"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { AdminJob, AuditEntry, AuditOperationsSnapshot, ExportRecord, NotificationPage } from "@citychatbot/audit-observability";
import type { SloDashboard } from "@citychatbot/slo";
import type { JobOperationsSnapshot } from "@citychatbot/job-ops";
import type { IncidentSnapshot } from "@citychatbot/incident-ops";

import { EmptyState, ErrorState, ExpiredSessionState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../ui/states";
import { AdminShell } from "../AdminShell";
import type { AdminIdentity } from "../admin-navigation";
import { SloDashboardPanel } from "./SloDashboardPanel";
import { JobOperationsPanel } from "./JobOperationsPanel";
import { IncidentOperationsPanel } from "./IncidentOperationsPanel";
import "./audit.css";

type AuditConsoleProps = { identity: AdminIdentity; initialSnapshot: AuditOperationsSnapshot; initialSloSnapshot: SloDashboard; initialJobSnapshot: JobOperationsSnapshot; initialIncidentSnapshot: IncidentSnapshot };
type ApiEnvelope<T> = { data: T; error?: { code?: string; message?: string } };
type ErrorStateKind = "error" | "offline" | "permission" | "expired" | "stale";

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, stepUp: "1" }).toString();
const dateText = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const stateLabel: Record<ExportRecord["status"], string> = { REQUESTED: "รอรับคำขอ", APPROVED: "อนุมัติแล้ว", QUEUED: "เข้าคิวสร้างไฟล์", READY: "พร้อมดาวน์โหลด", EXPIRED: "หมดอายุ", REVOKED: "ถูกยกเลิก", FAILED: "ล้มเหลว" };
const priorityLabel: Record<NotificationPage["items"][number]["priority"], string> = { INFO: "ข้อมูล", WARNING: "ควรติดตาม", CRITICAL: "เร่งด่วน" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as ApiEnvelope<T> | undefined;
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? "ไม่สามารถดำเนินการได้");
    error.name = payload?.error?.code ?? "PROCESSING_FAILED";
    throw error;
  }
  return payload?.data as T;
}

const errorKind = (error: unknown): ErrorStateKind => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof Error && error.name === "FORBIDDEN") return "permission";
  if (error instanceof Error && error.name === "NOT_FOUND") return "expired";
  return "error";
};

function ErrorSurface({ kind, retry }: { kind: ErrorStateKind; retry: () => void }) {
  if (kind === "offline") return <OfflineState action={<button className="audit-button audit-button--primary" onClick={retry} type="button">ลองเชื่อมต่ออีกครั้ง</button>} />;
  if (kind === "permission") return <PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} />;
  if (kind === "expired") return <ExpiredSessionState action={<button className="audit-button audit-button--primary" onClick={retry} type="button">เริ่ม session ใหม่</button>} />;
  if (kind === "stale") return <StaleState action={<button className="audit-button audit-button--primary" onClick={retry} type="button">โหลดข้อมูลล่าสุด</button>} />;
  return <ErrorState action={<button className="audit-button audit-button--primary" onClick={retry} type="button">ลองใหม่</button>} />;
}

export function AuditConsole({ identity, initialSnapshot, initialSloSnapshot, initialJobSnapshot, initialIncidentSnapshot }: AuditConsoleProps) {
  const [data, setData] = useState<AuditOperationsSnapshot>(initialSnapshot);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [selected, setSelected] = useState<AuditEntry>();
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<ErrorStateKind>();
  const [notice, setNotice] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const query = identityQuery(identity);

  const visibleAudit = useMemo(() => data.audit.items.filter((entry) => (!actionFilter || entry.action.includes(actionFilter.trim().toUpperCase())) && (!resourceFilter || entry.resourceType.includes(resourceFilter.trim().toUpperCase()))), [actionFilter, data.audit.items, resourceFilter]);

  const refresh = async () => {
    setLoading(true);
    setErrorState(undefined);
    try {
      const [audit, notifications, jobs] = await Promise.all([
        requestJson<AuditOperationsSnapshot["audit"]>(`/api/v1/admin/audit-logs?${query}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}${resourceFilter ? `&resourceType=${encodeURIComponent(resourceFilter)}` : ""}`),
        requestJson<AuditOperationsSnapshot["notifications"]>(`/api/v1/admin/notifications?${query}`),
        requestJson<{ items: readonly AdminJob[] }>(`/api/v1/admin/jobs?${query}`),
      ]);
      setData((current) => ({ ...current, audit, notifications, jobs: jobs.items }));
      setNotice("โหลด audit, notification และ jobs ล่าสุดแล้ว");
    } catch (error) {
      setErrorState(errorKind(error));
    } finally { setLoading(false); }
  };

  const markRead = async (id: string, rowVersion: number) => {
    try {
      const updated = await requestJson<NotificationPage["items"][number]>(`/api/v1/admin/notifications/${id}/read?${query}`, { method: "POST", body: JSON.stringify({ expectedVersion: rowVersion }) });
      setData((current) => ({ ...current, notifications: { ...current.notifications, items: current.notifications.items.map((item) => item.id === updated.id ? updated : item), unreadCount: current.notifications.items.filter((item) => item.id === updated.id ? !updated.readAt : !item.readAt).length } }));
      setNotice("ทำเครื่องหมายอ่านแล้ว");
    } catch (error) { setErrorState(errorKind(error)); }
  };

  const requestAuditExport = async () => {
    setExporting(true);
    try {
      const exportRecord = await requestJson<ExportRecord>("/api/v1/admin/audit-log-exports", { method: "POST", headers: { "idempotency-key": `audit-ui-${crypto.randomUUID()}` }, body: JSON.stringify({ format: "CSV", filters: { action: actionFilter || undefined, resourceType: resourceFilter || undefined }, reason: "ตรวจสอบย้อนหลังจาก A-97", expectedVersion: 1, estimatedRows: 10 }) });
      setData((current) => ({ ...current, exports: [exportRecord, ...current.exports] }));
      setNotice(exportRecord.status === "READY" ? "สร้างไฟล์ audit และออก signed URL แล้ว" : "รับคำขอ export แล้ว กำลังสร้างไฟล์แบบ background");
    } catch (error) { setErrorState(errorKind(error)); }
    finally { setExporting(false); }
  };

  if (errorState && !data.audit.items.length) return <AdminShell activeId="audit" breadcrumbs={["Audit และงานระบบ"]} identity={identity}><ErrorSurface kind={errorState} retry={() => void refresh()} /></AdminShell>;

  return <AdminShell activeId="audit" breadcrumbs={["Audit และงานระบบ"]} identity={identity} notificationCount={data.notifications.unreadCount}>
    <main className="audit-page" aria-busy={loading}>
      <header className="audit-heading"><div><span className="audit-kicker">A-97 · IMMUTABLE OPERATIONS</span><h1>Audit และงานระบบ</h1><p>ตรวจสอบการเปลี่ยนแปลงย้อนหลัง การแจ้งเตือน และ export ที่มีสิทธิ์ควบคุม</p></div><div className="audit-heading__actions"><span className={`audit-integrity ${data.audit.integrityValid ? "is-valid" : "is-invalid"}`}>{data.audit.integrityValid ? "hash-chain ปกติ" : "พบความผิดปกติ"}</span><button className="audit-button audit-button--secondary" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "กำลังโหลด…" : "รีเฟรช"}</button></div></header>
      {notice ? <p className="audit-notice" role="status">{notice}</p> : null}
      {errorState ? <div className="audit-inline-state"><ErrorSurface kind={errorState} retry={() => void refresh()} /></div> : null}
      <SloDashboardPanel identity={identity} initialSnapshot={initialSloSnapshot} />
      <JobOperationsPanel identity={identity} initialSnapshot={initialJobSnapshot} />
      <IncidentOperationsPanel identity={identity} initialSnapshot={initialIncidentSnapshot} />
      <section className="audit-grid" aria-label="Audit workspace">
        <div className="audit-main-column">
          <section className="audit-card audit-filter-card" aria-labelledby="audit-filter-title"><div className="audit-card-heading"><div><h2 id="audit-filter-title">ค้นหา audit</h2><p>กรองด้วย action หรือ resource ได้เฉพาะใน tenant และ role scope นี้</p></div><span>{data.audit.total} รายการ</span></div><div className="audit-filter-row"><label>Action<input onChange={(event) => setActionFilter(event.target.value)} placeholder="เช่น EXPORT_READY" value={actionFilter} /></label><label>Resource type<input onChange={(event) => setResourceFilter(event.target.value)} placeholder="เช่น EXPORT" value={resourceFilter} /></label><button className="audit-button audit-button--secondary" onClick={() => void refresh()} type="button">ใช้ตัวกรอง</button></div></section>
          <section className="audit-card" aria-labelledby="audit-list-title"><div className="audit-card-heading"><div><h2 id="audit-list-title">Immutable audit log</h2><p>ข้อมูล diff แสดงเฉพาะค่าที่ผ่าน redaction แล้ว</p></div></div>{visibleAudit.length === 0 ? <EmptyState title="ยังไม่มี audit ที่ตรงตัวกรอง" message="ลองล้างตัวกรองหรือรอให้มี mutation ที่เกี่ยวข้อง" /> : <div className="audit-table-wrap"><table className="audit-table"><caption className="sr-only">รายการ audit ที่อ่านได้</caption><thead><tr><th scope="col">เวลา</th><th scope="col">Action</th><th scope="col">Resource</th><th scope="col">เหตุผล</th></tr></thead><tbody>{visibleAudit.map((entry) => <tr className={selected?.id === entry.id ? "is-selected" : undefined} key={entry.id}><td><button className="audit-row-button" onClick={() => setSelected(entry)} type="button"><time dateTime={entry.createdAt}>{dateText(entry.createdAt)}</time><small>{entry.actorAccountId ?? entry.actorType}</small></button></td><td><strong>{entry.action}</strong></td><td>{entry.resourceType}<small>{entry.resourceId}</small></td><td>{entry.reason}</td></tr>)}</tbody></table></div>}</section>
          {selected ? <section className="audit-card audit-detail" aria-labelledby="audit-detail-title"><div className="audit-card-heading"><div><h2 id="audit-detail-title">รายละเอียด audit</h2><p>{selected.action} · {selected.resourceType} · {dateText(selected.createdAt)}</p></div><button className="audit-button audit-button--secondary" onClick={() => setSelected(undefined)} type="button">ปิดรายละเอียด</button></div><dl className="audit-detail-list"><div><dt>Actor</dt><dd>{selected.actorAccountId ?? selected.actorType}</dd></div><div><dt>Request / correlation</dt><dd>{selected.requestId} / {selected.correlationId}</dd></div><div><dt>Integrity</dt><dd>{selected.integrityHash}</dd></div></dl><div className="audit-diff-grid"><div><h3>ก่อนเปลี่ยน</h3><pre>{JSON.stringify(selected.beforeRedactedJson ?? {}, null, 2)}</pre></div><div><h3>หลังเปลี่ยน</h3><pre>{JSON.stringify(selected.afterRedactedJson ?? {}, null, 2)}</pre></div></div></section> : null}
        </div>
        <aside className="audit-side-column">
          <section className="audit-card" aria-labelledby="notification-title"><div className="audit-card-heading"><div><h2 id="notification-title">การแจ้งเตือน</h2><p>{data.notifications.unreadCount} รายการยังไม่อ่าน</p></div></div>{data.notifications.items.length === 0 ? <EmptyState title="ไม่มีการแจ้งเตือน" /> : <ul className="audit-notification-list">{data.notifications.items.map((notification) => <li className={notification.readAt ? "is-read" : ""} key={notification.id}><div><span className={`audit-priority audit-priority--${notification.priority.toLowerCase()}`}>{priorityLabel[notification.priority]}</span><strong>{notification.title}</strong><p>{notification.body}</p><small>{dateText(notification.createdAt)}</small></div>{notification.readAt ? <span className="audit-read-label">อ่านแล้ว</span> : <button aria-label={`ทำเครื่องหมาย ${notification.title} ว่าอ่านแล้ว`} className="audit-button audit-button--text" onClick={() => void markRead(notification.id, notification.rowVersion)} type="button">อ่านแล้ว</button>}</li>)}</ul>}</section>
          <section className="audit-card" aria-labelledby="export-title"><div className="audit-card-heading"><div><h2 id="export-title">Privileged export</h2><p>ต้องเป็น Tenant Admin, มีเหตุผล, watermark และ signed URL อายุ 5 นาที</p></div></div><button className="audit-button audit-button--primary" disabled={exporting || identity.role !== "TENANT_ADMIN"} onClick={() => void requestAuditExport()} type="button">{exporting ? "กำลังสร้าง…" : "ขอ export audit CSV"}</button>{identity.role !== "TENANT_ADMIN" ? <p className="audit-muted">Executive ดูสถานะได้ แต่ไม่สามารถ export ได้</p> : null}<ul className="audit-export-list">{data.exports.length === 0 ? <li className="audit-muted">ยังไม่มีคำขอ export</li> : data.exports.map((record) => <li key={record.id}><div><strong>{stateLabel[record.status]}</strong><span>{record.exportType} · {record.rowCount} rows</span><small>{dateText(record.requestedAt)}</small></div>{record.signedUrl ? <a className="audit-download" href={record.signedUrl}>ดาวน์โหลด</a> : null}</li>)}</ul></section>
          <section className="audit-card" aria-labelledby="jobs-title"><div className="audit-card-heading"><div><h2 id="jobs-title">Jobs / DLQ</h2><p>สถานะ background work และงานที่ต้องติดตาม</p></div></div>{data.jobs.length === 0 ? <EmptyState title="ไม่มี job ในขอบเขตนี้" /> : <ul className="audit-job-list">{data.jobs.map((job) => <li key={job.id}><strong>{job.jobType}</strong><span>{job.status} · attempt {job.attemptCount}/{job.maxAttempts}</span><small>{dateText(job.updatedAt)}</small></li>)}</ul>}</section>
        </aside>
      </section>
      <footer className="audit-footer"><span>tenant isolation · redacted diff · audit export ทุก lifecycle · production adapter fail-closed</span><Link href="/admin">กลับ dashboard</Link></footer>
    </main>
  </AdminShell>;
}
