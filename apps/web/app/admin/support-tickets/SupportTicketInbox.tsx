"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import type { SupportAdminPage, SupportAdminTicketView } from "../../api/v1/admin/support-tickets/repository";
import { useTheme } from "../../ui/theme";
import "./support-tickets.css";

export type SupportAdminIdentity = {
  tenantId: string;
  accountId: string;
  role: "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN";
  synthetic: boolean;
};

type TicketFilters = {
  search: string;
  status: string;
  priority: string;
  queue: string;
  sla: string;
  sort: string;
};

class SupportApiError extends Error {
  constructor(public readonly status: number, public readonly reasonCode: string, message: string) { super(message); this.name = "SupportApiError"; }
}

const initialFilters: TicketFilters = { search: "", status: "ALL", priority: "ALL", queue: "TENANT", sla: "ALL", sort: "PRIORITY_DESC" };
const queryFor = (identity: SupportAdminIdentity, filters: TicketFilters): string => {
  const query = new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, status: filters.status, priority: filters.priority, queue: filters.queue, sla: filters.sla, sort: filters.sort, limit: "50" });
  if (filters.search.trim()) query.set("search", filters.search.trim());
  return query.toString();
};

const detailHref = (identity: SupportAdminIdentity, id: string): string => `/admin/support-tickets/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(identity.tenantId)}&accountId=${encodeURIComponent(identity.accountId)}&role=${encodeURIComponent(identity.role)}`;
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };
const priorityLabel = (value: SupportAdminTicketView["priority"]): string => value === "URGENT" ? "เร่งด่วน" : "ปกติ";
const channelLabel = (value: SupportAdminTicketView["channel"]): string => value === "LINE" ? "LINE" : value === "WEB" ? "เว็บ" : "ระบบ";
const toneFor = (item: SupportAdminTicketView): "red" | "amber" | "green" | "blue" => item.sla.isOverdue || item.priority === "URGENT" && item.status === "NEW" ? "red" : item.sla.isNearDue || item.status === "WAITING_FOR_CITIZEN" ? "amber" : item.status === "CLOSED" || item.status === "ANSWERED" ? "green" : "blue";

const parsePayload = async (response: Response): Promise<unknown> => response.json().catch(() => undefined);
const apiGet = async (url: string): Promise<SupportAdminPage> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await parsePayload(response);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw new SupportApiError(response.status, error?.error?.reasonCode ?? "PROCESSING_FAILED", error?.error?.message ?? "ไม่สามารถโหลดคิว support ticket ได้");
  }
  return payload as SupportAdminPage;
};

function State({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section aria-live="polite" className="support-state"><h2>{title}</h2><p>{message}</p>{action}</section>;
}

function StatusChip({ item }: { item: SupportAdminTicketView }) {
  return <span className={`support-chip support-chip--${toneFor(item)}`}>{item.statusLabel}</span>;
}

function SlaChip({ item }: { item: SupportAdminTicketView }) {
  return <span className={`support-chip support-chip--${item.sla.isOverdue ? "red" : item.sla.isNearDue ? "amber" : item.sla.state === "COMPLETED" ? "green" : "blue"}`}>{item.sla.label}</span>;
}

function AdminHeader({ identity, theme, onThemeChange }: { identity: SupportAdminIdentity; theme: "light" | "dark" | "high-contrast"; onThemeChange: () => void }) {
  const themeLabel = theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง";
  return <header className="support-topbar"><div className="support-brand"><Link href="/admin/complaints">ศูนย์บริการประชาชน</Link><span>งานส่งต่อเจ้าหน้าที่</span></div><div className="support-topbar__tools"><span className="support-tenant">เทศบาลเมืองตัวอย่าง · {identity.role}</span><button aria-label={themeLabel} className="support-icon-button" onClick={onThemeChange} type="button">{theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼"}</button><Link aria-label="กลับรายการเรื่องร้องเรียน" className="support-icon-button" href="/admin/complaints">↩</Link></div></header>;
}

export function SupportTicketInbox({ identity }: { identity: SupportAdminIdentity }) {
  const { theme, cycleTheme } = useTheme();
  const [filters, setFilters] = useState<TicketFilters>(initialFilters);
  const [page, setPage] = useState<SupportAdminPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SupportApiError>();
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!identity.synthetic) return;
    setLoading(true); setError(undefined);
    try { setPage(await apiGet(`/api/v1/admin/support-tickets?${queryFor(identity, filters)}`)); }
    catch (requestError) { setError(requestError instanceof SupportApiError ? requestError : new SupportApiError(500, "PROCESSING_FAILED", "ไม่สามารถโหลดคิว support ticket ได้")); setPage(undefined); }
    finally { setLoading(false); }
  }, [filters, identity]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const updateFilter = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const items = page?.items ?? [];
  const showPermission = error?.status === 403 || error?.status === 404;
  const showExpired = error?.status === 401 || error?.status === 419;
  const filteredEmpty = !loading && !error && page && items.length === 0;

  return <main className="support-shell" data-theme={theme}><AdminHeader identity={identity} onThemeChange={cycleTheme} theme={theme} /><div className="support-page">
    <div className="support-heading"><div><span className="support-kicker">A-30 · HUMAN HANDOFF</span><h1>คิวส่งต่อเจ้าหน้าที่</h1><p>ดูเหตุผล แหล่งที่มา เจ้าของงาน และ SLA ก่อนตอบประชาชน</p></div><div className="support-heading__actions"><Link className="support-button support-button--secondary" href="/admin/complaints">เรื่องร้องเรียน</Link><button className="support-button support-button--primary" onClick={() => void load()} type="button">รีเฟรชคิว</button></div></div>
    {identity.synthetic ? <p className="support-synthetic">โหมดทดสอบ local — ข้อมูล ticket เป็นข้อมูลสังเคราะห์และไม่ใช่ข้อมูล production</p> : <State message="ระบบ production จะเปิดผ่าน server identity และ policy ของ tenant เท่านั้น" title="ยังไม่เปิดใช้งานคิว production" />}
    {offline ? <div className="support-alert" role="status"><strong>ออฟไลน์อยู่</strong><span>ยังไม่ส่งการแก้ไขใด ๆ และจะลองโหลดใหม่เมื่อกลับมาออนไลน์</span></div> : null}
    {identity.synthetic ? <><section aria-label="สรุป SLA" className="support-metrics"><div><span>ทั้งหมด</span><strong>{page?.facets.total ?? "—"}</strong></div><div><span>เร่งด่วน</span><strong>{page?.facets.urgent ?? "—"}</strong></div><div><span>ใกล้ครบ SLA</span><strong>{page?.facets.nearDue ?? "—"}</strong></div><div><span>เกิน SLA</span><strong>{page?.facets.overdue ?? "—"}</strong></div></section>
      <section aria-label="ตัวกรองคิว" className="support-filter-panel"><label className="support-filter support-filter--search"><span>ค้นหา</span><input aria-label="ค้นหา ticket" onChange={(event) => updateFilter("search", event.target.value)} placeholder="เลข ticket เหตุผล หรือหน่วยงาน…" value={filters.search} /></label><label className="support-filter"><span>สถานะ</span><select aria-label="กรองตามสถานะ" onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}><option value="ALL">ทุกสถานะ</option><option value="NEW">รอเจ้าหน้าที่รับเรื่อง</option><option value="ASSIGNED">มอบหมายแล้ว</option><option value="IN_PROGRESS">กำลังดำเนินการ</option><option value="WAITING_FOR_CITIZEN">รอข้อมูลประชาชน</option><option value="ANSWERED">ตอบกลับแล้ว</option><option value="CLOSED">ปิดเรื่อง</option></select></label><label className="support-filter"><span>ความสำคัญ</span><select aria-label="กรองตามความสำคัญ" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}><option value="ALL">ทั้งหมด</option><option value="URGENT">เร่งด่วน</option><option value="NORMAL">ปกติ</option></select></label><label className="support-filter"><span>คิว</span><select aria-label="เลือกคิว" onChange={(event) => updateFilter("queue", event.target.value)} value={filters.queue}><option value="TENANT">ทั้งเทศบาล</option><option value="UNASSIGNED">ยังไม่มอบหมาย</option><option value="MINE">งานของฉัน</option><option value="DEPARTMENT">หน่วยงานของฉัน</option></select></label><label className="support-filter"><span>SLA</span><select aria-label="กรองตาม SLA" onChange={(event) => updateFilter("sla", event.target.value)} value={filters.sla}><option value="ALL">ทั้งหมด</option><option value="NEAR_DUE">ใกล้ครบ SLA</option><option value="OVERDUE">เกิน SLA</option></select></label><label className="support-filter"><span>เรียงลำดับ</span><select aria-label="เรียงลำดับคิว" onChange={(event) => updateFilter("sort", event.target.value)} value={filters.sort}><option value="PRIORITY_DESC">เร่งด่วนก่อน</option><option value="UPDATED_DESC">อัปเดตล่าสุด</option><option value="CREATED_DESC">รับเรื่องล่าสุด</option></select></label></section>
      {loading ? <State message="กำลังโหลดรายการตามสิทธิ์ของคุณ…" title="กำลังโหลดคิว" /> : showExpired ? <State message="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนดู ticket" title="เซสชันหมดอายุ" /> : showPermission ? <State message="บัญชีนี้ไม่มีสิทธิ์ดูคิวในขอบเขตที่ร้องขอ" title="ไม่มีสิทธิ์เข้าถึง" /> : error ? <State action={<button className="support-button support-button--primary" onClick={() => void load()} type="button">ลองใหม่</button>} message={error.message} title="โหลดคิวไม่สำเร็จ" /> : filteredEmpty ? <State action={<button className="support-button support-button--secondary" onClick={() => setFilters(initialFilters)} type="button">ล้างตัวกรอง</button>} message="ยังไม่มี ticket ในขอบเขตหรือตัวกรองนี้" title="ไม่พบรายการ" /> : <>
        <div className="support-table-wrap"><table className="support-table"><caption className="sr-only">รายการ support ticket</caption><thead><tr><th>Ticket / เหตุผล</th><th>สถานะ</th><th>ความสำคัญ</th><th>เจ้าของงาน</th><th>SLA</th><th>ช่องทาง</th><th>อัปเดตล่าสุด</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Link className="support-ticket-link" href={detailHref(identity, item.id)}>{item.publicTicketId}</Link><strong>{item.reasonLabel}</strong><small>{item.reasonDetail}</small></td><td><StatusChip item={item} /></td><td><span className={`support-chip support-chip--${item.priority === "URGENT" ? "red" : "blue"}`}>{priorityLabel(item.priority)}</span></td><td>{item.departmentName ?? "คิวกลาง"}<small>{item.ownerLabel}</small></td><td><SlaChip item={item} /><small>ครบกำหนด {formatDate(item.sla.dueAt)}</small></td><td>{channelLabel(item.channel)}</td><td>{formatDate(item.updatedAt)}</td></tr>)}</tbody></table></div>
        <div aria-label="รายการ ticket สำหรับจอเล็ก" className="support-mobile-list">{items.map((item) => <Link className="support-mobile-card" href={detailHref(identity, item.id)} key={item.id}><div className="support-mobile-card__top"><strong>{item.publicTicketId}</strong><StatusChip item={item} /></div><h2>{item.reasonLabel}</h2><p>{item.reasonDetail}</p><div className="support-mobile-card__meta"><span>{priorityLabel(item.priority)} · {channelLabel(item.channel)}</span><SlaChip item={item} /></div><small>{item.departmentName ?? "คิวกลาง"} · {formatDate(item.updatedAt)}</small></Link>)}</div>
        <div className="support-list-footer"><span>แสดง {items.length} รายการ · ขอบเขตทั้งหมด {page?.facets.total ?? 0} รายการ</span><span>ทุกการ mutation ต้องยืนยัน version ล่าสุด</span></div>
      </>}
    </> : null}
    <p className="support-synthetic">สิทธิ์: {identity.role} · ข้อมูล public/internal แยกตาม visibility · ไม่มีการเปิดเผย citizen identity hash</p>
  </div></main>;
}

