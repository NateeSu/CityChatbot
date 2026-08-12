"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import type { ProvisioningRun, TenantProvisioningSnapshot, TenantRecord } from "@citychatbot/tenant-provisioning";

import { EmptyState, ErrorState, ExpiredSessionState, LoadingState, OfflineState, StaleState } from "../../ui/states";
import "./system.css";

type SystemTenantConsoleProps = { initialSnapshot: TenantProvisioningSnapshot; mode: "list" | "new" };
type TenantForm = { slug: string; displayName: string; packageCode: "PILOT" | "STANDARD" | "ENTERPRISE"; isTestTenant: boolean; reason: string };

const systemQuery = "systemRole=SUPER_ADMIN&accountId=90000000-0000-4000-8000-000000000001&stepUp=1";
const idempotencyKey = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const requestJson = async (url: string, init?: RequestInit): Promise<unknown> => { const response = await fetch(url, { cache: "no-store", ...init }); const payload: unknown = await response.json().catch(() => undefined); if (!response.ok) { const body = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined; throw new Error(`${body?.error?.reasonCode ?? "PROCESSING_FAILED"}: ${body?.error?.message ?? "ไม่สามารถดำเนินการได้"}`); } return payload; };
const blankForm = (): TenantForm => ({ slug: "", displayName: "", packageCode: "PILOT", isTestTenant: true, reason: "เริ่ม pilot tenant จาก S-02" });
const statusLabel = (tenant: TenantRecord): string => tenant.provisioningStatus === "COMPLETE" ? tenant.status : `provisioning ${tenant.provisioningStatus}`;
const runFor = (runs: readonly ProvisioningRun[], tenantId: string): ProvisioningRun | undefined => runs.find((run) => run.tenantId === tenantId);

export function SystemTenantConsole({ initialSnapshot, mode }: SystemTenantConsoleProps) {
  const [data, setData] = useState(initialSnapshot);
  const [form, setForm] = useState<TenantForm>(blankForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [expired, setExpired] = useState(false);
  const [stale, setStale] = useState(false);

  const refresh = async (): Promise<void> => {
    if (!navigator.onLine) { setOffline(true); return; }
    setLoading(true); setError(undefined); setStale(false);
    try { setData(await requestJson(`/api/v1/system/tenants?${systemQuery}`) as TenantProvisioningSnapshot); setOffline(false); } catch (caught) { const message = caught instanceof Error ? caught.message : "ไม่สามารถโหลด tenant ได้"; setExpired(message.includes("UNAUTHENTICATED")); setError(message); setStale(true); } finally { setLoading(false); }
  };

  const createTenant = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); setError(undefined); setNotice(undefined); setLoading(true);
    try { const result = await requestJson(`/api/v1/system/tenants?${systemQuery}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, idempotencyKey: idempotencyKey("tenant-provision") }) }) as { tenant: TenantRecord; run: ProvisioningRun }; setNotice(`สร้าง ${result.tenant.slug} และรัน provisioning ${result.run.status} แล้ว`); setForm(blankForm()); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "สร้าง tenant ไม่สำเร็จ"); } finally { setLoading(false); }
  };

  const tenantAction = async (tenant: TenantRecord, action: "resume" | "suspend" | "reactivate" | "archive"): Promise<void> => {
    setError(undefined); setNotice(undefined);
    try {
      const body = action === "archive" ? { expectedVersion: tenant.rowVersion, verificationText: tenant.slug, reason: "archive verified test tenant จาก S-01" } : { expectedVersion: tenant.rowVersion, reason: `${action} จาก S-01` };
      await requestJson(`/api/v1/system/tenants/${tenant.id}/${action}?${systemQuery}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: idempotencyKey(`tenant-${action}`) }) }); setNotice(`ดำเนินการ ${action} สำเร็จ`); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ดำเนินการ tenant ไม่สำเร็จ"); }
  };

  const activeFlags = useMemo(() => data.flags.filter((flag) => flag.enabled).length, [data.flags]);
  return <main className="system-shell">
    <header className="system-heading"><div><span className="system-kicker">{mode === "new" ? "S-02 · PROVISION WIZARD" : "S-01 · TENANT OPERATIONS"}</span><h1>{mode === "new" ? "สร้าง Tenant ใหม่" : "Tenant และการ Provision"}</h1><p>{mode === "new" ? "ดำเนินตาม dependency order และ resume ได้เมื่อขั้นตอนใดล้มเหลว" : "Super Admin เห็นเฉพาะ metadata, health, usage และ onboarding state; ไม่มี impersonation"}</p></div><div className="system-heading__actions"><span className="system-role">SUPER_ADMIN · MFA step-up</span><button className="system-button system-button--secondary" onClick={() => void refresh()} type="button">รีเฟรช</button></div></header>
    {error ? <div className="system-alert" role="alert">{error}</div> : null}{notice ? <div className="system-alert system-alert--success" role="status">{notice}</div> : null}
    {expired ? <ExpiredSessionState action={<Link href="/">กลับหน้าเริ่มต้น</Link>} /> : null}{offline ? <OfflineState action={<button className="system-button system-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่อใหม่</button>} /> : null}{stale ? <StaleState action={<button className="system-button system-button--secondary" onClick={() => void refresh()} type="button">โหลดข้อมูลล่าสุด</button>} /> : null}
    {mode === "new" ? <section className="system-wizard"><div className="system-panel"><div className="system-panel__heading"><div><span className="system-kicker">DEPENDENCY ORDER</span><h2>Provisioning checklist</h2></div><Link href={`/system/tenants?${systemQuery}`}>กลับ S-01</Link></div><ol className="system-steps"><li>สร้าง tenant + timezone</li><li>ตั้งค่า tenant settings</li><li>จอง channel/LIFF โดยไม่เก็บ secret ใน UI</li><li>สร้าง departments และผู้ดูแลเริ่มต้น</li><li>ใช้ default theme/menu/contact</li><li>เปิด flags และ limits ตาม package</li></ol><p className="system-muted">Production จะต้องผูก trusted secret reference และรัน canary ก่อนเปิด citizen traffic</p></div><form className="system-panel system-form" onSubmit={(event) => void createTenant(event)}><h2>Tenant details</h2><label>Slug<input maxLength={64} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]" required value={form.slug} /></label><label>ชื่อ tenant<input maxLength={200} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required value={form.displayName} /></label><label>Package<select onChange={(event) => setForm((current) => ({ ...current, packageCode: event.target.value as TenantForm["packageCode"] }))} value={form.packageCode}><option value="PILOT">PILOT</option><option value="STANDARD">STANDARD</option><option value="ENTERPRISE">ENTERPRISE</option></select></label><label className="system-checkbox"><input checked={form.isTestTenant} onChange={(event) => setForm((current) => ({ ...current, isTestTenant: event.target.checked }))} type="checkbox" /> ทำเครื่องหมายเป็น test tenant (จำเป็นสำหรับ rollback archive)</label><label>เหตุผล<input maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required value={form.reason} /></label><button className="system-button system-button--primary" disabled={loading} type="submit">เริ่ม Provisioning</button></form></section> : <section className="system-dashboard"><div className="system-dashboard__summary"><div><strong>{data.tenants.length}</strong><span>tenants</span></div><div><strong>{activeFlags}</strong><span>flags เปิด</span></div><div><strong>{data.usage.length}</strong><span>usage counters</span></div><Link className="system-button system-button--primary" href={`/system/tenants/new?${systemQuery}`}>+ สร้าง Tenant</Link></div>{loading ? <LoadingState title="กำลังโหลด tenant" message="กำลังตรวจสอบ provisioning, flags และ usage" /> : data.tenants.length === 0 ? <EmptyState title="ยังไม่มี tenant" message="เริ่มสร้าง pilot tenant จาก S-02" /> : <div className="system-tenant-grid">{data.tenants.map((tenant) => { const run = runFor(data.runs, tenant.id); return <article className="system-tenant-card" key={tenant.id}><div className="system-tenant-card__top"><div><span className="system-kicker">{tenant.packageCode} · {tenant.slug}</span><h2>{tenant.displayName}</h2><p>{tenant.defaultTimezone} · {tenant.isTestTenant ? "test tenant" : "production target"}</p></div><span className={`system-status system-status--${tenant.status.toLowerCase()}`}>{statusLabel(tenant)}</span></div>{run ? <div className="system-progress"><strong>Provisioning {run.status}</strong><progress max={run.steps.length} value={run.steps.filter((step) => step.status === "SUCCEEDED").length} /><small>{run.steps.filter((step) => step.status === "SUCCEEDED").length}/{run.steps.length} steps · attempt {Math.max(...run.steps.map((step) => step.attempt), 0)}</small><ul>{run.steps.map((step) => <li key={step.key}><span>{step.key}</span><span>{step.status}</span></li>)}</ul></div> : <p className="system-muted">provisioning history พร้อมตรวจสอบ</p>}<dl><div><dt>Flags</dt><dd>{data.flags.filter((flag) => flag.tenantId === tenant.id && flag.enabled).length} เปิด</dd></div><div><dt>Limits</dt><dd>{data.limits.filter((limit) => limit.tenantId === tenant.id).length} configured</dd></div><div><dt>Version</dt><dd>{tenant.rowVersion}</dd></div></dl><div className="system-card-actions">{tenant.provisioningStatus !== "COMPLETE" ? <button className="system-button system-button--secondary" onClick={() => void tenantAction(tenant, "resume")} type="button">Resume</button> : null}{tenant.status === "ACTIVE" ? <button className="system-button system-button--secondary" onClick={() => void tenantAction(tenant, "suspend")} type="button">Suspend</button> : tenant.status === "SUSPENDED" && tenant.provisioningStatus === "COMPLETE" ? <button className="system-button system-button--secondary" onClick={() => void tenantAction(tenant, "reactivate")} type="button">Reactivate</button> : null}{tenant.isTestTenant && tenant.status !== "ARCHIVED" ? <button className="system-button system-button--danger" onClick={() => void tenantAction(tenant, "archive")} type="button">Archive test</button> : null}</div></article>; })}</div>}</section>}
    <footer className="system-footer"><span>no impersonation · sensitive secrets are references only · all mutations audited</span><Link href="/">กลับหน้าเริ่มต้น</Link></footer>
  </main>;
}
