import type { ComplaintLocation } from "./complaint";

export type ComplaintWizardStep = 1 | 2 | 3 | 4;
export type ComplaintNotifyChannel = "LINE" | "PHONE";
export type ComplaintAttachmentState = "QUARANTINED" | "READY" | "REJECTED";

export type ComplaintWizardAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  byteLength: number;
  state: ComplaintAttachmentState;
  previewUrl?: string;
  errorMessage?: string;
};

export type ComplaintWizardDraft = {
  categoryId?: string;
  categoryUncertain: boolean;
  title: string;
  description: string;
  attachments: readonly ComplaintWizardAttachment[];
  location?: ComplaintLocation;
  citizenName: string;
  phone: string;
  notifyChannel: ComplaintNotifyChannel;
  consentAccepted: boolean;
  consentVersion: string;
};

export type ComplaintWizardValidationError = {
  field: keyof ComplaintWizardDraft | "location" | "attachments";
  message: string;
};

export type ComplaintWizardDraftSnapshot = Pick<
  ComplaintWizardDraft,
  "categoryId" | "categoryUncertain" | "title" | "description" | "location" | "citizenName" | "notifyChannel"
> & {
  version: 1;
  savedAt: string;
  step: ComplaintWizardStep;
  attachmentNames: readonly string[];
};

export type ComplaintSubmitRequest = ComplaintWizardDraft & {
  tenantId: string;
  lineUserId: string;
  intakeQueueId: string;
  idempotencyKey: string;
  occurredAt?: string;
};

export type ComplaintSubmitSuccess = {
  complaintId: string;
  complaintNo: string;
  idempotentReplay: boolean;
  mode: "production" | "local-synthetic";
};

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const PHONE_PATTERN = /^[0-9+()\-\s]{8,32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const requiredText = (value: string, field: ComplaintWizardValidationError["field"], message: string, maxLength: number): ComplaintWizardValidationError | undefined => {
  if (!value.trim() || value.length > maxLength || CONTROL_PATTERN.test(value)) return { field, message };
  return undefined;
};

export const validateComplaintWizardDraft = (
  draft: ComplaintWizardDraft,
  step: ComplaintWizardStep | 4 = 4,
): readonly ComplaintWizardValidationError[] => {
  const errors: ComplaintWizardValidationError[] = [];
  const titleError = requiredText(draft.title, "title", "กรุณาระบุหัวข้อเรื่อง", 240);
  const descriptionError = requiredText(draft.description, "description", "กรุณาระบุรายละเอียดปัญหา", 20_000);

  if (step >= 1) {
    const hasCategory = draft.categoryId !== undefined;
    if (hasCategory === draft.categoryUncertain) {
      errors.push({ field: "categoryId", message: "เลือกประเภทปัญหา หรือเลือก “ยังไม่แน่ใจ” อย่างใดอย่างหนึ่ง" });
    }
    if (draft.categoryId !== undefined && !UUID_PATTERN.test(draft.categoryId)) {
      errors.push({ field: "categoryId", message: "ประเภทปัญหาไม่ถูกต้อง" });
    }
    if (titleError) errors.push(titleError);
    if (descriptionError) errors.push(descriptionError);
  }

  if (step >= 2) {
    if (draft.attachments.length > 5) errors.push({ field: "attachments", message: "แนบรูปได้ไม่เกิน 5 รูป" });
    for (const attachment of draft.attachments) {
      if (!IMAGE_TYPES.has(attachment.contentType) || attachment.byteLength <= 0 || attachment.byteLength > MAX_ATTACHMENT_BYTES) {
        errors.push({ field: "attachments", message: `${attachment.fileName} ไม่ผ่านเงื่อนไขไฟล์รูปภาพ` });
      }
      if (attachment.state === "REJECTED") errors.push({ field: "attachments", message: `${attachment.fileName} ต้องลบหรืออัปโหลดใหม่` });
    }
    const hasCoordinates = draft.location?.latitude !== undefined || draft.location?.longitude !== undefined;
    if (hasCoordinates && (draft.location?.latitude === undefined || draft.location?.longitude === undefined)) {
      errors.push({ field: "location", message: "พิกัดต้องมีละติจูดและลองจิจูดคู่กัน" });
    }
    if (draft.location?.latitude !== undefined && (draft.location.latitude < -90 || draft.location.latitude > 90)) {
      errors.push({ field: "location", message: "ละติจูดไม่อยู่ในช่วงที่ถูกต้อง" });
    }
    if (draft.location?.longitude !== undefined && (draft.location.longitude < -180 || draft.location.longitude > 180)) {
      errors.push({ field: "location", message: "ลองจิจูดไม่อยู่ในช่วงที่ถูกต้อง" });
    }
    if (!draft.location?.text?.trim() && !hasCoordinates) errors.push({ field: "location", message: "กรุณาระบุตำแหน่งที่เกิดเหตุ" });
  }

  if (step >= 3) {
    if (draft.citizenName.length > 200 || CONTROL_PATTERN.test(draft.citizenName)) {
      errors.push({ field: "citizenName", message: "ชื่อผู้แจ้งไม่ถูกต้อง" });
    }
    if (draft.phone && (!PHONE_PATTERN.test(draft.phone) || CONTROL_PATTERN.test(draft.phone))) {
      errors.push({ field: "phone", message: "กรุณาตรวจสอบเบอร์โทรศัพท์" });
    }
    if (draft.notifyChannel === "PHONE" && !draft.phone) errors.push({ field: "phone", message: "กรุณาระบุเบอร์โทรศัพท์สำหรับช่องทางนี้" });
    if (!draft.consentAccepted || !draft.consentVersion.trim()) {
      errors.push({ field: "consentAccepted", message: "กรุณายอมรับประกาศความเป็นส่วนตัวก่อนส่งเรื่อง" });
    }
  }

  return errors;
};

export const makeDraftSnapshot = (draft: ComplaintWizardDraft, step: ComplaintWizardStep, now: Date): ComplaintWizardDraftSnapshot => ({
  version: 1,
  savedAt: now.toISOString(),
  step,
  ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
  categoryUncertain: draft.categoryUncertain,
  title: draft.title,
  description: draft.description,
  ...(draft.location ? { location: { ...draft.location } } : {}),
  citizenName: draft.citizenName,
  notifyChannel: draft.notifyChannel,
  attachmentNames: draft.attachments.map((attachment) => attachment.fileName).slice(0, 5),
});

export const restoreDraftSnapshot = (snapshot: unknown): Partial<ComplaintWizardDraft> | undefined => {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const value = snapshot as Partial<ComplaintWizardDraftSnapshot>;
  if (value.version !== 1 || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)) || typeof value.title !== "string" || typeof value.description !== "string") return undefined;
  if (value.categoryId !== undefined && typeof value.categoryId !== "string") return undefined;
  if (typeof value.categoryUncertain !== "boolean" || typeof value.citizenName !== "string" || !["LINE", "PHONE"].includes(value.notifyChannel ?? "")) return undefined;
  return {
    ...(value.categoryId ? { categoryId: value.categoryId } : {}),
    categoryUncertain: value.categoryUncertain,
    title: value.title,
    description: value.description,
    ...(value.location ? { location: { ...value.location } } : {}),
    citizenName: value.citizenName,
    notifyChannel: value.notifyChannel,
  };
};

export const isAllowedImage = (contentType: string, byteLength: number): boolean =>
  IMAGE_TYPES.has(contentType) && byteLength > 0 && byteLength <= MAX_ATTACHMENT_BYTES;

export const COMPLAINT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const COMPLAINT_MAX_ATTACHMENTS = 5;
export const COMPLAINT_MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES;
