"use client";

import Link from "next/link";
import { useState } from "react";

import type { SloDashboard, SloEvaluation } from "@citychatbot/slo";

import { ErrorState, ExpiredSessionState, OfflineState, PermissionDeniedState, LoadingState } from "../../ui/states";
import type { AdminIdentity } from "../admin-navigation";
import "./slo.css";

type ApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };
type ErrorKind = "error" | "offline" | "permission" | "expired";

const statusLabel: Record<SloEvaluation["status"], string> = {
  HEALTHY: "ปกติ",
  AT_RISK: "ใกล้ใช้ budget หมด",
  BREACHED: "เกินเป้าหมาย",
  NO_DATA: "ยังไม่มีข้อมูล",
};

const statusClass: Record<SloEvaluation["status"], string> = {
  HEALTHY: "slo-status--healthy",
  AT_RISK: "slo-status--risk",
  BREACHED: "slo-status--breached",
  NO_DATA: "slo-status--nodata",
};

const dateText = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();

async function requestSlo(url: string): Promise<SloDashboard> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => undefined) as ApiEnvelope<SloDashboard> | undefined;
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? "ไม่สามารถโหลด SLO ได้");
    error.name = payload?.error?.code ?? "PROCESSING_FAILED";
    throw error;
  }
  if (!payload?.data) throw new Error("SLO response ไม่มีข้อมูล");
  return payload.data;
}

const errorKind = (error: unknown): ErrorKind => {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof Error && error.name === "FORBIDDEN") return "permission";
  if (error instanceof Error && error.name === "NOT_FOUND") return "expired";
  return "error";
};

function ErrorSurface({ kind, retry }: { kind: ErrorKind; retry: () => void }) {
  if (kind === "offline") return <OfflineState action={<button className="slo-button slo-button--primary" onClick={retry} type="button">ลองเชื่อมต่ออีกครั้ง</button>} />;
  if (kind === "permission") return <PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} />;
  if (kind === "expired") return <ExpiredSessionState action={<button className="slo-button slo-button--primary" onClick={retry} type="button">เริ่ม session ใหม่</button>} />;
  return <ErrorState action={<button className="slo-button slo-button--primary" onClick={retry} type="button">ลองใหม่</button>} />;
}

const metricText = (evaluation: SloEvaluation): string => {
  if (evaluation.measuredValue === undefined) return "—";
  if (evaluation.definition.unit === "RATIO") return `${(evaluation.measuredValue * 100).toFixed(3)}%`;
  return `${Math.round(evaluation.measuredValue).toLocaleString("th-TH")} ms`;
};

const targetText = (evaluation: SloEvaluation): string => evaluation.definition.unit === "RATIO"
  ? `≥ ${(evaluation.definition.targetValue * 100).toFixed(2)}%`
  : `≤ ${evaluation.definition.targetValue.toLocaleString("th-TH")} ms (${Math.round((evaluation.definition.percentile ?? 0.95) * 100)}th)`;

export function SloDashboardPanel({ identity, initialSnapshot }: { identity: AdminIdentity; initialSnapshot: SloDashboard }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<ErrorKind>();
  const refresh = async () => {
    setLoading(true);
    setErrorState(undefined);
    try { setSnapshot(await requestSlo(`/api/v1/admin/slo?${identityQuery(identity)}`)); }
    catch (error) { setErrorState(errorKind(error)); }
    finally { setLoading(false); }
  };
  return <section className="slo-panel" aria-labelledby="slo-panel-title" aria-busy={loading}>
    <header className="slo-panel__heading"><div><span className="slo-kicker">SLO / ERROR BUDGET</span><h2 id="slo-panel-title">สุขภาพระบบและการแจ้งเตือน</h2><p>ตัวเลขจาก trusted SLI store พร้อม owner, runbook และ probe ที่ตรวจได้ โดยไม่แสดง PII</p></div><button className="slo-button slo-button--secondary" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "กำลังโหลด…" : "รีเฟรช SLO"}</button></header>
    {loading && !snapshot.evaluations.length ? <LoadingState title="กำลังโหลด SLO" message="กำลังอ่าน metrics และตรวจสอบ tenant scope" /> : null}
    {errorState ? <div className="slo-inline-state"><ErrorSurface kind={errorState} retry={() => void refresh()} /></div> : null}
    <div className="slo-summary" aria-label="สรุปสถานะ SLO"><div><span>ปกติ</span><strong>{snapshot.summary.healthy}</strong></div><div><span>ใกล้เกิน budget</span><strong>{snapshot.summary.atRisk}</strong></div><div><span>เกินเป้า</span><strong>{snapshot.summary.breached}</strong></div><div><span>ไม่มีข้อมูล</span><strong>{snapshot.summary.noData}</strong></div><div><span>alert active</span><strong>{snapshot.summary.activeAlerts}</strong></div><div><span>probe fail</span><strong>{snapshot.summary.failedProbes}</strong></div></div>
    <div className="slo-table-wrap"><table className="slo-table"><caption className="sr-only">รายการ SLO และ error budget</caption><thead><tr><th scope="col">SLO</th><th scope="col">ค่าปัจจุบัน</th><th scope="col">เป้าหมาย</th><th scope="col">error budget</th><th scope="col">สถานะ</th></tr></thead><tbody>{snapshot.evaluations.map((evaluation) => <tr key={evaluation.definition.sloId}><th scope="row"><strong>{evaluation.definition.name}</strong><small>{evaluation.definition.sloId} · owner {evaluation.definition.owner}</small></th><td>{metricText(evaluation)}<small>{evaluation.sampleCount} samples · {dateText(evaluation.evaluatedAt)}</small></td><td>{targetText(evaluation)}</td><td><div className="slo-budget"><span style={{ width: `${Math.round(evaluation.errorBudget.remainingFraction * 100)}%` }} /><strong>{Math.round(evaluation.errorBudget.remainingFraction * 100)}% เหลือ</strong></div></td><td><span className={`slo-status ${statusClass[evaluation.status]}`}>{statusLabel[evaluation.status]}</span></td></tr>)}</tbody></table></div>
    <div className="slo-bottom-grid"><section className="slo-subcard" aria-labelledby="slo-alert-title"><div className="slo-subcard__heading"><h3 id="slo-alert-title">Actionable alerts</h3><span>{snapshot.alerts.length} รายการ</span></div>{snapshot.alerts.length === 0 ? <p className="slo-muted">ยังไม่มี alert ที่ต้องดำเนินการ</p> : <ul className="slo-alert-list">{snapshot.alerts.map((alert) => <li key={alert.alertId}><div><strong>{alert.title}</strong><span>{alert.severity} · {alert.owner} · {alert.action}</span><small>{alert.summary} · dedupe {alert.dedupeKey}</small></div><Link href={alert.runbookUrl}>Runbook {alert.runbookId}</Link></li>)}</ul>}</section><section className="slo-subcard" aria-labelledby="slo-probe-title"><div className="slo-subcard__heading"><h3 id="slo-probe-title">Synthetic probes</h3><span>{snapshot.probes.length} probes</span></div><ul className="slo-probe-list">{snapshot.probes.map((probe) => <li key={probe.probeId}><div><strong>{probe.name}</strong><small>{probe.route} · {probe.latencyMs} ms · {probe.statusCode}</small></div><span className={`slo-probe-status slo-probe-status--${probe.status.toLowerCase()}`}>{probe.status === "PASS" ? "ผ่าน" : "ล้มเหลว"}</span></li>)}</ul></section></div>
    <footer className="slo-footer"><span>window {dateText(snapshot.window.from)} – {dateText(snapshot.window.to)} · generated {dateText(snapshot.generatedAt)} · source {snapshot.source}</span><span>request/correlation IDs เก็บไว้สำหรับ trace และไม่แสดงข้อความดิบ</span></footer>
  </section>;
}
