"use client";

import type { BotSettingsConfig, BotSettingsPreview, BotSettingsSnapshot, BotSettingsState, BotSettingsVersion } from "@citychatbot/bot-settings";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminShell } from "../../AdminShell";
import type { AdminIdentity } from "../../admin-navigation";
import { ConflictState, EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../../ui/states";

import "./bot-settings.css";

type BotSettingsConsoleProps = { identity: AdminIdentity; initialSnapshot: BotSettingsSnapshot };
type ApiError = { error?: { reasonCode?: string; message?: string } };

const stateLabel: Record<BotSettingsState, string> = { DRAFT: "ฉบับร่าง", UNIT_APPROVED: "ผ่าน unit gate", CERTIFIED: "รับรองแล้ว", PUBLISHED: "เผยแพร่แล้ว", SUPERSEDED: "เวอร์ชันก่อนหน้า", ROLLED_BACK: "ถูกแทนที่หลัง rollback" };
const stateClass = (state: BotSettingsState): string => state === "PUBLISHED" || state === "CERTIFIED" ? "bot-chip--success" : state === "DRAFT" ? "bot-chip--warning" : "bot-chip--muted";
const idempotencyKey = (operation: string): string => `${operation}-${crypto.randomUUID()}`;
const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as ApiError | undefined;
  if (!response.ok) throw new Error(`${payload?.error?.reasonCode ?? "PROCESSING_FAILED"}: ${payload?.error?.message ?? "ไม่สามารถดำเนินการได้"}`);
  return payload as T;
}

const formFrom = (config: BotSettingsConfig): BotSettingsConfig => ({ ...config });

function PolicyLock() {
  const items = ["เปิดเผยว่าเป็นผู้ช่วย AI", "ตอบโดยยึดหลักฐานที่อนุมัติ", "ส่งต่อเมื่อหลักฐานไม่พอ", "แยกข้อมูลข้าม tenant", "หยุดเดาและใช้ safe abstention"];
  return <section aria-labelledby="bot-policy-lock" className="bot-panel bot-policy-lock"><div className="bot-section-heading"><div><span className="bot-kicker">SYSTEM POLICY · LOCKED</span><h2 id="bot-policy-lock">นโยบายความปลอดภัยบังคับ</h2></div><span aria-label="นโยบายล็อกและแก้ไขไม่ได้" className="bot-lock-icon">⌑</span></div><p>รายการนี้แสดงให้ตรวจสอบได้ แต่แก้ไขหรือปิดผ่าน tenant settings ไม่ได้</p><ul>{items.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul><small>Canonical outcomes: ANSWER · CLARIFY · HANDOFF</small></section>;
}

function VersionChip({ state }: { state: BotSettingsState }) { return <span className={`bot-chip ${stateClass(state)}`}>{stateLabel[state]}</span>; }

export function BotSettingsConsole({ identity, initialSnapshot }: BotSettingsConsoleProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState(initialSnapshot.versions.find((version) => version.state === "PUBLISHED")?.id ?? initialSnapshot.versions[0]?.id);
  const [config, setConfig] = useState<BotSettingsConfig | undefined>(() => initialSnapshot.versions.find((version) => version.id === selectedId)?.config);
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState("");
  const [preview, setPreview] = useState<BotSettingsPreview>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const selected = useMemo(() => snapshot.versions.find((version) => version.id === selectedId), [selectedId, snapshot.versions]);
  const editable = selected?.state === "DRAFT" && config !== undefined;
  const refresh = async (): Promise<void> => {
    if (!navigator.onLine) { setOffline(true); return; }
    setLoading(true); setError(undefined);
    try {
      const next = await requestJson<BotSettingsSnapshot>(`/api/v1/admin/bot-settings?${identityQuery(identity)}`);
      setSnapshot(next); setOffline(false);
      const nextSelected = next.versions.find((version) => version.id === selectedId) ?? next.versions.find((version) => version.state === "PUBLISHED") ?? next.versions[0];
      setSelectedId(nextSelected?.id); setConfig(nextSelected ? formFrom(nextSelected.config) : undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "โหลดการตั้งค่าไม่สำเร็จ"); } finally { setLoading(false); }
  };

  const selectVersion = (version: BotSettingsVersion): void => { setSelectedId(version.id); setConfig(formFrom(version.config)); setPreview(undefined); setNotice(undefined); setError(undefined); };
  const updateField = <K extends keyof BotSettingsConfig>(field: K, value: BotSettingsConfig[K]): void => setConfig((current) => current ? { ...current, [field]: value } : current);

  const createDraft = async (): Promise<void> => {
    const base = snapshot.published?.config ?? config;
    if (!base) return;
    setBusy("create"); setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/bot-settings?${identityQuery(identity)}`, { method: "POST", headers: { "idempotency-key": idempotencyKey("bot-draft") }, body: JSON.stringify({ ...base, reason: "สร้างฉบับร่างเพื่อปรับ copy และ preview", }) }); setNotice("สร้างฉบับร่างแล้ว — ตรวจ policy lock และ test console ก่อน publish"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้างฉบับร่างไม่สำเร็จ"); } finally { setBusy(undefined); }
  };

  const saveDraft = async (): Promise<void> => {
    if (!selected || !editable || !config) return;
    setBusy("save"); setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/bot-settings/${encodeURIComponent(selected.id)}?${identityQuery(identity)}`, { method: "PATCH", headers: { "idempotency-key": idempotencyKey("bot-update") }, body: JSON.stringify({ ...config, expectedVersion: selected.rowVersion, reason: "แก้ไข draft จากหน้า Bot settings", }) }); setNotice("บันทึก draft แล้ว — การเปลี่ยนแปลงนี้ต้องผ่าน L1 unit gate ก่อนเผยแพร่"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึก draft ไม่สำเร็จ"); } finally { setBusy(undefined); }
  };

  const runPreview = async (): Promise<void> => {
    if (!selected) return;
    setBusy("preview"); setError(undefined); setNotice(undefined);
    try { const result = await requestJson<{ preview: BotSettingsPreview }>(`/api/v1/admin/bot-settings/${encodeURIComponent(selected.id)}/preview?${identityQuery(identity)}`, { method: "POST", body: JSON.stringify({ question, sourceLabels: sources.split(",").map((item) => item.trim()).filter(Boolean) }) }); setPreview(result.preview); } catch (caught) { setError(caught instanceof Error ? caught.message : "preview ไม่สำเร็จ"); } finally { setBusy(undefined); }
  };

  const publish = async (): Promise<void> => {
    if (!selected || selected.state !== "DRAFT") return;
    setBusy("publish"); setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/bot-settings/${encodeURIComponent(selected.id)}/publish?${identityQuery(identity)}`, { method: "POST", headers: { "idempotency-key": idempotencyKey("bot-publish") }, body: JSON.stringify({ expectedVersion: selected.rowVersion, reason: "เผยแพร่หลัง preview และ automatic L1 unit gate", }) }); setNotice("เผยแพร่สำเร็จ — ระบบบันทึก UNIT_AUTO_APPROVED และเก็บเวอร์ชันก่อนหน้าไว้ rollback"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "เผยแพร่ไม่สำเร็จ"); } finally { setBusy(undefined); }
  };

  const rollback = async (version: BotSettingsVersion): Promise<void> => {
    if (version.state !== "SUPERSEDED" && version.state !== "ROLLED_BACK") return;
    setBusy("rollback"); setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/bot-settings/${encodeURIComponent(version.id)}/rollback?${identityQuery(identity)}`, { method: "POST", headers: { "idempotency-key": idempotencyKey("bot-rollback") }, body: JSON.stringify({ expectedVersion: version.rowVersion, reason: "กู้คืนเวอร์ชันก่อนหน้าที่เก็บไว้", }) }); setNotice("rollback สำเร็จ — restored version กลับเป็น published"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "rollback ไม่สำเร็จ"); } finally { setBusy(undefined); }
  };

  if (offline) return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}><OfflineState action={<button className="bot-button bot-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่ออีกครั้ง</button>} /></AdminShell>;
  if (loading && snapshot.versions.length === 0) return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}><LoadingState title="กำลังโหลดการตั้งค่า Bot" /></AdminShell>;
  if (error && snapshot.versions.length === 0) return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}><ErrorState message={error} action={<button className="bot-button bot-button--primary" onClick={() => void refresh()} type="button">ลองใหม่</button>} /></AdminShell>;
  if (!identity.synthetic) return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}><FeatureDisabledState /></AdminShell>;
  if (snapshot.versions.length === 0) return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}><EmptyState title="ยังไม่มี Bot settings version" message="สร้างฉบับร่างจาก safe default เพื่อเริ่มตั้งค่า" action={<button className="bot-button bot-button--primary" onClick={() => void createDraft()} type="button">สร้างฉบับร่าง</button>} /></AdminShell>;

  return <AdminShell activeId="bot-settings" breadcrumbs={["Bot และความปลอดภัย"]} identity={identity}>
    <header className="bot-heading"><div><span className="bot-kicker">A-91 · A-46 · A-47</span><h1>Bot personality และความปลอดภัย</h1><p>กำหนด copy ที่อนุญาต โดย policy หลักฐาน การส่งต่อ และ tenant isolation ถูกล็อกเสมอ</p></div><div className="bot-heading__actions"><span className="bot-role">{identity.role} · {identity.departmentLabel}</span><button className="bot-button bot-button--secondary" disabled={busy !== undefined} onClick={() => void refresh()} type="button">รีเฟรช</button><button className="bot-button bot-button--primary" disabled={busy !== undefined} onClick={() => void createDraft()} type="button">+ สร้าง draft</button></div></header>
    {error ? <div className="bot-alert" role="alert">{error}</div> : null}{notice ? <div className="bot-alert bot-alert--success" role="status">{notice}</div> : null}
    <div className="bot-layout"><main className="bot-main"><section className="bot-panel"><div className="bot-section-heading"><div><h2>Version history</h2><p>ฉบับเผยแพร่ก่อนหน้าจะไม่ถูกลบ และกู้คืนได้หนึ่ง action</p></div><span>{snapshot.versions.length} versions</span></div><div className="bot-version-list">{snapshot.versions.map((version) => <div className={`bot-version-row ${version.id === selected?.id ? "is-selected" : ""}`} key={version.id}><button onClick={() => selectVersion(version)} type="button"><strong>v{version.version}</strong><span>row v{version.rowVersion}</span><VersionChip state={version.state} /></button>{version.state === "SUPERSEDED" || version.state === "ROLLED_BACK" ? <button className="bot-link-button" disabled={busy !== undefined} onClick={() => void rollback(version)} type="button">กู้คืน</button> : null}</div>)}</div></section>
      {!selected ? <PermissionDeniedState /> : <><section className="bot-panel"><div className="bot-section-heading"><div><h2>แก้ไข personality และข้อความ</h2><p>แก้ได้เฉพาะ DRAFT; HTML ถูกตัดออกและข้อความที่พยายาม override policy จะถูกปฏิเสธ</p></div><VersionChip state={selected.state} /></div><div className="bot-form-grid"><label>โทนการสื่อสาร<select disabled={!editable} onChange={(event) => updateField("tone", event.target.value as BotSettingsConfig["tone"])} value={config?.tone ?? selected.config.tone}><option value="WARM">อบอุ่น</option><option value="FORMAL">เป็นทางการ</option><option value="NEUTRAL">กลาง</option></select></label><label>รูปแบบคำตอบ<select disabled={!editable} onChange={(event) => updateField("responseStyle", event.target.value as BotSettingsConfig["responseStyle"])} value={config?.responseStyle ?? selected.config.responseStyle}><option value="GUIDED">มีขั้นตอนแนะนำ</option><option value="CONCISE">กระชับ</option></select></label><label>ภาษา<select disabled={!editable} onChange={(event) => updateField("locale", event.target.value as BotSettingsConfig["locale"])} value={config?.locale ?? selected.config.locale}><option value="th-TH">ไทย</option><option value="en-US">English</option></select></label></div><div className="bot-copy-grid">{([ ["welcomeMessage", "ข้อความต้อนรับ"], ["disclaimerMessage", "คำอธิบายประกอบ"], ["fallbackMessage", "ข้อความเมื่อหลักฐานไม่พอ"], ["handoffMessage", "ข้อความส่งต่อเจ้าหน้าที่"], ["afterHoursMessage", "ข้อความนอกเวลาทำการ"] ] as const).map(([field, label]) => <label key={field}>{label}<textarea disabled={!editable} maxLength={500} onChange={(event) => updateField(field, event.target.value)} value={config?.[field] ?? selected.config[field]} /></label>)}</div><div className="bot-impact-warning"><strong>Change impact warning</strong><span>การเปลี่ยนข้อความหรือโทนทำให้เกิด configuration revision ใหม่ ต้องรัน preview และ L1 unit gate ก่อน publish; ห้ามเปลี่ยน policy lock</span></div><div className="bot-action-row"><button className="bot-button bot-button--secondary" disabled={!editable || busy !== undefined} onClick={() => void saveDraft()} type="button">{busy === "save" ? "กำลังบันทึก…" : "บันทึก draft"}</button><button className="bot-button bot-button--primary" disabled={selected.state !== "DRAFT" || busy !== undefined} onClick={() => void publish()} type="button">{busy === "publish" ? "กำลังตรวจและเผยแพร่…" : "ผ่าน unit gate และเผยแพร่"}</button></div>{selected.state !== "DRAFT" ? <StaleState action={<p className="bot-muted">เวอร์ชันนี้แก้ไขไม่ได้ สร้าง draft ใหม่เพื่อเปลี่ยนแปลง</p>} /> : null}</section>
      <section className="bot-panel"><div className="bot-section-heading"><div><span className="bot-kicker">A-46 · TEST CONSOLE</span><h2>Preview พร้อม source boundary</h2><p>source ที่ป้อนในหน้านี้ใช้เพื่อ preview เท่านั้น ไม่ถูกถือเป็น evidence หรือ ACTIVE index</p></div></div><div className="bot-test-form"><label>คำถามตัวอย่าง<textarea onChange={(event) => setQuestion(event.target.value)} placeholder="เช่น ต้องใช้เอกสารอะไรบ้าง" value={question} /></label><label>ชื่อแหล่งอ้างอิงสำหรับ preview (คั่นด้วย comma)<input onChange={(event) => setSources(event.target.value)} placeholder="source-1, source-2" value={sources} /></label><button className="bot-button bot-button--secondary" disabled={busy !== undefined} onClick={() => void runPreview()} type="button">{busy === "preview" ? "กำลัง preview…" : "Run preview"}</button></div>{preview ? <div className="bot-preview-result" data-preview-only="true" role="status"><div><strong>{preview.outcome}</strong><span>{preview.reasonCode}</span><span>{preview.sourceBoundary}</span></div><pre>{preview.renderedMessage}</pre>{preview.sourceLabels.length > 0 ? <ul>{preview.sourceLabels.map((source) => <li key={source}>{source}</li>)}</ul> : <p className="bot-muted">ไม่มี source — ระบบ fail closed เป็น HANDOFF/NO_EVIDENCE</p>}</div> : <p className="bot-muted">ยังไม่ได้ run preview</p>}</section></>}
      {error?.includes("SESSION_EXPIRED") ? <ExpiredSessionState action={<button className="bot-button bot-button--secondary" onClick={() => void refresh()} type="button">เริ่มเซสชันใหม่</button>} /> : null}{error?.includes("VERSION_CONFLICT") ? <ConflictState action={<button className="bot-button bot-button--secondary" onClick={() => void refresh()} type="button">โหลดเวอร์ชันล่าสุด</button>} /> : null}
    </main><aside className="bot-sidebar"><PolicyLock /><section className="bot-panel bot-audit"><h2>Audit ล่าสุด</h2>{snapshot.audit.length === 0 ? <p className="bot-muted">ยังไม่มี audit</p> : <ol>{snapshot.audit.slice(-8).reverse().map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{entry.reason}</span></li>)}</ol>}</section></aside></div>
    <footer className="bot-footer"><span>Production policy: server session + tenant permission required · local นี้เป็น synthetic only</span><Link href="/admin?role=TENANT_ADMIN">กลับ dashboard</Link></footer>
  </AdminShell>;
}
