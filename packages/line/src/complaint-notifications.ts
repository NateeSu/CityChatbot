import { randomUUID } from "node:crypto";

import { LineMessagingDispatcher, LineMessagingError, LineTemplateRegistry, type LineDeliveryStatus, type LineProviderClient } from "./messaging";

export const COMPLAINT_NOTIFICATION_EVENTS = [
  "complaint.created",
  "complaint.assigned",
  "complaint.status_changed",
  "complaint.public_update_added",
  "complaint.sla_warning",
  "complaint.sla_breached",
] as const;

export type ComplaintNotificationEventType = (typeof COMPLAINT_NOTIFICATION_EVENTS)[number];
export type ComplaintNotificationLocale = "th-TH" | "en-US";
export type ComplaintNotificationStatus = "RECEIVED" | "UNDER_REVIEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_CITIZEN" | "RESOLVED" | "CLOSED" | "OUT_OF_JURISDICTION" | "CANCELLED";

export class ComplaintNotificationError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND", message: string) {
    super(`${code}: ${message}`);
    this.name = "ComplaintNotificationError";
  }
}

export type ComplaintNotificationPayload = {
  complaintNo: string;
  fromStatus?: ComplaintNotificationStatus;
  toStatus?: ComplaintNotificationStatus;
  statusLabel?: string;
  departmentName?: string;
  publicMessage?: string;
  milestone?: "response" | "resolution";
};

export type ComplaintNotificationEvent = {
  eventId: string;
  eventType: ComplaintNotificationEventType;
  eventVersion: 1;
  tenantId: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: string;
  payload: ComplaintNotificationPayload;
};

export type ComplaintNotificationTenantConfig = {
  tenantId: string;
  enabled: boolean;
  locale: ComplaintNotificationLocale;
  themeVersion: number;
  trackingBaseUrl: string;
  publicContact?: string;
  maxAttempts?: number;
};

export type ComplaintNotificationRecipient = {
  tenantId: string;
  complaintId: string;
  lineUserId: string;
  optedIn: boolean;
};

export type ComplaintNotificationContext = {
  getTenantConfig(tenantId: string): ComplaintNotificationTenantConfig | undefined;
  getRecipient(tenantId: string, complaintId: string): ComplaintNotificationRecipient | undefined;
};

export type ComplaintNotificationOutboxView = {
  id: string;
  eventId: string;
  eventType: ComplaintNotificationEventType;
  tenantId: string;
  aggregateId: string;
  channel: "LINE";
  recipientScope: "CITIZEN";
  templateKey: string;
  templateVersion: number;
  locale: ComplaintNotificationLocale;
  themeVersion: number;
  deliveryId: string;
  idempotencyKey: string;
  status: LineDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string;
  providerStatus?: number;
  errorCode?: string;
  providerMessageId?: string;
  createdAt: string;
  completedAt?: string;
};

export type ComplaintNotificationResult =
  | { outcome: "ENQUEUED"; outbox: ComplaintNotificationOutboxView }
  | { outcome: "SKIPPED"; eventId: string; reasonCode: "DISABLED" | "OPTED_OUT" | "UNSUPPORTED_EVENT" };

type NotificationOutboxRecord = ComplaintNotificationOutboxView;
type TemplatePlan = { key: string; variables: Record<string, string> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const STATUS_LABELS: Record<ComplaintNotificationStatus, string> = {
  RECEIVED: "รับเรื่องแล้ว",
  UNDER_REVIEW: "อยู่ระหว่างตรวจสอบ",
  ASSIGNED: "มอบหมายหน่วยงานแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_FOR_CITIZEN: "รอข้อมูลจากประชาชน",
  RESOLVED: "ดำเนินการแล้ว",
  CLOSED: "ปิดเรื่องแล้ว",
  OUT_OF_JURISDICTION: "ส่งต่อหน่วยงานที่เกี่ยวข้อง",
  CANCELLED: "ยกเลิกเรื่องแล้ว",
};

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new ComplaintNotificationError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertPublicText = (value: string, field: string, maxLength = 500): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || CONTROL_PATTERN.test(normalized)) throw new ComplaintNotificationError("VALIDATION_ERROR", `${field} is invalid`);
  return normalized;
};

const assertEvent = (event: ComplaintNotificationEvent): void => {
  assertUuid(event.eventId, "eventId");
  assertUuid(event.tenantId, "tenantId");
  assertUuid(event.aggregateId, "aggregateId");
  assertUuid(event.correlationId, "correlationId");
  if (event.eventVersion !== 1 || !COMPLAINT_NOTIFICATION_EVENTS.includes(event.eventType)) throw new ComplaintNotificationError("VALIDATION_ERROR", "unsupported complaint notification event version/type");
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw new ComplaintNotificationError("VALIDATION_ERROR", "occurredAt is invalid");
  assertPublicText(event.payload.complaintNo, "complaintNo", 80);
  if (event.payload.departmentName !== undefined) assertPublicText(event.payload.departmentName, "departmentName", 200);
  if (event.payload.statusLabel !== undefined) assertPublicText(event.payload.statusLabel, "statusLabel", 120);
  if (event.payload.publicMessage !== undefined) assertPublicText(event.payload.publicMessage, "publicMessage", 1000);
  if (event.payload.fromStatus !== undefined && !(event.payload.fromStatus in STATUS_LABELS)) throw new ComplaintNotificationError("VALIDATION_ERROR", "fromStatus is invalid");
  if (event.payload.toStatus !== undefined && !(event.payload.toStatus in STATUS_LABELS)) throw new ComplaintNotificationError("VALIDATION_ERROR", "toStatus is invalid");
  if (event.eventType === "complaint.status_changed" && (!event.payload.fromStatus || !event.payload.toStatus)) throw new ComplaintNotificationError("VALIDATION_ERROR", "status_changed requires fromStatus and toStatus");
  if ((event.eventType === "complaint.public_update_added") && !event.payload.publicMessage) throw new ComplaintNotificationError("VALIDATION_ERROR", "public_update_added requires a public message");
  if ((event.eventType === "complaint.sla_warning" || event.eventType === "complaint.sla_breached") && !event.payload.milestone) throw new ComplaintNotificationError("VALIDATION_ERROR", "SLA notification requires a milestone");
};

const registerLocaleTemplates = (registry: LineTemplateRegistry, locale: ComplaintNotificationLocale): void => {
  const suffix = locale === "en-US" ? ".en" : "";
  const copy = locale === "en-US"
    ? {
        received: "We received complaint {{complaintNo}}. Track it at {{trackingUrl}}",
        assigned: "Complaint {{complaintNo}} was assigned to {{departmentName}}. Track it at {{trackingUrl}}",
        waiting: "We need more information for complaint {{complaintNo}}: {{publicMessage}} Contact: {{contactText}}",
        resolved: "Complaint {{complaintNo}} has been resolved: {{publicMessage}} Track it at {{trackingUrl}}",
        closed: "Complaint {{complaintNo}} is now closed. Contact: {{contactText}}",
        status: "Complaint {{complaintNo}} status: {{statusLabel}}. Track it at {{trackingUrl}}",
        publicUpdate: "There is a new update for complaint {{complaintNo}}: {{publicMessage}} Track it at {{trackingUrl}}",
        slaWarning: "Complaint {{complaintNo}} is nearing its {{milestone}} SLA target. Track it at {{trackingUrl}}",
        slaBreached: "Complaint {{complaintNo}} has passed its {{milestone}} SLA target. Contact: {{contactText}}",
      }
    : {
        received: "รับเรื่อง {{complaintNo}} แล้ว ติดตามเรื่องได้ที่ {{trackingUrl}}",
        assigned: "เรื่อง {{complaintNo}} มอบหมายให้ {{departmentName}} แล้ว ติดตามเรื่องได้ที่ {{trackingUrl}}",
        waiting: "เรื่อง {{complaintNo}} ต้องการข้อมูลเพิ่มเติม: {{publicMessage}} ติดต่อ: {{contactText}}",
        resolved: "เรื่อง {{complaintNo}} ดำเนินการแล้ว: {{publicMessage}} ติดตามเรื่องได้ที่ {{trackingUrl}}",
        closed: "เรื่อง {{complaintNo}} ปิดเรื่องแล้ว ติดต่อ: {{contactText}}",
        status: "สถานะเรื่อง {{complaintNo}}: {{statusLabel}} ติดตามเรื่องได้ที่ {{trackingUrl}}",
        publicUpdate: "มีข้อความใหม่สำหรับเรื่อง {{complaintNo}}: {{publicMessage}} ติดตามเรื่องได้ที่ {{trackingUrl}}",
        slaWarning: "เรื่อง {{complaintNo}} ใกล้ครบกำหนด SLA ด้าน{{milestone}} ติดตามเรื่องได้ที่ {{trackingUrl}}",
        slaBreached: "เรื่อง {{complaintNo}} เกินกำหนด SLA ด้าน{{milestone}} ติดต่อ: {{contactText}}",
      };
  const definitions = [
    ["complaint.received", copy.received, ["complaintNo", "trackingUrl"]],
    ["complaint.assigned", copy.assigned, ["complaintNo", "departmentName", "trackingUrl"]],
    ["complaint.waiting", copy.waiting, ["complaintNo", "publicMessage", "contactText"]],
    ["complaint.resolved", copy.resolved, ["complaintNo", "publicMessage", "trackingUrl"]],
    ["complaint.closed", copy.closed, ["complaintNo", "contactText"]],
    ["complaint.status", copy.status, ["complaintNo", "statusLabel", "trackingUrl"]],
    ["complaint.public_update", copy.publicUpdate, ["complaintNo", "publicMessage", "trackingUrl"]],
    ["complaint.sla_warning", copy.slaWarning, ["complaintNo", "milestone", "trackingUrl"]],
    ["complaint.sla_breached", copy.slaBreached, ["complaintNo", "milestone", "contactText"]],
  ] as const;
  for (const [key, text, variables] of definitions) registry.register({ key: `${key}${suffix}`, version: 1, locale, text, variables });
};

export const createComplaintNotificationTemplates = (): LineTemplateRegistry => {
  const registry = new LineTemplateRegistry();
  registerLocaleTemplates(registry, "th-TH");
  registerLocaleTemplates(registry, "en-US");
  return registry;
};

const buildTrackingUrl = (config: ComplaintNotificationTenantConfig, complaintId: string): string => {
  try {
    const base = new URL(config.trackingBaseUrl);
    if (base.protocol !== "https:") throw new ComplaintNotificationError("VALIDATION_ERROR", "trackingBaseUrl must use HTTPS");
    const url = new URL(`/liff/complaints/${complaintId}`, base);
    return url.toString();
  } catch (error) {
    if (error instanceof ComplaintNotificationError) throw error;
    throw new ComplaintNotificationError("VALIDATION_ERROR", "trackingBaseUrl is invalid");
  }
};

const buildPlan = (event: ComplaintNotificationEvent, config: ComplaintNotificationTenantConfig): TemplatePlan => {
  const trackingUrl = buildTrackingUrl(config, event.aggregateId);
  const complaintNo = assertPublicText(event.payload.complaintNo, "complaintNo", 80);
  const departmentName = event.payload.departmentName ? assertPublicText(event.payload.departmentName, "departmentName", 200) : "หน่วยงานที่รับผิดชอบ";
  const contactText = config.publicContact ? assertPublicText(config.publicContact, "publicContact", 200) : (config.locale === "en-US" ? "municipal contact channel" : "ช่องทางติดต่อของเทศบาล");
  const status = event.payload.toStatus ?? "IN_PROGRESS";
  const statusLabel = event.payload.statusLabel ? assertPublicText(event.payload.statusLabel, "statusLabel", 120) : STATUS_LABELS[status];
  const publicMessage = event.payload.publicMessage ? assertPublicText(event.payload.publicMessage, "publicMessage", 1000) : (config.locale === "en-US" ? "The municipal team is processing this complaint" : "เจ้าหน้าที่กำลังดำเนินการ");
  const milestone = event.payload.milestone === "response" ? (config.locale === "en-US" ? "response" : "การตอบรับ") : (config.locale === "en-US" ? "resolution" : "การแก้ไข");
  const variables = { complaintNo, trackingUrl, departmentName, contactText, statusLabel, publicMessage, milestone };
  let key: string;
  switch (event.eventType) {
    case "complaint.created": key = "complaint.received"; break;
    case "complaint.assigned": key = "complaint.assigned"; break;
    case "complaint.public_update_added": key = "complaint.public_update"; break;
    case "complaint.sla_warning": key = "complaint.sla_warning"; break;
    case "complaint.sla_breached": key = "complaint.sla_breached"; break;
    case "complaint.status_changed":
      key = status === "WAITING_FOR_CITIZEN" ? "complaint.waiting" : status === "RESOLVED" ? "complaint.resolved" : status === "CLOSED" ? "complaint.closed" : "complaint.status";
      break;
    default: throw new ComplaintNotificationError("VALIDATION_ERROR", "unsupported complaint notification event");
  }
  const variablesByKey: Record<string, Record<string, string>> = {
    "complaint.received": { complaintNo, trackingUrl },
    "complaint.assigned": { complaintNo, departmentName, trackingUrl },
    "complaint.waiting": { complaintNo, publicMessage, contactText },
    "complaint.resolved": { complaintNo, publicMessage, trackingUrl },
    "complaint.closed": { complaintNo, contactText },
    "complaint.status": { complaintNo, statusLabel, trackingUrl },
    "complaint.public_update": { complaintNo, publicMessage, trackingUrl },
    "complaint.sla_warning": { complaintNo, milestone, trackingUrl },
    "complaint.sla_breached": { complaintNo, milestone, contactText },
  };
  return { key: config.locale === "en-US" ? `${key}.en` : key, variables: variablesByKey[key]! };
};

export class ComplaintNotificationService {
  private readonly outbox = new Map<string, NotificationOutboxRecord>();
  private readonly eventToOutbox = new Map<string, string>();
  private readonly dispatcher: LineMessagingDispatcher;
  private readonly context: ComplaintNotificationContext;
  private readonly templates: LineTemplateRegistry;
  private readonly clock: () => Date;

  constructor(input: { dispatcher: LineMessagingDispatcher; context: ComplaintNotificationContext; templates?: LineTemplateRegistry; clock?: () => Date }) {
    this.dispatcher = input.dispatcher;
    this.context = input.context;
    this.templates = input.templates ?? createComplaintNotificationTemplates();
    this.clock = input.clock ?? (() => new Date());
  }

  enqueue(event: ComplaintNotificationEvent): ComplaintNotificationResult {
    assertEvent(event);
    const existingId = this.eventToOutbox.get(event.eventId);
    if (existingId) return { outcome: "ENQUEUED", outbox: { ...this.outbox.get(existingId)! } };
    const config = this.context.getTenantConfig(event.tenantId);
    if (!config || !config.enabled) return { outcome: "SKIPPED", eventId: event.eventId, reasonCode: "DISABLED" };
    if (config.tenantId !== event.tenantId || !Number.isSafeInteger(config.themeVersion) || config.themeVersion <= 0) throw new ComplaintNotificationError("VALIDATION_ERROR", "tenant notification config is invalid");
    const recipient = this.context.getRecipient(event.tenantId, event.aggregateId);
    if (!recipient || recipient.tenantId !== event.tenantId || recipient.complaintId !== event.aggregateId) throw new ComplaintNotificationError("NOT_FOUND", "citizen notification recipient was not found");
    if (!recipient.optedIn) return { outcome: "SKIPPED", eventId: event.eventId, reasonCode: "OPTED_OUT" };
    const plan = buildPlan(event, config);
    const templateKey = plan.key;
    this.templates.render(templateKey, 1, plan.variables);
    const delivery = this.dispatcher.enqueue({ eventId: event.eventId, tenantId: event.tenantId, route: "push", recipientId: recipient.lineUserId, idempotencyKey: `complaint-notification:${event.eventId}`, correlationId: event.correlationId, template: { key: templateKey, version: 1, variables: plan.variables }, maxAttempts: config.maxAttempts });
    const record: NotificationOutboxRecord = {
      id: randomUUID(),
      eventId: event.eventId,
      eventType: event.eventType,
      tenantId: event.tenantId,
      aggregateId: event.aggregateId,
      channel: "LINE",
      recipientScope: "CITIZEN",
      templateKey,
      templateVersion: 1,
      locale: config.locale,
      themeVersion: config.themeVersion,
      deliveryId: delivery.id,
      idempotencyKey: `complaint-notification:${event.eventId}`,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      nextAttemptAt: delivery.nextAttemptAt,
      createdAt: this.clock().toISOString(),
    };
    this.outbox.set(record.id, record);
    this.eventToOutbox.set(event.eventId, record.id);
    return { outcome: "ENQUEUED", outbox: { ...record } };
  }

  async dispatch(outboxId: string, provider: LineProviderClient, now = this.clock(), jitterMs?: number): Promise<ComplaintNotificationOutboxView> {
    const record = this.outbox.get(outboxId);
    if (!record) throw new ComplaintNotificationError("NOT_FOUND", "notification outbox record was not found");
    const delivery = await this.dispatcher.dispatch(record.deliveryId, provider, now, jitterMs);
    record.status = delivery.status;
    record.attemptCount = delivery.attemptCount;
    record.nextAttemptAt = delivery.nextAttemptAt;
    record.providerStatus = delivery.providerStatus;
    record.errorCode = delivery.errorCode;
    record.providerMessageId = delivery.providerMessageId;
    record.completedAt = delivery.completedAt;
    return { ...record };
  }

  get(outboxId: string): ComplaintNotificationOutboxView | undefined {
    const record = this.outbox.get(outboxId);
    return record ? { ...record } : undefined;
  }

  list(tenantId: string): ComplaintNotificationOutboxView[] {
    return [...this.outbox.values()].filter((record) => record.tenantId === tenantId).map((record) => ({ ...record }));
  }
}

export const isLineNotificationConfigurationError = (error: unknown): boolean => error instanceof ComplaintNotificationError || error instanceof LineMessagingError;
