"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../ui/states";
import { AdminShell } from "./AdminShell";
import { navForRole, navHref, type AdminIdentity } from "./admin-navigation";

type DashboardPage = { facets: { total: number; active?: number; urgent: number; overdue?: number; nearDue?: number }; items: readonly unknown[]; synthetic?: boolean };
type DashboardError = { status: number; reasonCode: string; message: string };
type DashboardState = "loading" | "ready" | "partial" | "empty" | "error" | "offline" | "permission" | "expired" | "disabled";

const getJson = async (url: string): Promise<DashboardPage> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const body = payload && typeof payload === "object" && payload !== null ? payload as { error?: { reasonCode?: string; message?: string } } : undefined;
    const error: DashboardError = { status: response.status, reasonCode: body?.error?.reasonCode ?? "PROCESSING_FAILED", message: body?.error?.message ?? "โหลดข้อมูล dashboard ไม่สำเร็จ" };
    throw error;
  }
  return payload as DashboardPage;
};

const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();

export function AdminDashboard({ identity }: { identity: AdminIdentity }) {
  const [state, setState] = useState<DashboardState>(identity.synthetic ? "loading" : "disabled");
  const [complaints, setComplaints] = useState<DashboardPage>();
  const [support, setSupport] = useState<DashboardPage>();
  const [error, setError] = useState<DashboardError>();
  const [offline, setOffline] = useState(false);
  const allowedItems = useMemo(() => navForRole(identity.role), [identity.role]);
  const load = useCallback(async () => {
    if (!identity.synthetic) { setState("disabled"); return; }
    if (!navigator.onLine) { setOffline(true); setState("offline"); return; }
    setOffline(false); setState("loading"); setError(undefined);
    const query = identityQuery(identity);
    const results = await Promise.allSettled([
      getJson(`/api/v1/admin/complaints?${query}&queue=TENANT&sort=UPDATED_DESC&limit=50`),
      getJson(`/api/v1/admin/support-tickets?${query}&queue=TENANT&sort=PRIORITY_DESC&limit=50`),
    ]);
    const first = results[0];
    const second = results[1];
    if (first.status === "fulfilled") setComplaints(first.value); else setComplaints(undefined);
    if (second.status === "fulfilled") setSupport(second.value); else setSupport(undefined);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length === 2) {
      const failure = failures[0]?.reason as DashboardError | undefined;
      setError(failure);
      if (failure?.status === 401 || failure?.status === 419) setState("expired");
      else if (failure?.status === 403 || failure?.status === 404) setState("permission");
      else if (failure?.status === 503) setState("disabled");
      else setState("error");
      return;
    }
    if (failures.length === 1) setState("partial");
    else if ((first.status === "fulfilled" && first.value.facets.total > 0) || (second.status === "fulfilled" && second.value.facets.total > 0)) setState("ready");
    else setState("empty");
  }, [identity]);

  useEffect(() => {
    const updateOnline = () => { const nextOffline = !navigator.onLine; setOffline(nextOffline); if (nextOffline) setState("offline"); };
    updateOnline();
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const notificationCount = (complaints?.facets.urgent ?? 0) + (support?.facets.urgent ?? 0) + (support?.facets.overdue ?? 0);
  const complaintTotal = complaints?.facets.total ?? 0;
  const supportTotal = support?.facets.total ?? 0;
  const departmentLink = allowedItems.find((item) => item.id === "complaints");

  return <AdminShell activeId="dashboard" breadcrumbs={["ภาพรวม"]} identity={identity} notificationCount={notificationCount}>
    <header className="admin-dashboard-heading"><div><span className="admin-dashboard-kicker">A-10 · ROLE DASHBOARD</span><h1>ภาพรวมการให้บริการ</h1><p>แสดงเฉพาะงานที่ session และขอบเขตหน่วยงานนี้มีสิทธิ์ดู</p></div><div className="admin-dashboard-heading__actions"><span className="admin-dashboard-role">{identity.role} · {identity.departmentLabel}</span><button className="admin-dashboard-button admin-dashboard-button--secondary" onClick={() => void load()} type="button">รีเฟรชข้อมูล</button></div></header>
    {offline || state === "offline" ? <OfflineState action={<button className="admin-dashboard-button admin-dashboard-button--secondary" onClick={() => void load()} type="button">ลองเชื่อมต่ออีกครั้ง</button>} /> : null}
    {state === "loading" ? <LoadingState title="กำลังโหลดภาพรวม" message="กำลังอ่านตัวเลขจาก endpoint ที่ตรวจสอบสิทธิ์แล้ว…" /> : null}
    {state === "expired" ? <ExpiredSessionState action={<Link className="admin-dashboard-button admin-dashboard-button--primary" href="/admin">เริ่ม session ใหม่</Link>} /> : null}
    {state === "permission" ? <PermissionDeniedState action={<Link className="admin-dashboard-button admin-dashboard-button--secondary" href="/admin">กลับหน้าหลัก</Link>} /> : null}
    {state === "disabled" ? <FeatureDisabledState action={<Link className="admin-dashboard-button admin-dashboard-button--secondary" href="/api/health">ตรวจสอบสถานะระบบ</Link>} /> : null}
    {state === "error" ? <ErrorState action={<button className="admin-dashboard-button admin-dashboard-button--primary" onClick={() => void load()} type="button">ลองใหม่</button>} message={error?.message ?? "ระบบยังไม่สามารถอ่านข้อมูลภาพรวมได้"} title="โหลดภาพรวมไม่สำเร็จ" /> : null}
    {state === "partial" ? <StaleState action={<button className="admin-dashboard-button admin-dashboard-button--secondary" onClick={() => void load()} type="button">รีเฟรชข้อมูลอีกครั้ง</button>} /> : null}
    {state === "empty" ? <EmptyState action={<Link className="admin-dashboard-button admin-dashboard-button--secondary" href={departmentLink ? navHref(departmentLink, identity) : "/admin"}>เปิดคิวงาน</Link>} title="ยังไม่มีงานในขอบเขตนี้" message="เมื่อมีเรื่องร้องเรียนหรืองานส่งต่อ ระบบจะแสดงตัวเลขที่นี่" /> : null}
    {state === "ready" || state === "partial" ? <>
      <section aria-label="ตัวชี้วัดงานสำคัญ" className="admin-dashboard-metrics"><article><span>เรื่องร้องเรียนทั้งหมด</span><strong>{complaintTotal}</strong><Link href={departmentLink ? navHref(departmentLink, identity) : "/admin"}>ดูรายการ</Link></article><article><span>งานส่งต่อทั้งหมด</span><strong>{supportTotal}</strong><Link href={navForRole(identity.role).find((item) => item.id === "support") ? navHref(navForRole(identity.role).find((item) => item.id === "support")!, identity) : "/admin"}>เปิดคิวงาน</Link></article><article><span>เรื่องเร่งด่วน</span><strong>{notificationCount}</strong><small>รวมงานที่ต้องติดตาม</small></article><article><span>งานเกิน SLA</span><strong>{support?.facets.overdue ?? 0}</strong><small>จากข้อมูล support ที่โหลดได้</small></article></section>
      <section className="admin-dashboard-grid"><article className="admin-dashboard-card"><div className="admin-dashboard-card__header"><div><h2>งานที่ต้องติดตาม</h2><p>ตัวเลขมาจาก support/complaint API ตาม tenant scope</p></div><span className="admin-dashboard-card__status">อัปเดตล่าสุด</span></div><ul className="admin-dashboard-list"><li><span>เรื่องร้องเรียนเร่งด่วน</span><strong>{complaints?.facets.urgent ?? 0}</strong></li><li><span>งานส่งต่อเร่งด่วน</span><strong>{support?.facets.urgent ?? 0}</strong></li><li><span>งานส่งต่อใกล้ครบ SLA</span><strong>{support?.facets.nearDue ?? 0}</strong></li><li><span>งานส่งต่อเกิน SLA</span><strong>{support?.facets.overdue ?? 0}</strong></li></ul></article><article className="admin-dashboard-card"><div className="admin-dashboard-card__header"><div><h2>ทางลัดตามสิทธิ์</h2><p>เมนูที่ไม่อยู่ใน role นี้จะไม่แสดง</p></div></div><div className="admin-dashboard-shortcuts">{allowedItems.filter((item) => item.id !== "dashboard").map((item) => <Link href={navHref(item, identity)} key={item.id}><strong>{item.label}</strong><span>{item.description}</span></Link>)}</div></article></section>
    </> : null}
  </AdminShell>;
}
