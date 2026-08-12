"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ComplaintAdminDetail, ComplaintAdminRole, ComplaintState } from "@citychatbot/complaints";

import type { AdminIdentity } from "../AdminComplaintInbox";
import { useTheme } from "../../../ui/theme";

import "../admin-complaints.css";
import "./admin-complaint-detail.css";

type AdminErrorPayload = { error?: { reasonCode?: string; message?: string }; current?: { rowVersion?: number; canonicalStatus?: ComplaintState; updatedAt?: string } };

const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_B = "77777777-7777-4777-8777-777777777777";

const statusTone = (status: ComplaintState): string => status === "CLOSED" || status === "RESOLVED" ? "green" : status === "WAITING_FOR_CITIZEN" ? "amber" : status === "CANCELLED" || status === "OUT_OF_JURISDICTION" ? "red" : "blue";
const priorityLabel = (priority: ComplaintAdminDetail["priority"]): string => priority === "URGENT" ? "สูงมาก" : priority === "HIGH" ? "สูง" : priority === "LOW" ? "ต่ำ" : "ปานกลาง";
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const queryFor = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const newIdempotencyKey = (): string => globalThis.crypto?.randomUUID?.() ?? `admin-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function AdminComplaintDetail({ identity, complaintId }: { identity: AdminIdentity; complaintId: string }) {
  const { theme, cycleTheme } = useTheme();
  const [detail, setDetail] = useState<ComplaintAdminDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AdminErrorPayload>();
  const [offline, setOffline] = useState(false);
  const [working, setWorking] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState<AdminErrorPayload["current"]>();
  const [departmentId, setDepartmentId] = useState(DEPARTMENT_A);
  const [membershipId, setMembershipId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [transitionStatus, setTransitionStatus] = useState<ComplaintState | "">("");
  const [transitionReason, setTransitionReason] = useState("");
  const [publicRequest, setPublicRequest] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [publicUpdate, setPublicUpdate] = useState("");

  const query = useMemo(() => queryFor(identity), [identity]);
  const endpoint = `/api/v1/admin/complaints/${encodeURIComponent(complaintId)}`;
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(`${endpoint}?${query}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw { ...(payload as AdminErrorPayload), error: (payload as AdminErrorPayload)?.error ?? { reasonCode: "PROCESSING_FAILED", message: "ไม่สามารถโหลดรายละเอียดได้" } } satisfies AdminErrorPayload;
      const next = payload as ComplaintAdminDetail;
      setDetail(next); setDepartmentId(next.departmentId ?? DEPARTMENT_A); setMembershipId("");
    } catch (requestError) { setError(requestError as AdminErrorPayload); setDetail(undefined); }
    finally { setLoading(false); }
  }, [endpoint, query]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const mutate = async (action: string, path: string, body: Record<string, unknown>, successMessage: string): Promise<void> => {
    if (!detail) return;
    setWorking(action); setNotice(undefined); setConflict(undefined);
    try {
      const response = await fetch(`${endpoint}/${path}?${query}`, { method: "POST", headers: { "content-type": "application/json", "if-match": `"${detail.rowVersion}"`, "idempotency-key": newIdempotencyKey() }, body: JSON.stringify({ ...body, expectedVersion: detail.rowVersion }) });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const errorPayload = payload as AdminErrorPayload;
        if (response.status === 409) setConflict(errorPayload.current);
        throw errorPayload;
      }
      const item = (payload as { item?: ComplaintAdminDetail }).item;
      if (!item) throw { error: { reasonCode: "PROCESSING_FAILED", message: "ไม่พบข้อมูลหลังบันทึก" } } satisfies AdminErrorPayload;
      setDetail(item); setNotice(successMessage); setTransitionReason(""); setPublicRequest(""); setResolutionSummary(""); setInternalNote(""); setPublicUpdate(""); setAssignmentReason("");
    } catch (requestError) {
      const errorPayload = requestError as AdminErrorPayload;
      setNotice(errorPayload.error?.message ?? "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
    } finally { setWorking(undefined); }
  };

  const departmentOptions = identity.role === "TENANT_ADMIN" ? [{ id: DEPARTMENT_A, name: "กองช่าง" }, { id: DEPARTMENT_B, name: "กองสาธารณสุข" }] : [{ id: DEPARTMENT_A, name: "กองช่าง" }];
  const chosenStatus = transitionStatus || detail?.allowedTransitions[0] || "";

  if (loading) return <main className="admin-shell" data-theme={theme}><div className="admin-detail-page"><section className="admin-state" role="status"><h1>กำลังโหลดรายละเอียดเรื่อง</h1><p>กำลังตรวจสอบสิทธิ์และโหลดข้อมูลล่าสุด…</p></section></div></main>;
  if (error || !detail) return <main className="admin-shell" data-theme={theme}><div className="admin-detail-page"><section className="admin-state" role="alert"><h1>{error?.error?.reasonCode === "NOT_FOUND" ? "ไม่พบเรื่องร้องเรียน" : "โหลดรายละเอียดไม่สำเร็จ"}</h1><p>{error?.error?.message ?? "กรุณาลองใหม่อีกครั้ง"}</p><button className="admin-button admin-button--primary" onClick={() => void load()} type="button">ลองใหม่</button></section></div></main>;

  return <main className="admin-shell" data-theme={theme}><div className="admin-detail-page">
    <header className="admin-detail-top"><Link className="admin-detail-back" href={`/admin/complaints?${query}`}>← กลับรายการเรื่องร้องเรียน</Link><div className="admin-detail-tools"><span className="admin-chip admin-chip--blue">A-25</span><button aria-label={theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง"} className="admin-topbar__button" onClick={cycleTheme} type="button">{theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼"}</button></div></header>
    {identity.synthetic ? <p className="admin-synthetic">โหมดทดสอบ local — รายละเอียดนี้ใช้ข้อมูลสังเคราะห์ ไม่ใช่ข้อมูล production</p> : null}
    {offline ? <div className="admin-detail-alert" role="status"><strong>ออฟไลน์อยู่</strong><span>การเปลี่ยนแปลงจะไม่ถูกส่งจนกว่าจะกลับมาออนไลน์</span></div> : null}
    {conflict ? <div className="admin-detail-alert admin-detail-alert--conflict" role="alert"><strong>ข้อมูลชนกัน</strong><span>รายการถูกแก้ไขโดยผู้ใช้อื่นแล้ว สถานะล่าสุดคือ {conflict.canonicalStatus ?? "ไม่ทราบ"} เวอร์ชัน {conflict.rowVersion ?? "-"}</span><button className="admin-button admin-button--secondary" onClick={() => void load()} type="button">โหลดข้อมูลล่าสุด</button></div> : null}
    {notice ? <div className="admin-detail-alert" role="status"><span>{notice}</span><button aria-label="ปิดข้อความ" className="admin-button admin-button--secondary" onClick={() => setNotice(undefined)} type="button">ปิด</button></div> : null}
    <section className="admin-detail-heading"><div><p className="admin-detail-kicker">{detail.complaintNo}</p><h1>{detail.title}</h1><p className="admin-detail-meta">รับเรื่อง {formatDate(detail.createdAt)} · อัปเดตล่าสุด {formatDate(detail.updatedAt)} · เวอร์ชัน {detail.rowVersion}</p></div><div className="admin-detail-heading__badges"><span className={`admin-chip admin-chip--${statusTone(detail.canonicalStatus)}`}>{detail.statusLabel}</span><span className={`admin-chip admin-chip--${detail.priority === "URGENT" ? "red" : detail.priority === "HIGH" ? "amber" : "blue"}`}>{priorityLabel(detail.priority)}</span></div></section>
    <div className="admin-detail-grid">
      <div className="admin-detail-main">
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>รายละเอียดเรื่อง</h2><span className="admin-detail-muted">ข้อมูลสำหรับเจ้าหน้าที่</span></div><p className="admin-detail-description">{detail.description}</p><dl className="admin-detail-facts"><div><dt>หน่วยงาน</dt><dd>{detail.departmentName ?? "ยังไม่มอบหมาย"}</dd></div><div><dt>ระดับความเสี่ยง</dt><dd>{detail.riskLevel}</dd></div><div><dt>สถานะ SLA</dt><dd>ยังไม่ตั้งค่า · P3-SLA-001</dd></div><div><dt>ตำแหน่ง</dt><dd>{detail.location?.text ?? (detail.location?.latitude !== undefined ? `${detail.location.latitude}, ${detail.location.longitude}` : "ไม่ได้ระบุตำแหน่ง")}</dd></div></dl>{detail.location ? <div className="admin-detail-map"><strong>แผนที่ตำแหน่ง</strong><p>ชั้นแผนที่ยังปิดอยู่ใน MVP เพื่อป้องกันการเปิดเผยพิกัดโดยไม่มี policy</p></div> : null}</section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>ไฟล์แนบ</h2><span className="admin-detail-muted">แสดง state ตาม storage policy</span></div>{detail.attachments.length === 0 ? <p className="admin-detail-empty">ไม่มีไฟล์แนบ</p> : <ul className="admin-detail-list">{detail.attachments.map((attachment) => <li key={attachment.id}><span><strong>{attachment.fileName}</strong><small>{attachment.contentType} · {attachment.state === "READY" ? "พร้อมใช้" : "กักกัน"}</small></span>{attachment.state === "READY" && attachment.publicUrl ? <a href={attachment.publicUrl} rel="noreferrer" target="_blank">เปิดไฟล์</a> : <span className="admin-chip admin-chip--amber">ยังเปิดไม่ได้</span>}</li>)}</ul>}</section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>Timeline สถานะ</h2><span className="admin-detail-muted">canonical state จาก domain</span></div><ol className="admin-detail-timeline">{detail.timeline.map((entry) => <li key={entry.id}><span className={`admin-timeline-dot admin-timeline-dot--${entry.publicVisible ? "public" : "internal"}`} aria-hidden="true" /><div><strong>{entry.statusLabel}</strong><p>{entry.reason}</p><small>{formatDate(entry.occurredAt)} · {entry.actorType} · {entry.publicVisible ? "แสดงประชาชน" : "ภายใน"}</small></div></li>)}</ol></section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>ข้อความและบันทึก</h2><span className="admin-detail-muted">private note ไม่แจ้งประชาชน</span></div>{detail.comments.length === 0 ? <p className="admin-detail-empty">ยังไม่มีข้อความ</p> : <ul className="admin-detail-comments">{detail.comments.map((comment) => <li key={comment.id} className={comment.visibility === "PUBLIC" ? "is-public" : "is-internal"}><div><strong>{comment.visibility === "PUBLIC" ? "อัปเดตประชาชน" : "บันทึกภายใน"}</strong><small>{comment.authorType} · {formatDate(comment.createdAt)}</small></div><p>{comment.body}</p></li>)}</ul>}</section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>Audit trail</h2><span className="admin-detail-muted">ก่อน/หลัง mutation</span></div><ol className="admin-audit-list">{detail.auditTrail.map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{entry.actorRole} · v{entry.beforeVersion} → v{entry.afterVersion}</span><p>{entry.summary}</p><small>{formatDate(entry.occurredAt)}</small></li>)}</ol></section>
      </div>
      <aside className="admin-detail-side">
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>มอบหมายงาน</h2><span className="admin-detail-muted">version {detail.rowVersion}</span></div>{detail.permissions.canAssign ? <form onSubmit={(event) => { event.preventDefault(); void mutate("assign", "assign", { departmentId, ...(membershipId ? { membershipId } : {}), reason: assignmentReason }, "มอบหมายงานแล้ว"); }}><label>หน่วยงาน<select aria-label="หน่วยงานปลายทาง" onChange={(event) => setDepartmentId(event.target.value)} value={departmentId}>{departmentOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label><label>รหัสผู้รับผิดชอบ (ถ้ามี)<input aria-label="รหัสผู้รับผิดชอบ" onChange={(event) => setMembershipId(event.target.value)} placeholder="เว้นว่างเพื่อส่งเข้าคิวหน่วยงาน" value={membershipId} /></label><label>เหตุผล<textarea aria-label="เหตุผลการมอบหมาย" onChange={(event) => setAssignmentReason(event.target.value)} required rows={3} value={assignmentReason} /></label><button className="admin-button admin-button--primary" disabled={Boolean(working) || offline || assignmentReason.trim().length < 3} type="submit">{working === "assign" ? "กำลังบันทึก…" : "มอบหมาย / เปลี่ยนผู้รับผิดชอบ"}</button></form> : <p className="admin-detail-muted">บทบาทนี้ดูรายละเอียดได้ แต่ไม่มีสิทธิ์มอบหมาย</p>}</section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>เปลี่ยนสถานะ</h2><span className="admin-detail-muted">ต้องยืนยันทุกครั้ง</span></div>{detail.allowedTransitions.length === 0 ? <p className="admin-detail-empty">ยังไม่มี transition ที่บทบาทนี้ทำได้</p> : <form onSubmit={(event) => { event.preventDefault(); void mutate("transition", "transitions", { toStatus: chosenStatus, ...(transitionReason ? { reason: transitionReason } : {}), ...(publicRequest ? { publicRequest } : {}), ...(resolutionSummary ? { resolutionSummary } : {}) }, "เปลี่ยนสถานะแล้ว"); }}><label>สถานะใหม่<select aria-label="สถานะใหม่" onChange={(event) => setTransitionStatus(event.target.value as ComplaintState)} value={chosenStatus}>{detail.allowedTransitions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>{chosenStatus === "WAITING_FOR_CITIZEN" ? <label>คำขอข้อมูลประชาชน<textarea aria-label="คำขอข้อมูลประชาชน" onChange={(event) => setPublicRequest(event.target.value)} required rows={3} value={publicRequest} /></label> : null}{chosenStatus === "RESOLVED" ? <label>สรุปผลการแก้ไข<textarea aria-label="สรุปผลการแก้ไข" onChange={(event) => setResolutionSummary(event.target.value)} required rows={3} value={resolutionSummary} /></label> : null}<label>เหตุผล / หมายเหตุ<textarea aria-label="เหตุผลเปลี่ยนสถานะ" onChange={(event) => setTransitionReason(event.target.value)} rows={3} value={transitionReason} /></label><button className="admin-button admin-button--primary" disabled={Boolean(working) || offline} type="submit">{working === "transition" ? "กำลังบันทึก…" : "ยืนยันเปลี่ยนสถานะ"}</button></form>}</section>
        <section className="admin-detail-card"><div className="admin-detail-card__header"><h2>เขียนข้อความ</h2><span className="admin-detail-muted">แยก public / internal</span></div><form onSubmit={(event) => { event.preventDefault(); void mutate("internal", "internal-notes", { body: internalNote }, "บันทึกภายในแล้ว"); }}><label>บันทึกภายใน<textarea aria-label="บันทึกภายใน" onChange={(event) => setInternalNote(event.target.value)} required rows={4} value={internalNote} /></label><button className="admin-button admin-button--secondary" disabled={Boolean(working) || offline || internalNote.trim().length < 1} type="submit">{working === "internal" ? "กำลังบันทึก…" : "บันทึกภายใน"}</button></form><hr /><form onSubmit={(event) => { event.preventDefault(); void mutate("public", "public-updates", { body: publicUpdate }, "ส่งอัปเดตประชาชนแล้ว"); }}><label>อัปเดตประชาชน<textarea aria-label="อัปเดตประชาชน" onChange={(event) => setPublicUpdate(event.target.value)} required rows={4} value={publicUpdate} /></label><button className="admin-button admin-button--primary" disabled={Boolean(working) || offline || publicUpdate.trim().length < 1} type="submit">{working === "public" ? "กำลังส่ง…" : "ส่งอัปเดตประชาชน"}</button><p className="admin-detail-help">การส่ง public update สร้าง outbox event สำหรับ notification; internal note ไม่สร้าง citizen notification</p></form></section>
      </aside>
    </div>
  </div></main>;
}
