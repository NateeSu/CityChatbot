"use client";

import type { ComplaintPublicView } from "@citychatbot/complaints";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../ui/states";
import { ThemeToggle } from "../ui/theme-toggle";

import "./liff.css";

export type LiffCitizenIdentity = {
  tenantId: string;
  lineUserId: string;
  tenantName: string;
  synthetic: boolean;
};

export type LiffHomeBootstrap = {
  intakeQueueId: string | null;
  categories: readonly { id: string; code: string; label: string }[];
};

type ApiError = { status: number; reasonCode: string; message: string };
type ListResponse = { items: readonly ComplaintPublicView[]; nextCursor?: string };

const makeQuery = (identity: LiffCitizenIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, lineUserId: identity.lineUserId, status: "ALL", limit: "3" }).toString();
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };

async function fetchRecent(identity: LiffCitizenIdentity): Promise<ListResponse> {
  const response = await fetch(`/api/v1/citizen/complaints?${makeQuery(identity)}`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw { status: response.status, reasonCode: error?.error?.reasonCode ?? "PROCESSING_FAILED", message: error?.error?.message ?? "ไม่สามารถโหลดรายการของคุณได้" } satisfies ApiError;
  }
  return payload as ListResponse;
}

function Header({ title, tenantName, backHref }: { title: string; tenantName: string; backHref: string }) {
  return <header className="liff-header"><Link aria-label={backHref === "/" ? "ปิดหน้าบริการ" : "ย้อนกลับ"} className="liff-header__icon" href={backHref}>{backHref === "/" ? "×" : "‹"}</Link><span aria-hidden="true" className="liff-header__brand">▥</span><div className="liff-header__title"><strong>{title}</strong><small>{tenantName}</small></div><button aria-label="ค้นหา" className="liff-header__icon" type="button">⌕</button><button aria-label="การแจ้งเตือนใหม่ 2 รายการ" className="liff-header__icon liff-header__notification" type="button">♧<b>2</b></button><ThemeToggle className="liff-theme-toggle" /></header>;
}

function FooterNav() {
  return <nav aria-label="เมนูบริการประชาชน" className="liff-footer"><Link href="/liff"><span aria-hidden="true">⌂</span><span>หน้าหลัก</span></Link><Link href="/liff/complaints"><span aria-hidden="true">▣</span><span>ติดตาม</span></Link><Link href="/liff/services"><span aria-hidden="true">▤</span><span>บริการ</span></Link><Link href="/liff/contact"><span aria-hidden="true">♧</span><span>ติดต่อ</span></Link></nav>;
}

export function LiffFrame({ children, identity, title, backHref = "/" }: { children: ReactNode; identity: LiffCitizenIdentity; title: string; backHref?: string }) {
  return <main className="liff-shell"><Header backHref={backHref} tenantName={identity.tenantName} title={title} />{identity.synthetic ? <p className="liff-synthetic">โหมดทดสอบ local — ข้อมูลตัวอย่างเป็นสังเคราะห์ ไม่ใช่ข้อมูล production</p> : null}<div className="liff-main">{children}</div><FooterNav /></main>;
}

const quickActions = [
  { href: "/liff/complaints/new", icon: "◈", label: "แจ้งปัญหา", tone: "teal" },
  { href: "/liff/complaints", icon: "▣", label: "ติดตามสถานะ", tone: "blue" },
  { href: "/liff/news", icon: "▤", label: "ข่าวเทศบาล", tone: "amber" },
  { href: "/liff/services", icon: "⌂", label: "บริการ", tone: "purple" },
  { href: "/liff/contact", icon: "♧", label: "ติดต่อ", tone: "green" },
] as const;

function RecentCard({ item }: { item: ComplaintPublicView }) {
  return <Link className="liff-recent-card" href={`/liff/complaints/${item.id}`}><span aria-hidden="true" className="liff-recent-card__icon">▣</span><span className="liff-recent-card__copy"><strong>{item.complaintNo}</strong><span>{item.title}</span><small>อัปเดตล่าสุด {formatDate(item.submittedAt)}</small></span><span className="liff-recent-card__status">{item.statusLabel}</span><span aria-hidden="true">›</span></Link>;
}

function HomeContent({ identity }: { identity: LiffCitizenIdentity }) {
  const [question, setQuestion] = useState("");
  const [notice, setNotice] = useState<string>();
  const [items, setItems] = useState<readonly ComplaintPublicView[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<ApiError>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetchRecent(identity);
      setItems(result.items);
    } catch (requestError) {
      const next = requestError && typeof requestError === "object" && "reasonCode" in requestError ? requestError as ApiError : { status: 500, reasonCode: "PROCESSING_FAILED", message: "ไม่สามารถโหลดรายการของคุณได้" } satisfies ApiError;
      setError(next);
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { updateOnline(); void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const submitQuestion = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) { setNotice("พิมพ์คำถามก่อนส่ง หรือเลือกบริการด้านล่างได้เลย"); return; }
    setNotice("ช่องถามข้อมูลจะเปิดเมื่อระบบคำตอบที่มีแหล่งอ้างอิงพร้อมใช้งาน กรุณาเลือกบริการหรือแจ้งปัญหาได้ทันที");
  };

  return <LiffFrame backHref="/" identity={identity} title="หน้าหลัก">
    <section aria-labelledby="liff-home-title" className="liff-hero"><span aria-hidden="true" className="liff-hero__mark">▥</span><div><p>สวัสดีค่ะ 👋</p><h1 id="liff-home-title">วันนี้ให้เทศบาลช่วยเรื่องอะไรดีคะ?</h1><span>สอบถามข้อมูลหรือเลือกบริการด้านล่างได้เลย</span></div></section>
    <form className="liff-ask" onSubmit={submitQuestion}><label><span aria-hidden="true">⌕</span><input aria-label="ถามข้อมูลเทศบาล" onChange={(event) => setQuestion(event.target.value)} placeholder="เช่น ต้องใช้เอกสารอะไรในการขออนุญาต" value={question} /></label><button className="liff-button liff-button--primary" type="submit">➤ ถาม AI</button></form>
    {notice ? <p aria-live="polite" className="liff-notice" role="status">{notice}</p> : null}
    <p className="liff-trust">✓ ระบบจะแสดงคำตอบพร้อมแหล่งอ้างอิงเมื่อเปิดใช้งาน</p>
    <section aria-labelledby="quick-actions-title" className="liff-section"><h2 id="quick-actions-title">ทางลัดบริการ</h2><div className="liff-quick-grid">{quickActions.map((action) => <Link className={`liff-quick-card liff-quick-card--${action.tone}`} href={action.href} key={action.href}><span aria-hidden="true">{action.icon}</span><strong>{action.label}</strong></Link>)}</div><Link className="liff-button liff-button--primary liff-wide-action" href="/liff/complaints/new">→ เปิดแจ้งปัญหา</Link></section>
    <section aria-labelledby="recent-title" className="liff-section liff-recent"><div className="liff-section-heading"><h2 id="recent-title">เรื่องของฉันล่าสุด</h2><Link href="/liff/complaints">ดูทั้งหมด</Link></div>{offline ? <OfflineState action={<button className="liff-button liff-button--secondary" onClick={() => void load()} type="button">ลองเชื่อมต่อใหม่</button>} /> : null}{loading ? <LoadingState title="กำลังโหลดรายการของคุณ" message="กำลังตรวจสอบข้อมูลจากบัญชีที่ยืนยันแล้ว" /> : error?.status === 401 || error?.reasonCode === "UNAUTHENTICATED" ? <ExpiredSessionState action={<Link className="liff-button liff-button--secondary" href="/liff">เริ่มเซสชันใหม่</Link>} /> : error?.status === 403 || error?.reasonCode === "FORBIDDEN" ? <PermissionDeniedState /> : error ? items.length > 0 ? <><StaleState action={<button className="liff-button liff-button--secondary" onClick={() => void load()} type="button">รีเฟรช</button>} />{items.map((item) => <RecentCard item={item} key={item.id} />)}</> : <ErrorState message={`${error.message} (${error.reasonCode})`} action={<button className="liff-button liff-button--secondary" onClick={() => void load()} type="button">ลองใหม่</button>} /> : items.length === 0 ? <EmptyState title="ยังไม่มีเรื่องร้องเรียน" message="เมื่อคุณส่งเรื่องแล้ว เลขคำร้องและสถานะจะแสดงที่นี่" action={<Link className="liff-button liff-button--primary" href="/liff/complaints/new">แจ้งปัญหาใหม่</Link>} /> : <div className="liff-recent-list">{items.map((item) => <RecentCard item={item} key={item.id} />)}</div>}</section>
    <p className="liff-help-link"><Link href="/liff/help">ช่วยเหลือและความเป็นส่วนตัว</Link></p>
  </LiffFrame>;
}

export function LiffHome({ identity, bootstrap }: { identity: LiffCitizenIdentity; bootstrap?: LiffHomeBootstrap }) {
  void bootstrap;
  return <HomeContent identity={identity} />;
}

export function LiffUnavailable({ title, identity }: { title: string; identity: LiffCitizenIdentity }) {
  return <LiffFrame backHref="/liff" identity={identity} title={title}><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /></LiffFrame>;
}
