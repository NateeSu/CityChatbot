"use client";

import Link from "next/link";
import { useState } from "react";

import type { JobOperationsSnapshot, JobView } from "@citychatbot/job-ops";

import { ErrorState, ExpiredSessionState, LoadingState, OfflineState, PermissionDeniedState } from "../../ui/states";
import type { AdminIdentity } from "../admin-navigation";
import "./job-ops.css";

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };
type ErrorKind = "error" | "offline" | "permission" | "expired";

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const statusLabel: Record<JobView["status"], string> = { QUEUED: "รอทำงาน", RUNNING: "กำลังทำงาน", SUCCEEDED: "สำเร็จ", RETRY_WAIT: "รอ retry", DEAD: "DLQ", QUARANTINED: "กักกัน", CANCELLED: "ยกเลิก" };

async function requestJobs<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as ApiEnvelope<T> | undefined;
  if (!response.ok) { const error = new Error(payload?.error?.message ?? "ไม่สามารถโหลดงานระบบได้"); error.name = payload?.error?.code ?? "PROCESSING_FAILED"; throw error; }
  if (!payload?.data) throw new Error("job operations response ไม่มีข้อมูล");
  return payload.data;
}

const errorKind = (error: unknown): ErrorKind => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof Error && error.name === "FORBIDDEN") return "permission";
  if (error instanceof Error && error.name === "NOT_FOUND") return "expired";
  return "error";
};

function ErrorSurface({ kind, retry }: { kind: ErrorKind; retry: () => void }) {
  if (kind === "offline") return <OfflineState action={<button className="job-ops-button job-ops-button--primary" onClick={retry} type="button">ลองเชื่อมต่ออีกครั้ง</button>} />;
  if (kind === "permission") return <PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} />;
  if (kind === "expired") return <ExpiredSessionState action={<button className="job-ops-button job-ops-button--primary" onClick={retry} type="button">เริ่ม session ใหม่</button>} />;
  return <ErrorState action={<button className="job-ops-button job-ops-button--primary" onClick={retry} type="button">ลองใหม่</button>} />;
}

export function JobOperationsPanel({ identity, initialSnapshot }: { identity: AdminIdentity; initialSnapshot: JobOperationsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [workingJobId, setWorkingJobId] = useState<string>();
  const [errorState, setErrorState] = useState<ErrorKind>();
  const [notice, setNotice] = useState<string>();
  const refresh = async () => { setLoading(true); setErrorState(undefined); try { setSnapshot(await requestJobs<JobOperationsSnapshot>(`/api/v1/admin/job-operations?${identityQuery(identity)}`)); } catch (error) { setErrorState(errorKind(error)); } finally { setLoading(false); } };
  const replay = async (job: JobView) => {
    if (identity.role !== "TENANT_ADMIN") return;
    setWorkingJobId(job.id); setErrorState(undefined);
    try {
      await requestJobs<JobView>(`/api/v1/admin/job-operations?${identityQuery(identity)}`, { method: "POST", headers: { "idempotency-key": `job-replay-ui-${job.id}` }, body: JSON.stringify({ jobId: job.id, reason: "ตรวจสอบ DLQ และแก้ไขสาเหตุแล้ว", idempotencyKey: `job-replay-ui-${job.id}`, quarantineApproved: job.status === "QUARANTINED" }) });
      setNotice(`ส่ง ${job.jobType} กลับเข้า queue แล้ว`);
      await refresh();
    } catch (error) { setErrorState(errorKind(error)); }
    finally { setWorkingJobId(undefined); }
  };
  return <section className="job-ops-panel" aria-labelledby="job-ops-title" aria-busy={loading || Boolean(workingJobId)}>
    <header className="job-ops-heading"><div><span className="job-ops-kicker">JOB OPERATIONS / DLQ</span><h2 id="job-ops-title">งานระบบและการกู้คืน</h2><p>inventory, retry, DLQ, replay และ reconciliation จาก trusted server boundary โดยไม่แสดง payload ดิบ</p></div><button className="job-ops-button job-ops-button--secondary" disabled={loading || Boolean(workingJobId)} onClick={() => void refresh()} type="button">{loading ? "กำลังโหลด…" : "รีเฟรชงานระบบ"}</button></header>
    {notice ? <p className="job-ops-notice" role="status">{notice}</p> : null}
    {errorState ? <div className="job-ops-inline-state"><ErrorSurface kind={errorState} retry={() => void refresh()} /></div> : null}
    {loading && snapshot.jobs.length === 0 ? <LoadingState title="กำลังโหลดงานระบบ" message="กำลังอ่านสถานะ queue และ DLQ" /> : null}
    <div className="job-ops-summary" aria-label="สรุปงานระบบ"><div><span>job definitions</span><strong>{snapshot.definitions.length}</strong></div><div><span>jobs ใน tenant</span><strong>{snapshot.jobs.length}</strong></div><div><span>DLQ / quarantine</span><strong>{snapshot.dlq.length}</strong></div><div><span>reconciliation</span><strong>{snapshot.reconciliation.status}</strong></div><div><span>audit events</span><strong>{snapshot.audit.length}</strong></div></div>
    <section className="job-ops-card" aria-labelledby="job-inventory-title"><div className="job-ops-card-heading"><div><h3 id="job-inventory-title">Job inventory</h3><p>owner, SLO, idempotency boundary และ runbook</p></div><span>{snapshot.definitions.length} definitions</span></div><div className="job-ops-table-wrap"><table className="job-ops-table"><caption className="sr-only">Job inventory และ policy</caption><thead><tr><th scope="col">Job</th><th scope="col">Owner / SLO</th><th scope="col">Idempotency key</th><th scope="col">Runbook</th></tr></thead><tbody>{snapshot.definitions.map((definition) => <tr key={definition.jobType}><th scope="row"><strong>{definition.jobType}</strong><small>{definition.purpose}</small></th><td>{definition.owner}<small>{definition.sloTargetMs.toLocaleString("th-TH")} ms · max {definition.maxAttempts} attempts</small></td><td><code>{definition.idempotencyKey}</code><small>v{definition.version}</small></td><td><Link href={`/runbooks/${definition.runbookId}`}>{definition.runbookId}</Link></td></tr>)}</tbody></table></div></section>
    <div className="job-ops-grid"><section className="job-ops-card" aria-labelledby="job-dlq-title"><div className="job-ops-card-heading"><div><h3 id="job-dlq-title">DLQ / poison quarantine</h3><p>replay ได้เฉพาะ TENANT_ADMIN และต้องมีเหตุผล</p></div><span>{snapshot.dlq.length} รายการ</span></div>{snapshot.dlq.length === 0 ? <p className="job-ops-muted">ไม่มี job ที่ต้องกู้คืน</p> : <ul className="job-ops-list">{snapshot.dlq.map((job) => <li key={job.id}><div><strong>{job.jobType}</strong><span>{statusLabel[job.status]} · attempt {job.attemptCount}/{job.maxAttempts}</span><small>{job.errorCode ?? "ไม่พบ error code"} · {job.deadLetterReason ?? "รอ operator review"}</small></div><button className="job-ops-button job-ops-button--primary" disabled={identity.role !== "TENANT_ADMIN" || Boolean(workingJobId)} onClick={() => void replay(job)} type="button">{workingJobId === job.id ? "กำลัง replay…" : "Replay"}</button></li>)}</ul>}</section><section className="job-ops-card" aria-labelledby="job-reconcile-title"><div className="job-ops-card-heading"><div><h3 id="job-reconcile-title">Reconciliation</h3><p>ตรวจ document expiry, news, SLA และ KPI jobs</p></div><span className={`job-ops-reconcile job-ops-reconcile--${snapshot.reconciliation.status.toLowerCase()}`}>{snapshot.reconciliation.status}</span></div><dl className="job-ops-reconcile-list"><div><dt>missing</dt><dd>{snapshot.reconciliation.missingJobTypes.length ? snapshot.reconciliation.missingJobTypes.join(", ") : "ไม่มี"}</dd></div><div><dt>dead</dt><dd>{snapshot.reconciliation.deadJobIds.length}</dd></div><div><dt>quarantine</dt><dd>{snapshot.reconciliation.quarantinedJobIds.length}</dd></div><div><dt>duplicate idempotency</dt><dd>{snapshot.reconciliation.duplicateIdempotencyKeys.length ? snapshot.reconciliation.duplicateIdempotencyKeys.join(", ") : "ไม่มี"}</dd></div></dl></section></div>
    <footer className="job-ops-footer"><span>cron signature required · payload refs redacted · replay audited · no direct DB edit</span><span>last checked {snapshot.reconciliation.checkedAt}</span></footer>
  </section>;
}
