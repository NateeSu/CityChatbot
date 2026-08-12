"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { ComplaintAdminPage, ComplaintAdminQueue, ComplaintAdminRole, ComplaintAdminSort, ComplaintAdminView } from "@citychatbot/complaints";

import { useTheme } from "../../ui/theme";
import "./admin-complaints.css";

export type AdminIdentity = {
  tenantId: string;
  accountId: string;
  role: ComplaintAdminRole;
  departmentIds: readonly string[];
  synthetic: boolean;
};

type AdminFilters = {
  search: string;
  status: string;
  priority: string;
  queue: ComplaintAdminQueue;
  departmentId: string;
  sort: ComplaintAdminSort;
};

class AdminApiError extends Error {
  constructor(public readonly status: number, public readonly reasonCode: string, message: string) { super(message); this.name = "AdminApiError"; }
}

const initialFilters: AdminFilters = { search: "", status: "ALL", priority: "ALL", queue: "DEPARTMENT", departmentId: "", sort: "UPDATED_DESC" };
const makeQuery = (identity: AdminIdentity, filters: AdminFilters, cursor?: string): URLSearchParams => {
  const query = new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, status: filters.status, priority: filters.priority, queue: filters.queue, sort: filters.sort, limit: "25" });
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.departmentId) query.set("departmentId", filters.departmentId);
  if (cursor) query.set("cursor", cursor);
  return query;
};

const detailHref = (identity: AdminIdentity, complaintId: string): string => `/admin/complaints/${complaintId}?tenantId=${encodeURIComponent(identity.tenantId)}&accountId=${encodeURIComponent(identity.accountId)}&role=${encodeURIComponent(identity.role)}`;

const apiRequest = async (url: string): Promise<ComplaintAdminPage> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    throw new AdminApiError(response.status, error?.error?.reasonCode ?? "PROCESSING_FAILED", error?.error?.message ?? "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้");
  }
  return payload as ComplaintAdminPage;
};

const statusTone = (status: ComplaintAdminView["canonicalStatus"]): "blue" | "green" | "amber" | "red" => status === "CLOSED" || status === "RESOLVED" ? "green" : status === "WAITING_FOR_CITIZEN" ? "amber" : status === "CANCELLED" || status === "OUT_OF_JURISDICTION" ? "red" : "blue";
const priorityLabel = (priority: ComplaintAdminView["priority"]): string => priority === "URGENT" ? "สูงมาก" : priority === "HIGH" ? "สูง" : priority === "LOW" ? "ต่ำ" : "ปานกลาง";
const formatDate = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };

function Sidebar() {
  return <aside className="admin-sidebar"><div className="admin-brand"><span aria-hidden="true" className="admin-brand__mark">▥</span><div><strong>ศูนย์บริการประชาชน</strong><small>ระบบจัดการเรื่องร้องเรียน</small></div></div><nav aria-label="เมนูเจ้าหน้าที่" className="admin-nav"><Link href="/admin/complaints"><span aria-hidden="true">⌂</span><span>ภาพรวม</span></Link><Link aria-current="page" href="/admin/complaints"><span aria-hidden="true">▣</span><span>เรื่องร้องเรียน</span></Link><Link href="/admin/support-tickets"><span aria-hidden="true">↗</span><span>งานส่งต่อ</span></Link><Link href="/admin/complaints"><span aria-hidden="true">▤</span><span>คลังความรู้</span></Link><Link href="/admin/complaints"><span aria-hidden="true">▥</span><span>ข่าวประชาสัมพันธ์</span></Link><Link href="/admin/complaints"><span aria-hidden="true">♧</span><span>หน่วยงาน</span></Link><Link href="/admin/complaints"><span aria-hidden="true">▤</span><span>รายงาน</span></Link><Link href="/admin/complaints"><span aria-hidden="true">⚙</span><span>ตั้งค่า</span></Link></nav><div className="admin-sidebar__user"><strong>นวิตรา มีสุข</strong><small>ผู้ดูแลเทศบาล</small></div></aside>;
}

function Topbar({ theme, onThemeChange, identity }: { theme: "light" | "dark" | "high-contrast"; onThemeChange: () => void; identity: AdminIdentity }) {
  const themeLabel = theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง";
  return <header className="admin-topbar"><label className="admin-global-search"><span aria-hidden="true">⌕</span><input aria-label="ค้นหาระบบ" placeholder="ค้นหาเรื่อง ผู้ร้องเรียน เอกสาร หรือเมนู…" /><kbd>/</kbd></label><div className="admin-topbar__tools"><span className="admin-tenant-badge"><span aria-hidden="true" className="admin-tenant-badge__mark">▥</span><span>เทศบาลเมืองตัวอย่าง<small>รหัสหน่วยงาน: TM-001</small></span></span><button aria-label={themeLabel} className="admin-topbar__button" onClick={onThemeChange} type="button">{theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼"}</button><button aria-label="การแจ้งเตือน" className="admin-topbar__button" type="button">♧</button><button aria-label={`บทบาท ${identity.role}`} className="admin-topbar__button" type="button">นว</button></div></header>;
}

function State({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="admin-state"><h2>{title}</h2><p>{message}</p>{action}</section>;
}

function StatusChip({ item }: { item: ComplaintAdminView }) { return <span className={`admin-chip admin-chip--${statusTone(item.canonicalStatus)}`}>{item.statusLabel}</span>; }
function PriorityChip({ item }: { item: ComplaintAdminView }) { return <span className={`admin-chip admin-chip--${item.priority === "URGENT" ? "red" : item.priority === "HIGH" ? "amber" : "blue"}`}>{priorityLabel(item.priority)}</span>; }

export function AdminComplaintInbox({ identity }: { identity: AdminIdentity }) {
  const { theme, cycleTheme } = useTheme();
  const [filters, setFilters] = useState<AdminFilters>(initialFilters);
  const [page, setPage] = useState<ComplaintAdminPage>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<AdminApiError>();
  const [offline, setOffline] = useState(false);
  const [viewMode, setViewMode] = useState<"LIST" | "MAP">("LIST");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string>();
  const [savedViews, setSavedViews] = useState<readonly { name: string; filters: AdminFilters }[]>([]);
  const [savedName, setSavedName] = useState("");

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true); else setLoading(true);
    setError(undefined);
    const query = makeQuery(identity, filters, cursor);
    window.history.replaceState({}, "", `/admin/complaints?${query.toString()}`);
    try {
      const result = await apiRequest(`/api/v1/admin/complaints?${query.toString()}`);
      setPage((current) => cursor && current ? { ...result, items: [...current.items, ...result.items] } : result);
      if (!cursor) setSelected(new Set());
    } catch (requestError) {
      setError(requestError instanceof AdminApiError ? requestError : new AdminApiError(500, "PROCESSING_FAILED", "ไม่สามารถโหลดรายการเรื่องร้องเรียนได้"));
      if (!cursor) setPage(undefined);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [filters, identity]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline(); window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const items = page?.items ?? [];
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const filteredEmpty = !loading && !error && page && items.length === 0;
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const updateFilter = <K extends keyof AdminFilters,>(key: K, value: AdminFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters(initialFilters);
  const saveCurrentView = () => { const name = savedName.trim(); if (!name) { setNotice("กรุณาตั้งชื่อมุมมองก่อนบันทึก"); return; } setSavedViews((current) => [...current, { name, filters: { ...filters } }]); setSavedName(""); setNotice(`บันทึกมุมมอง “${name}” เฉพาะเซสชันนี้แล้ว`); };
  const selectionAction = () => setNotice("การมอบหมายและเปลี่ยนสถานะจะเปิดในหน้ารายละเอียดงาน P3-ADM-002");
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));

  return <main className="admin-shell" data-theme={theme}><Sidebar /><div className="admin-main"><Topbar identity={identity} onThemeChange={cycleTheme} theme={theme} /><div className="admin-page">
    <div className="admin-page__heading"><div><span className="admin-page__badge">A-20</span><h1>รายการเรื่องร้องเรียน</h1><p>ตารางงานที่ค้นหา กรอง เลือกหลายรายการ และมอบหมายได้</p></div><div className="admin-actions"><button className="admin-button admin-button--secondary" onClick={() => setNotice("ตัวกรองเพิ่มเติมใช้ฟิลด์ที่อนุญาตใน URL เดียวกับ API") } type="button">☷ ตัวกรอง</button><button className="admin-button admin-button--primary" onClick={() => setNotice("เลือกเรื่องก่อนมอบหมายงาน") } type="button">มอบหมายงาน</button></div></div>
    {identity.synthetic ? <p className="admin-synthetic">โหมดทดสอบ local — รายการตัวอย่างเป็นข้อมูลสังเคราะห์ ไม่ใช่ข้อมูล production</p> : null}
    {offline ? <div className="admin-state" role="status"><h2>ออฟไลน์อยู่</h2><p>ข้อมูลจะไม่ถูกแก้ไข และจะลองโหลดใหม่เมื่อกลับมาออนไลน์</p></div> : null}
    <div className="admin-toolbar"><label className="admin-filter admin-filter--search"><span aria-hidden="true">⌕</span><input aria-label="ค้นหาเรื่องร้องเรียน" onChange={(event) => updateFilter("search", event.target.value)} placeholder="ค้นหาเรื่องร้องเรียน เลขที่เรื่อง สถานที่ หรือผู้แจ้ง…" value={filters.search} /></label><label className="admin-filter"><span className="sr-only">สถานะ</span><select aria-label="กรองตามสถานะ" onChange={(event) => updateFilter("status", event.target.value)} value={filters.status}><option value="ALL">ทั้งหมด</option><option value="RECEIVED">รับเรื่องแล้ว</option><option value="UNDER_REVIEW">รอตรวจสอบ</option><option value="ASSIGNED">มอบหมายแล้ว</option><option value="IN_PROGRESS">กำลังดำเนินการ</option><option value="WAITING_FOR_CITIZEN">รอข้อมูล</option><option value="RESOLVED">แก้ไขแล้ว</option><option value="CLOSED">เสร็จสิ้น</option></select></label><label className="admin-filter"><span className="sr-only">ความสำคัญ</span><select aria-label="กรองตามความสำคัญ" onChange={(event) => updateFilter("priority", event.target.value)} value={filters.priority}><option value="ALL">ทุกระดับความสำคัญ</option><option value="URGENT">สูงมาก</option><option value="HIGH">สูง</option><option value="NORMAL">ปานกลาง</option><option value="LOW">ต่ำ</option></select></label><label className="admin-filter"><span className="sr-only">คิวงาน</span><select aria-label="เลือกคิวงาน" onChange={(event) => updateFilter("queue", event.target.value as ComplaintAdminQueue)} value={filters.queue}><option value="DEPARTMENT">หน่วยงานของฉัน</option><option value="MINE">งานของฉัน</option>{identity.role === "TENANT_ADMIN" ? <option value="TENANT">ทั้งเทศบาล</option> : null}</select></label><label className="admin-filter"><span className="sr-only">เรียงลำดับ</span><select aria-label="เรียงลำดับรายการ" onChange={(event) => updateFilter("sort", event.target.value as ComplaintAdminSort)} value={filters.sort}><option value="UPDATED_DESC">อัปเดตล่าสุด</option><option value="CREATED_DESC">รับเรื่องล่าสุด</option><option value="PRIORITY_DESC">ความสำคัญสูงก่อน</option></select></label><div aria-label="มุมมอง" className="admin-view-toggle"><button aria-pressed={viewMode === "LIST"} onClick={() => setViewMode("LIST")} type="button">▤ รายการ</button><button aria-pressed={viewMode === "MAP"} onClick={() => setViewMode("MAP")} type="button">⌖ แผนที่</button></div></div>
    <div className="admin-saved-views"><label className="admin-filter"><input aria-label="ชื่อมุมมองที่บันทึก" onChange={(event) => setSavedName(event.target.value)} placeholder="ชื่อมุมมอง…" value={savedName} /></label><button className="admin-button admin-button--secondary" onClick={saveCurrentView} type="button">บันทึกมุมมอง</button>{savedViews.map((view) => <button key={view.name} onClick={() => setFilters({ ...view.filters })} type="button">{view.name}</button>)}</div>
    {notice ? <div className="admin-state" role="status"><p>{notice}</p><button className="admin-button admin-button--secondary" onClick={() => setNotice(undefined)} type="button">ปิด</button></div> : null}
    {loading ? <State message="กำลังโหลดข้อมูลตามสิทธิ์ของคุณ…" title="กำลังโหลดรายการ" /> : error ? <State message={error.status === 403 || error.status === 404 ? "ไม่พบรายการในขอบเขตที่คุณมีสิทธิ์ดู" : error.message} title={error.status === 403 || error.status === 404 ? "ไม่มีสิทธิ์เข้าถึงรายการนี้" : "โหลดรายการไม่สำเร็จ"} action={<button className="admin-button admin-button--primary" onClick={() => void load()} type="button">ลองใหม่</button>} /> : filteredEmpty ? <State message="ลองล้างตัวกรองหรือเปลี่ยนคิวงานเพื่อดูรายการที่มีสิทธิ์" title={filters.search || filters.status !== "ALL" || filters.priority !== "ALL" ? "ไม่พบรายการตามตัวกรอง" : "ยังไม่มีเรื่องร้องเรียนในคิว"} action={<button className="admin-button admin-button--secondary" onClick={clearFilters} type="button">ล้างตัวกรอง</button>} /> : viewMode === "MAP" ? <section aria-label="แผนที่เรื่องร้องเรียน" className="admin-map-panel"><h2>แผนที่เรื่องร้องเรียน</h2><p>แสดงเฉพาะข้อมูลตำแหน่งที่ผ่านการตรวจสิทธิ์และการทำให้ปลอดภัย</p><div className="admin-map-panel__notice"><strong>ชั้นแผนที่ยังปิดอยู่ใน MVP</strong><p>รายการที่กรองแล้วมี {items.length} เรื่อง ใช้รายการด้านล่างเป็นทางเลือกที่เข้าถึงได้</p><button className="admin-button admin-button--secondary" onClick={() => setViewMode("LIST")} type="button">กลับมุมมองรายการ</button></div></section> : <>
      <div className="admin-selection-bar"><span><strong>{selected.size}</strong> รายการที่เลือก <button className="admin-button admin-button--secondary" onClick={toggleAll} type="button">{allSelected ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}</button></span><div className="admin-selection-bar__actions"><button className="admin-button admin-button--secondary" disabled={selected.size === 0} onClick={selectionAction} type="button">มอบหมาย</button><button className="admin-button admin-button--secondary" disabled={selected.size === 0} onClick={selectionAction} type="button">เปลี่ยนสถานะ</button></div></div>
      <div className="admin-table-wrap"><table aria-label="ตารางรายการเรื่องร้องเรียน" className="admin-table"><thead><tr><th><input aria-label="เลือกเรื่องทั้งหมด" checked={allSelected} className="admin-checkbox" onChange={toggleAll} type="checkbox" /></th><th>เลขที่เรื่อง</th><th>หัวข้อเรื่อง</th><th>สถานะ</th><th>ความสำคัญ</th><th>หน่วยงาน</th><th>ผู้รับผิดชอบ</th><th>SLA</th><th>รับเรื่องเมื่อ</th></tr></thead><tbody>{items.map((item) => <tr className={selected.has(item.id) ? "is-selected" : ""} key={item.id}><td><input aria-label={`เลือก ${item.complaintNo}`} checked={selected.has(item.id)} className="admin-checkbox" onChange={() => toggleSelected(item.id)} type="checkbox" /></td><td><Link className="admin-row__number" href={detailHref(identity, item.id)}>{item.complaintNo}</Link></td><td><span className="admin-row__title">{item.title}</span><span className="admin-row__location">ข้อมูล public location จะแสดงเมื่อ endpoint อนุญาต</span></td><td><StatusChip item={item} /></td><td><PriorityChip item={item} /></td><td>{item.departmentName ?? "ยังไม่มอบหมาย"}</td><td>{item.hasAssignee ? item.assignedToCurrentUser ? "ฉัน" : "มีผู้รับผิดชอบ" : "—"}</td><td>{item.sla.state === "NOT_CONFIGURED" ? "ยังไม่ตั้งค่า" : "—"}</td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div>
      <div className="admin-mobile-list">{items.map((item) => <article className={`admin-mobile-card ${selected.has(item.id) ? "is-selected" : ""}`} key={item.id}><input aria-label={`เลือก ${item.complaintNo}`} checked={selected.has(item.id)} className="admin-checkbox" onChange={() => toggleSelected(item.id)} type="checkbox" /><div><div className="admin-mobile-card__header"><Link className="admin-row__number" href={detailHref(identity, item.id)}>{item.complaintNo}</Link><StatusChip item={item} /></div><span className="admin-mobile-card__title">{item.title}</span><span className="admin-mobile-card__meta">{item.departmentName ?? "ยังไม่มอบหมาย"} · {formatDate(item.createdAt)}</span><div className="admin-mobile-card__footer"><PriorityChip item={item} /><span className="admin-chip admin-chip--blue">{item.sla.state === "NOT_CONFIGURED" ? "SLA ยังไม่ตั้งค่า" : "SLA"}</span></div></div></article>)}</div>
      <div className="admin-pagination"><span>แสดง {items.length} รายการ · ทั้งหมดในขอบเขต {page?.facets.total ?? 0} รายการ</span><div className="admin-pagination__buttons"><button aria-label="หน้าก่อนหน้า" disabled type="button">‹</button>{page?.hasMore ? <button aria-current="page" type="button">1</button> : null}<button aria-label="โหลดหน้าถัดไป" disabled={!page?.nextCursor || loadingMore} onClick={() => page?.nextCursor ? void load(page.nextCursor) : undefined} type="button">{loadingMore ? "…" : "›"}</button></div></div>
    </>}
    <p className="admin-synthetic">สิทธิ์การดู: {identity.role} · {page?.facets.total ?? 0} รายการที่ได้รับอนุญาต · ข้อมูล SLA แสดงจากระบบจริงเมื่อ P3-SLA-001 พร้อม</p>
  </div></div></main>;
}
