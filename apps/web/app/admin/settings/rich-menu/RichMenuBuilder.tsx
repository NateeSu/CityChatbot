"use client";

import type { RichMenuAreaInput, RichMenuImageMetadata, RichMenuVersion } from "@citychatbot/rich-menu";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConflictState, EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../../ui/states";
import { ThemeToggle } from "../../../ui/theme-toggle";

import "./rich-menu.css";

export type RichMenuAdminIdentity = {
  tenantId: string;
  accountId: string;
  role: "TENANT_ADMIN" | "SUPER_ADMIN";
  synthetic: boolean;
};

type RichMenuListResponse = {
  items: readonly RichMenuVersion[];
  audit: readonly {
    id: string;
    action: string;
    resourceId: string;
    reason: string;
    occurredAt: string;
    fromState?: RichMenuVersion["state"];
    toState?: RichMenuVersion["state"];
  }[];
};

type ApiErrorPayload = { error?: { reasonCode?: string; message?: string } };

class RichMenuApiError extends Error {
  constructor(public readonly status: number, public readonly reasonCode: string, message: string) {
    super(message);
    this.name = "RichMenuApiError";
  }
}

const DEFAULT_AREAS: readonly RichMenuAreaInput[] = [
  { x: 0, y: 0, width: 1667, height: 1000, label: "แจ้งปัญหา", sortOrder: 0, action: { type: "URI", label: "แจ้งปัญหา", uri: "https://liff.line.me/citychatbot/complaints/new" } },
  { x: 1667, y: 0, width: 833, height: 1000, label: "ติดตามสถานะ", sortOrder: 1, action: { type: "URI", label: "ติดตามสถานะ", uri: "https://liff.line.me/citychatbot/complaints" } },
  { x: 0, y: 1000, width: 833, height: 686, label: "ข่าวสาร", sortOrder: 2, action: { type: "URI", label: "ข่าวสาร", uri: "https://citychatbot.local/news" } },
  { x: 833, y: 1000, width: 834, height: 686, label: "บริการ", sortOrder: 3, action: { type: "URI", label: "บริการ", uri: "https://citychatbot.local/services" } },
  { x: 1667, y: 1000, width: 833, height: 686, label: "ติดต่อ", sortOrder: 4, action: { type: "URI", label: "ติดต่อ", uri: "https://citychatbot.local/contact" } },
];

const defaultImage = (tenantId: string): RichMenuImageMetadata => ({
  contentType: "image/png",
  width: 2500,
  height: 1686,
  sizeBytes: 67_829,
  sha256: "a".repeat(64),
  storageKey: `private/tenants/${tenantId}/rich-menu/RM-01-main.png`,
});

const queryFor = (identity: RichMenuAdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const apiUrl = (identity: RichMenuAdminIdentity, suffix = ""): string => `/api/v1/admin/rich-menu-versions${suffix}?${queryFor(identity)}`;
const idempotencyKey = (operation: string): string => `${operation}-${crypto.randomUUID()}`;
const formatDate = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};
const stateLabel: Record<RichMenuVersion["state"], string> = {
  DRAFT: "ฉบับร่าง",
  VALIDATED: "ผ่านการตรวจสอบ",
  PUBLISHING: "กำลังเผยแพร่",
  PUBLISHED: "เผยแพร่แล้ว",
  FAILED: "เผยแพร่ไม่สำเร็จ",
  SUPERSEDED: "เวอร์ชันเก่า",
};
const stateTone = (state: RichMenuVersion["state"]): string => state === "PUBLISHED" ? "success" : state === "FAILED" ? "danger" : state === "VALIDATED" ? "primary" : state === "SUPERSEDED" ? "muted" : "warning";

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? payload as ApiErrorPayload : undefined;
    throw new RichMenuApiError(response.status, error?.error?.reasonCode ?? "PROCESSING_FAILED", error?.error?.message ?? "ไม่สามารถดำเนินการกับ Rich Menu ได้");
  }
  return payload as T;
}

function Sidebar() {
  return (
    <aside className="rm-sidebar">
      <div className="rm-brand"><span aria-hidden="true" className="rm-brand__mark">▥</span><div><strong>ศูนย์บริการประชาชน</strong><small>ระบบจัดการเทศบาล</small></div></div>
      <nav aria-label="เมนูเจ้าหน้าที่" className="rm-nav">
        <Link href="/admin/complaints"><span aria-hidden="true">⌂</span><span>ภาพรวม</span></Link>
        <Link href="/admin/complaints"><span aria-hidden="true">▣</span><span>เรื่องร้องเรียน</span></Link>
        <Link aria-current="page" href="/admin/settings/rich-menu"><span aria-hidden="true">▤</span><span>Rich Menu</span></Link>
        <Link href="/admin/complaints"><span aria-hidden="true">⚙</span><span>ตั้งค่าอื่น ๆ</span></Link>
      </nav>
      <div className="rm-sidebar__user"><strong>ผู้ดูแลเทศบาล</strong><small>Tenant admin · TM-001</small></div>
    </aside>
  );
}

function StateChip({ state }: { state: RichMenuVersion["state"] }) {
  return <span className={`rm-chip rm-chip--${stateTone(state)}`}>{stateLabel[state]}</span>;
}

function Preview({ item, selectedArea, onSelectArea }: { item: RichMenuVersion; selectedArea: string | undefined; onSelectArea: (id: string) => void }) {
  return (
    <div className="rm-preview-frame">
      <div aria-label={`ตัวอย่าง Rich Menu เวอร์ชัน ${item.version}`} className="rm-preview-canvas" role="img">
        <div className="rm-preview-canvas__title">CITY CHATBOT</div>
        {item.areas.map((area) => (
          <button
            aria-label={`พื้นที่ ${area.label}`}
            className={`rm-tap-area ${selectedArea === area.id ? "is-selected" : ""}`}
            key={area.id}
            onClick={() => onSelectArea(area.id ?? "")}
            style={{ height: `${(area.height / item.image.height) * 100}%`, left: `${(area.x / item.image.width) * 100}%`, top: `${(area.y / item.image.height) * 100}%`, width: `${(area.width / item.image.width) * 100}%` }}
            type="button"
          >
            <span>{area.label}</span>
            <small>{area.action.type === "URI" ? "ลิงก์" : area.action.type}</small>
          </button>
        ))}
      </div>
      <p className="rm-preview-caption">Canvas {item.image.width} × {item.image.height}px · สัดส่วน tap map จาก artwork ที่บันทึกไว้</p>
    </div>
  );
}

export function RichMenuBuilder({ identity }: { identity: RichMenuAdminIdentity }) {
  const [items, setItems] = useState<readonly RichMenuVersion[]>([]);
  const [audit, setAudit] = useState<RichMenuListResponse["audit"]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [selectedAreaId, setSelectedAreaId] = useState<string | undefined>(undefined);
  const [chatBarText, setChatBarText] = useState("");
  const [areaUris, setAreaUris] = useState<Record<string, string>>({});
  const [image, setImage] = useState<RichMenuImageMetadata | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [error, setError] = useState<RichMenuApiError | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const selectedIdRef = useRef<string | undefined>(undefined);

  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);
  const editable = selected?.state === "DRAFT" || selected?.state === "FAILED";

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const syncSelection = useCallback((nextItems: readonly RichMenuVersion[], preferredId?: string) => {
    const nextSelected = nextItems.find((item) => item.id === (preferredId ?? selectedIdRef.current)) ?? nextItems[0];
    setSelectedId(nextSelected?.id);
    setSelectedAreaId(nextSelected?.areas[0]?.id);
    setChatBarText(nextSelected?.chatBarText ?? "");
    setAreaUris(Object.fromEntries((nextSelected?.areas ?? []).map((area) => [area.id ?? `${area.sortOrder}`, area.action.uri ?? ""])));
    setImage(nextSelected?.image);
  }, []);

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await requestJson<RichMenuListResponse>(apiUrl(identity));
      setItems(result.items);
      setAudit(result.audit);
      syncSelection(result.items, preferredId);
    } catch (requestError) {
      setError(requestError instanceof RichMenuApiError ? requestError : new RichMenuApiError(500, "PROCESSING_FAILED", "ไม่สามารถโหลดรายการ Rich Menu ได้"));
    } finally {
      setLoading(false);
    }
  }, [identity, syncSelection]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const initialLoad = window.setTimeout(() => { updateOnline(); void load(); }, 0);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, [load]);

  const selectVersion = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setSelectedId(id);
    setSelectedAreaId(item.areas[0]?.id);
    setChatBarText(item.chatBarText);
    setAreaUris(Object.fromEntries(item.areas.map((area) => [area.id ?? `${area.sortOrder}`, area.action.uri ?? ""])));
    setImage(item.image);
    setNotice(undefined);
  };

  const perform = async (operation: string, url: string, body: Record<string, unknown>) => {
    setBusy(operation);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson<{ item: RichMenuVersion }>(url, { method: "POST", headers: { "idempotency-key": idempotencyKey(operation) }, body: JSON.stringify(body) });
      setNotice(operation === "validate" ? "ตรวจสอบ Rich Menu ผ่านแล้ว" : operation === "publish" ? "เผยแพร่ Rich Menu สำเร็จ" : "ดำเนินการย้อนกลับสำเร็จ");
      await load();
    } catch (requestError) {
      const nextError = requestError instanceof RichMenuApiError ? requestError : new RichMenuApiError(500, "PROCESSING_FAILED", "การดำเนินการไม่สำเร็จ");
      setError(nextError);
    } finally {
      setBusy(undefined);
    }
  };

  const createDraft = async () => {
    setBusy("create");
    setError(undefined);
    try {
      const result = await requestJson<{ item: RichMenuVersion }>(apiUrl(identity), { method: "POST", headers: { "idempotency-key": idempotencyKey("create") }, body: JSON.stringify({ tenantId: identity.tenantId, chatBarText: "เมนู", image: defaultImage(identity.tenantId), areas: DEFAULT_AREAS, reason: "สร้าง Rich Menu ฉบับร่างจาก Builder" }) });
      setNotice("สร้าง Rich Menu ฉบับร่างแล้ว");
      await load(result.item.id);
    } catch (requestError) {
      setError(requestError instanceof RichMenuApiError ? requestError : new RichMenuApiError(500, "PROCESSING_FAILED", "สร้างฉบับร่างไม่สำเร็จ"));
    } finally {
      setBusy(undefined);
    }
  };

  const saveDraft = async () => {
    if (!selected || !editable) return;
    const areas = selected.areas.map((area) => ({ ...area, action: { ...area.action, ...(area.action.type === "URI" ? { uri: areaUris[area.id ?? `${area.sortOrder}`] ?? area.action.uri } : {}) } }));
    setBusy("save");
    setError(undefined);
    try {
      await requestJson<{ item: RichMenuVersion }>(apiUrl(identity, `/${selected.id}`), { method: "PATCH", headers: { "idempotency-key": idempotencyKey("update") }, body: JSON.stringify({ expectedVersion: selected.rowVersion, chatBarText, image: image ?? selected.image, areas, reason: "แก้ไข Rich Menu จาก Builder" }) });
      setNotice("บันทึกฉบับร่างแล้ว");
      await load();
    } catch (requestError) {
      setError(requestError instanceof RichMenuApiError ? requestError : new RichMenuApiError(500, "PROCESSING_FAILED", "บันทึกฉบับร่างไม่สำเร็จ"));
    } finally {
      setBusy(undefined);
    }
  };

  if (loading) return <main className="rm-shell"><Sidebar /><div className="rm-main"><LoadingState /></div></main>;
  if (error?.reasonCode === "FORBIDDEN") return <main className="rm-shell"><Sidebar /><div className="rm-main"><PermissionDeniedState action={<button className="rm-button rm-button--secondary" onClick={() => void load()} type="button">ลองใหม่</button>} /></div></main>;
  if (error?.reasonCode === "CONFIGURATION_UNAVAILABLE") return <main className="rm-shell"><Sidebar /><div className="rm-main"><FeatureDisabledState /></div></main>;

  return (
    <main className="rm-shell">
      <Sidebar />
      <div className="rm-main">
        <header className="rm-topbar"><div><span className="rm-topbar__eyebrow">A-93 · Settings</span><strong>Rich Menu Builder</strong></div><div className="rm-topbar__tools"><span className="rm-tenant-badge">เทศบาลเมืองตัวอย่าง · TM-001</span><ThemeToggle /></div></header>
        <div className="rm-content">
          <div className="rm-heading"><div><span className="rm-badge">RM-01</span><h1>ตัวออกแบบ Rich Menu</h1><p>จัดการ tap map, deep link และ lifecycle ของ Rich Menu แบบมีเวอร์ชัน</p></div><button className="rm-button rm-button--primary" disabled={busy !== undefined} onClick={() => void createDraft()} type="button">+ สร้างฉบับร่าง</button></div>
          {identity.synthetic ? <p className="rm-synthetic">โหมดทดสอบ local — ข้อมูลและ LINE provider เป็นสังเคราะห์ ไม่ใช่ข้อมูล production</p> : null}
          {offline ? <OfflineState action={<button className="rm-button rm-button--secondary" onClick={() => void load()} type="button">ลองโหลดใหม่</button>} /> : null}
          {error && error.reasonCode !== "FORBIDDEN" && error.reasonCode !== "CONFIGURATION_UNAVAILABLE" ? <ErrorState message={`${error.message} (${error.reasonCode})`} action={<button className="rm-button rm-button--secondary" onClick={() => void load()} type="button">ลองใหม่</button>} /> : null}
          {notice ? <p aria-live="polite" className="rm-notice" role="status">{notice}</p> : null}
          {items.length === 0 ? <EmptyState title="ยังไม่มี Rich Menu version" message="สร้างฉบับร่างเพื่อเริ่มกำหนด tap map และตรวจสอบก่อนเผยแพร่" action={<button className="rm-button rm-button--primary" onClick={() => void createDraft()} type="button">สร้างฉบับร่าง</button>} /> : null}
          {selected ? <>
            <section aria-label="Rich Menu version list" className="rm-version-panel">
              <div className="rm-section-heading"><div><h2>เวอร์ชันและประวัติ</h2><p>ระบบเก็บ previous menu ไว้สำหรับ rollback และ audit</p></div><span className="rm-count">{items.length} versions</span></div>
              <div className="rm-version-list">{items.map((item) => <button className={`rm-version-row ${item.id === selected.id ? "is-selected" : ""}`} key={item.id} onClick={() => selectVersion(item.id)} type="button"><span className="rm-version-row__main"><strong>v{item.version}</strong><span>{formatDate(item.updatedAt)}</span></span><StateChip state={item.state} /></button>)}</div>
            </section>
            <div className="rm-workspace">
              <section className="rm-panel rm-panel--preview"><div className="rm-section-heading"><div><h2>Preview / Tap map</h2><p>แตะพื้นที่เพื่อเลือกและตรวจ deep link</p></div><StateChip state={selected.state} /></div><Preview item={selected} onSelectArea={setSelectedAreaId} selectedArea={selectedAreaId} /><div className="rm-action-row"><button className="rm-button rm-button--secondary" disabled={!editable || busy !== undefined} onClick={() => void saveDraft()} type="button">บันทึกฉบับร่าง</button><button className="rm-button rm-button--primary" disabled={selected.state !== "DRAFT" && selected.state !== "FAILED" || busy !== undefined} onClick={() => void perform("validate", apiUrl(identity, `/${selected.id}/validate`), { expectedVersion: selected.rowVersion, reason: "ตรวจสอบจาก Builder" })} type="button">{busy === "validate" ? "กำลังตรวจสอบ…" : "ตรวจสอบ"}</button><button className="rm-button rm-button--primary" disabled={selected.state !== "VALIDATED" || busy !== undefined} onClick={() => void perform("publish", apiUrl(identity, `/${selected.id}/publish`), { expectedVersion: selected.rowVersion, reason: "เผยแพร่จาก Builder" })} type="button">{busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}</button><button className="rm-button rm-button--danger" disabled={selected.state !== "SUPERSEDED" && selected.state !== "PUBLISHED" || busy !== undefined} onClick={() => void perform("rollback", apiUrl(identity, `/${selected.id}/rollback`), { expectedVersion: selected.rowVersion, reason: "ย้อนกลับจาก Builder" })} type="button">{busy === "rollback" ? "กำลังย้อนกลับ…" : "Rollback"}</button></div></section>
              <section className="rm-panel rm-panel--editor"><div className="rm-section-heading"><div><h2>ตั้งค่า draft</h2><p>แก้ไขได้เฉพาะ DRAFT หรือ FAILED เพื่อป้องกัน published config</p></div></div><label className="rm-field"><span>ข้อความบนแถบเมนู (ไม่เกิน 14 ตัวอักษร)</span><input disabled={!editable} maxLength={14} onChange={(event) => setChatBarText(event.target.value)} value={chatBarText} /></label><div className="rm-editor-group"><h3>Tap areas / deep links</h3>{selected.areas.map((area) => <label className={`rm-area-field ${selectedAreaId === area.id ? "is-selected" : ""}`} key={area.id}><span><b>{area.label}</b><small>{area.x},{area.y} · {area.width}×{area.height}px</small></span><input aria-label={`ลิงก์ ${area.label}`} disabled={!editable || area.action.type !== "URI"} onChange={(event) => setAreaUris((current) => ({ ...current, [area.id ?? `${area.sortOrder}`]: event.target.value }))} value={areaUris[area.id ?? `${area.sortOrder}`] ?? ""} /></label>)}</div><div className="rm-asset-card"><h3>Artwork asset</h3><p>{image?.contentType} · {image?.width}×{image?.height}px · {(image?.sizeBytes ?? 0).toLocaleString()} bytes</p><code>{image?.storageKey}</code><small>ตรวจ MIME, dimensions, aspect ratio, ขนาด และ private tenant path ก่อน validate</small></div>{!editable ? <StaleState action={<p className="rm-readonly-note">เวอร์ชันนี้แก้ไขไม่ได้แล้ว หากต้องการเปลี่ยน artwork ให้สร้างเวอร์ชันใหม่</p>} /> : null}</section>
            </div>
            <section className="rm-panel rm-panel--audit"><div className="rm-section-heading"><div><h2>Audit ล่าสุด</h2><p>ทุกการเปลี่ยน state มี actor, reason และ correlation ใน service</p></div></div><div className="rm-audit-list">{audit.filter((entry) => entry.resourceId === selected.id).slice(-8).reverse().map((entry) => <div className="rm-audit-row" key={entry.id}><span className="rm-audit-dot" aria-hidden="true" /><div><strong>{entry.action}</strong><p>{entry.reason}</p></div><time dateTime={entry.occurredAt}>{formatDate(entry.occurredAt)}</time></div>)}</div></section>
            {error?.reasonCode === "SESSION_EXPIRED" ? <ExpiredSessionState action={<button className="rm-button rm-button--secondary" onClick={() => void load()} type="button">เริ่มเซสชันใหม่</button>} /> : null}
            {error?.reasonCode === "CONFLICT" ? <ConflictState action={<button className="rm-button rm-button--secondary" onClick={() => void load()} type="button">โหลดเวอร์ชันล่าสุด</button>} /> : null}
          </> : null}
        </div>
      </div>
    </main>
  );
}
