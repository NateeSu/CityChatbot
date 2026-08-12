"use client";

import type { CSSProperties } from "react";
import type { ThemeMode, ThemeModeTokens, ThemeSettingsConfig, ThemeSettingsSnapshot, ThemeSettingsState, ThemeSettingsVersion, ThemeValidationResult } from "@citychatbot/theme-settings";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "../../AdminShell";
import type { AdminIdentity } from "../../admin-navigation";
import { ConflictState, EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../../ui/states";

import "./theme-settings.css";

type ThemeSettingsConsoleProps = { identity: AdminIdentity; initialSnapshot: ThemeSettingsSnapshot };
type ApiError = { error?: { reasonCode?: string; message?: string } };
type ApiErrorState = { reasonCode: string; message: string };

const MODES: readonly ThemeMode[] = ["light", "dark", "high-contrast"];
const modeLabel: Record<ThemeMode, string> = { light: "Light", dark: "Dark", "high-contrast": "High contrast" };
const stateLabel: Record<ThemeSettingsState, string> = { DRAFT: "ฉบับร่าง", UNIT_APPROVED: "ผ่าน unit gate", PUBLISHED: "เผยแพร่แล้ว", SUPERSEDED: "เวอร์ชันก่อนหน้า", ROLLED_BACK: "ถูกแทนที่หลัง rollback" };
const stateTone = (state: ThemeSettingsState): string => state === "PUBLISHED" ? "success" : state === "DRAFT" ? "warning" : state === "ROLLED_BACK" ? "danger" : "muted";
const cloneConfig = (value: ThemeSettingsConfig): ThemeSettingsConfig => JSON.parse(JSON.stringify(value)) as ThemeSettingsConfig;
const idempotencyKey = (operation: string): string => `${operation}-${crypto.randomUUID()}`;
const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const apiUrl = (identity: AdminIdentity, suffix = ""): string => `/api/v1/admin/theme-versions${suffix}?${identityQuery(identity)}`;
const formatDate = (value: string): string => {
  try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; }
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as ApiError | undefined;
  if (!response.ok) throw { reasonCode: payload?.error?.reasonCode ?? "PROCESSING_FAILED", message: payload?.error?.message ?? "ไม่สามารถดำเนินการได้" } satisfies ApiErrorState;
  return payload as T;
}

function ThemePreview({ config, mode }: { config: ThemeSettingsConfig; mode: ThemeMode }) {
  const tokens = config.modes[mode];
  const style = {
    "--theme-preview-bg": tokens.background,
    "--theme-preview-surface": tokens.surface,
    "--theme-preview-text": tokens.textPrimary,
    "--theme-preview-muted": tokens.textSecondary,
    "--theme-preview-primary": tokens.primary,
    "--theme-preview-primary-text": tokens.primaryContrast,
    "--theme-preview-accent": tokens.accent,
    "--theme-preview-accent-text": tokens.accentContrast,
    "--theme-preview-border": tokens.border,
    "--theme-preview-focus": tokens.focusRing,
  } as CSSProperties;
  return <div className="theme-preview" data-preview-mode={mode} style={style}>
    <div className="theme-preview__bar"><strong>{config.brandName}</strong><span>{modeLabel[mode]}</span></div>
    <div className="theme-preview__cards">
      <article><span className="theme-preview__eyebrow">CITIZEN</span><h3>{config.landmark}</h3><p>แจ้งเรื่อง ติดตามสถานะ และดูบริการในพื้นที่</p><button type="button">เริ่มใช้งาน</button></article>
      <article><span className="theme-preview__eyebrow">ADMIN</span><h3>งานที่ต้องติดตาม</h3><p>ตรวจสอบข้อมูลและส่งต่อเจ้าหน้าที่ตามสิทธิ์</p><button type="button">เปิด dashboard</button></article>
      <article><span className="theme-preview__eyebrow">RICH MENU</span><div className="theme-preview__menu"><span>แจ้งเรื่อง</span><span>ติดตาม</span><span>ข่าวสาร</span><span>ติดต่อ</span></div><p>ตัวอย่างเมนูบน LINE</p></article>
    </div>
  </div>;
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="theme-color-field"><span>{label}</span><span className="theme-color-field__control"><input aria-label={label} disabled={disabled} onChange={(event) => onChange(event.target.value)} type="color" value={value} /><code>{value}</code></span></label>;
}

export function ThemeSettingsConsole({ identity, initialSnapshot }: ThemeSettingsConsoleProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState(initialSnapshot.published?.id ?? initialSnapshot.versions[0]?.id);
  const [config, setConfig] = useState<ThemeSettingsConfig | undefined>(initialSnapshot.published?.config ?? initialSnapshot.versions[0]?.config);
  const [mode, setMode] = useState<ThemeMode>("light");
  const [validation, setValidation] = useState<ThemeValidationResult | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<ApiErrorState | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const selected = useMemo(() => snapshot.versions.find((version) => version.id === selectedId), [selectedId, snapshot.versions]);
  const editable = selected?.state === "DRAFT" && config !== undefined;
  const retained = selected?.state === "SUPERSEDED" || selected?.state === "ROLLED_BACK";

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  const syncSnapshot = async (preferredId?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await requestJson<ThemeSettingsSnapshot>(apiUrl(identity));
      setSnapshot(next);
      const nextSelected = next.versions.find((item) => item.id === (preferredId ?? selectedId)) ?? next.published ?? next.versions[0];
      setSelectedId(nextSelected?.id);
      setConfig(nextSelected?.config ? cloneConfig(nextSelected.config) : undefined);
      setValidation(undefined);
    } catch (requestError) {
      setError((requestError && typeof requestError === "object" && "reasonCode" in requestError) ? requestError as ApiErrorState : { reasonCode: "PROCESSING_FAILED", message: "โหลดรายการ Theme ไม่สำเร็จ" });
    } finally { setLoading(false); }
  };

  const selectVersion = (version: ThemeSettingsVersion) => {
    setSelectedId(version.id);
    setConfig(cloneConfig(version.config));
    setValidation(undefined);
    setNotice(undefined);
    setError(undefined);
  };

  const updateConfig = (change: (current: ThemeSettingsConfig) => ThemeSettingsConfig) => setConfig((current) => current ? change(cloneConfig(current)) : current);
  const updateModeToken = (field: keyof ThemeModeTokens, value: string) => updateConfig((current) => ({ ...current, modes: { ...current.modes, [mode]: { ...current.modes[mode], [field]: value } } }));

  const createDraft = async () => {
    const source = config ?? snapshot.published?.config ?? snapshot.versions[0]?.config;
    if (!source) return;
    setBusy("create"); setError(undefined); setNotice(undefined);
    try {
      const result = await requestJson<{ version: ThemeSettingsVersion }>(apiUrl(identity), { method: "POST", headers: { "idempotency-key": idempotencyKey("theme-create") }, body: JSON.stringify({ config: source, reason: "สร้าง Theme draft จากตัวแก้ไข A-91", idempotencyKey: idempotencyKey("theme-create-body") }) });
      setNotice("สร้าง Theme ฉบับร่างแล้ว");
      await syncSnapshot(result.version.id);
    } catch (requestError) { setError(requestError as ApiErrorState); } finally { setBusy(undefined); }
  };

  const saveDraft = async () => {
    if (!selected || !editable || !config) return;
    setBusy("save"); setError(undefined); setNotice(undefined);
    try {
      await requestJson<{ version: ThemeSettingsVersion }>(apiUrl(identity, `/${selected.id}`), { method: "PATCH", headers: { "idempotency-key": idempotencyKey("theme-update") }, body: JSON.stringify({ config, expectedVersion: selected.rowVersion, reason: "แก้ไข Theme และ branding จาก A-91", idempotencyKey: idempotencyKey("theme-update-body") }) });
      setNotice("บันทึก Theme ฉบับร่างแล้ว");
      await syncSnapshot(selected.id);
    } catch (requestError) { setError(requestError as ApiErrorState); } finally { setBusy(undefined); }
  };

  const runValidation = async () => {
    if (!selected) return;
    setBusy("validate"); setError(undefined); setNotice(undefined);
    try {
      const result = await requestJson<{ validation: ThemeValidationResult }>(apiUrl(identity, `/${selected.id}/validate`), { method: "POST" });
      setValidation(result.validation);
      setNotice(result.validation.passed ? "Theme ผ่าน contrast gate แล้ว" : "Theme ยังไม่ผ่าน contrast gate");
    } catch (requestError) { setError(requestError as ApiErrorState); } finally { setBusy(undefined); }
  };

  const perform = async (operation: "publish" | "rollback") => {
    if (!selected) return;
    setBusy(operation); setError(undefined); setNotice(undefined);
    try {
      await requestJson<{ version: ThemeSettingsVersion }>(apiUrl(identity, `/${selected.id}/${operation}`), { method: "POST", headers: { "idempotency-key": idempotencyKey(`theme-${operation}`) }, body: JSON.stringify({ reason: `${operation === "publish" ? "เผยแพร่" : "กู้คืน"} Theme จาก A-91`, idempotencyKey: idempotencyKey(`theme-${operation}-body`) }) });
      setNotice(operation === "publish" ? "เผยแพร่ Theme สำเร็จและบันทึก version แล้ว" : "กู้คืน Theme version ก่อนหน้าสำเร็จ");
      await syncSnapshot();
    } catch (requestError) { setError(requestError as ApiErrorState); } finally { setBusy(undefined); }
  };

  if (loading && snapshot.versions.length === 0) return <main className="theme-settings-page"><LoadingState />;</main>;
  if (error?.reasonCode === "CONFIGURATION_UNAVAILABLE") return <main className="theme-settings-page"><FeatureDisabledState />;</main>;
  if (error?.reasonCode === "FORBIDDEN") return <main className="theme-settings-page"><PermissionDeniedState action={<button className="theme-button theme-button--secondary" onClick={() => void syncSnapshot()} type="button">ลองใหม่</button>} />;</main>;
  if (!snapshot.versions.length || !selected || !config) return <main className="theme-settings-page"><EmptyState action={<button className="theme-button theme-button--primary" onClick={() => void syncSnapshot()} type="button">โหลดใหม่</button>} /></main>;

  return <AdminShell activeId="theme-settings" breadcrumbs={["Theme และ branding"]} identity={identity}>
    <main className="theme-settings-page">
      <header className="theme-settings-heading"><div><span className="theme-kicker">A-91 · SETTINGS BUILDER</span><h1>Theme และ branding</h1><p>ปรับภาพลักษณ์ของเทศบาล พร้อมตรวจ contrast ก่อนเผยแพร่ทุกโหมด</p></div><button className="theme-button theme-button--primary" disabled={busy !== undefined} onClick={() => void createDraft()} type="button">+ สร้างฉบับร่าง</button></header>
      <p className="theme-synthetic">local synthetic สำหรับตรวจ contract เท่านั้น · production ต้องใช้ server session, tenant asset และ storage จริง</p>
      {offline ? <OfflineState action={<button className="theme-button theme-button--secondary" onClick={() => void syncSnapshot()} type="button">ลองโหลดใหม่</button>} /> : null}
      {error && error.reasonCode !== "FORBIDDEN" && error.reasonCode !== "CONFIGURATION_UNAVAILABLE" ? <ErrorState message={`${error.message} (${error.reasonCode})`} action={<button className="theme-button theme-button--secondary" onClick={() => void syncSnapshot()} type="button">ลองใหม่</button>} /> : null}
      {notice ? <p aria-live="polite" className="theme-notice" role="status">{notice}</p> : null}
      {loading ? <LoadingState /> : null}
      <div className="theme-settings-layout">
        <section className="theme-panel theme-version-panel"><div className="theme-section-heading"><div><span className="theme-kicker">VERSION HISTORY</span><h2>เวอร์ชัน Theme</h2></div><span className="theme-count">{snapshot.versions.length} versions</span></div>{snapshot.versions.length === 0 ? <EmptyState /> : <ul className="theme-version-list">{snapshot.versions.map((version) => <li key={version.id}><button className={`theme-version-row${selected.id === version.id ? " is-selected" : ""}`} onClick={() => selectVersion(version)} type="button"><span><strong>v{version.version}</strong><small>{formatDate(version.updatedAt)}</small></span><span className={`theme-chip theme-chip--${stateTone(version.state)}`}>{stateLabel[version.state]}</span></button></li>)}</ul>}<div className="theme-audit-summary"><h3>Audit ล่าสุด</h3>{snapshot.audit.length === 0 ? <p>ยังไม่มี audit</p> : <ol>{snapshot.audit.slice(-6).reverse().map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{entry.reason}</span></li>)}</ol>}</div></section>
        <section className="theme-panel theme-editor-panel"><div className="theme-section-heading"><div><span className="theme-kicker">DRAFT EDITOR</span><h2>v{selected.version} · {stateLabel[selected.state]}</h2></div><span className={`theme-chip theme-chip--${stateTone(selected.state)}`}>{selected.state}</span></div><div className="theme-impact-warning"><strong>Change impact warning</strong><span>การเปลี่ยน Theme มีผลกับ citizen, admin และ Rich Menu หลัง publish; ระบบจะตรวจทุกโหมดและเก็บ version เดิมเพื่อ rollback</span></div><div className="theme-form-grid"><label>ชื่อแบรนด์<input disabled={!editable} maxLength={80} onChange={(event) => updateConfig((current) => ({ ...current, brandName: event.target.value }))} value={config.brandName} /></label><label>landmark / ชื่อหน่วยงาน<input disabled={!editable} maxLength={120} onChange={(event) => updateConfig((current) => ({ ...current, landmark: event.target.value }))} value={config.landmark} /></label><label>logo asset path<input disabled={!editable} pattern="^/(?!/)[^?#\s]{1,255}$" placeholder="/tenant-assets/logo.svg" onChange={(event) => updateConfig((current) => ({ ...current, logoAssetPath: event.target.value || undefined }))} value={config.logoAssetPath ?? ""} /><small>ต้องเป็น path ใน tenant storage เท่านั้น</small></label><label>ตัวอักษร<select disabled={!editable} onChange={(event) => updateConfig((current) => ({ ...current, fontScale: event.target.value as ThemeSettingsConfig["fontScale"] }))} value={config.fontScale}><option value="DEFAULT">มาตรฐาน</option><option value="LARGE">ใหญ่</option></select></label><label>ความหนาแน่น<select disabled={!editable} onChange={(event) => updateConfig((current) => ({ ...current, density: event.target.value as ThemeSettingsConfig["density"] }))} value={config.density}><option value="COMFORTABLE">อ่านง่าย</option><option value="COMPACT">กระชับ</option></select></label><label>มุม panel<select disabled={!editable} onChange={(event) => updateConfig((current) => ({ ...current, radius: event.target.value as ThemeSettingsConfig["radius"] }))} value={config.radius}><option value="STANDARD">มาตรฐาน</option><option value="SOFT">นุ่ม</option></select></label></div><div className="theme-mode-tabs" role="tablist" aria-label="เลือกโหมด Theme">{MODES.map((item) => <button aria-selected={mode === item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)} role="tab" type="button" key={item}>{modeLabel[item]}</button>)}</div><div className="theme-color-grid"><ColorField disabled={!editable} label="พื้นหลัง" onChange={(value) => updateModeToken("background", value)} value={config.modes[mode].background} /><ColorField disabled={!editable} label="ข้อความหลัก" onChange={(value) => updateModeToken("textPrimary", value)} value={config.modes[mode].textPrimary} /><ColorField disabled={!editable} label="ข้อความรอง" onChange={(value) => updateModeToken("textSecondary", value)} value={config.modes[mode].textSecondary} /><ColorField disabled={!editable} label="Primary" onChange={(value) => updateModeToken("primary", value)} value={config.modes[mode].primary} /><ColorField disabled={!editable} label="Accent" onChange={(value) => updateModeToken("accent", value)} value={config.modes[mode].accent} /><ColorField disabled={!editable} label="Focus ring" onChange={(value) => updateModeToken("focusRing", value)} value={config.modes[mode].focusRing} /></div><div className="theme-action-row"><button className="theme-button theme-button--secondary" disabled={busy !== undefined} onClick={() => void runValidation()} type="button">{busy === "validate" ? "กำลังตรวจ…" : "ตรวจ contrast"}</button><button className="theme-button theme-button--secondary" disabled={!editable || busy !== undefined} onClick={() => void saveDraft()} type="button">{busy === "save" ? "กำลังบันทึก…" : "บันทึก draft"}</button><button className="theme-button theme-button--primary" disabled={!editable || busy !== undefined} onClick={() => void perform("publish")} type="button">{busy === "publish" ? "กำลัง publish…" : "ผ่าน gate และ publish"}</button>{retained ? <button className="theme-button theme-button--danger" disabled={busy !== undefined} onClick={() => void perform("rollback")} type="button">{busy === "rollback" ? "กำลัง rollback…" : "กู้คืน version นี้"}</button> : null}</div>{selected.state !== "DRAFT" ? <StaleState action={<p>เวอร์ชันนี้แก้ไขตรง ๆ ไม่ได้ ให้สร้าง draft ใหม่ก่อน</p>} /> : null}{validation ? <section className={`theme-validation ${validation.passed ? "is-pass" : "is-fail"}`} aria-live="polite"><strong>{validation.passed ? "ผ่าน WCAG contrast gate" : "ยังไม่ผ่าน contrast gate"}</strong>{validation.failures.length > 0 ? <ul>{validation.failures.map((failure) => <li key={failure}>{failure}</li>)}</ul> : <p>ตรวจครบ {validation.checks.length} คู่สีของ Light, Dark และ High contrast</p>}</section> : null}</section>
      </div>
      <section className="theme-panel theme-preview-panel"><div className="theme-section-heading"><div><span className="theme-kicker">LIVE PREVIEW · 390 / 834 / 1440</span><h2>ตัวอย่างก่อน publish</h2></div><span className="theme-preview-label">preview ไม่เปลี่ยน published theme</span></div><ThemePreview config={config} mode={mode} /></section>
      {error?.reasonCode === "SESSION_EXPIRED" ? <ExpiredSessionState action={<button className="theme-button theme-button--secondary" onClick={() => void syncSnapshot()} type="button">เริ่ม session ใหม่</button>} /> : null}{error?.reasonCode === "VERSION_CONFLICT" ? <ConflictState action={<button className="theme-button theme-button--secondary" onClick={() => void syncSnapshot(selected.id)} type="button">โหลด version ล่าสุด</button>} /> : null}
      <footer className="theme-footer"><span>Published theme ต้องมี version, owner, audit และ rollback ได้</span><Link href="/admin?role=TENANT_ADMIN">กลับ dashboard</Link></footer>
    </main>
  </AdminShell>;
}
