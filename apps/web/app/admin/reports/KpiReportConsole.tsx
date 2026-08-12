"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { KpiReport, KpiReportMetric } from "@citychatbot/reports-kpi";

import { EmptyState, ErrorState, ExpiredSessionState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../ui/states";
import { AdminShell } from "../AdminShell";
import type { AdminIdentity } from "../admin-navigation";

type DepartmentOption = { readonly id: string; readonly label: string };

type KpiReportConsoleProps = {
  identity: AdminIdentity;
  initialReport: KpiReport;
  departments: readonly DepartmentOption[];
};

type ReportFilterState = {
  from: string;
  to: string;
  departmentId: string;
  granularity: "DAILY" | "MONTHLY";
};

const dateInput = (value: string): string => value.slice(0, 10);
const isoStart = (value: string): string => `${value}T00:00:00.000Z`;
const isoEnd = (value: string): string => `${value}T00:00:00.000Z`;

const numberText = (value: number | null | undefined, unit?: string): string => {
  if (value === null || value === undefined) return "ไม่มีข้อมูล";
  if (unit === "PERCENT") return `${(value * 100).toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
};

const dateText = (value: string | null | undefined): string => value ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

const toneFor = (metric: KpiReportMetric): string => metric.reconciliation === "MISMATCH" ? "mismatch" : metric.freshness === "STALE" ? "stale" : metric.latest ? "ready" : "missing";

export function KpiReportConsole({ identity, initialReport, departments }: KpiReportConsoleProps) {
  const [report, setReport] = useState(initialReport);
  const [from, setFrom] = useState(dateInput(initialReport.filter.from));
  const [to, setTo] = useState(dateInput(initialReport.filter.to));
  const [departmentId, setDepartmentId] = useState(initialReport.filter.departmentId ?? "ALL");
  const [granularity, setGranularity] = useState<"DAILY" | "MONTHLY">(initialReport.filter.granularity);
  const [selectedMetricKey, setSelectedMetricKey] = useState(initialReport.metrics[0]?.metricKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [permission, setPermission] = useState(false);
  const [expired, setExpired] = useState(false);

  const selectedMetric = useMemo(() => report.metrics.find((metric) => metric.metricKey === selectedMetricKey) ?? report.metrics[0], [report.metrics, selectedMetricKey]);
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ tenantId: identity.tenantId, role: identity.role, accountId: identity.accountId, from: isoStart(from), to: isoEnd(to), granularity, categoryId: "ALL", format: "csv" });
    if (departmentId !== "ALL") params.set("departmentId", departmentId);
    return `/api/v1/admin/reports/kpi?${params.toString()}`;
  }, [departmentId, from, granularity, identity.accountId, identity.role, identity.tenantId, to]);

  async function refresh(next?: Partial<ReportFilterState>): Promise<void> {
    const nextFrom = next?.from ?? from;
    const nextTo = next?.to ?? to;
    const nextDepartmentId = next?.departmentId ?? departmentId;
    const nextGranularity = next?.granularity ?? granularity;
    setLoading(true);
    setError(undefined);
    setOffline(false);
    setPermission(false);
    setExpired(false);
    const params = new URLSearchParams({ tenantId: identity.tenantId, role: identity.role, accountId: identity.accountId, from: isoStart(nextFrom), to: isoEnd(nextTo), granularity: nextGranularity, categoryId: "ALL" });
    if (nextDepartmentId !== "ALL") params.set("departmentId", nextDepartmentId);
    try {
      const response = await fetch(`/api/v1/admin/reports/kpi?${params.toString()}`, { cache: "no-store" });
      if (response.status === 403) { setPermission(true); return; }
      if (response.status === 404) { setExpired(true); return; }
      if (response.status === 503) { setOffline(true); return; }
      const payload = await response.json() as { data?: KpiReport; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "โหลดรายงานไม่สำเร็จ");
      setReport(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดรายงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const resetFilters = (): void => {
    const next = {
      from: dateInput(initialReport.filter.from),
      to: dateInput(initialReport.filter.to),
      departmentId: initialReport.filter.departmentId ?? "ALL",
      granularity: initialReport.filter.granularity,
    } satisfies ReportFilterState;
    setFrom(next.from);
    setTo(next.to);
    setDepartmentId(next.departmentId);
    setGranularity(next.granularity);
    void refresh(next);
  };

  const maxTrendValue = Math.max(1, ...(selectedMetric?.trend.map((point) => Math.abs(point.value ?? 0)) ?? []));

  if (permission) return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></AdminShell>;
  if (expired) return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><ExpiredSessionState action={<button className="report-button report-button--primary" onClick={() => void refresh()} type="button">เริ่ม session ใหม่</button>} /></AdminShell>;
  if (offline) return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><OfflineState action={<button className="report-button report-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่ออีกครั้ง</button>} /></AdminShell>;
  if (loading && !report.metrics.length) return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><LoadingState title="กำลังโหลดรายงาน KPI" /></AdminShell>;
  if (error && !report.metrics.length) return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><ErrorState message={error} action={<button className="report-button report-button--primary" onClick={() => void refresh()} type="button">ลองใหม่</button>} /></AdminShell>;

  return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}>
    <main aria-busy={loading} className="report-page">
      <header className="report-heading">
        <div><span className="report-kicker">A-80 · APPROVED SQL SNAPSHOTS</span><h1>รายงาน KPI และ SLA</h1><p>ตัวเลขจาก definition ที่อนุมัติแล้ว พร้อมช่วงเวลา แหล่งข้อมูล และสถานะความสด</p></div>
        <div className="report-heading__actions"><span className={`report-status report-status--${report.status.toLowerCase()}`}>{report.status === "READY" ? "พร้อมใช้งาน" : report.status === "STALE" ? "ข้อมูลอาจเก่า" : report.status === "EMPTY" ? "ยังไม่มีข้อมูล" : "ต้องตรวจสอบ"}</span><a className="report-button report-button--secondary" download href={exportHref}>ดาวน์โหลด CSV</a></div>
      </header>
      {error ? <p className="report-inline-alert" role="alert">{error} <button onClick={() => void refresh()} type="button">ลองใหม่</button></p> : null}
      {report.status === "STALE" ? <StaleState action={<button className="report-button report-button--secondary" onClick={() => void refresh()} type="button">รีเฟรชข้อมูล</button>} /> : null}
      <section aria-labelledby="report-filters-title" className="report-card report-filters">
        <div className="report-card-heading"><div><span className="report-kicker">FILTERS</span><h2 id="report-filters-title">ตัวกรองรายงาน</h2></div><span className="report-muted">Timezone: {report.filter.timezone}</span></div>
        <form onSubmit={(event) => { event.preventDefault(); void refresh(); }}>
          <label>ตั้งแต่<input aria-label="วันที่เริ่มต้น" onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label>
          <label>ถึง<input aria-label="วันที่สิ้นสุด" onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label>
          <label>หน่วยงาน<select aria-label="หน่วยงาน" onChange={(event) => setDepartmentId(event.target.value)} value={departmentId}>{departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}</select></label>
          <label>ระดับข้อมูล<select aria-label="ระดับข้อมูล" onChange={(event) => setGranularity(event.target.value as "DAILY" | "MONTHLY")} value={granularity}><option value="MONTHLY">รายเดือน</option><option value="DAILY">รายวัน</option></select></label>
          <label>หมวดเรื่อง<select aria-label="หมวดเรื่อง" disabled value="ALL"><option value="ALL">ทุกหมวด — รอ definition ที่รองรับหมวด</option></select></label>
          <button className="report-button report-button--primary" disabled={loading} type="submit">{loading ? "กำลังโหลด…" : "ใช้ตัวกรอง"}</button>
          <button className="report-button report-button--text" disabled={loading} onClick={resetFilters} type="button">คืนค่าเริ่มต้น</button>
        </form>
      </section>
      <section aria-label="สรุปความครอบคลุมรายงาน" className="report-summary-grid">
        <article className="report-summary-card"><span>Metric ที่แสดง</span><strong>{report.coverage.metricsWithCurrentSnapshot}/{report.coverage.definitionCount}</strong><small>จาก approved definition</small></article>
        <article className="report-summary-card"><span>Reconciliation</span><strong>{report.coverage.reconciledMetricCount}/{report.coverage.metricsWithCurrentSnapshot}</strong><small>ต้องตรงกับ raw SQL</small></article>
        <article className="report-summary-card"><span>ข้อมูลล่าสุด</span><strong>{dateText(report.latestSourceWatermark)}</strong><small>source watermark</small></article>
        <article className="report-summary-card"><span>ขอบเขต</span><strong>{departmentId === "ALL" ? "ทุกหน่วยงาน" : departments.find((item) => item.id === departmentId)?.label ?? "หน่วยงาน"}</strong><small>{report.filter.granularity === "MONTHLY" ? "รายเดือน" : "รายวัน"}</small></article>
      </section>
      {report.status === "EMPTY" ? <EmptyState title="ยังไม่มี snapshot ในช่วงเวลานี้" message="ลองเลือกช่วงเวลาหรือหน่วยงานที่มีการสร้าง snapshot แล้ว" action={<button className="report-button report-button--secondary" onClick={resetFilters} type="button">คืนค่าตัวกรอง</button>} /> : <section aria-labelledby="report-metrics-title" className="report-card"><div className="report-card-heading"><div><span className="report-kicker">DETERMINISTIC METRICS</span><h2 id="report-metrics-title">ตัวชี้วัดทั้งหมด</h2></div><span className="report-muted">คลิกการ์ดเพื่อดู definition และ trend</span></div><div className="report-metric-grid">{report.metrics.map((metric) => <button className={`report-metric-card report-metric-card--${toneFor(metric)}${selectedMetric?.metricKey === metric.metricKey ? " is-selected" : ""}`} key={metric.metricKey} onClick={() => setSelectedMetricKey(metric.metricKey)} type="button"><span className="report-metric-card__title">{metric.definition.displayName}</span><strong>{numberText(metric.latest?.value, metric.latest?.unit)}</strong><span className="report-metric-card__meta">{metric.latest ? `${metric.latest.numerator}/${metric.latest.denominator} ${metric.latest.unit === "PERCENT" ? "applicable" : "cases"}` : "ยังไม่มี snapshot"}</span><span className="report-metric-card__footer"><span>{metric.freshness === "FRESH" ? "สด" : metric.freshness === "STALE" ? "เก่า" : "ไม่มีข้อมูล"}</span><span>{metric.reconciliation === "MATCH" ? "ตรงกับ SQL" : metric.reconciliation === "PENDING" ? "รอตรวจสอบ" : "ไม่ตรงกัน"}</span></span></button>)}</div></section>}
      {selectedMetric ? <section aria-labelledby="report-detail-title" className="report-detail-grid"><article className="report-card"><div className="report-card-heading"><div><span className="report-kicker">DEFINITION · DRILL-DOWN</span><h2 id="report-detail-title">{selectedMetric.definition.displayName}</h2></div><span className={`report-chip report-chip--${toneFor(selectedMetric)}`}>{selectedMetric.reconciliation}</span></div><dl className="report-definition-list"><div><dt>Formula</dt><dd>{selectedMetric.definition.formula}</dd></div><div><dt>Cohort</dt><dd>{selectedMetric.definition.cohort}</dd></div><div><dt>Timezone</dt><dd>{selectedMetric.definition.timezone}</dd></div><div><dt>Null rule</dt><dd>{selectedMetric.definition.nullRule}</dd></div><div><dt>แหล่งข้อมูล</dt><dd>{selectedMetric.definition.sourceTables.join(", ")}</dd></div><div><dt>Drill-down key</dt><dd>{selectedMetric.drilldown.queryKey}</dd></div></dl><p className="report-definition-tooltip">คำอธิบาย: {selectedMetric.definition.tooltip}</p></article><article className="report-card"><div className="report-card-heading"><div><span className="report-kicker">TREND</span><h2>แนวโน้มตามช่วงเวลา</h2></div><span className="report-muted">{selectedMetric.trend.length} จุดข้อมูล</span></div>{selectedMetric.trend.length === 0 ? <p className="report-muted">ยังไม่มีข้อมูล trend</p> : <><div aria-label={`แนวโน้ม ${selectedMetric.definition.displayName}`} className="report-trend-bars" role="img">{selectedMetric.trend.map((point) => <span className="report-trend-bar" key={point.id} style={{ height: `${Math.max(point.value === null ? 4 : Math.round(Math.abs(point.value) / maxTrendValue * 100), 4)}%` }}><i aria-hidden="true" /><small>{dateText(point.periodFrom)}</small></span>)}</div><div className="report-table-wrap"><table className="report-trend-table"><caption className="sr-only">ตารางแนวโน้ม {selectedMetric.definition.displayName}</caption><thead><tr><th scope="col">ช่วงเวลา</th><th scope="col">ค่า</th><th scope="col">สดถึง</th><th scope="col">Revision</th></tr></thead><tbody>{selectedMetric.trend.map((point) => <tr key={`${point.id}-row`}><td>{dateText(point.periodFrom)} — {dateText(point.periodTo)}</td><td>{numberText(point.value, point.unit)}</td><td>{dateText(point.sourceWatermark)}</td><td>v{point.revision}</td></tr>)}</tbody></table></div></>}</article></section> : null}
      <footer className="report-footer"><span>Source: {report.source} · Definition version {selectedMetric?.definition.version ?? "—"}</span><span>สร้างเมื่อ {dateText(report.generatedAt)} · <Link href="/admin/audit">ดู audit</Link></span></footer>
    </main>
  </AdminShell>;
}
