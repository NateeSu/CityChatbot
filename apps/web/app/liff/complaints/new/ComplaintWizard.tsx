"use client";

/* eslint-disable @next/next/no-img-element -- object URLs from a user-selected file cannot use Next image optimization. */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  COMPLAINT_IMAGE_ACCEPT,
  COMPLAINT_MAX_ATTACHMENTS,
  ComplaintDomainError,
  isAllowedImage,
  makeDraftSnapshot,
  restoreDraftSnapshot,
  validateComplaintWizardDraft,
  type ComplaintSubmitSuccess,
  type ComplaintWizardAttachment,
  type ComplaintWizardDraft,
  type ComplaintWizardStep,
  type ComplaintWizardValidationError,
} from "@citychatbot/complaints";

import { useTheme, type ThemeName } from "../../../ui/theme";

import "./complaint-wizard.css";

export type ComplaintWizardCategory = {
  id: string;
  code: string;
  label: string;
};

export type ComplaintWizardConfig = {
  tenantId: string;
  intakeQueueId: string;
  lineUserId: string;
  tenantName: string;
  consentVersion: string;
  categories: readonly ComplaintWizardCategory[];
  synthetic: boolean;
};

type IconName = "arrow-left" | "arrow-right" | "bell" | "building" | "camera" | "check" | "chevron-down" | "chevron-right" | "circle-check" | "clipboard" | "copy" | "contrast" | "home" | "info" | "locate" | "map-pin" | "moon" | "phone" | "search" | "sun" | "trash" | "upload" | "user" | "x";

const DRAFT_STORAGE_PREFIX = "citychatbot:complaint-draft:v1";
const DEFAULT_DESCRIPTION = "";

const initialDraft = (config: ComplaintWizardConfig): ComplaintWizardDraft => ({
  categoryId: config.categories[0]?.id,
  categoryUncertain: false,
  title: "",
  description: DEFAULT_DESCRIPTION,
  attachments: [],
  location: undefined,
  citizenName: "",
  phone: "",
  notifyChannel: "LINE",
  consentAccepted: false,
  consentVersion: config.consentVersion,
});

const iconPaths: Record<IconName, string> = {
  "arrow-left": "M19 12H5m7 7-7-7 7-7",
  "arrow-right": "M5 12h14m-7-7 7 7-7 7",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 13h4",
  building: "M4 21h16M6 21V5l6-3 6 3v16M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1M11 21v-3h2v3",
  camera: "M4 7h3l1.5-2h7L17 7h3v11H4V7Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  check: "m5 12 4 4L19 6",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-right": "m9 6 6 6-6 6",
  "circle-check": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-13 0 2.5 2.5L16 9",
  clipboard: "M8 5h8v3H8V5Zm-2 2H4v14h16V7h-2M8 12h8m-8 4h6",
  copy: "M9 9h10v10H9V9ZM5 15H4V4h11v1",
  contrast: "M12 3a9 9 0 1 0 0 18V3Zm0 0a9 9 0 0 1 0 18",
  home: "m3 11 9-8 9 8v9H5v-7h14",
  info: "M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0Z",
  "map-pin": "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  moon: "M20 15.3A8.5 8.5 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3Z",
  phone: "M6 3h3l1.5 4-2 1.5a16 16 0 0 0 5 5L15 11l4 1.5v3c0 1.1-.9 2-2 2C10.4 17.5 4.5 11.6 4.5 5A2 2 0 0 1 6 3Z",
  search: "m20 20-4.5-4.5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z",
  sun: "M12 3V1m0 22v-2M4.2 4.2 2.8 2.8m18.4 18.4-1.4-1.4M3 12H1m22 0h-2M4.2 19.8l-1.4 1.4M21.2 2.8l-1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  trash: "M5 7h14m-9 4v6m4-6v6M9 4h6l1 3H8l1-3Zm-3 3 1 14h10l1-14",
  upload: "M12 16V4m0 0L7 9m5-5 5 5M4 15v5h16v-5",
  user: "M20 21a8 8 0 0 0-16 0m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  x: "m6 6 12 12M18 6 6 18",
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" className="wizard-icon" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path d={iconPaths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function compressImage(file: File): Promise<File> {
  if (file.size < 1_500_000 || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    bitmap.close();
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

const stepTitle = (step: ComplaintWizardStep | "success"): string => {
  if (step === "success") return "รับเรื่องแล้ว";
  if (step === 1) return "แจ้งปัญหา";
  if (step === 2) return "แนบหลักฐาน";
  if (step === 3) return "ข้อมูลผู้ติดต่อ";
  return "ตรวจสอบข้อมูล";
};

function Header({ config, step, onBack, theme, onThemeChange }: { config: ComplaintWizardConfig; step: ComplaintWizardStep | "success"; onBack: () => void; theme: ThemeName; onThemeChange: () => void }) {
  const themeLabel = theme === "light" ? "เปิดโหมดมืด" : theme === "dark" ? "เปิดโหมดคอนทราสต์สูง" : "เปิดโหมดสว่าง";
  return (
    <header className="wizard-header">
      <button aria-label="ย้อนกลับ" className="wizard-header__icon-button" onClick={onBack} type="button"><Icon name="arrow-left" /></button>
      <span aria-hidden="true" className="wizard-brand"><Icon name="building" size={22} /></span>
      <div className="wizard-header__title">
        <strong>{stepTitle(step)}</strong>
        <small>{config.tenantName}</small>
      </div>
      <div className="wizard-header__actions">
        <button aria-label="ค้นหา" className="wizard-header__icon-button" type="button"><Icon name="search" /></button>
        <button aria-label={themeLabel} className="wizard-header__icon-button" onClick={onThemeChange} type="button"><Icon name={theme === "light" ? "moon" : theme === "dark" ? "contrast" : "sun"} /></button>
        <span aria-label="การแจ้งเตือนใหม่ 2 รายการ" className="wizard-notification"><Icon name="bell" /><b>2</b></span>
      </div>
    </header>
  );
}

function StepProgress({ step }: { step: ComplaintWizardStep | "success" }) {
  const active = step === "success" ? 3 : step === 1 ? 1 : 2;
  const items = [{ number: 1, label: "รายละเอียด" }, { number: 2, label: "ตรวจสอบ" }, { number: 3, label: "เสร็จสิ้น" }];
  return (
    <nav aria-label="ขั้นตอนการแจ้งปัญหา" className="wizard-progress">
      <ol>
        {items.map((item) => (
          <li className={item.number <= active ? "is-active" : ""} key={item.number}>
            <span>{item.number < active ? <Icon name="check" size={16} /> : item.number}</span>
            <small>{item.label}</small>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? <p className="wizard-field-error" id={id} role="alert">{error}</p> : null;
}

function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "success" | "warning" | "error" }) {
  return <div className={`wizard-notice wizard-notice--${tone}`} role={tone === "error" ? "alert" : "status"}><Icon name={tone === "success" ? "check" : "info"} size={18} /><span>{children}</span></div>;
}

function Button({ children, variant = "primary", disabled = false, onClick, type = "button", icon }: { children: React.ReactNode; variant?: "primary" | "secondary"; disabled?: boolean; onClick?: () => void; type?: "button" | "submit"; icon?: IconName }) {
  return <button className={`wizard-button wizard-button--${variant}`} disabled={disabled} onClick={onClick} type={type}>{icon ? <Icon name={icon} size={18} /> : null}<span>{children}</span></button>;
}

function AttachmentGrid({ attachments, onAdd, onRemove, compact = false }: { attachments: readonly ComplaintWizardAttachment[]; onAdd: (event: ChangeEvent<HTMLInputElement>) => void; onRemove: (id: string) => void; compact?: boolean }) {
  return (
    <div className={compact ? "wizard-attachment-grid wizard-attachment-grid--compact" : "wizard-attachment-list"}>
      {attachments.map((attachment) => (
        <article className={`wizard-attachment ${attachment.state === "REJECTED" ? "is-error" : ""}`} key={attachment.id}>
          {attachment.previewUrl ? <img alt="" src={attachment.previewUrl} /> : <span className="wizard-attachment__placeholder"><Icon name="camera" size={24} /></span>}
          <div className="wizard-attachment__meta"><strong>{attachment.fileName}</strong><small>{attachment.state === "REJECTED" ? attachment.errorMessage ?? "ไฟล์ไม่ผ่านเงื่อนไข" : `${Math.max(1, Math.round(attachment.byteLength / 1024))} KB · กักกันก่อนตรวจ`}</small>{!compact ? <span className="wizard-progress-bar"><i style={{ width: attachment.state === "REJECTED" ? "18%" : "100%" }} /></span> : null}</div>
          <button aria-label={`ลบ ${attachment.fileName}`} className="wizard-attachment__remove" onClick={() => onRemove(attachment.id)} type="button"><Icon name="trash" size={17} /></button>
        </article>
      ))}
      {attachments.length < COMPLAINT_MAX_ATTACHMENTS ? (
        <label className={compact ? "wizard-upload-tile" : "wizard-upload-dropzone"}>
          <Icon name="camera" size={compact ? 24 : 22} />
          <span>{compact ? "เพิ่มรูป" : "เพิ่มรูปภาพ"}</span>
          <input accept={COMPLAINT_IMAGE_ACCEPT} multiple onChange={onAdd} type="file" />
        </label>
      ) : null}
    </div>
  );
}

function LocationEditor({ location, onChange, onLocate, locating, locationError }: { location?: ComplaintWizardDraft["location"]; onChange: (location: ComplaintWizardDraft["location"]) => void; onLocate: () => void; locating: boolean; locationError?: string }) {
  const hasCoordinates = location?.latitude !== undefined && location?.longitude !== undefined;
  return (
    <section className="wizard-location-panel" aria-labelledby="location-title">
      <div className="wizard-panel-heading"><h2 id="location-title">ตำแหน่งที่เกิดเหตุ <em>*</em></h2><span aria-hidden="true"><Icon name="map-pin" size={20} /></span></div>
      <label className="wizard-label">ที่อยู่หรือจุดสังเกต
        <input aria-label="ที่อยู่หรือจุดสังเกต" maxLength={1000} onChange={(event) => onChange({ ...(location ?? {}), text: event.target.value })} placeholder="เช่น หน้าตลาดเทศบาล" value={location?.text ?? ""} />
      </label>
      <div className="wizard-map-placeholder" aria-label={hasCoordinates ? "ตำแหน่งที่เลือกจาก GPS" : "ยังไม่ได้เลือกตำแหน่งบนแผนที่"} role="img"><span><Icon name="map-pin" size={28} /></span>{hasCoordinates ? <small>{location?.latitude?.toFixed(5)}, {location?.longitude?.toFixed(5)}</small> : <small>ปักหมุดเพื่อระบุตำแหน่ง</small>}</div>
      <Button disabled={locating} onClick={onLocate} variant="secondary" icon="locate">{locating ? "กำลังค้นหาตำแหน่ง…" : "ใช้ตำแหน่งปัจจุบัน"}</Button>
      {locationError ? <p className="wizard-location-help" role="alert">{locationError} สามารถกรอกที่อยู่แทนได้</p> : <p className="wizard-location-help">หากไม่อนุญาต GPS ให้กรอกที่อยู่หรือจุดสังเกตแทนได้</p>}
    </section>
  );
}

function ReviewCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return <section className="wizard-review-card"><div className="wizard-review-card__header"><h2>{title}</h2><button onClick={onEdit} type="button">แก้ไข</button></div><div className="wizard-review-card__body">{children}</div></section>;
}

function BottomNav() {
  return <nav aria-label="เมนูหลัก" className="wizard-bottom-nav"><Link aria-current="page" href="/liff"><Icon name="home" size={19} /><span>หน้าหลัก</span></Link><Link href="/liff/complaints"><Icon name="clipboard" size={19} /><span>ติดตาม</span></Link><Link href="/liff/services"><Icon name="circle-check" size={19} /><span>บริการ</span></Link><Link href="/liff/contact"><Icon name="user" size={19} /><span>ติดต่อ</span></Link></nav>;
}

export function ComplaintWizard({ config }: { config: ComplaintWizardConfig }) {
  const router = useRouter();
  const { theme, cycleTheme } = useTheme();
  const [step, setStep] = useState<ComplaintWizardStep>(1);
  const [draft, setDraft] = useState<ComplaintWizardDraft>(() => initialDraft(config));
  const [hydrated, setHydrated] = useState(false);
  const [resumeNotice, setResumeNotice] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<readonly ComplaintWizardValidationError[]>([]);
  const [locationError, setLocationError] = useState<string>();
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ reasonCode: string; message: string }>();
  const [receipt, setReceipt] = useState<ComplaintSubmitSuccess>();
  const [offline, setOffline] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState<string>();
  const idempotencyKeyRef = useRef<string | undefined>(undefined);
  const draftFileMap = useRef(new Map<string, File>());
  const storageKey = `${DRAFT_STORAGE_PREFIX}:${config.tenantId}:${config.lineUserId || "session"}`;

  const updateDraft = useCallback((patch: Partial<ComplaintWizardDraft>) => setDraft((current) => ({ ...current, ...patch })), []);
  const errorsByField = useMemo(() => new Map(fieldErrors.map((error) => [error.field, error.message])), [fieldErrors]);

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    const hydrate = () => {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          const restored = restoreDraftSnapshot(parsed);
          if (restored) {
            setDraft((current) => ({ ...current, ...restored, consentVersion: config.consentVersion }));
            const savedStep = typeof parsed === "object" && parsed !== null && "step" in parsed ? (parsed as { step?: unknown }).step : undefined;
            if (savedStep === 1 || savedStep === 2 || savedStep === 3 || savedStep === 4) setStep(savedStep);
            setResumeNotice(true);
          }
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }
      updateOnline();
      setHydrated(true);
    };
    const hydrationTimer = window.setTimeout(hydrate, 0);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [config.consentVersion, storageKey]);

  useEffect(() => {
    if (!hydrated || receipt) return;
    const snapshot = makeDraftSnapshot(draft, step, new Date());
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [draft, hydrated, receipt, step, storageKey]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const available = Math.max(0, COMPLAINT_MAX_ATTACHMENTS - draft.attachments.length);
    const nextAttachments: ComplaintWizardAttachment[] = [];
    for (const file of files.slice(0, available)) {
      const id = makeId();
      if (!isAllowedImage(file.type, file.size)) {
        nextAttachments.push({ id, fileName: file.name, contentType: file.type, byteLength: file.size, state: "REJECTED", errorMessage: "รองรับ JPG, PNG หรือ WebP ไม่เกิน 10 MB" });
        continue;
      }
      const compressed = await compressImage(file);
      draftFileMap.current.set(id, compressed);
      nextAttachments.push({ id, fileName: compressed.name, contentType: compressed.type, byteLength: compressed.size, state: "QUARANTINED", previewUrl: URL.createObjectURL(compressed) });
    }
    updateDraft({ attachments: [...draft.attachments, ...nextAttachments] });
  };

  const removeFile = (id: string) => {
    const attachment = draft.attachments.find((item) => item.id === id);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    draftFileMap.current.delete(id);
    updateDraft({ attachments: draft.attachments.filter((item) => item.id !== id) });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง");
      return;
    }
    setLocating(true);
    setLocationError(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateDraft({ location: { ...(draft.location ?? {}), latitude: position.coords.latitude, longitude: position.coords.longitude } });
        setLocating(false);
      },
      () => {
        setLocationError("ไม่ได้รับอนุญาตให้ใช้ตำแหน่งปัจจุบัน");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  };

  const nextStep = () => {
    const errors = validateComplaintWizardDraft(draft, step);
    setFieldErrors(errors);
    if (errors.length > 0) {
      document.getElementById(`error-${errors[0]?.field}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors([]);
    setStep((current) => Math.min(4, current + 1) as ComplaintWizardStep);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const errors = validateComplaintWizardDraft(draft, 4);
    setFieldErrors(errors);
    if (errors.length > 0 || offline || submitting) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = makeId();
    setSubmitting(true);
    setSubmitError(undefined);
    setOnlineMessage(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/v1/citizen/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKeyRef.current },
        body: JSON.stringify({
          ...draft,
          tenantId: config.tenantId,
          lineUserId: config.lineUserId,
          intakeQueueId: config.intakeQueueId,
          idempotencyKey: idempotencyKeyRef.current,
          attachments: draft.attachments.map(({ previewUrl: _previewUrl, ...attachment }) => attachment),
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const error = typeof payload === "object" && payload !== null && "error" in payload ? (payload as { error?: { reasonCode?: string; message?: string } }).error : undefined;
        throw new ComplaintDomainError((error?.reasonCode as never) ?? "PROCESSING_FAILED", error?.message ?? "ไม่สามารถส่งเรื่องได้");
      }
      setResumeNotice(false);
      setReceipt(payload as ComplaintSubmitSuccess);
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSubmitError({ reasonCode: "TIMEOUT", message: "การเชื่อมต่อใช้เวลานานเกินไป กรุณาตรวจสอบสัญญาณแล้วลองใหม่" });
      } else if (error instanceof ComplaintDomainError) {
        setSubmitError({ reasonCode: error.code, message: error.message.replace(`${error.code}: `, "") });
      } else {
        setSubmitError({ reasonCode: "NETWORK_ERROR", message: "เชื่อมต่อระบบไม่ได้ ข้อมูลยังอยู่ในเครื่องและสามารถลองใหม่ได้" });
      }
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (receipt) {
      router.push("/liff");
      return;
    }
    if (step === 1) router.back();
    else setStep((current) => Math.max(1, current - 1) as ComplaintWizardStep);
  };

  const location = draft.location;
  const categoryLabel = config.categories.find((category) => category.id === draft.categoryId)?.label ?? "ยังไม่แน่ใจ";
  const primaryLabel = step === 1 ? "บันทึกและถัดไป" : step === 2 ? "บันทึกและถัดไป" : step === 3 ? "บันทึกและถัดไป" : submitting ? "กำลังส่งข้อมูล…" : "ยืนยันและส่ง";

  return (
    <main className="wizard-shell" data-theme={theme}>
      <Header config={config} onBack={handleBack} onThemeChange={cycleTheme} step={receipt ? "success" : step} theme={theme} />
      <div className="wizard-body">
        <StepProgress step={receipt ? "success" : step} />
        {config.synthetic ? <div className="wizard-synthetic-banner" role="note">โหมดทดสอบ local — ข้อมูลสังเคราะห์จะไม่ถูกใช้เป็นข้อมูล production</div> : null}
        {offline ? <Notice tone="warning">ออฟไลน์อยู่ ข้อมูลที่กรอกจะถูกเก็บเป็นฉบับร่างและส่งได้เมื่อกลับมาออนไลน์</Notice> : null}
        {resumeNotice ? <Notice tone="info">กู้คืนฉบับร่างแล้ว ไฟล์เดิมไม่ได้เก็บไว้ในเครื่อง กรุณาแนบใหม่ก่อนส่ง</Notice> : null}
        {receipt ? (
          <section aria-labelledby="success-title" className="wizard-success">
            <span aria-hidden="true" className="wizard-success__orbit"><Icon name="circle-check" size={48} /></span>
            <h1 id="success-title">เทศบาลรับเรื่องของคุณแล้ว</h1>
            <p>เราได้ส่งข้อมูลให้หน่วยงานที่รับผิดชอบ เจ้าหน้าที่จะเริ่มตรวจสอบภายในเวลาทำการ</p>
            <div className="wizard-receipt"><small>เลขคำร้อง</small><strong>{receipt.complaintNo}</strong><button aria-label="คัดลอกเลขคำร้อง" onClick={() => void navigator.clipboard?.writeText(receipt.complaintNo)} type="button"><Icon name="copy" size={18} />คัดลอก</button></div>
            <section className="wizard-next-steps"><h2>ขั้นตอนถัดไป</h2><ol><li><span>1</span><div><strong>ตรวจสอบข้อมูล</strong><small>ภายใน 1 วันทำการ</small></div></li><li><span>2</span><div><strong>มอบหมายหน่วยงาน</strong><small>แจ้งผ่าน LINE เมื่อมีความคืบหน้า</small></div></li><li><span>3</span><div><strong>ดำเนินการแก้ไข</strong><small>ติดตามสถานะได้ตลอดเวลา</small></div></li></ol></section>
            {receipt.mode === "local-synthetic" ? <Notice tone="info">ใบรับเรื่องนี้เป็นข้อมูลสังเคราะห์สำหรับทดสอบใน local เท่านั้น</Notice> : null}
            <Button onClick={() => router.push("/liff/complaints")} icon="clipboard">ติดตามสถานะ</Button>
            <Button onClick={() => router.push("/liff")} variant="secondary">กลับหน้าหลัก</Button>
          </section>
        ) : (
          <form className="wizard-form" onSubmit={step === 4 ? submit : (event) => { event.preventDefault(); nextStep(); }}>
            {step === 1 ? <section aria-labelledby="step-one-title" className="wizard-step"><h1 id="step-one-title">1. รายละเอียดปัญหา</h1><p className="wizard-intro">บอกข้อมูลสั้น ๆ เพื่อให้เทศบาลส่งเรื่องไปยังหน่วยงานที่เกี่ยวข้อง</p>
              <label className="wizard-label">ประเภทปัญหา <em>*</em><select aria-describedby={errorsByField.get("categoryId") ? "error-categoryId" : undefined} disabled={draft.categoryUncertain} onChange={(event) => updateDraft({ categoryId: event.target.value || undefined })} value={draft.categoryId ?? ""}><option value="">เลือกประเภทปัญหา</option>{config.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
              <label className="wizard-check-row"><input checked={draft.categoryUncertain} onChange={(event) => updateDraft({ categoryUncertain: event.target.checked, categoryId: event.target.checked ? undefined : draft.categoryId ?? config.categories[0]?.id })} type="checkbox" /><span>ยังไม่แน่ใจประเภทปัญหา</span></label><FieldError error={errorsByField.get("categoryId")} id="error-categoryId" />
              <label className="wizard-label">หัวข้อเรื่อง <em>*</em><input aria-describedby={errorsByField.get("title") ? "error-title" : undefined} maxLength={240} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="เช่น ถนนชำรุดหน้าชุมชน" value={draft.title} /></label><FieldError error={errorsByField.get("title")} id="error-title" />
              <label className="wizard-label">รายละเอียดเพิ่มเติม <em>*</em><textarea aria-describedby={errorsByField.get("description") ? "error-description" : undefined} maxLength={20_000} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="เล่ารายละเอียด สถานที่ หรือช่วงเวลาที่พบปัญหา" value={draft.description} /><small className="wizard-character-count">{draft.description.length}/20,000</small></label><FieldError error={errorsByField.get("description")} id="error-description" />
              <div className="wizard-inline-heading"><h2>รูปภาพประกอบ</h2><small>สูงสุด {COMPLAINT_MAX_ATTACHMENTS} รูป</small></div><AttachmentGrid attachments={draft.attachments} compact onAdd={addFiles} onRemove={removeFile} /><p className="wizard-help-text">ไฟล์จะถูกตรวจสอบและกักกันก่อนนำไปใช้งาน</p>
              <div className="wizard-inline-heading"><h2>ตำแหน่งที่เกิดเหตุ <em>*</em></h2></div><button className="wizard-location-summary" onClick={() => setStep(2)} type="button"><span><Icon name="map-pin" size={22} /></span><strong>{location?.text || "ยังไม่ได้ระบุตำแหน่ง"}<small>{location?.latitude !== undefined && location?.longitude !== undefined ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "กดเพื่อเพิ่มที่อยู่หรือใช้ GPS"}</small></strong><Icon name="chevron-right" size={19} /></button>
              <FieldError error={errorsByField.get("location")} id="error-location" /><Notice tone="success">บันทึกอัตโนมัติแล้ว คุณสามารถกลับมาแก้ไขได้เสมอ</Notice>
            </section> : null}
            {step === 2 ? <section aria-labelledby="step-two-title" className="wizard-step"><h1 id="step-two-title">รูปภาพและตำแหน่ง</h1><p className="wizard-intro">เพิ่มหลักฐานเพื่อช่วยเจ้าหน้าที่ตรวจสอบได้เร็วขึ้น</p><AttachmentGrid attachments={draft.attachments} onAdd={addFiles} onRemove={removeFile} /><FieldError error={errorsByField.get("attachments")} id="error-attachments" /><LocationEditor location={draft.location} locationError={locationError} locating={locating} onChange={(nextLocation) => updateDraft({ location: nextLocation })} onLocate={locate} /><FieldError error={errorsByField.get("location")} id="error-location" /></section> : null}
            {step === 3 ? <section aria-labelledby="step-three-title" className="wizard-step"><h1 id="step-three-title">ข้อมูลผู้ติดต่อ</h1><label className="wizard-label">ชื่อผู้แจ้ง<input maxLength={200} onChange={(event) => updateDraft({ citizenName: event.target.value })} placeholder="ชื่อ-นามสกุล (ถ้าต้องการ)" value={draft.citizenName} /></label><FieldError error={errorsByField.get("citizenName")} id="error-citizenName" /><label className="wizard-label">เบอร์โทรศัพท์ <small>(ถ้าต้องการ)</small><input inputMode="tel" maxLength={32} onChange={(event) => updateDraft({ phone: event.target.value })} placeholder="เช่น 081-234-5678" value={draft.phone} /></label><FieldError error={errorsByField.get("phone")} id="error-phone" /><fieldset className="wizard-fieldset"><legend>ช่องทางรับความคืบหน้า</legend><div className="wizard-segmented"><label className={draft.notifyChannel === "LINE" ? "is-active" : ""}><input checked={draft.notifyChannel === "LINE"} onChange={() => updateDraft({ notifyChannel: "LINE" })} type="radio" value="LINE" />LINE</label><label className={draft.notifyChannel === "PHONE" ? "is-active" : ""}><input checked={draft.notifyChannel === "PHONE"} onChange={() => updateDraft({ notifyChannel: "PHONE" })} type="radio" value="PHONE" /><Icon name="phone" size={15} />โทรศัพท์</label></div></fieldset><section className="wizard-consent"><h2>ความยินยอมและความเป็นส่วนตัว</h2><label className="wizard-check-row"><input checked={draft.consentAccepted} onChange={(event) => updateDraft({ consentAccepted: event.target.checked })} type="checkbox" /><span><strong>ยินยอมให้เทศบาลใช้ข้อมูลเพื่อดำเนินการคำร้อง</strong><small>ใช้เฉพาะการติดต่อ ตรวจสอบ และแจ้งความคืบหน้าของเรื่องนี้</small></span></label><button className="wizard-text-button" type="button">อ่านประกาศความเป็นส่วนตัว</button></section><FieldError error={errorsByField.get("consentAccepted")} id="error-consentAccepted" /><Notice tone="info">คุณถอนความยินยอมได้ แต่เทศบาลอาจไม่สามารถแจ้งความคืบหน้าผ่านช่องทางที่เลือก</Notice></section> : null}
            {step === 4 ? <section aria-labelledby="step-four-title" className="wizard-step"><h1 id="step-four-title">ตรวจสอบก่อนส่ง</h1><p className="wizard-intro">ตรวจสอบข้อมูลให้ถูกต้องก่อนส่งเรื่องให้เทศบาล</p><div className="wizard-review-list"><ReviewCard onEdit={() => setStep(1)} title="รายละเอียด"><dl><div><dt>ประเภท</dt><dd>{categoryLabel}</dd></div><div><dt>หัวข้อ</dt><dd>{draft.title}</dd></div><div><dt>รายละเอียด</dt><dd>{draft.description}</dd></div></dl></ReviewCard><ReviewCard onEdit={() => setStep(2)} title="หลักฐานและตำแหน่ง"><p>{draft.attachments.length} รูปภาพ · {location?.text || "ยังไม่ได้ระบุที่อยู่"}</p></ReviewCard><ReviewCard onEdit={() => setStep(3)} title="ผู้ติดต่อ"><p>{draft.citizenName || "ไม่ระบุชื่อ"} · {draft.phone || "ไม่ระบุเบอร์"} · แจ้งผ่าน {draft.notifyChannel}</p></ReviewCard></div><Notice tone="success">ข้อมูลครบถ้วน พร้อมส่งให้เทศบาล</Notice>{submitError ? <Notice tone="error">{submitError.message} {submitError.reasonCode === "SESSION_EXPIRED" ? <button className="wizard-text-button" onClick={() => window.location.reload()} type="button">เริ่มเซสชันใหม่</button> : <button className="wizard-text-button" onClick={() => void submit()} type="button">ลองใหม่</button>}</Notice> : null}</section> : null}
            <div className="wizard-actions"><Button disabled={submitting || offline} onClick={step === 4 ? undefined : nextStep} type={step === 4 ? "submit" : "button"}>{primaryLabel}</Button>{step === 4 ? <Button disabled={submitting} onClick={() => setStep(3)} variant="secondary">กลับไปแก้ไข</Button> : null}</div>
            {onlineMessage ? <p className="wizard-help-text">{onlineMessage}</p> : null}
          </form>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
