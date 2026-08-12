"use client";
/* eslint-disable @next/next/no-img-element -- public attachment URLs are server-approved media metadata. */

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ComplaintPublicListStatus, ComplaintPublicView } from "@citychatbot/complaints";

import type { ComplaintCitizenIdentity } from "./tracking-config";
import { useTheme } from "../../ui/theme";
import "./tracking.css";

type ListResponse = {
  items: readonly ComplaintPublicView[];
  nextCursor?: string;
};

type ApiErrorShape = {
  error?: { reasonCode?: string; message?: string };
};

class TrackingApiError extends Error {
  constructor(public readonly reasonCode: string, public readonly status: number, message: string) {
    super(message);
    this.name = "TrackingApiError";
  }
}

const makeIdempotencyKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `citizen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const formatDate = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

const apiRequest = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const csrfToken = typeof window === "undefined" ? undefined : window.sessionStorage.getItem("citychatbot:csrf-token") ?? undefined;
  const response = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) } });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && payload !== null ? payload as ApiErrorShape : undefined;
    throw new TrackingApiError(error?.error?.reasonCode ?? "PROCESSING_FAILED", response.status, error?.error?.message ?? "ไม่สามารถเชื่อมต่อระบบติดตามเรื่องได้");
  }
  return payload as T;
};

const identityQuery = (identity: ComplaintCitizenIdentity): string => {
  const query = new URLSearchParams({ tenantId: identity.tenantId, lineUserId: identity.lineUserId });
  return query.toString();
};

const isClosed = (status: ComplaintPublicView["canonicalStatus"]): boolean => ["CLOSED", "CANCELLED", "OUT_OF_JURISDICTION"].includes(status);

function Header({ title, subtitle, onBack, onThemeChange, theme }: { title: string; subtitle: string; onBack: () => void; onThemeChange: () => void; theme: "light" | "dark" | "high-contrast" }) {
  const themeLabel = theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง";
  return (
    <header className="tracking-header">
      <button aria-label="ย้อนกลับ" className="tracking-header__back" onClick={onBack} type="button">←</button>
      <div>
        <span aria-hidden="true" className="tracking-header__building">▥</span>
      </div>
      <div className="tracking-header__title">{title}<span className="tracking-header__subtitle">{subtitle}</span></div>
      <div className="tracking-header__tools">
        <button aria-label="ค้นหา" className="tracking-header__action" type="button">⌕</button>
        <button aria-label={themeLabel} className="tracking-header__action" onClick={onThemeChange} type="button">{theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼"}</button>
        <button aria-label="การแจ้งเตือน" className="tracking-header__action" type="button">♧</button>
      </div>
    </header>
  );
}

function FooterNav() {
  return (
    <nav aria-label="เมนูหลัก" className="tracking-footer-nav">
      <Link href="/liff"><span aria-hidden="true">⌂</span><span>หน้าหลัก</span></Link>
      <Link aria-current="page" href="/liff/complaints"><span aria-hidden="true">▣</span><span>ติดตาม</span></Link>
      <Link href="/liff/complaints/new"><span aria-hidden="true">◉</span><span>บริการ</span></Link>
      <Link href="/liff/complaints/new"><span aria-hidden="true">♙</span><span>ติดต่อ</span></Link>
    </nav>
  );
}

function Shell({ children, identity, title, subtitle, onBack }: { children: ReactNode; identity: ComplaintCitizenIdentity; title: string; subtitle: string; onBack: () => void }) {
  const { theme, cycleTheme } = useTheme();
  return (
    <main className="tracking-shell" data-theme={theme}>
      <Header onBack={onBack} onThemeChange={cycleTheme} theme={theme} title={title} subtitle={subtitle} />
      {children}
      {identity.synthetic ? <p className="tracking-synthetic">โหมดทดสอบ local — ข้อมูลสังเคราะห์จะไม่ถูกใช้เป็นข้อมูล production</p> : null}
      <FooterNav />
    </main>
  );
}

function ErrorState({ error, onRetry }: { error: TrackingApiError | undefined; onRetry: () => void }) {
  const sessionExpired = error?.status === 401 || error?.reasonCode === "UNAUTHENTICATED";
  return (
    <section aria-live="polite" className="tracking-empty">
      <div aria-hidden="true" className="tracking-empty__icon">!</div>
      <h2>{sessionExpired ? "เซสชันหมดอายุ" : "โหลดข้อมูลไม่สำเร็จ"}</h2>
      <p>{sessionExpired ? "กรุณาเริ่มเซสชันใหม่แล้วลองอีกครั้ง" : error?.message ?? "กรุณาตรวจสอบสัญญาณแล้วลองใหม่"}</p>
      <button className="tracking-button tracking-button--primary" onClick={onRetry} type="button">ลองใหม่</button>
    </section>
  );
}

function ListCard({ item }: { item: ComplaintPublicView }) {
  const closed = isClosed(item.canonicalStatus);
  return (
    <Link className="tracking-card" href={`/liff/complaints/${item.id}`}>
      <span aria-hidden="true" className={`tracking-card__icon ${closed ? "is-closed" : ""}`}>{closed ? "✓" : "⚑"}</span>
      <span>
        <span className="tracking-card__eyebrow">คำร้องเลขที่</span>
        <span className="tracking-card__number">{item.complaintNo}<span className={`tracking-card__status tracking-card__status--${closed ? "closed" : "active"}`}>{item.statusLabel}</span></span>
        <span className="tracking-card__title">{item.title}</span>
        <span className="tracking-card__date">อัปเดตล่าสุด {formatDate(item.submittedAt)}</span>
      </span>
      <span aria-hidden="true" className="tracking-card__arrow">›</span>
    </Link>
  );
}

export function ComplaintList({ identity }: { identity: ComplaintCitizenIdentity }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ComplaintPublicListStatus>("ALL");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly ComplaintPublicView[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<TrackingApiError>();
  const [offline, setOffline] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true); else setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams(identityQuery(identity));
      params.set("status", filter);
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      const response = await apiRequest<ListResponse>(`/api/v1/citizen/complaints?${params.toString()}`);
      setItems((current) => cursor ? [...current, ...response.items] : response.items);
      setNextCursor(response.nextCursor);
    } catch (requestError) {
      setError(requestError instanceof TrackingApiError ? requestError : new TrackingApiError("PROCESSING_FAILED", 500, "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้"));
      if (!cursor) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, identity]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const loadTimer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(loadTimer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? items.filter((item) => `${item.complaintNo} ${item.title}`.toLocaleLowerCase().includes(normalized)) : items;
  }, [items, query]);

  return (
    <Shell identity={identity} onBack={() => router.push("/liff")} subtitle="เทศบาลเมืองตัวอย่าง" title="ติดตามสถานะ">
      <div className="tracking-main">
        <h1>ติดตามสถานะ</h1>
        <p className="tracking-lead">ติดตามคำร้องและคำขอของคุณ</p>
        {offline ? <div className="tracking-note tracking-note--warning" role="status">ออฟไลน์อยู่ — แสดงข้อมูลที่โหลดไว้แล้ว และจะลองใหม่เมื่อกลับมาออนไลน์</div> : null}
        {loading ? <section aria-busy="true" className="tracking-empty"><p>กำลังโหลดรายการของคุณ…</p></section> : error ? <ErrorState error={error} onRetry={() => void load()} /> : (
          <>
            <label className="tracking-search"><span aria-hidden="true">⌕</span><input aria-label="ค้นหาด้วยเลขที่คำร้อง" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาด้วยเลขที่คำร้อง" value={query} /><kbd>/</kbd></label>
            <div aria-label="ตัวกรองสถานะ" className="tracking-filters" role="tablist">
              {(["ALL", "ACTIVE", "CLOSED"] as const).map((value) => <button aria-selected={filter === value} className="tracking-filter" key={value} onClick={() => setFilter(value)} role="tab" type="button">{value === "ALL" ? "ทั้งหมด" : value === "ACTIVE" ? "กำลังดำเนินการ" : "เสร็จสิ้น"}</button>)}
            </div>
            {visibleItems.length === 0 ? <section className="tracking-empty"><div aria-hidden="true" className="tracking-empty__icon">▣</div><h2>{query ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการติดตาม"}</h2><p>{query ? "ลองใช้เลขที่คำร้องหรือคำค้นอื่น" : "เมื่อส่งเรื่องแล้ว รายการจะปรากฏที่หน้านี้"}</p>{!query ? <Link className="tracking-button tracking-button--primary" href="/liff/complaints/new">แจ้งปัญหาใหม่</Link> : null}</section> : <div aria-live="polite" className="tracking-list">{visibleItems.map((item) => <ListCard item={item} key={item.id} />)}</div>}
            {nextCursor && !query ? <div className="tracking-list-actions"><button className="tracking-button tracking-button--secondary" disabled={loadingMore} onClick={() => void load(nextCursor)} type="button">{loadingMore ? "กำลังโหลด…" : "โหลดรายการเพิ่ม"}</button></div> : null}
          </>
        )}
      </div>
    </Shell>
  );
}

function Timeline({ item }: { item: ComplaintPublicView }) {
  return <ol aria-label="ลำดับความคืบหน้า" className="tracking-timeline">{item.publicTimeline.map((entry, index) => <li className={index === item.publicTimeline.length - 1 ? "is-current" : "is-done"} key={entry.id}><span aria-hidden="true" className="tracking-timeline__dot" /><span className="tracking-timeline__label">{entry.statusLabel}</span><span className="tracking-timeline__date">{formatDate(entry.occurredAt)}</span></li>)}</ol>;
}

function SurveyPanel({ identity, complaintId, onSubmitted }: { identity: ComplaintCitizenIdentity; complaintId: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const keyRef = useRef(makeIdempotencyKey());
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rating < 1) { setError("กรุณาให้คะแนนความพึงพอใจ"); return; }
    setSubmitting(true);
    setError(undefined);
    try {
      await apiRequest(`/api/v1/citizen/complaints/${complaintId}/surveys`, { method: "POST", headers: { "Idempotency-Key": keyRef.current }, body: JSON.stringify({ ...identity, rating, comment }) });
      onSubmitted();
    } catch (requestError) {
      setError(requestError instanceof TrackingApiError ? requestError.message : "ไม่สามารถบันทึกแบบประเมินได้");
    } finally { setSubmitting(false); }
  };
  return <form className="tracking-survey" onSubmit={submit}><h2>ประเมินความพึงพอใจ</h2><p>ช่วยบอกเราเกี่ยวกับการให้บริการเรื่องนี้</p><div aria-label="คะแนนความพึงพอใจ" className="tracking-stars" role="group">{[1, 2, 3, 4, 5].map((value) => <button aria-label={`${value} ดาว`} aria-pressed={rating === value} className="tracking-star" key={value} onClick={() => setRating(value)} type="button">★</button>)}</div><label>ความคิดเห็นเพิ่มเติม<textarea maxLength={4000} onChange={(event) => setComment(event.target.value)} value={comment} /></label>{error ? <p className="tracking-note tracking-note--error" role="alert">{error}</p> : null}<button className="tracking-button tracking-button--primary" disabled={submitting} type="submit">{submitting ? "กำลังบันทึก…" : "ส่งแบบประเมิน"}</button></form>;
}

export function ComplaintDetail({ identity, complaintId }: { identity: ComplaintCitizenIdentity; complaintId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<ComplaintPublicView>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TrackingApiError>();
  const [tab, setTab] = useState<"progress" | "info">("progress");
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { const result = await apiRequest<{ item: ComplaintPublicView }>(`/api/v1/citizen/complaints/${complaintId}?${identityQuery(identity)}`); setItem(result.item); setSurveySubmitted(result.item.survey.submitted); }
    catch (requestError) { setError(requestError instanceof TrackingApiError ? requestError : new TrackingApiError("PROCESSING_FAILED", 500, "ไม่สามารถโหลดรายละเอียดได้")); }
    finally { setLoading(false); }
  }, [complaintId, identity]);
  useEffect(() => { const loadTimer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(loadTimer); }, [load]);
  return <Shell identity={identity} onBack={() => router.push("/liff/complaints")} subtitle="เทศบาลเมืองตัวอย่าง" title="รายละเอียดคำร้อง">
    <div className="tracking-main">
      {loading ? <section aria-busy="true" className="tracking-empty"><p>กำลังโหลดรายละเอียด…</p></section> : error ? <ErrorState error={error} onRetry={() => void load()} /> : item ? <>
        <section className="tracking-detail-card"><div className="tracking-detail-card__heading"><span aria-hidden="true" className="tracking-detail-card__icon">⚑</span><div><div className="tracking-detail-card__number">{item.complaintNo}</div><div className="tracking-detail-card__meta">{item.title}</div></div><span className="tracking-status-pill">{item.statusLabel}</span></div></section>
        <div aria-label="เลือกข้อมูลรายละเอียด" className="tracking-tabs" role="tablist"><button aria-selected={tab === "progress"} className="tracking-tab" onClick={() => setTab("progress")} role="tab" type="button">ความคืบหน้า</button><button aria-selected={tab === "info"} className="tracking-tab" onClick={() => setTab("info")} role="tab" type="button">ข้อมูลที่แจ้ง</button></div>
        {tab === "progress" ? <>
          <section className="tracking-next"><h2>ขั้นตอนถัดไป</h2><p>{item.nextExpectedStep}</p>{item.requestForInformation ? <><p><strong>ข้อมูลที่เจ้าหน้าที่ขอ:</strong> {item.requestForInformation}</p><Link className="tracking-button tracking-button--secondary" href={`/liff/complaints/${item.id}/additional-info`}>ส่งข้อมูลเพิ่มเติม</Link></> : null}</section>
          <section className="tracking-detail-card tracking-timeline"><h2>ประวัติการดำเนินการ</h2><Timeline item={item} /></section>
        </> : <section className="tracking-detail-card"><h2>ข้อมูลที่แจ้ง</h2><p><strong>หมวดหมู่:</strong> {item.categoryId ?? "ยังไม่ระบุ"}</p><p><strong>สถานที่:</strong> {item.location?.text ?? "ยังไม่ได้ระบุ"}</p>{item.location?.latitude !== undefined && item.location.longitude !== undefined ? <p><strong>พิกัด:</strong> {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}</p> : null}<div className="tracking-media"><h2>รูปภาพประกอบ</h2>{item.publicAttachments.length === 0 ? <p>ยังไม่มีรูปภาพที่เผยแพร่</p> : <div className="tracking-media__grid">{item.publicAttachments.map((attachment) => attachment.publicUrl ? <img alt={attachment.caption ?? attachment.fileName} key={attachment.id} src={attachment.publicUrl} /> : <span key={attachment.id}>{attachment.fileName}</span>)}</div>}</div><div className="tracking-comments"><h2>ข้อความในเรื่อง</h2>{item.publicComments.length === 0 ? <p>ยังไม่มีข้อความเพิ่มเติม</p> : item.publicComments.map((comment) => <div className="tracking-comment" key={comment.id}>{comment.body}<small>{formatDate(comment.createdAt)}</small></div>)}</div></section>}
        {item.survey.eligible && !surveySubmitted ? <SurveyPanel complaintId={item.id} identity={identity} onSubmitted={() => setSurveySubmitted(true)} /> : item.survey.eligible ? <div className="tracking-note tracking-note--success" role="status">ขอบคุณสำหรับการประเมินความพึงพอใจ</div> : null}
        <div className="tracking-detail-actions"><Link className="tracking-button tracking-button--secondary" href="/liff/complaints">กลับไปหน้ารายการ</Link></div>
      </> : null}
    </div>
  </Shell>;
}

export function AdditionalInfo({ identity, complaintId }: { identity: ComplaintCitizenIdentity; complaintId: string }) {
  const router = useRouter();
  const [item, setItem] = useState<ComplaintPublicView>();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<TrackingApiError>();
  const keyRef = useRef(makeIdempotencyKey());
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { const result = await apiRequest<{ item: ComplaintPublicView }>(`/api/v1/citizen/complaints/${complaintId}?${identityQuery(identity)}`); setItem(result.item); }
    catch (requestError) { setError(requestError instanceof TrackingApiError ? requestError : new TrackingApiError("PROCESSING_FAILED", 500, "ไม่สามารถโหลดรายละเอียดได้")); }
    finally { setLoading(false); }
  }, [complaintId, identity]);
  useEffect(() => { const loadTimer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(loadTimer); }, [load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) { setError(new TrackingApiError("VALIDATION_ERROR", 400, "กรุณาระบุข้อมูลเพิ่มเติม")); return; }
    setSubmitting(true); setError(undefined);
    try { const result = await apiRequest<{ item: ComplaintPublicView }>(`/api/v1/citizen/complaints/${complaintId}/messages`, { method: "POST", headers: { "Idempotency-Key": keyRef.current }, body: JSON.stringify({ ...identity, body: message }) }); setItem(result.item); setSent(true); }
    catch (requestError) { setError(requestError instanceof TrackingApiError ? requestError : new TrackingApiError("PROCESSING_FAILED", 500, "ไม่สามารถส่งข้อมูลเพิ่มเติมได้")); }
    finally { setSubmitting(false); }
  };
  return <Shell identity={identity} onBack={() => router.push(`/liff/complaints/${complaintId}`)} subtitle="เทศบาลเมืองตัวอย่าง" title="เพิ่มข้อมูลคำร้อง">
    <div className="tracking-main">
      {loading ? <section aria-busy="true" className="tracking-empty"><p>กำลังโหลดข้อมูล…</p></section> : error && !item ? <ErrorState error={error} onRetry={() => void load()} /> : item ? <>
        <section className="tracking-detail-card"><div className="tracking-detail-card__heading"><span aria-hidden="true" className="tracking-detail-card__icon">⚑</span><div><div className="tracking-detail-card__meta">คำร้อง {item.complaintNo}</div><div className="tracking-detail-card__number">ส่งข้อมูลเพิ่มเติม</div></div></div></section>
        {sent ? <section className="tracking-note tracking-note--success" role="status"><h2>ส่งข้อมูลแล้ว</h2><p>ข้อมูลของคุณถูกเพิ่มในเรื่องนี้ และแจ้งให้เจ้าหน้าที่ทราบแล้ว</p><Link className="tracking-button tracking-button--secondary" href={`/liff/complaints/${complaintId}`}>กลับไปดูความคืบหน้า</Link></section> : item.canonicalStatus !== "WAITING_FOR_CITIZEN" ? <section className="tracking-empty"><h2>ยังไม่มีคำขอข้อมูลเพิ่มเติม</h2><p>เจ้าหน้าที่จะขอข้อมูลผ่านหน้ารายละเอียดเมื่อจำเป็น</p><Link className="tracking-button tracking-button--secondary" href={`/liff/complaints/${complaintId}`}>กลับไปหน้ารายละเอียด</Link></section> : <form className="tracking-form" onSubmit={submit}><div className="tracking-note"><p>ข้อความและไฟล์ที่ส่งจะมองเห็นได้โดยเจ้าหน้าที่ผู้รับผิดชอบและจะไม่แสดงต่อผู้ใช้อื่น</p></div><label>ข้อความเพิ่มเติม<textarea aria-describedby="additional-info-count" maxLength={20_000} onChange={(event) => setMessage(event.target.value)} placeholder="เช่น เพิ่มเติม: บริเวณดังกล่าวอยู่หน้าร้านเลขที่…" value={message} /></label><span className="tracking-form__count" id="additional-info-count">{message.length}/20,000</span>{error ? <p className="tracking-note tracking-note--error" role="alert">{error.message}</p> : null}<button className="tracking-button tracking-button--primary" disabled={submitting} type="submit">{submitting ? "กำลังส่งข้อมูล…" : "ส่งข้อมูล"}</button></form>}
      </> : null}
    </div>
  </Shell>;
}
