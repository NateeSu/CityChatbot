"use client";

import Link from "next/link";
import { useState } from "react";

import type { IncidentSnapshot, IncidentStatus, IncidentRecord, KillSwitchRecord } from "@citychatbot/incident-ops";

import { ErrorState, ExpiredSessionState, LoadingState, OfflineState, PermissionDeniedState } from "../../ui/states";
import type { AdminIdentity } from "../admin-navigation";
import "./incident-ops.css";

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };
type ErrorKind = "error" | "offline" | "permission" | "expired";

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const statusLabel: Record<IncidentStatus, string> = { DECLARED: "ประกาศเหตุ", CONTAINING: "กำลังควบคุม", RECOVERING: "กำลังกู้คืน", RESOLVED: "แก้ไขแล้ว", ACCEPTED: "ปิดรับรอง" };

async function requestIncident<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as ApiEnvelope<T> | undefined;
  if (!response.ok) { const error = new Error(payload?.error?.message ?? "ไม่สามารถอ่านสถานะ incident ได้"); error.name = payload?.error?.code ?? "PROCESSING_FAILED"; throw error; }
  if (!payload?.data) throw new Error("incident response ไม่มีข้อมูล");
  return payload.data;
}

const errorKind = (error: unknown): ErrorKind => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof Error && error.name === "FORBIDDEN") return "permission";
  if (error instanceof Error && error.name === "NOT_FOUND") return "expired";
  return "error";
};

function IncidentErrorSurface({ kind, retry }: { kind: ErrorKind; retry: () => void }) {
  if (kind === "offline") return <OfflineState action={<button className="incident-ops-button incident-ops-button--primary" onClick={retry} type="button">ลองเชื่อมต่ออีกครั้ง</button>} />;
  if (kind === "permission") return <PermissionDeniedState />;
  if (kind === "expired") return <ExpiredSessionState action={<button className="incident-ops-button incident-ops-button--primary" onClick={retry} type="button">เริ่ม session ใหม่</button>} />;
  return <ErrorState action={<button className="incident-ops-button incident-ops-button--primary" onClick={retry} type="button">ลองใหม่</button>} />;
}

const activeSwitchesFor = (snapshot: IncidentSnapshot, incidentId: string): readonly KillSwitchRecord[] => snapshot.killSwitches.filter((record) => record.incidentId === incidentId && record.status === "ACTIVE");

export function IncidentOperationsPanel({ identity, initialSnapshot }: { identity: AdminIdentity; initialSnapshot: IncidentSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorState, setErrorState] = useState<ErrorKind>();
  const [notice, setNotice] = useState<string>();
  const refresh = async () => { setLoading(true); setErrorState(undefined); try { setSnapshot(await requestIncident<IncidentSnapshot>(`/api/v1/admin/incident-operations?${identityQuery(identity)}`)); } catch (error) { setErrorState(errorKind(error)); } finally { setLoading(false); } };
  const activateHandoff = async (incident: IncidentRecord) => {
    if (identity.role !== "TENANT_ADMIN") return;
    setWorking(true); setErrorState(undefined);
    const key = `incident-ui-kill-${incident.id}`;
    try {
      await requestIncident(`/api/v1/admin/incident-operations?${identityQuery(identity)}`, { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ action: "ACTIVATE_KILL_SWITCH", incidentId: incident.id, scope: "FEATURE", target: "noncritical-ai", reason: "Force safe HANDOFF while incident is under review", idempotencyKey: key }) });
      setNotice("เปิด kill switch แบบจำกัดขอบเขตแล้ว");
      await refresh();
    } catch (error) { setErrorState(errorKind(error)); } finally { setWorking(false); }
  };
  return <section className="incident-ops-panel" aria-labelledby="incident-ops-title" aria-busy={loading || working}>
    <header className="incident-ops-heading"><div><span className="incident-ops-kicker">INCIDENT RESPONSE / COST CONTROL</span><h2 id="incident-ops-title">รับมือเหตุขัดข้องและควบคุมค่าใช้จ่าย</h2><p>S0–S3, commander, kill switch, evidence digest, status communication และ budget action จาก trusted server boundary</p></div><button className="incident-ops-button incident-ops-button--secondary" disabled={loading || working} onClick={() => void refresh()} type="button">{loading ? "กำลังโหลด…" : "รีเฟรชสถานะ"}</button></header>
    {notice ? <p className="incident-ops-notice" role="status">{notice}</p> : null}
    {errorState ? <div className="incident-ops-inline-state"><IncidentErrorSurface kind={errorState} retry={() => void refresh()} /></div> : null}
    {loading && snapshot.incidents.length === 0 ? <LoadingState title="กำลังโหลด incident" message="กำลังอ่านเหตุขัดข้องและ budget" /> : null}
    <div className="incident-ops-summary" aria-label="สรุป incident operations"><div><span>open incidents</span><strong>{snapshot.incidents.filter((incident) => incident.status !== "RESOLVED" && incident.status !== "ACCEPTED").length}</strong></div><div><span>active kill switches</span><strong>{snapshot.killSwitches.filter((record) => record.status === "ACTIVE").length}</strong></div><div><span>budget action</span><strong>{snapshot.budgets.filter((budget) => budget.level !== "OK").length}</strong></div><div><span>tabletop cases</span><strong>{snapshot.tabletopCases.length}</strong></div></div>
    <div className="incident-ops-grid"><section className="incident-ops-card" aria-labelledby="incident-list-title"><div className="incident-ops-card-heading"><div><h3 id="incident-list-title">Active incidents</h3><p>severity, owner, escalation, runbook และ containment state</p></div><span>{snapshot.incidents.length} รายการ</span></div>{snapshot.incidents.length === 0 ? <p className="incident-ops-muted">ยังไม่มี incident ใน tenant นี้</p> : <ul className="incident-ops-list">{snapshot.incidents.map((incident) => { const active = activeSwitchesFor(snapshot, incident.id); return <li key={incident.id}><div><strong>{incident.severity} · {incident.category}</strong><span>{statusLabel[incident.status]} · {incident.owner} · {incident.commander}</span><small>{incident.summary} · evidence {incident.evidenceDigests.length} digest · active switch {active.length}</small><Link href={`/runbooks/${incident.runbookId}`}>{incident.runbookId}</Link></div>{identity.role === "TENANT_ADMIN" && incident.status !== "ACCEPTED" && active.length === 0 ? <button className="incident-ops-button incident-ops-button--primary" disabled={working} onClick={() => void activateHandoff(incident)} type="button">เปิด kill switch</button> : null}</li>; })}</ul>}</section><section className="incident-ops-card" aria-labelledby="budget-title"><div className="incident-ops-card-heading"><div><h3 id="budget-title">Budget guard</h3><p>70% warn · 90% restrict noncritical AI · 100% safe HANDOFF</p></div><span>{snapshot.budgets.length} resources</span></div><div className="incident-ops-table-wrap"><table className="incident-ops-table"><caption className="sr-only">Budget guard by trusted usage</caption><thead><tr><th scope="col">Resource</th><th scope="col">Use</th><th scope="col">Action</th></tr></thead><tbody>{snapshot.budgets.map((budget) => <tr key={budget.resource}><th scope="row">{budget.resource}</th><td>{Math.round(budget.utilization * 100)}%</td><td><strong className={`incident-ops-level incident-ops-level--${budget.level.toLowerCase()}`}>{budget.level}</strong><small>{budget.coreComplaintAllowed ? "core complaint ยังทำงาน" : "blocked"}</small></td></tr>)}</tbody></table></div></section></div>
    <section className="incident-ops-card" aria-labelledby="playbook-title"><div className="incident-ops-card-heading"><div><h3 id="playbook-title">Incident playbooks</h3><p>failure matrix, escalation และ rollback scope ที่ versioned</p></div><span>{snapshot.playbooks.length} playbooks · Tabletop {snapshot.tabletopCases.length}</span></div><div className="incident-ops-table-wrap"><table className="incident-ops-table"><caption className="sr-only">Incident playbook inventory</caption><thead><tr><th scope="col">Category</th><th scope="col">Owner / severity</th><th scope="col">Kill-switch scopes</th><th scope="col">Runbook</th></tr></thead><tbody>{snapshot.playbooks.map((playbook) => <tr key={playbook.category}><th scope="row">{playbook.category}<small>{playbook.detection}</small></th><td>{playbook.owner}<small>{playbook.defaultSeverity} · {playbook.commander}</small></td><td><code>{playbook.killSwitchScopes.join(" → ")}</code></td><td><Link href={`/runbooks/${playbook.runbookId}`}>{playbook.runbookId}</Link></td></tr>)}</tbody></table></div></section>
    <footer className="incident-ops-footer"><span>S0/S1 preserve evidence · narrowest kill switch · core complaint/manual path protected · no raw PII/secret</span><span>tabletop {snapshot.tabletopCases.length} cases · postmortem fields {snapshot.postmortemTemplate.requiredFields.length}</span></footer>
  </section>;
}
