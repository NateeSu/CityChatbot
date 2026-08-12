"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { SupportAdminDetail } from "../../../api/v1/admin/support-tickets/repository";
import { useTheme } from "../../../ui/theme";
import "../support-tickets.css";

import type { SupportAdminIdentity } from "../SupportTicketInbox";

type MutationKind = "assign" | "reply" | "transition" | "faq";

class SupportApiError extends Error {
  constructor(public readonly status: number, public readonly reasonCode: string, message: string) { super(message); this.name = "SupportApiError"; }
}

const statusLabels: Readonly<Record<string, string>> = {
  NEW: "รอเจ้าหน้าที่รับเรื่อง",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_FOR_CITIZEN: "รอข้อมูลประชาชน",
  ANSWERED: "ตอบกลับแล้ว",
  CLOSED: "ปิดเรื่อง",
  CANCELLED: "ยกเลิกแล้ว",
};
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const identityQuery = (identity: SupportAdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();

const parsePayload = async (response: Response): Promise<unknown> => response.json().catch(() => undefined);
const apiGet = async (url: string): Promise<SupportAdminDetail> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await parsePayload(response);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw new SupportApiError(response.status, error?.error?.reasonCode ?? "PROCESSING_FAILED", error?.error?.message ?? "ไม่สามารถโหลดรายละเอียด ticket ได้");
  }
  return payload as SupportAdminDetail;
};

const errorFrom = (response: Response, payload: unknown): SupportApiError => {
  const error = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
  return new SupportApiError(response.status, error?.error?.reasonCode ?? "PROCESSING_FAILED", error?.error?.message ?? "ไม่สามารถบันทึกการเปลี่ยนแปลงได้");
};

function State({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section aria-live="polite" className="support-state"><h2>{title}</h2><p>{message}</p>{action}</section>;
}

function StatusBadge({ detail }: { detail: SupportAdminDetail }) {
  const tone = detail.item.sla.isOverdue || detail.item.priority === "URGENT" && detail.item.status === "NEW" ? "red" : detail.item.sla.isNearDue || detail.item.status === "WAITING_FOR_CITIZEN" ? "amber" : detail.item.status === "CLOSED" || detail.item.status === "ANSWERED" ? "green" : "blue";
  return <span className={`support-chip support-chip--${tone}`}>{detail.item.statusLabel}</span>;
}

function DetailHeader({ identity, detail, theme, onThemeChange }: { identity: SupportAdminIdentity; detail: SupportAdminDetail; theme: "light" | "dark" | "high-contrast"; onThemeChange: () => void }) {
  const themeLabel = theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง";
  return <header className="support-topbar"><div className="support-brand"><Link href={`/admin/support-tickets?${identityQuery(identity)}`}>คิวส่งต่อเจ้าหน้าที่</Link><span>{detail.item.publicTicketId}</span></div><div className="support-topbar__tools"><span className="support-tenant">{identity.role}</span><button aria-label={themeLabel} className="support-icon-button" onClick={onThemeChange} type="button">{theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼"}</button></div></header>;
}

export function SupportTicketDetail({ identity, ticketId }: { identity: SupportAdminIdentity; ticketId: string }) {
  const { theme, cycleTheme } = useTheme();
  const [detail, setDetail] = useState<SupportAdminDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupportApiError>();
  const [offline, setOffline] = useState(false);
  const [working, setWorking] = useState<MutationKind>();
  const [notice, setNotice] = useState<string>();
  const [departmentId, setDepartmentId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("มอบหมายให้หน่วยงานตรวจสอบต่อ");
  const [chosenStatus, setChosenStatus] = useState("");
  const [transitionReason, setTransitionReason] = useState("ดำเนินการตาม workflow เจ้าหน้าที่");
  const [replyBody, setReplyBody] = useState("");
  const [replyVisibility, setReplyVisibility] = useState<"PUBLIC" | "INTERNAL">("PUBLIC");
  const [replyIsAiDraft, setReplyIsAiDraft] = useState(false);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [sendToLine, setSendToLine] = useState(false);
  const [outOfHours, setOutOfHours] = useState(false);
  const [faqSourceMessageId, setFaqSourceMessageId] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqCategoryId, setFaqCategoryId] = useState("category-civic");
  const [faqVisibility, setFaqVisibility] = useState<"PUBLIC" | "INTERNAL" | "RESTRICTED">("PUBLIC");
  const [faqEffectiveFrom, setFaqEffectiveFrom] = useState("2026-08-11");
  const [faqPrivacyReviewed, setFaqPrivacyReviewed] = useState(false);

  const detailUrl = `/api/v1/admin/support-tickets/${encodeURIComponent(ticketId)}?${identityQuery(identity)}`;
  const load = useCallback(async () => {
    if (!identity.synthetic) return;
    setLoading(true); setError(undefined);
    try {
      const result = await apiGet(detailUrl);
      setDetail(result);
      setDepartmentId(result.item.departmentId ?? result.departmentOptions[0]?.id ?? "");
      setMembershipId(result.item.membershipId ?? "");
      setChosenStatus(result.allowedTransitions[0] ?? "");
      setFaqSourceMessageId((current) => current || [...result.messages].reverse().find((message) => message.authorType === "STAFF" && message.visibility === "PUBLIC" && !message.isAiDraft)?.id || "");
    } catch (requestError) { setError(requestError instanceof SupportApiError ? requestError : new SupportApiError(500, "PROCESSING_FAILED", "ไม่สามารถโหลดรายละเอียด ticket ได้")); }
    finally { setLoading(false); }
  }, [detailUrl, identity]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const mutate = useCallback(async (kind: MutationKind, path: string, body: Record<string, unknown>): Promise<void> => {
    if (!detail || offline) return;
    setWorking(kind); setError(undefined); setNotice(undefined);
    try {
      const idempotencyKey = `support-ui-${kind}-${crypto.randomUUID()}`;
      const response = await fetch(`/api/v1/admin/support-tickets/${encodeURIComponent(ticketId)}/${path}?${identityQuery(identity)}`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "if-match": String(detail.item.rowVersion) }, body: JSON.stringify({ ...body, expectedVersion: detail.item.rowVersion, idempotencyKey }) });
      const payload = await parsePayload(response);
      if (!response.ok) throw errorFrom(response, payload);
      setDetail(payload as SupportAdminDetail);
      setNotice(kind === "reply" ? "บันทึกข้อความแล้ว พร้อมเก็บ audit ก่อน/หลัง mutation" : kind === "assign" ? "มอบหมายงานแล้ว" : "เปลี่ยนสถานะแล้ว");
      if (kind === "reply") { setReplyBody(""); setPreviewConfirmed(false); setReplyIsAiDraft(false); setSendToLine(false); setOutOfHours(false); }
    } catch (requestError) { setError(requestError instanceof SupportApiError ? requestError : new SupportApiError(500, "PROCESSING_FAILED", "ไม่สามารถบันทึกการเปลี่ยนแปลงได้")); }
    finally { setWorking(undefined); }
  }, [detail, identity, offline, ticketId]);

  const mutateFaq = useCallback(async (body: Record<string, unknown>, expectedVersion: number, notice: string): Promise<void> => {
    if (!detail || offline) return;
    setWorking("faq"); setError(undefined); setNotice(undefined);
    try {
      const idempotencyKey = `faq-ui-${crypto.randomUUID()}`;
      const response = await fetch(`/api/v1/admin/support-tickets/${encodeURIComponent(ticketId)}/faq-candidates?${identityQuery(identity)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ ...body, expectedVersion, idempotencyKey }),
      });
      const payload = await parsePayload(response);
      if (!response.ok) throw errorFrom(response, payload);
      const next = payload as { detail: SupportAdminDetail };
      setDetail(next.detail);
      setNotice(notice);
      if (body.action === "PROPOSE") { setFaqQuestion(""); setFaqAnswer(""); setFaqPrivacyReviewed(false); }
    } catch (requestError) { setError(requestError instanceof SupportApiError ? requestError : new SupportApiError(500, "PROCESSING_FAILED", "ไม่สามารถบันทึก FAQ candidate ได้")); }
    finally { setWorking(undefined); }
  }, [detail, identity, offline, ticketId]);

  const selectedTemplate = useMemo(() => detail?.templates.find((template) => template.body === replyBody), [detail, replyBody]);
  const availableMemberships = detail?.membershipOptions.filter((item) => !departmentId || item.departmentId === departmentId) ?? [];
  const permissionError = error?.status === 403 || error?.status === 404;
  const expiredError = error?.status === 401 || error?.status === 419;

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate("reply", "reply", { body: replyBody, visibility: replyVisibility, isAiDraft: replyVisibility === "INTERNAL" && replyIsAiDraft, ...(replyVisibility === "PUBLIC" ? { previewConfirmed, sendToLine, ...(sendToLine ? { outOfHours } : {}) } : {}) });
  };
  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate("assign", "assign", { departmentId, ...(membershipId ? { membershipId } : {}), reason: assignmentReason });
  };
  const submitTransition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void mutate("transition", "transitions", { toStatus: chosenStatus, reason: transitionReason });
  };

  if (!identity.synthetic) return <main className="support-shell" data-theme={theme}><State message="ระบบ production จะโหลด tenant identity และ policy จาก server" title="ยังไม่เปิดใช้งานรายละเอียด production" /></main>;
  if (loading) return <main className="support-shell" data-theme={theme}><State message="กำลังโหลดข้อมูล conversation และสิทธิ์…" title="กำลังโหลดรายละเอียด" /></main>;
  if (expiredError) return <main className="support-shell" data-theme={theme}><State message="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" title="เซสชันหมดอายุ" /></main>;
  if (permissionError) return <main className="support-shell" data-theme={theme}><State message="ไม่พบ ticket ในขอบเขตที่บัญชีนี้มีสิทธิ์ดู" title="ไม่มีสิทธิ์เข้าถึง" action={<Link className="support-button support-button--secondary" href={`/admin/support-tickets?${identityQuery(identity)}`}>กลับคิว</Link>} /></main>;
  if (!detail || error && !detail) return <main className="support-shell" data-theme={theme}><State message={error?.message ?? "ไม่สามารถโหลดข้อมูลได้"} title="โหลดรายละเอียดไม่สำเร็จ" action={<button className="support-button support-button--primary" onClick={() => void load()} type="button">ลองใหม่</button>} /></main>;

  return <main className="support-shell" data-theme={theme}><DetailHeader detail={detail} identity={identity} onThemeChange={cycleTheme} theme={theme} /><div className="support-page support-detail-page">
    <div className="support-detail-back"><Link href={`/admin/support-tickets?${identityQuery(identity)}`}>← กลับคิวทั้งหมด</Link><span className="support-synthetic">ข้อมูลสังเคราะห์ local</span></div>
    <div className="support-detail-heading"><div><span className="support-kicker">A-31 · TICKET DETAIL</span><h1>{detail.item.publicTicketId}</h1><p>{detail.item.reasonLabel} · {detail.item.reasonCode}</p></div><div className="support-detail-heading__badges"><StatusBadge detail={detail} /><span className={`support-chip support-chip--${detail.item.priority === "URGENT" ? "red" : "blue"}`}>{detail.item.priority === "URGENT" ? "เร่งด่วน" : "ปกติ"}</span><span className="support-chip support-chip--blue">SLA: {detail.item.sla.label}</span></div></div>
    {offline ? <div className="support-alert" role="status"><strong>ออฟไลน์อยู่</strong><span>ปิดการส่งข้อมูลชั่วคราวจนกว่าจะออนไลน์</span></div> : null}
    {notice ? <div className="support-alert support-alert--success" role="status"><strong>บันทึกแล้ว</strong><span>{notice}</span><button aria-label="ปิดข้อความ" onClick={() => setNotice(undefined)} type="button">ปิด</button></div> : null}
    {error && detail ? <div className="support-alert support-alert--error" role="alert"><strong>{error.reasonCode}</strong><span>{error.message}</span><button onClick={() => { setError(undefined); void load(); }} type="button">โหลดล่าสุด</button></div> : null}
    <div className="support-detail-grid"><div className="support-detail-main">
      <section className="support-card"><div className="support-card__header"><div><h2>บทสนทนา</h2><p>แยก Citizen / AI / Staff / System และ visibility ตาม canonical message</p></div><span className="support-muted">{detail.item.channel} · v{detail.item.rowVersion}</span></div>{detail.messages.length === 0 ? <State message="ยังไม่มีข้อความใน ticket นี้" title="ไม่มีบทสนทนา" /> : <ol aria-label="ประวัติข้อความ" className="support-conversation">{detail.messages.map((message) => <li className={`support-message support-message--${message.authorType.toLowerCase()} support-message--${message.visibility.toLowerCase()}`} key={message.id}><div className="support-message__meta"><strong>{message.authorType === "CITIZEN" ? "ประชาชน" : message.authorType === "STAFF" ? "เจ้าหน้าที่" : message.authorType === "BOT" ? "AI / Bot" : "ระบบ"}</strong><span>{message.visibility === "PUBLIC" ? "แสดงประชาชน" : "ภายในเท่านั้น"}{message.isAiDraft ? " · AI draft" : ""} · {formatDate(message.createdAt)}</span></div><p>{message.body}</p></li>)}</ol>}</section>
      <section className="support-card"><div className="support-card__header"><div><h2>เหตุผลและหลักฐาน</h2><p>ข้อมูลสำหรับตรวจสอบก่อนตอบ ไม่ใช่คำตอบที่ AI สร้างแทนเจ้าหน้าที่</p></div><span className="support-chip support-chip--amber">{detail.evidence.reasonCode}</span></div><p className="support-evidence-reason">{detail.evidence.reasonDetail}</p><div className="support-evidence-list">{detail.evidence.retrievedPublicSources.length === 0 ? <p className="support-muted">ไม่มี public source ที่ส่งต่อมา — ห้ามเดาข้อมูลเพิ่ม</p> : detail.evidence.retrievedPublicSources.map((source) => <div key={source.id}><strong>{source.label}</strong><small>retrieval trace: {source.id}</small></div>)}</div><dl className="support-facts"><div><dt>source event</dt><dd>{detail.source.sourceEventId}</dd></div><div><dt>session</dt><dd>{detail.source.sessionId ?? "ไม่ระบุ"}</dd></div><div><dt>message</dt><dd>{detail.source.messageId ?? "ไม่ระบุ"}</dd></div><div><dt>provider run</dt><dd>{detail.source.providerRunId ?? "ไม่ระบุ"}</dd></div></dl></section>
      <section className="support-card"><div className="support-card__header"><div><h2>Timeline สถานะ</h2><p>การเปลี่ยนสถานะถูกตรวจด้วย state machine</p></div></div>{detail.statusLogs.length === 0 ? <p className="support-muted">ยังไม่มีประวัติสถานะ</p> : <ol className="support-timeline">{detail.statusLogs.map((entry) => <li key={entry.id}><span aria-hidden="true" className="support-timeline__dot" /><div><strong>{entry.fromStatus ? `${statusLabels[entry.fromStatus] ?? entry.fromStatus} → ` : ""}{statusLabels[entry.toStatus] ?? entry.toStatus}</strong><p>{entry.reason}</p><small>{entry.actorType} · {formatDate(entry.occurredAt)}</small></div></li>)}</ol>}</section>
      <section className="support-card"><div className="support-card__header"><div><h2>Audit trail</h2><p>บันทึกก่อน/หลัง mutation สำหรับตรวจสอบย้อนหลัง</p></div></div><ol className="support-audit-list">{detail.audits.map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>v{entry.beforeVersion} → v{entry.afterVersion} · {entry.actorType}</span><p>{entry.reason}</p><small>{formatDate(entry.occurredAt)}</small></li>)}</ol></section>
    </div><aside className="support-detail-side">
      <section className="support-card"><div className="support-card__header"><h2>เจ้าของงานและ SLA</h2><span className="support-muted">v{detail.item.rowVersion}</span></div><dl className="support-facts support-facts--single"><div><dt>หน่วยงาน</dt><dd>{detail.item.departmentName ?? "คิวกลาง — ยังไม่มอบหมาย"}</dd></div><div><dt>ผู้รับผิดชอบ</dt><dd>{detail.item.ownerLabel}</dd></div><div><dt>เวลาตอบกลับเป้าหมาย</dt><dd>{formatDate(detail.item.sla.responseDueAt)}</dd></div><div><dt>เวลาปิดเรื่องเป้าหมาย</dt><dd>{formatDate(detail.item.sla.resolutionDueAt)}</dd></div><div><dt>สถานะ SLA</dt><dd>{detail.item.sla.label}</dd></div></dl></section>
      <section className="support-card"><div className="support-card__header"><h2>มอบหมาย / เปลี่ยนเจ้าของ</h2><span className="support-muted">ต้องมีสิทธิ์ assignment</span></div>{detail.permissions.canAssign ? <form className="support-form" onSubmit={submitAssignment}><label>หน่วยงาน<select aria-label="หน่วยงานปลายทาง" onChange={(event) => { setDepartmentId(event.target.value); setMembershipId(""); }} value={departmentId}>{detail.departmentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label>ผู้รับผิดชอบ<select aria-label="ผู้รับผิดชอบ" onChange={(event) => setMembershipId(event.target.value)} value={membershipId}><option value="">คิวหน่วยงาน</option>{availableMemberships.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label>เหตุผล<textarea aria-label="เหตุผลการมอบหมาย" onChange={(event) => setAssignmentReason(event.target.value)} required rows={3} value={assignmentReason} /></label><button className="support-button support-button--primary" disabled={Boolean(working) || offline || !departmentId || assignmentReason.trim().length < 2} type="submit">{working === "assign" ? "กำลังบันทึก…" : "มอบหมาย / เปลี่ยนเจ้าของ"}</button></form> : <p className="support-muted">บทบาทนี้ดูรายละเอียดและตอบได้ แต่ไม่มีสิทธิ์มอบหมายงาน</p>}</section>
      <section className="support-card"><div className="support-card__header"><h2>เปลี่ยนสถานะ</h2><span className="support-muted">ต้องใช้ version ล่าสุด</span></div>{detail.permissions.canTransition && detail.allowedTransitions.length > 0 ? <form className="support-form" onSubmit={submitTransition}><label>สถานะใหม่<select aria-label="สถานะใหม่" onChange={(event) => setChosenStatus(event.target.value)} value={chosenStatus}>{detail.allowedTransitions.map((status) => <option key={status} value={status}>{statusLabels[status] ?? status}</option>)}</select></label><label>เหตุผล / หมายเหตุ<textarea aria-label="เหตุผลเปลี่ยนสถานะ" onChange={(event) => setTransitionReason(event.target.value)} required rows={3} value={transitionReason} /></label><button className="support-button support-button--primary" disabled={Boolean(working) || offline || !chosenStatus || transitionReason.trim().length < 2} type="submit">{working === "transition" ? "กำลังบันทึก…" : "ยืนยันเปลี่ยนสถานะ"}</button></form> : <p className="support-muted">ไม่มี transition ที่บทบาทนี้ทำได้จากสถานะปัจจุบัน</p>}</section>
      <section className="support-card support-reply-card"><div className="support-card__header"><div><h2>ตอบกลับ / บันทึกภายใน</h2><p>public และ internal แยก editor ชัดเจน</p></div></div>{detail.permissions.canReply ? <form className="support-form" onSubmit={submitReply}><label>template<select aria-label="เลือก template" onChange={(event) => { const template = detail.templates.find((item) => item.id === event.target.value); if (template) { setReplyBody(template.body); setReplyVisibility(template.visibility); setReplyIsAiDraft(false); setPreviewConfirmed(false); setSendToLine(false); setOutOfHours(false); } }} value={selectedTemplate?.id ?? ""}><option value="">เขียนเอง</option>{detail.templates.map((template) => <option key={template.id} value={template.id}>{template.label} · {template.visibility === "PUBLIC" ? "public" : "internal"}</option>)}</select></label><label>visibility<select aria-label="visibility ของข้อความ" onChange={(event) => { const value = event.target.value as "PUBLIC" | "INTERNAL"; setReplyVisibility(value); if (value === "PUBLIC") setReplyIsAiDraft(false); else { setSendToLine(false); setOutOfHours(false); } setPreviewConfirmed(false); }} value={replyVisibility}><option value="PUBLIC">PUBLIC — แสดงประชาชน</option><option value="INTERNAL">INTERNAL — เจ้าหน้าที่เท่านั้น</option></select></label><label>ข้อความ<textarea aria-label={replyVisibility === "PUBLIC" ? "ข้อความตอบประชาชน" : "บันทึกภายใน"} onChange={(event) => setReplyBody(event.target.value)} placeholder={replyVisibility === "PUBLIC" ? "ข้อความที่จะแสดงให้ประชาชนเห็น…" : "บันทึกที่ไม่ส่งให้ประชาชน…"} required rows={5} value={replyBody} /></label>{replyVisibility === "INTERNAL" ? <label className="support-checkbox-label"><input checked={replyIsAiDraft} onChange={(event) => setReplyIsAiDraft(event.target.checked)} type="checkbox" /> ทำเครื่องหมายเป็น AI draft (เก็บภายในเท่านั้น)</label> : <><div className="support-preview"><strong>Preview ผู้รับและช่องทาง</strong><p>ผู้รับ: ประชาชนเจ้าของ ticket · ช่องทาง: {detail.item.channel}</p><p>{replyBody.trim() || "ยังไม่มีข้อความสำหรับ preview"}</p></div><label className="support-checkbox-label"><input checked={previewConfirmed} onChange={(event) => setPreviewConfirmed(event.target.checked)} type="checkbox" /> ตรวจสอบผู้รับ ช่องทาง และข้อความแล้ว</label><label className="support-checkbox-label"><input checked={sendToLine} onChange={(event) => setSendToLine(event.target.checked)} type="checkbox" /> ส่ง public reply ต่อทาง LINE (มี delivery/retry state)</label>{sendToLine ? <label className="support-checkbox-label"><input checked={outOfHours} onChange={(event) => setOutOfHours(event.target.checked)} type="checkbox" /> แจ้งข้อความนอกเวลาทำการตาม policy</label> : null}</>} {detail.delivery ? <div className="support-preview support-delivery-status"><strong>LINE delivery: {detail.delivery.status}</strong><p>attempt {detail.delivery.attemptCount}/{detail.delivery.maxAttempts} · {detail.delivery.outOfHours ? "out-of-hours copy" : "เวลาทำการปกติ"}</p><p>tracking: {detail.delivery.deepLink}</p></div> : null}<button className="support-button support-button--primary" disabled={Boolean(working) || offline || !replyBody.trim() || replyVisibility === "PUBLIC" && !previewConfirmed} type="submit">{working === "reply" ? "กำลังบันทึก…" : replyVisibility === "PUBLIC" ? sendToLine ? "ส่ง public reply + LINE" : "ส่งข้อความ public" : "บันทึก internal note"}</button></form> : <p className="support-muted">บทบาทนี้ไม่มีสิทธิ์ตอบกลับ</p>}</section>
      <section className="support-card"><div className="support-card__header"><div><h2>เสนอ FAQ candidate</h2><p>สร้าง candidate จาก public staff message ที่เลือกเท่านั้น — ระบบไม่เรียนรู้จาก reply อัตโนมัติ</p></div><Link className="support-button support-button--secondary" href={`/admin/faq-candidates?tenantId=${encodeURIComponent(identity.tenantId)}&accountId=${encodeURIComponent(identity.accountId)}&role=${encodeURIComponent(identity.role)}`}>เปิด approval queue</Link></div>{detail.messages.filter((message) => message.authorType === "STAFF" && message.visibility === "PUBLIC" && !message.isAiDraft).length === 0 ? <p className="support-muted">ยังไม่มี public staff reply ที่ใช้เป็น source ได้</p> : <form className="support-form" onSubmit={(event) => { event.preventDefault(); void mutateFaq({ action: "PROPOSE", sourceMessageId: faqSourceMessageId, question: faqQuestion, answer: faqAnswer, departmentId: detail.item.departmentId ?? departmentId, knowledgeCategoryId: faqCategoryId, visibility: faqVisibility, effectiveFrom: faqEffectiveFrom, evidenceIds: [faqSourceMessageId], privacyReviewed: faqPrivacyReviewed }, 1, "สร้าง FAQ candidate แล้ว — รอ owner review และ coordinator approval"); }}><label>ข้อความต้นทาง<select aria-label="ข้อความ public staff ที่เป็น source" onChange={(event) => setFaqSourceMessageId(event.target.value)} required value={faqSourceMessageId}>{detail.messages.filter((message) => message.authorType === "STAFF" && message.visibility === "PUBLIC" && !message.isAiDraft).map((message) => <option key={message.id} value={message.id}>{formatDate(message.createdAt)} · {message.body.slice(0, 80)}</option>)}</select></label><label>คำถาม FAQ<textarea aria-label="คำถาม FAQ" onChange={(event) => setFaqQuestion(event.target.value)} required rows={2} value={faqQuestion} /></label><label>คำตอบ FAQ<textarea aria-label="คำตอบ FAQ" onChange={(event) => setFaqAnswer(event.target.value)} required rows={4} value={faqAnswer} /></label><div className="support-form-grid"><label>หมวดความรู้<input aria-label="หมวดความรู้" onChange={(event) => setFaqCategoryId(event.target.value)} required value={faqCategoryId} /></label><label>มีผลตั้งแต่<input aria-label="วันที่ FAQ มีผล" onChange={(event) => setFaqEffectiveFrom(event.target.value)} required type="date" value={faqEffectiveFrom} /></label></div><label>visibility<select aria-label="visibility ของ FAQ" onChange={(event) => setFaqVisibility(event.target.value as "PUBLIC" | "INTERNAL" | "RESTRICTED")} value={faqVisibility}><option value="PUBLIC">PUBLIC</option><option value="INTERNAL">INTERNAL</option><option value="RESTRICTED">RESTRICTED</option></select></label><label className="support-checkbox-label"><input checked={faqPrivacyReviewed} onChange={(event) => setFaqPrivacyReviewed(event.target.checked)} type="checkbox" /> ตรวจแล้วว่าไม่มี PII ที่ไม่ได้รับอนุมัติ</label><button className="support-button support-button--primary" disabled={Boolean(working) || offline || !faqSourceMessageId || !faqQuestion.trim() || !faqAnswer.trim() || !faqPrivacyReviewed} type="submit">{working === "faq" ? "กำลังบันทึก…" : "สร้าง FAQ candidate"}</button></form>}{detail.faqCandidates.length > 0 ? <div className="support-faq-list" aria-label="FAQ candidates ใน ticket นี้">{detail.faqCandidates.map((candidate) => <div className="support-faq-list__item" key={candidate.id}><strong>{candidate.status}</strong><span>v{candidate.rowVersion} · duplicate check: {candidate.duplicateCheck.status}</span><small>{candidate.question}</small></div>)}</div> : <p className="support-muted">ยังไม่มี FAQ candidate ใน ticket นี้</p>}</section>
    </aside></div>
    <p className="support-synthetic">ห้ามเปิดเผย citizen identity hash · reply public ต้องผ่าน preview · AI draft เก็บ INTERNAL เท่านั้น</p>
  </div></main>;
}
