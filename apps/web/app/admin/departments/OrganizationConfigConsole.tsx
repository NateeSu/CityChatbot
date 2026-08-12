"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { DepartmentConfig, OrganizationSnapshot, WorkScopeRules } from "@citychatbot/org-config";

import { EmptyState, ErrorState, LoadingState, OfflineState, PermissionDeniedState } from "../../ui/states";
import { AdminShell } from "../AdminShell";
import type { AdminIdentity } from "../admin-navigation";
import "./organization.css";

type OrganizationConfigConsoleProps = { identity: AdminIdentity; initialSnapshot: OrganizationSnapshot };
type ApiPayload = { departments: readonly DepartmentConfig[]; categories: OrganizationSnapshot["categories"] };

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const idempotencyKey = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const defaultRules = (title: string, keywords: string[]): WorkScopeRules => ({ title, description: "กำหนดขอบเขตงานสำหรับ preview และ routing candidate", includedKeywords: keywords, includedCategories: ["GENERAL"], excludedTopics: [], areaRules: [], priorityRiskRules: [{ priority: "NORMAL", riskLevel: "STANDARD" }], positiveExamples: [], negativeExamples: [] });

const requestJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const body = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw new Error(`${body?.error?.reasonCode ?? "PROCESSING_FAILED"}: ${body?.error?.message ?? "ไม่สามารถบันทึกการตั้งค่าได้"}`);
  }
  return payload;
};

function DepartmentCard({ department, canManage, onPublish, onRefresh }: { department: DepartmentConfig; canManage: boolean; onPublish: (department: DepartmentConfig, scopeId: string, rowVersion: number) => Promise<void>; onRefresh: () => Promise<void> }) {
  const activeScope = department.workScopes.find((scope) => scope.state === "ACTIVE");
  const draftScopes = department.workScopes.filter((scope) => scope.state === "DRAFT");
  const activeSla = department.slaRules.find((rule) => rule.state === "ACTIVE");
  return <article className="organization-card">
    <div className="organization-card__header"><div><span className="organization-kicker">{department.code}</span><h2>{department.name}</h2><p>{department.memberships.length} สมาชิก · row v{department.rowVersion}</p></div><span className={`organization-status organization-status--${department.status.toLowerCase()}`}>{department.status === "ACTIVE" ? "ใช้งาน" : "ปิดใช้งาน"}</span></div>
    <dl className="organization-facts"><div><dt>ขอบเขตงาน active</dt><dd>{activeScope ? `v${activeScope.version} · ${activeScope.scopeRules.title}` : "ยังไม่มี"}</dd></div><div><dt>SLA active</dt><dd>{activeSla ? `${Math.round(activeSla.responseTargetSeconds / 60)} นาทีตอบรับ · ${Math.round(activeSla.resolutionTargetSeconds / 3600)} ชม.ปิดงาน` : "ยังไม่ตั้งค่า"}</dd></div><div><dt>ช่องทางสาธารณะ</dt><dd>{department.contacts.filter((contact) => contact.isPublic).length} รายการที่ผ่าน review</dd></div></dl>
    {draftScopes.length > 0 ? <div className="organization-drafts"><strong>รอ preview / publish</strong>{draftScopes.map((scope) => <div className="organization-draft" key={scope.id}><span>work scope v{scope.version} · {scope.scopeRules.title}</span>{canManage ? <button className="organization-button organization-button--primary" onClick={() => void onPublish(department, scope.id, scope.rowVersion)} type="button">Publish</button> : null}</div>)}</div> : null}
    <details className="organization-details"><summary>ดูรายละเอียด config และ rollback context</summary><div className="organization-detail-grid"><div><strong>Keywords</strong><p>{activeScope?.scopeRules.includedKeywords.join(", ") || "ยังไม่มี"}</p></div><div><strong>Categories</strong><p>{activeScope?.scopeRules.includedCategories.join(", ") || "ยังไม่มี"}</p></div><div><strong>Contacts</strong><p>{department.contacts.map((contact) => `${contact.label}: ${contact.value}`).join(" · ") || "ยังไม่มี"}</p></div><div><strong>Memberships</strong><p>{department.memberships.map((member) => `${member.roleInDepartment}:${member.membershipId}`).join(" · ") || "ยังไม่มี"}</p></div></div></details>
    <button className="organization-button organization-button--secondary" onClick={() => void onRefresh()} type="button">โหลดเวอร์ชันล่าสุด</button>
  </article>;
}

export function OrganizationConfigConsole({ identity, initialSnapshot }: OrganizationConfigConsoleProps) {
  const [data, setData] = useState<ApiPayload>({ departments: initialSnapshot.departments, categories: initialSnapshot.categories });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(initialSnapshot.departments[0]?.id ?? "");
  const [scopeTitle, setScopeTitle] = useState("");
  const [scopeKeywords, setScopeKeywords] = useState("");
  const [scopeEffectiveFrom, setScopeEffectiveFrom] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewResult, setPreviewResult] = useState<readonly string[]>([]);
  const [contactLabel, setContactLabel] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [slaCalendarId, setSlaCalendarId] = useState("");
  const [slaResponseMinutes, setSlaResponseMinutes] = useState("60");
  const [slaResolutionHours, setSlaResolutionHours] = useState("48");
  const [slaEffectiveFrom, setSlaEffectiveFrom] = useState("");
  const [notice, setNotice] = useState<string>();

  const canManageTenant = identity.role === "TENANT_ADMIN";
  const selectedDepartment = data.departments.find((department) => department.id === selectedDepartmentId);
  const activeScopes = useMemo(() => data.departments.flatMap((department) => department.workScopes.filter((scope) => scope.state === "ACTIVE").map((scope) => ({ department, scope }))), [data.departments]);

  const refresh = async (): Promise<void> => {
    if (!navigator.onLine) { setOffline(true); return; }
    setLoading(true); setError(undefined); setNotice(undefined);
    try { const payload = await requestJson(`/api/v1/admin/departments?${identityQuery(identity)}`) as ApiPayload; setData(payload); setOffline(false); } catch (caught) { setError(caught instanceof Error ? caught.message : "ไม่สามารถโหลดการตั้งค่าได้"); } finally { setLoading(false); }
  };

  const createDepartment = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canManageTenant || !departmentCode.trim() || !departmentName.trim()) return;
    try { await requestJson(`/api/v1/admin/departments?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("department") }, body: JSON.stringify({ code: departmentCode, name: departmentName, reason: "สร้างจากหน้า A-70 โดย tenant admin" }) }); setDepartmentCode(""); setDepartmentName(""); setNotice("สร้าง department revision ใหม่แล้ว"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้าง department ไม่สำเร็จ"); }
  };

  const createScopeDraft = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedDepartmentId || !scopeTitle.trim() || !scopeEffectiveFrom) return;
    const rules = defaultRules(scopeTitle, scopeKeywords.split(",").map((item) => item.trim()).filter(Boolean));
    try { await requestJson(`/api/v1/admin/departments/${encodeURIComponent(selectedDepartmentId)}/work-scope-versions?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("scope") }, body: JSON.stringify({ rules, effectiveFrom: new Date(scopeEffectiveFrom).toISOString(), reason: "สร้าง draft เพื่อ preview routing", }) }); setScopeTitle(""); setScopeKeywords(""); setScopeEffectiveFrom(""); setNotice("สร้าง work-scope draft แล้ว; ตรวจสอบก่อน publish"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้าง work-scope ไม่สำเร็จ"); }
  };

  const publishScope = async (department: DepartmentConfig, scopeId: string, rowVersion: number): Promise<void> => {
    try { await requestJson(`/api/v1/admin/departments/${encodeURIComponent(department.id)}/work-scope-versions/${encodeURIComponent(scopeId)}/publish?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("scope-publish") }, body: JSON.stringify({ expectedVersion: rowVersion, reason: "ผ่าน preview และอนุมัติ publish โดยผู้ดูแล" }) }); setNotice("publish work-scope สำเร็จ; version เดิมถูกเก็บเป็น history"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "publish ไม่สำเร็จ"); }
  };

  const addContact = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedDepartmentId || !contactLabel.trim() || !contactValue.trim()) return;
    try { await requestJson(`/api/v1/admin/departments/${encodeURIComponent(selectedDepartmentId)}?${identityQuery(identity)}`, { method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("contact") }, body: JSON.stringify({ contact: { contactType: "PHONE", label: contactLabel, value: contactValue, isPublic: false }, reason: "เพิ่มช่องทางติดต่อเพื่อรอ review" }) }); setContactLabel(""); setContactValue(""); setNotice("บันทึก contact เป็น draft/private แล้ว; ต้อง review ก่อน public"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึก contact ไม่สำเร็จ"); }
  };

  const createSlaDraft = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedDepartmentId || !slaCalendarId.trim() || !slaEffectiveFrom) return;
    try { await requestJson(`/api/v1/admin/sla-rule-versions?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey("sla") }, body: JSON.stringify({ departmentId: selectedDepartmentId, calendarId: slaCalendarId, priority: "NORMAL", responseTargetSeconds: Number(slaResponseMinutes) * 60, resolutionTargetSeconds: Number(slaResolutionHours) * 3600, warningRatio: 0.8, pauseStatuses: ["WAITING_FOR_CITIZEN"], effectiveFrom: new Date(slaEffectiveFrom).toISOString(), reason: "สร้าง SLA draft จากหน้า A-74" }) }); setSlaCalendarId(""); setSlaEffectiveFrom(""); setNotice("สร้าง SLA draft แล้ว; ต้อง publish หลังตรวจ precedence และ calendar"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้าง SLA ไม่สำเร็จ"); }
  };

  const preview = (): void => {
    const normalized = previewText.trim().toLocaleLowerCase("th-TH");
    setPreviewResult(normalized ? activeScopes.filter(({ scope }) => scope.scopeRules.includedKeywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase("th-TH")))).map(({ department }) => `${department.code} · ${department.name}`) : []);
  };

  if (offline) return <AdminShell activeId="departments" breadcrumbs={["หน่วยงานและ SLA"]} identity={identity}><OfflineState action={<button className="organization-button organization-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่ออีกครั้ง</button>} /></AdminShell>;
  if (loading && data.departments.length === 0) return <AdminShell activeId="departments" breadcrumbs={["หน่วยงานและ SLA"]} identity={identity}><LoadingState title="กำลังโหลดการตั้งค่าองค์กร" /></AdminShell>;
  if (error && data.departments.length === 0) return <AdminShell activeId="departments" breadcrumbs={["หน่วยงานและ SLA"]} identity={identity}><ErrorState message={error} action={<button className="organization-button organization-button--primary" onClick={() => void refresh()} type="button">ลองใหม่</button>} /></AdminShell>;
  if (!identity.synthetic) return <AdminShell activeId="departments" breadcrumbs={["หน่วยงานและ SLA"]} identity={identity}><PermissionDeniedState /></AdminShell>;

  return <AdminShell activeId="departments" breadcrumbs={["หน่วยงานและ SLA"]} identity={identity}>
    <header className="organization-heading"><div><span className="organization-kicker">A-70 · ORGANIZATION CONFIG</span><h1>หน่วยงาน ขอบเขตงาน และ SLA</h1><p>แก้ไข configuration แบบ versioned พร้อม preview, permission และ rollback history</p></div><div className="organization-heading__actions"><span className="organization-role">{identity.role} · {identity.departmentLabel}</span><button className="organization-button organization-button--secondary" onClick={() => void refresh()} type="button">รีเฟรช</button></div></header>
    {error ? <div className="organization-alert" role="alert">{error}</div> : null}{notice ? <div className="organization-alert organization-alert--success" role="status">{notice}</div> : null}
    <section className="organization-layout"><div className="organization-main"><div className="organization-section-heading"><div><h2>รายการหน่วยงาน</h2><p>ข้อมูลถูกกรองด้วย tenant และ department scope จาก server context</p></div><span>{data.departments.length} รายการ</span></div>{data.departments.length === 0 ? <EmptyState title="ยังไม่มีหน่วยงานในขอบเขตนี้" message="สร้างหรือขอให้ tenant admin เพิ่มหน่วยงาน" /> : <div className="organization-cards">{data.departments.map((department) => <DepartmentCard canManage={canManageTenant || (identity.role === "DEPARTMENT_HEAD" && identity.departmentIds.includes(department.id))} department={department} key={department.id} onPublish={publishScope} onRefresh={refresh} />)}</div>}<section className="organization-panel organization-category-panel"><div className="organization-section-heading"><div><h2>หมวดหมู่เรื่องร้องเรียน</h2><p>ใช้เป็น category reference ใน work scope และ routing; การเปลี่ยนสถานะต้องใช้ revision</p></div><span>{data.categories.length} รายการ</span></div>{data.categories.length === 0 ? <p className="organization-muted">ยังไม่มี category</p> : <div className="organization-category-list">{data.categories.map((category) => <div key={category.id}><strong>{category.code}</strong><span>{category.publicName} · default {category.defaultPriority}</span><small>{category.status === "ACTIVE" ? "ใช้งาน" : "ปิดใช้งาน"} · row v{category.rowVersion}</small></div>)}</div>}</section></div>
      <aside className="organization-sidebar"><section className="organization-panel"><h2>สร้าง department revision</h2>{canManageTenant ? <form className="organization-form" onSubmit={(event) => void createDepartment(event)}><label>Code<input maxLength={32} onChange={(event) => setDepartmentCode(event.target.value)} pattern="[A-Za-z][A-Za-z0-9_-]{1,31}" required value={departmentCode} /></label><label>ชื่อหน่วยงาน<input maxLength={200} onChange={(event) => setDepartmentName(event.target.value)} required value={departmentName} /></label><button className="organization-button organization-button--primary" type="submit">สร้าง draft department</button></form> : <p className="organization-muted">ต้องใช้ TENANT_ADMIN สำหรับการสร้าง tenant-level department</p>}</section>
        <section className="organization-panel"><h2>สร้าง work-scope draft</h2><form className="organization-form" onSubmit={(event) => void createScopeDraft(event)}><label>หน่วยงาน<select onChange={(event) => setSelectedDepartmentId(event.target.value)} value={selectedDepartmentId}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label><label>ชื่อ scope<input maxLength={200} onChange={(event) => setScopeTitle(event.target.value)} required value={scopeTitle} /></label><label>วันที่เริ่มมีผล<input onChange={(event) => setScopeEffectiveFrom(event.target.value)} required type="datetime-local" value={scopeEffectiveFrom} /></label><label>Keywords คั่นด้วย comma<input onChange={(event) => setScopeKeywords(event.target.value)} placeholder="ถนน, ไฟฟ้า, ท่อ" value={scopeKeywords} /></label><button className="organization-button organization-button--primary" disabled={!selectedDepartment} type="submit">สร้าง draft</button></form></section>
        <section className="organization-panel"><h2>เพิ่มช่องทางติดต่อ</h2><p className="organization-muted">บันทึกเป็น private draft ก่อน public review ตาม policy</p><form className="organization-form" onSubmit={(event) => void addContact(event)}><label>หน่วยงาน<select onChange={(event) => setSelectedDepartmentId(event.target.value)} value={selectedDepartmentId}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><label>ป้ายกำกับ<input onChange={(event) => setContactLabel(event.target.value)} required value={contactLabel} /></label><label>เบอร์โทรศัพท์<input inputMode="tel" onChange={(event) => setContactValue(event.target.value)} pattern="\+?[0-9][0-9 ()-]{6,24}" required value={contactValue} /></label><button className="organization-button organization-button--secondary" disabled={!selectedDepartment} type="submit">บันทึก contact draft</button></form></section>
        <section className="organization-panel"><h2>A-74 · สร้าง SLA draft</h2><p className="organization-muted">ใช้ calendar ID จาก tenant config; ค่า SLA เป็น seconds ใน API และไม่มาจาก AI</p><form className="organization-form" onSubmit={(event) => void createSlaDraft(event)}><label>หน่วยงาน<select onChange={(event) => setSelectedDepartmentId(event.target.value)} value={selectedDepartmentId}>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><label>Calendar ID<input onChange={(event) => setSlaCalendarId(event.target.value)} required value={slaCalendarId} /></label><label>เวลาตอบรับ (นาที)<input min="1" onChange={(event) => setSlaResponseMinutes(event.target.value)} required type="number" value={slaResponseMinutes} /></label><label>เวลาปิดงาน (ชั่วโมง)<input min="1" onChange={(event) => setSlaResolutionHours(event.target.value)} required type="number" value={slaResolutionHours} /></label><label>วันที่เริ่มมีผล<input onChange={(event) => setSlaEffectiveFrom(event.target.value)} required type="datetime-local" value={slaEffectiveFrom} /></label><button className="organization-button organization-button--secondary" disabled={!selectedDepartment} type="submit">สร้าง SLA draft</button></form></section>
        <section className="organization-panel"><h2>Routing sandbox</h2><p className="organization-muted">preview candidate เท่านั้น ไม่สร้าง complaint และไม่เปลี่ยน routing truth</p><label>ข้อความตัวอย่าง<input onChange={(event) => setPreviewText(event.target.value)} placeholder="เช่น ถนนชำรุด" value={previewText} /></label><button className="organization-button organization-button--secondary" onClick={preview} type="button">Preview candidates</button>{previewResult.length === 0 ? <p className="organization-muted">ยังไม่มี candidate</p> : <ul className="organization-preview-list">{previewResult.map((item) => <li key={item}>{item}</li>)}</ul>}</section></aside>
    </section>
    <footer className="organization-footer"><span>category config: {data.categories.length} รายการ · active work scopes: {activeScopes.length}</span><Link href="/admin?role=TENANT_ADMIN">กลับ dashboard</Link></footer>
  </AdminShell>;
}
