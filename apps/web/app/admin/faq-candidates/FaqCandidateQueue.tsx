"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { SupportAdminFaqCandidateView } from "../../api/v1/admin/support-tickets/repository";
import { useTheme } from "../../ui/theme";
import "../support-tickets/support-tickets.css";

import type { SupportAdminIdentity } from "../support-tickets/SupportTicketInbox";

type QueueAction = "REVIEW" | "APPROVE" | "PUBLISH" | "ROLLBACK";

class FaqQueueError extends Error {
  constructor(public readonly status: number, public readonly reasonCode: string, message: string) { super(message); this.name = "FaqQueueError"; }
}

const identityQuery = (identity: SupportAdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const parsePayload = async (response: Response): Promise<unknown> => response.json().catch(() => undefined);
const statusTone = (status: SupportAdminFaqCandidateView["status"]): string => status === "PUBLISHED" ? "green" : status === "CONFLICT" || status === "REJECTED" || status === "REVOKED" ? "red" : status === "APPROVED" ? "blue" : "amber";

function State({ title, message }: { title: string; message: string }) {
  return <section aria-live="polite" className="support-state"><h2>{title}</h2><p>{message}</p></section>;
}

function CandidateActions({ candidate, identity, onComplete }: { candidate: SupportAdminFaqCandidateView; identity: SupportAdminIdentity; onComplete: (candidate: SupportAdminFaqCandidateView) => void }) {
  const [reason, setReason] = useState("ตรวจ source, owner และ effective date ตาม policy แล้ว");
  const [working, setWorking] = useState<QueueAction>();
  const [error, setError] = useState<FaqQueueError>();

  const submit = async (action: QueueAction): Promise<void> => {
    if (!candidate.ticketId || working) return;
    setWorking(action); setError(undefined);
    const idempotencyKey = `faq-queue-${action.toLowerCase()}-${crypto.randomUUID()}`;
    try {
      const response = await fetch(`/api/v1/admin/support-tickets/${encodeURIComponent(candidate.ticketId)}/faq-candidates?${identityQuery(identity)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ action, candidateId: candidate.id, expectedVersion: candidate.rowVersion, reason, decision: action === "REVIEW" ? "APPROVE" : undefined, rollback: action === "ROLLBACK", idempotencyKey }),
      });
      const payload = await parsePayload(response);
      if (!response.ok) {
        const body = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
        throw new FaqQueueError(response.status, body?.error?.reasonCode ?? "PROCESSING_FAILED", body?.error?.message ?? "ไม่สามารถทำรายการ FAQ ได้");
      }
      const body = payload as { faqCandidate: SupportAdminFaqCandidateView };
      onComplete(body.faqCandidate);
    } catch (caught) {
      setError(caught instanceof FaqQueueError ? caught : new FaqQueueError(500, "PROCESSING_FAILED", "ไม่สามารถทำรายการ FAQ ได้"));
    } finally { setWorking(undefined); }
  };

  if (candidate.status === "PENDING_OWNER_REVIEW" && (identity.role === "STAFF" || identity.role === "DEPARTMENT_HEAD")) {
    return <div className="support-form"><label>เหตุผล owner review<textarea aria-label={`เหตุผลตรวจ FAQ ${candidate.id}`} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><button className="support-button support-button--primary" disabled={Boolean(working) || reason.trim().length < 2} onClick={() => void submit("REVIEW")} type="button">{working === "REVIEW" ? "กำลังตรวจ…" : "ยืนยัน owner review"}</button>{error ? <p className="support-muted" role="alert">{error.reasonCode}: {error.message}</p> : null}</div>;
  }
  if (candidate.status === "PENDING_COORDINATOR_APPROVAL" && identity.role === "TENANT_ADMIN") return <div className="support-form"><label>เหตุผล coordinator approval<textarea aria-label={`เหตุผลอนุมัติ FAQ ${candidate.id}`} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><button className="support-button support-button--primary" disabled={Boolean(working) || reason.trim().length < 2} onClick={() => void submit("APPROVE")} type="button">{working === "APPROVE" ? "กำลังอนุมัติ…" : "อนุมัติ FAQ และสร้าง document version"}</button>{error ? <p className="support-muted" role="alert">{error.reasonCode}: {error.message}</p> : null}</div>;
  if (candidate.status === "APPROVED" && identity.role === "TENANT_ADMIN") return <div className="support-form"><p className="support-muted">ผ่าน two-step approval แล้ว แต่ยังไม่เข้า active index จนกว่าจะ publish</p><button className="support-button support-button--primary" disabled={Boolean(working)} onClick={() => void submit("PUBLISH")} type="button">{working === "PUBLISH" ? "กำลัง publish…" : "Publish เข้า active FAQ index"}</button>{error ? <p className="support-muted" role="alert">{error.reasonCode}: {error.message}</p> : null}</div>;
  if (candidate.status === "PUBLISHED" && identity.role === "TENANT_ADMIN") return <div className="support-form"><label>เหตุผล rollback / revoke<textarea aria-label={`เหตุผล rollback FAQ ${candidate.id}`} onChange={(event) => setReason(event.target.value)} rows={2} value={reason} /></label><button className="support-button support-button--secondary" disabled={Boolean(working) || reason.trim().length < 2} onClick={() => void submit("ROLLBACK")} type="button">{working === "ROLLBACK" ? "กำลัง rollback…" : "Rollback และนำออกจาก active index"}</button>{error ? <p className="support-muted" role="alert">{error.reasonCode}: {error.message}</p> : null}</div>;
  return <p className="support-muted">การดำเนินการถัดไปต้องใช้ role ที่เหมาะสม หรือ candidate อยู่ในสถานะ terminal</p>;
}

export function FaqCandidateQueue({ identity, initialItems }: { identity: SupportAdminIdentity; initialItems: readonly SupportAdminFaqCandidateView[] }) {
  const { theme, cycleTheme } = useTheme();
  const [items, setItems] = useState<SupportAdminFaqCandidateView[]>([...initialItems]);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [filter, setFilter] = useState("ALL");
  useEffect(() => { const update = () => setOffline(!navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  const filtered = useMemo(() => filter === "ALL" ? items : items.filter((item) => item.status === filter), [filter, items]);
  const replace = (next: SupportAdminFaqCandidateView) => { setItems((current) => current.map((item) => item.id === next.id ? next : item)); setNotice("บันทึก workflow FAQ แล้ว"); };
  const showExpired = false;

  return <main className="support-shell" data-theme={theme}><header className="support-topbar"><div className="support-brand"><Link href={`/admin/support-tickets?${identityQuery(identity)}`}>คิวส่งต่อเจ้าหน้าที่</Link><span>A-47 · FAQ approval queue</span></div><div className="support-topbar__tools"><span className="support-tenant">{identity.role}</span><button aria-label="เปลี่ยน theme" className="support-icon-button" onClick={cycleTheme} type="button">◐</button></div></header><div className="support-page"><div className="support-heading"><div><span className="support-kicker">UI-ADM-14 · GOVERNED KNOWLEDGE</span><h1>คิวตรวจและอนุมัติ FAQ</h1><p>แยก owner review และ coordinator approval ออกจากการส่งข้อความประชาชน</p></div><div className="support-heading__actions"><Link className="support-button support-button--secondary" href={`/admin/support-tickets?${identityQuery(identity)}`}>กลับคิว ticket</Link><button className="support-button support-button--primary" onClick={() => window.location.reload()} type="button">รีเฟรช</button></div></div>{identity.synthetic ? <p className="support-synthetic">local synthetic เท่านั้น · candidate ที่ยังไม่ approved จะไม่เข้า active retrieval</p> : <State message="production จะใช้ server identity และ policy จริงก่อนเปิด workflow" title="ยังไม่เปิดใช้งาน production" />}{offline ? <div className="support-alert" role="status"><strong>ออฟไลน์อยู่</strong><span>ปิด mutation จนกว่าจะออนไลน์</span></div> : null}{notice ? <div className="support-alert support-alert--success" role="status">{notice}</div> : null}{showExpired ? <State message="session หมดอายุ กรุณาเข้าสู่ระบบใหม่" title="หมดอายุ session" /> : null}{identity.synthetic ? <section aria-label="ตัวกรอง FAQ" className="support-filter-panel"><label className="support-filter"><span>สถานะ</span><select aria-label="กรองสถานะ FAQ" onChange={(event) => setFilter(event.target.value)} value={filter}><option value="ALL">ทั้งหมด</option><option value="PENDING_OWNER_REVIEW">รอ owner review</option><option value="PENDING_COORDINATOR_APPROVAL">รอ coordinator</option><option value="APPROVED">approved รอ publish</option><option value="PUBLISHED">published</option><option value="CONFLICT">conflict</option><option value="REVOKED">revoked</option></select></label></section> : null}{identity.synthetic && filtered.length === 0 ? <State message="ยังไม่มี FAQ candidate ในขอบเขตนี้ หรือ filter ไม่ตรง" title="คิวว่าง" /> : null}{identity.synthetic ? <div className="support-detail-main">{filtered.map((candidate) => <article className="support-card" key={candidate.id}><div className="support-card__header"><div><h2>{candidate.question}</h2><p>ticket {candidate.ticketId ?? "manual"} · source {candidate.sourceMessageId ?? candidate.source.sourceType}</p></div><span className={`support-chip support-chip--${statusTone(candidate.status)}`}>{candidate.status}</span></div><p className="support-evidence-reason">{candidate.answer}</p><dl className="support-facts"><div><dt>owner department</dt><dd>{candidate.departmentId}</dd></div><div><dt>category / visibility</dt><dd>{candidate.knowledgeCategoryId} · {candidate.visibility}</dd></div><div><dt>effective</dt><dd>{candidate.effectiveDateUnknown ? "ไม่ทราบ — ต้องยืนยัน" : `${candidate.effectiveFrom ?? "ไม่ระบุ"} ถึง ${candidate.effectiveUntil ?? "ไม่ระบุ"}`}</dd></div><div><dt>duplicate check</dt><dd>{candidate.duplicateCheck.status} · {candidate.duplicateCheck.matches.length} match</dd></div><div><dt>source lineage</dt><dd>{candidate.source.sourceEventId ?? "ไม่ระบุ"} · evidence {candidate.source.evidenceIds.join(", ")}</dd></div><div><dt>review timestamps</dt><dd>{candidate.ownerReviewedAt ?? "รอ owner"} · {candidate.coordinatorApprovedAt ?? "รอ coordinator"}</dd></div></dl><p className="support-synthetic">document version: {candidate.documentVersionId ?? "ยังไม่สร้าง"} · row v{candidate.rowVersion} · สร้างเมื่อ {formatDate(candidate.createdAt)}</p><CandidateActions candidate={candidate} identity={identity} onComplete={replace} /></article>)}</div> : null}</div></main>;
}

