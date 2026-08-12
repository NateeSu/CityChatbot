"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import type { RoleDefinition, StaffInvitation, StaffMember, UserManagementSnapshot } from "@citychatbot/user-management";

import { EmptyState, ErrorState, ExpiredSessionState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../ui/states";
import { AdminShell } from "../AdminShell";
import type { AdminIdentity } from "../admin-navigation";
import "./staff.css";

type StaffConsoleProps = { identity: AdminIdentity; initialSnapshot: UserManagementSnapshot };
type ApiPayload = UserManagementSnapshot;
type InviteForm = { email: string; displayName: string; roleId: string; departmentIds: string; expiresInHours: string; reason: string };

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, stepUp: "1" }).toString();
const idempotencyKey = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const blankInvite = (roleId = ""): InviteForm => ({ email: "", displayName: "", roleId, departmentIds: "", expiresInHours: "72", reason: "เชิญเจ้าหน้าที่จาก A-75" });

const requestJson = async (url: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const body = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw new Error(`${body?.error?.reasonCode ?? "PROCESSING_FAILED"}: ${body?.error?.message ?? "ไม่สามารถดำเนินการได้"}`);
  }
  return payload;
};

const roleLabel = (member: StaffMember): string => member.roles.map((role) => role.displayName).join(", ") || "ยังไม่มีบทบาท";
const inviteStatusLabel = (status: StaffInvitation["status"]): string => ({ PENDING: "รอตอบรับ", ACCEPTED: "ตอบรับแล้ว", EXPIRED: "หมดอายุ", REVOKED: "ยกเลิกแล้ว" })[status];

export function StaffConsole({ identity, initialSnapshot }: StaffConsoleProps) {
  const [data, setData] = useState<ApiPayload>(initialSnapshot);
  const [form, setForm] = useState<InviteForm>(() => blankInvite(initialSnapshot.roles.find((role) => role.code === "STAFF")?.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [inviteToken, setInviteToken] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [expired, setExpired] = useState(false);
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState("");

  const roles = useMemo(() => data.roles.filter((role) => role.status === "ACTIVE"), [data.roles]);
  const filteredStaff = useMemo(() => data.staff.filter((member) => `${member.displayName} ${member.emailMasked} ${roleLabel(member)}`.toLocaleLowerCase("th-TH").includes(filter.trim().toLocaleLowerCase("th-TH"))), [data.staff, filter]);
  const pendingInvitations = data.invitations.filter((invitation) => invitation.status === "PENDING");

  const refresh = async (): Promise<void> => {
    if (!navigator.onLine) { setOffline(true); return; }
    setLoading(true); setError(undefined); setNotice(undefined); setStale(false);
    try { const payload = await requestJson(`/api/v1/admin/staff?${identityQuery(identity)}`) as ApiPayload; setData(payload); setOffline(false); } catch (caught) { const message = caught instanceof Error ? caught.message : "ไม่สามารถโหลดรายชื่อเจ้าหน้าที่ได้"; setExpired(message.includes("UNAUTHENTICATED")); setError(message); setStale(true); } finally { setLoading(false); }
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); setError(undefined); setNotice(undefined); setInviteToken(undefined);
    try {
      const result = await requestJson(`/api/v1/admin/staff/invitations?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.email, displayName: form.displayName, roleIds: [form.roleId], departmentIds: form.departmentIds.split(",").map((value) => value.trim()).filter(Boolean), expiresInHours: Number(form.expiresInHours), reason: form.reason, idempotencyKey: idempotencyKey("staff-invite") }) }) as { inviteToken: string; invitation: StaffInvitation; staff: StaffMember };
      setInviteToken(result.inviteToken); setNotice("สร้างคำเชิญแล้ว เก็บ token นี้ในช่องทางที่ได้รับอนุมัติเท่านั้น"); setForm(blankInvite(form.roleId)); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้างคำเชิญไม่สำเร็จ"); }
  };

  const updateStatus = async (member: StaffMember, status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"): Promise<void> => {
    setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/staff/${member.id}?${identityQuery(identity)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedVersion: member.rowVersion, reason: `เปลี่ยนสถานะจาก A-75 เป็น ${status}`, idempotencyKey: idempotencyKey("staff-status") }) }); setNotice("บันทึกสถานะและ revoke session ตาม policy แล้ว"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "เปลี่ยนสถานะไม่สำเร็จ"); }
  };

  const revokeInvite = async (invitation: StaffInvitation): Promise<void> => {
    setError(undefined); setNotice(undefined);
    try { await requestJson(`/api/v1/admin/staff/invitations/${invitation.id}/revoke?${identityQuery(identity)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: invitation.rowVersion, reason: "ยกเลิกคำเชิญจาก A-75", idempotencyKey: idempotencyKey("staff-revoke") }) }); setNotice("ยกเลิกคำเชิญแล้ว"); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "ยกเลิกคำเชิญไม่สำเร็จ"); }
  };

  if (identity.role !== "TENANT_ADMIN") return <AdminShell activeId="staff" identity={identity}><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></AdminShell>;

  return <AdminShell activeId="staff" identity={identity} breadcrumbs={["เจ้าหน้าที่และสิทธิ์"]}>
    <header className="staff-heading"><div><span className="staff-kicker">A-75 · STAFF / ROLES</span><h1>เจ้าหน้าที่และสิทธิ์</h1><p>จัดการสมาชิก บทบาท คำเชิญ และการเข้าถึงโดยมี step-up และ audit ทุก mutation</p></div><div className="staff-heading__actions"><span className="staff-role">{identity.role} · MFA step-up required</span><button className="staff-button staff-button--secondary" onClick={() => void refresh()} type="button">รีเฟรช</button></div></header>
    {error ? <div className="staff-alert" role="alert">{error}</div> : null}{notice ? <div className="staff-alert staff-alert--success" role="status">{notice}</div> : null}
    {inviteToken ? <section className="staff-token" aria-label="โทเคนคำเชิญ"><strong>โทเคนแสดงครั้งเดียว</strong><code>{inviteToken}</code><p>ห้ามใส่ token ลงใน log หรือส่งผ่านช่องทางที่ไม่เข้ารหัส หลังปิดหน้านี้จะไม่สามารถดู token เดิมได้</p></section> : null}
    {expired ? <ExpiredSessionState action={<Link href="/admin">เริ่มเซสชันใหม่</Link>} /> : null}{offline ? <OfflineState action={<button className="staff-button staff-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่อใหม่</button>} /> : null}{stale ? <StaleState action={<button className="staff-button staff-button--secondary" onClick={() => void refresh()} type="button">โหลดข้อมูลล่าสุด</button>} /> : null}
    <section className="staff-layout"><div className="staff-main"><div className="staff-section-heading"><div><h2>รายชื่อเจ้าหน้าที่</h2><p>แสดง email แบบ mask และ role จาก trusted server snapshot</p></div><span>{filteredStaff.length} / {data.staff.length} คน</span></div><label className="staff-filter">ค้นหา<input aria-label="ค้นหาเจ้าหน้าที่" onChange={(event) => setFilter(event.target.value)} placeholder="ชื่อ, email แบบ mask หรือ role" value={filter} /></label>{loading ? <LoadingState title="กำลังโหลดเจ้าหน้าที่" message="กำลังตรวจสอบ membership, role และ tenant scope" /> : filteredStaff.length === 0 ? <EmptyState title="ไม่พบเจ้าหน้าที่" message="ลองเปลี่ยนคำค้นหรือสร้างคำเชิญใหม่จากแผงด้านขวา" /> : <div className="staff-cards">{filteredStaff.map((member) => <article className="staff-card" key={member.id}><div className="staff-card__top"><div><span className="staff-kicker">{member.status}</span><h3>{member.displayName}</h3><p>{member.emailMasked}</p></div><span className={`staff-status staff-status--${member.status.toLowerCase()}`}>{member.status}</span></div><dl><div><dt>บทบาท</dt><dd>{roleLabel(member)}</dd></div><div><dt>หน่วยงาน</dt><dd>{member.departmentMemberships.length ? member.departmentMemberships.map((item) => `${item.departmentId}${item.isPrimary ? " · หลัก" : ""}`).join(", ") : "ทั้ง tenant"}</dd></div><div><dt>session</dt><dd>{member.sessionRevokedAt ? `revoke ${new Date(member.sessionRevokedAt).toLocaleString("th-TH")}` : "ยังไม่ถูก revoke"}</dd></div></dl><div className="staff-card__actions"><button className="staff-button staff-button--secondary" disabled={member.status === "SUSPENDED"} onClick={() => void updateStatus(member, "SUSPENDED")} type="button">พักสิทธิ์</button><button className="staff-button staff-button--secondary" disabled={member.status === "ACTIVE"} onClick={() => void updateStatus(member, "ACTIVE")} type="button">เปิดใช้งาน</button><button className="staff-button staff-button--danger" disabled={member.roles.some((role) => role.code === "TENANT_ADMIN") || member.status === "DEACTIVATED"} onClick={() => void updateStatus(member, "DEACTIVATED")} type="button">ปิดบัญชี</button></div></article>)}</div>}</div>
      <aside className="staff-sidebar"><section className="staff-panel"><div className="staff-panel__heading"><div><span className="staff-kicker">SECURE INVITE</span><h2>เชิญเจ้าหน้าที่</h2></div><span className="staff-muted">step-up</span></div><p className="staff-muted">Token ถูก hash ใน repository และแสดงกลับเพียงครั้งเดียว</p><form className="staff-form" onSubmit={(event) => void createInvite(event)}><label>อีเมล<input autoComplete="email" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required type="email" value={form.email} /></label><label>ชื่อที่แสดง<input maxLength={200} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required value={form.displayName} /></label><label>บทบาท<select onChange={(event) => setForm((current) => ({ ...current, roleId: event.target.value }))} required value={form.roleId}>{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName} · {role.code}</option>)}</select></label><label>Department IDs (คั่นด้วย comma)<input onChange={(event) => setForm((current) => ({ ...current, departmentIds: event.target.value }))} placeholder="ถ้าไม่ระบุ = ทั้ง tenant" value={form.departmentIds} /></label><label>อายุคำเชิญ (ชั่วโมง)<input max="168" min="1" onChange={(event) => setForm((current) => ({ ...current, expiresInHours: event.target.value }))} required type="number" value={form.expiresInHours} /></label><label>เหตุผล<input maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required value={form.reason} /></label><button className="staff-button staff-button--primary" disabled={!roles.length} type="submit">สร้างคำเชิญ</button></form></section>
        <section className="staff-panel"><div className="staff-panel__heading"><div><span className="staff-kicker">INVITATIONS</span><h2>คำเชิญที่รออยู่</h2></div><span>{pendingInvitations.length}</span></div>{data.invitations.length === 0 ? <p className="staff-muted">ยังไม่มีคำเชิญ</p> : <ul className="staff-invitations">{data.invitations.map((invitation) => <li key={invitation.id}><div><strong>{invitation.emailMasked}</strong><small>{inviteStatusLabel(invitation.status)} · หมดอายุ {new Date(invitation.expiresAt).toLocaleString("th-TH")}</small></div>{invitation.status === "PENDING" ? <button className="staff-button staff-button--danger" onClick={() => void revokeInvite(invitation)} type="button">ยกเลิก</button> : null}</li>)}</ul>}</section>
        <section className="staff-panel"><div className="staff-panel__heading"><div><span className="staff-kicker">ROLE POLICY</span><h2>บทบาทใน tenant</h2></div><span>{roles.length}</span></div><ul className="staff-role-list">{roles.map((role: RoleDefinition) => <li key={role.id}><strong>{role.displayName}</strong><small>{role.code} · {role.kind} · {role.permissions.length} permissions</small></li>)}</ul><p className="staff-muted">Built-in role policy แก้ไขไม่ได้จาก tenant; custom role ต้องผ่าน permission allowlist</p></section>
      </aside></section>
    <footer className="staff-footer"><span>audit {data.audit.length} รายการ · PII mask enabled · last-admin guard enabled</span><Link href="/admin?role=TENANT_ADMIN">กลับ dashboard</Link></footer>
  </AdminShell>;
}
