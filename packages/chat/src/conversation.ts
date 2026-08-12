import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  LineMessagingDispatcher,
  sanitizeLineText,
  type LineDeliveryStatus,
  type LineProviderClient,
} from "@citychatbot/line";
import {
  buildPromptEnvelope,
  guardPromptContext,
  redactSensitiveText,
  sanitizeAiOutput,
} from "@citychatbot/security/ai-safety";

import type {
  AnswerOutcome,
  GroundedTurn,
  HandoffReasonCode,
  IntentResult,
} from "./grounding";

export type ChatChannel = "LINE" | "LIFF" | "WEB";
export type ChatSessionStatus = "ACTIVE" | "HANDOFF" | "CLOSED" | "EXPIRED" | "CANCELLED";
export type ChatMessageKind = "USER" | "BOT" | "SYSTEM" | "FEEDBACK";
export type ChatPhase = "TYPING" | "ACK" | "FINAL";
export type ChatFeedbackValue = "HELPFUL" | "INCORRECT";
export type ChatIntentKind = "QUESTION" | "STAFF_REQUEST" | "CANCEL";

export type ChatContextMessage = {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  text: string;
  topicKey: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  tenantId: string;
  channel: ChatChannel;
  externalUserHash: string;
  status: ChatSessionStatus;
  topicKey: string | null;
  handoffTopicKey: string | null;
  context: ChatContextMessage[];
  expiresAt: string;
  lastMessageAt: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  tenantId: string;
  sessionId: string;
  eventId: string;
  kind: ChatMessageKind;
  contentRedacted: string;
  outcome?: AnswerOutcome;
  reasonCode?: string;
  sourceLabels: string[];
  sequenceNo: number;
  createdAt: string;
};

export type ChatFeedback = {
  id: string;
  tenantId: string;
  sessionId: string;
  messageId: string;
  value: ChatFeedbackValue;
  commentRedacted?: string;
  createdAt: string;
};

export type ChatAuditEvent = {
  tenantId: string;
  sessionId: string;
  eventId: string;
  action:
    | "CHAT_SESSION_CREATED"
    | "CHAT_TURN_ACCEPTED"
    | "CHAT_TURN_COMPLETED"
    | "CHAT_TURN_DUPLICATE"
    | "CHAT_SESSION_CANCELLED"
    | "CHAT_FEEDBACK_RECORDED";
  outcome?: AnswerOutcome;
  reasonCode?: string;
  channel: ChatChannel;
  createdAt: string;
};

export type ChatUsage = {
  inputCharacters: number;
  outputCharacters: number;
  providerCalls: number;
  totalTokens: number;
  totalCostCents: number;
};

export type ChatInboundEvent = {
  tenantId: string;
  channel: ChatChannel;
  eventId: string;
  lineUserId: string;
  text: string;
  replyToken?: string;
  requestId?: string;
  correlationId?: string;
  receivedAt?: Date;
};

export type ChatPhaseEvent = {
  tenantId: string;
  sessionId: string;
  eventId: string;
  phase: ChatPhase;
  createdAt: string;
  deliveryStatus?: LineDeliveryStatus | "NOT_CONFIGURED" | "NOT_ATTEMPTED";
};

export type ChatGenerationUsage = Partial<ChatUsage>;

export type ChatGenerationResult = {
  turn: GroundedTurn;
  providerOutputVerified?: boolean;
  usage?: ChatGenerationUsage;
};

export type ChatTurnProcessorInput = {
  tenantId: string;
  session: ChatSession;
  userText: string;
  context: readonly ChatContextMessage[];
  topicKey: string;
  topicChanged: boolean;
  intent: ChatIntentKind;
  signal: AbortSignal;
};

export type ChatTurnProcessor = (
  input: ChatTurnProcessorInput,
) => Promise<GroundedTurn | ChatGenerationResult>;

export type ChatConversationResponse = {
  requestId: string;
  correlationId: string;
  tenantId: string;
  session: ChatSession;
  message: ChatMessage;
  turn: GroundedTurn;
  text: string;
  sourceLabels: string[];
  phases: ChatPhaseEvent[];
  deliveryStatus: LineDeliveryStatus | "NOT_CONFIGURED" | "NOT_ATTEMPTED";
  duplicate: boolean;
  afterHours: boolean;
  topicChanged: boolean;
  truncatedInput: boolean;
  usage: ChatUsage;
};

export type ChatLineDelivery = {
  dispatcher: LineMessagingDispatcher;
  provider: LineProviderClient;
};

export type ChatConversationStore = {
  findActive(tenantId: string, channel: ChatChannel, externalUserHash: string, now: Date): ChatSession | undefined;
  createSession(input: {
    tenantId: string;
    channel: ChatChannel;
    externalUserHash: string;
    now: Date;
    ttlMs: number;
  }): ChatSession;
  getSession(tenantId: string, sessionId: string): ChatSession | undefined;
  saveSession(session: ChatSession): void;
  appendMessage(input: {
    tenantId: string;
    sessionId: string;
    eventId: string;
    kind: ChatMessageKind;
    contentRedacted: string;
    outcome?: AnswerOutcome;
    reasonCode?: string;
    sourceLabels?: readonly string[];
    now: Date;
  }): ChatMessage;
  getMessage(tenantId: string, messageId: string): ChatMessage | undefined;
  findResponse(tenantId: string, eventId: string): ChatConversationResponse | undefined;
  saveResponse(response: ChatConversationResponse): void;
  saveFeedback(feedback: ChatFeedback): ChatFeedback;
  listMessages(tenantId: string, sessionId: string): ChatMessage[];
  listAudits(tenantId: string): ChatAuditEvent[];
  appendAudit(event: ChatAuditEvent): void;
};

export class ChatConversationError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(code + ": " + message);
    this.name = "ChatConversationError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_LINE_TEXT_LENGTH = 5000;
const DEFAULT_CONTEXT_LIMIT = 12;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PROCESS_TIMEOUT_MS = 8_000;

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
const cloneSession = (session: ChatSession): ChatSession => ({
  ...session,
  context: session.context.map((item) => ({ ...item })),
});
const sessionKey = (tenantId: string, channel: ChatChannel, externalUserHash: string): string =>
  [tenantId, channel, externalUserHash].join(":");
const responseKey = (tenantId: string, eventId: string): string => tenantId + ":" + eventId;
const messageKey = (tenantId: string, messageId: string): string => tenantId + ":" + messageId;
const auditCopy = (event: ChatAuditEvent): ChatAuditEvent => ({ ...event });

export class InMemoryChatConversationStore implements ChatConversationStore {
  private readonly sessions = new Map<string, ChatSession>();
  private readonly sessionsByIdentity = new Map<string, string>();
  private readonly messages = new Map<string, ChatMessage>();
  private readonly responses = new Map<string, ChatConversationResponse>();
  private readonly feedback = new Map<string, ChatFeedback>();
  private readonly audits: ChatAuditEvent[] = [];
  private readonly sequenceBySession = new Map<string, number>();

  findActive(
    tenantId: string,
    channel: ChatChannel,
    externalUserHash: string,
    now: Date,
  ): ChatSession | undefined {
    const identity = sessionKey(tenantId, channel, externalUserHash);
    const sessionId = this.sessionsByIdentity.get(identity);
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session || !["ACTIVE", "HANDOFF"].includes(session.status)) return undefined;
    if (session.expiresAt <= now.toISOString()) {
      session.status = "EXPIRED";
      session.updatedAt = now.toISOString();
      this.sessions.set(session.id, session);
      this.sessionsByIdentity.delete(identity);
      return undefined;
    }
    return cloneSession(session);
  }

  createSession(input: {
    tenantId: string;
    channel: ChatChannel;
    externalUserHash: string;
    now: Date;
    ttlMs: number;
  }): ChatSession {
    const identity = sessionKey(input.tenantId, input.channel, input.externalUserHash);
    const existing = this.sessionsByIdentity.get(identity);
    if (existing) {
      const active = this.sessions.get(existing);
      if (active && ["ACTIVE", "HANDOFF"].includes(active.status)) {
        throw new ChatConversationError("CONFLICT", "active chat session already exists");
      }
    }
    const now = input.now.toISOString();
    const session: ChatSession = {
      id: randomUUID(),
      tenantId: input.tenantId,
      channel: input.channel,
      externalUserHash: input.externalUserHash,
      status: "ACTIVE",
      topicKey: null,
      handoffTopicKey: null,
      context: [],
      expiresAt: new Date(input.now.getTime() + input.ttlMs).toISOString(),
      lastMessageAt: now,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, cloneSession(session));
    this.sessionsByIdentity.set(identity, session.id);
    this.sequenceBySession.set(session.id, 0);
    return cloneSession(session);
  }

  getSession(tenantId: string, sessionId: string): ChatSession | undefined {
    const session = this.sessions.get(sessionId);
    return session && session.tenantId === tenantId ? cloneSession(session) : undefined;
  }

  saveSession(session: ChatSession): void {
    const current = this.sessions.get(session.id);
    if (!current || current.tenantId !== session.tenantId) {
      throw new ChatConversationError("NOT_FOUND", "chat session was not found");
    }
    this.sessions.set(session.id, cloneSession(session));
    const identity = sessionKey(session.tenantId, session.channel, session.externalUserHash);
    if (["ACTIVE", "HANDOFF"].includes(session.status)) this.sessionsByIdentity.set(identity, session.id);
    else if (this.sessionsByIdentity.get(identity) === session.id) this.sessionsByIdentity.delete(identity);
  }

  appendMessage(input: {
    tenantId: string;
    sessionId: string;
    eventId: string;
    kind: ChatMessageKind;
    contentRedacted: string;
    outcome?: AnswerOutcome;
    reasonCode?: string;
    sourceLabels?: readonly string[];
    now: Date;
  }): ChatMessage {
    const session = this.sessions.get(input.sessionId);
    if (!session || session.tenantId !== input.tenantId) {
      throw new ChatConversationError("NOT_FOUND", "chat session was not found");
    }
    const sequenceNo = (this.sequenceBySession.get(input.sessionId) ?? 0) + 1;
    this.sequenceBySession.set(input.sessionId, sequenceNo);
    const message: ChatMessage = {
      id: randomUUID(),
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      eventId: input.eventId,
      kind: input.kind,
      contentRedacted: redactSensitiveText(input.contentRedacted),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      sourceLabels: [...(input.sourceLabels ?? [])],
      sequenceNo,
      createdAt: input.now.toISOString(),
    };
    this.messages.set(messageKey(input.tenantId, message.id), { ...message, sourceLabels: [...message.sourceLabels] });
    return { ...message, sourceLabels: [...message.sourceLabels] };
  }

  getMessage(tenantId: string, messageId: string): ChatMessage | undefined {
    const message = this.messages.get(messageKey(tenantId, messageId));
    return message ? { ...message, sourceLabels: [...message.sourceLabels] } : undefined;
  }

  findResponse(tenantId: string, eventId: string): ChatConversationResponse | undefined {
    const response = this.responses.get(responseKey(tenantId, eventId));
    if (!response) return undefined;
    return {
      ...response,
      session: cloneSession(response.session),
      message: { ...response.message, sourceLabels: [...response.message.sourceLabels] },
      phases: response.phases.map((phase) => ({ ...phase })),
      sourceLabels: [...response.sourceLabels],
      usage: { ...response.usage },
    };
  }

  saveResponse(response: ChatConversationResponse): void {
    this.responses.set(responseKey(response.tenantId, response.message.eventId), {
      ...response,
      session: cloneSession(response.session),
      message: { ...response.message, sourceLabels: [...response.message.sourceLabels] },
      phases: response.phases.map((phase) => ({ ...phase })),
      sourceLabels: [...response.sourceLabels],
      usage: { ...response.usage },
    });
  }

  saveFeedback(feedback: ChatFeedback): ChatFeedback {
    const key = messageKey(feedback.tenantId, feedback.messageId);
    const existing = this.feedback.get(key);
    if (existing && (existing.value !== feedback.value || existing.commentRedacted !== feedback.commentRedacted)) {
      throw new ChatConversationError("CONFLICT", "feedback already exists with different content");
    }
    const stored = { ...feedback };
    this.feedback.set(key, stored);
    return { ...stored };
  }

  listMessages(tenantId: string, sessionId: string): ChatMessage[] {
    const session = this.getSession(tenantId, sessionId);
    if (!session) return [];
    return [...this.messages.values()]
      .filter((message) => message.tenantId === tenantId && message.sessionId === sessionId)
      .sort((left, right) => left.sequenceNo - right.sequenceNo)
      .map((message) => ({ ...message, sourceLabels: [...message.sourceLabels] }));
  }

  listAudits(tenantId: string): ChatAuditEvent[] {
    return this.audits.filter((event) => event.tenantId === tenantId).map(auditCopy);
  }

  appendAudit(event: ChatAuditEvent): void {
    this.audits.push(auditCopy(event));
  }
}

export const hashLineUserId = (lineUserId: string, secret: string): string => {
  if (!lineUserId || CONTROL_PATTERN.test(lineUserId)) {
    throw new ChatConversationError("VALIDATION_ERROR", "LINE user identity is invalid");
  }
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new ChatConversationError("VALIDATION_ERROR", "LINE user hash secret is too short");
  }
  return createHmac("sha256", secret).update(lineUserId).digest("hex");
};

const normalizeTopicText = (text: string): string => text
  .normalize("NFC")
  .toLocaleLowerCase("th-TH")
  .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0)))
  .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

export const deriveTopicKey = (text: string): string => {
  const normalized = normalizeTopicText(text);
  const withoutFillers = normalized
    .split(" ")
    .filter((token) => !["ขอ", "สอบถาม", "อยาก", "ช่วย", "หน่อย", "กรุณา", "please", "can", "you"].includes(token))
    .slice(0, 8)
    .join(" ");
  return createHash("sha256").update(withoutFillers || "empty").digest("hex").slice(0, 24);
};

export const routeChatIntent = (text: string): { kind: ChatIntentKind; topicKey: string } => {
  const normalized = normalizeTopicText(text);
  if (/^(ยกเลิก|cancel|หยุด)(\s|$)/i.test(normalized)) {
    return { kind: "CANCEL", topicKey: deriveTopicKey(normalized) };
  }
  if (/(เจ้าหน้าที่|พนักงาน|คนจริง|human|agent|staff)/i.test(normalized)) {
    return { kind: "STAFF_REQUEST", topicKey: deriveTopicKey(normalized) };
  }
  return { kind: "QUESTION", topicKey: deriveTopicKey(normalized) };
};

const HANDOFF_REASONS = new Set<HandoffReasonCode>([
  "NO_EVIDENCE",
  "CONFLICTING_EVIDENCE",
  "LOW_EVIDENCE",
  "SENSITIVE",
  "PERSON_SPECIFIC",
  "POLICY_REFUSAL",
  "SECURITY",
  "STAFF_REQUESTED",
  "SYSTEM_ERROR",
]);

const RESULT_KEYS = [
  "answerText",
  "claims",
  "clarificationOptions",
  "clarificationQuestion",
  "citations",
  "contacts",
  "intentId",
  "outcome",
  "reasonCode",
];

const expectedOutcome = (results: readonly IntentResult[]): AnswerOutcome =>
  results.some((result) => result.outcome === "HANDOFF")
    ? "HANDOFF"
    : results.some((result) => result.outcome === "CLARIFY") ? "CLARIFY" : "ANSWER";

const hasExactResultKeys = (result: IntentResult): boolean =>
  Object.keys(result).sort().join("|") === RESULT_KEYS.slice().sort().join("|");

const isCanonicalTurn = (turn: GroundedTurn): boolean => {
  if (!turn || !["ANSWER", "CLARIFY", "HANDOFF"].includes(turn.overallOutcome) || !Array.isArray(turn.intentResults) || turn.intentResults.length === 0) return false;
  if (turn.overallOutcome !== expectedOutcome(turn.intentResults)) return false;
  return turn.intentResults.every((result) => {
    if (!hasExactResultKeys(result) || typeof result.intentId !== "string" || !Array.isArray(result.claims) || !Array.isArray(result.citations) || !Array.isArray(result.contacts) || !Array.isArray(result.clarificationOptions)) return false;
    if (result.outcome === "ANSWER") {
      return result.reasonCode === "ANSWERABLE" && Boolean(result.answerText) && result.clarificationQuestion === null && result.clarificationOptions.length === 0 && result.claims.length > 0 && result.citations.length > 0;
    }
    if (result.outcome === "CLARIFY") {
      return ["AMBIGUOUS_ENTITY", "MISSING_TIME", "AMBIGUOUS_INTENT"].includes(result.reasonCode) && result.answerText === "" && Boolean(result.clarificationQuestion) && result.claims.length === 0 && result.citations.length === 0 && result.contacts.length === 0;
    }
    return HANDOFF_REASONS.has(result.reasonCode) && Boolean(result.answerText) && result.clarificationQuestion === null && result.clarificationOptions.length === 0 && result.claims.length === 0;
  });
};

const handoffTurn = (intentId: string, reasonCode: HandoffReasonCode, text: string): GroundedTurn => ({
  overallOutcome: "HANDOFF",
  intentResults: [{
    intentId,
    outcome: "HANDOFF",
    reasonCode,
    answerText: text,
    clarificationQuestion: null,
    clarificationOptions: [],
    claims: [],
    citations: [],
    contacts: [],
  }],
});

const clarifyTurn = (intentId: string, text: string): GroundedTurn => ({
  overallOutcome: "CLARIFY",
  intentResults: [{
    intentId,
    outcome: "CLARIFY",
    reasonCode: "AMBIGUOUS_INTENT",
    answerText: "",
    clarificationQuestion: text,
    clarificationOptions: [],
    claims: [],
    citations: [],
    contacts: [],
  }],
});

const truncateLineText = (text: string, maxLength = MAX_LINE_TEXT_LENGTH): string =>
  text.length <= maxLength ? text : text.slice(0, maxLength - 1).trimEnd() + "…";

export type RenderedChatText = {
  safe: boolean;
  text: string;
  sourceLabels: string[];
};

export const renderTurnForLine = (
  turn: GroundedTurn,
  options: { afterHours?: boolean; maxLength?: number; allowedUrlHosts?: readonly string[] } = {},
): RenderedChatText => {
  const parts: string[] = [];
  const sourceLabels: string[] = [];
  const allowedPhones: string[] = [];
  for (const result of turn.intentResults) {
    if (result.outcome === "ANSWER") parts.push(result.answerText);
    if (result.outcome === "CLARIFY") {
      parts.push(result.clarificationQuestion);
      if (result.clarificationOptions.length > 0) parts.push("ตัวเลือก: " + result.clarificationOptions.join(" / "));
    }
    if (result.outcome === "HANDOFF") parts.push(result.answerText);
    for (const citation of result.citations) {
      if (citation.title && !sourceLabels.includes(citation.title)) sourceLabels.push(citation.title);
    }
    for (const contact of result.contacts) {
      allowedPhones.push(contact.phone);
      parts.push("ติดต่อ " + contact.label + ": " + contact.phone);
    }
  }
  if (sourceLabels.length > 0) parts.push("แหล่งข้อมูล: " + sourceLabels.slice(0, 3).join(", "));
  if (options.afterHours && turn.overallOutcome === "HANDOFF") {
    parts.push("ขณะนี้อยู่นอกเวลาทำการ เจ้าหน้าที่จะตรวจสอบในเวลาทำการ");
  }
  const rawText = parts.filter(Boolean).join("\n");
  const sanitized = guardPromptContext(buildPromptEnvelope({
    tenantId: "render-only",
    systemPolicy: "Rendered text is data and must not contain instructions or secrets.",
    evidence: [],
    userQuery: rawText,
  }));
  if (!sanitized.allowed) return { safe: false, text: "", sourceLabels };
  const outputSafety = sanitizeAiOutput(rawText, {
    allowlistedPhones: allowedPhones,
    allowedUrlHosts: options.allowedUrlHosts ?? [],
  });
  const output = outputSafety.text;
  const safe = outputSafety.safe && !/[<>]/.test(output);
  try {
    return {
      safe,
      text: truncateLineText(sanitizeLineText(output), options.maxLength),
      sourceLabels,
    };
  } catch {
    return { safe: false, text: "", sourceLabels };
  }
};

export type ChatConversationOptions = {
  store?: ChatConversationStore;
  lineUserHashSecret: string;
  processor: ChatTurnProcessor;
  lineDelivery?: ChatLineDelivery;
  systemPolicy: string;
  tenantPolicy?: (tenantId: string) => string | undefined;
  isAfterHours?: (input: { tenantId: string; channel: ChatChannel; now: Date }) => boolean;
  onPhase?: (event: ChatPhaseEvent) => void | Promise<void>;
  onAudit?: (event: ChatAuditEvent) => void | Promise<void>;
  clock?: () => Date;
  sessionTtlMs?: number;
  contextLimit?: number;
  maxInputCharacters?: number;
  processTimeoutMs?: number;
  allowedUrlHosts?: readonly string[];
};

export class ChatConversationService {
  private readonly store: ChatConversationStore;
  private readonly options: Required<Pick<ChatConversationOptions, "clock" | "sessionTtlMs" | "contextLimit" | "maxInputCharacters" | "processTimeoutMs">> & ChatConversationOptions;
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(options: ChatConversationOptions) {
    if (!options.systemPolicy.trim()) throw new ChatConversationError("VALIDATION_ERROR", "system policy is required");
    if (Buffer.byteLength(options.lineUserHashSecret, "utf8") < 32) throw new ChatConversationError("VALIDATION_ERROR", "LINE user hash secret is too short");
    this.store = options.store ?? new InMemoryChatConversationStore();
    this.options = {
      ...options,
      clock: options.clock ?? (() => new Date()),
      sessionTtlMs: options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS,
      contextLimit: options.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
      maxInputCharacters: options.maxInputCharacters ?? 4000,
      processTimeoutMs: options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS,
    };
  }

  getStore(): ChatConversationStore {
    return this.store;
  }

  async process(input: ChatInboundEvent): Promise<ChatConversationResponse> {
    this.validateInput(input);
    const existing = this.store.findResponse(input.tenantId, input.eventId);
    if (existing) {
      const duplicate = { ...existing, duplicate: true, phases: existing.phases.map((phase) => ({ ...phase })) };
      await this.audit({
        tenantId: input.tenantId,
        sessionId: existing.session.id,
        eventId: input.eventId,
        action: "CHAT_TURN_DUPLICATE",
        channel: input.channel,
        createdAt: this.now().toISOString(),
      });
      return duplicate;
    }
    const now = input.receivedAt ?? this.now();
    const userHash = hashLineUserId(input.lineUserId, this.options.lineUserHashSecret);
    let session = this.store.findActive(input.tenantId, input.channel, userHash, now);
    if (!session) {
      session = this.store.createSession({
        tenantId: input.tenantId,
        channel: input.channel,
        externalUserHash: userHash,
        now,
        ttlMs: this.options.sessionTtlMs,
      });
      await this.audit({
        tenantId: input.tenantId,
        sessionId: session.id,
        eventId: input.eventId,
        action: "CHAT_SESSION_CREATED",
        channel: input.channel,
        createdAt: now.toISOString(),
      });
    }
    const route = routeChatIntent(input.text);
    const topicChanged = Boolean(session.topicKey && session.topicKey !== route.topicKey);
    const redactedInput = redactSensitiveText(input.text);
    this.store.appendMessage({
      tenantId: input.tenantId,
      sessionId: session.id,
      eventId: input.eventId,
      kind: "USER",
      contentRedacted: redactedInput,
      now,
    });
    if (topicChanged) session.context = [];
    session.context = [...session.context, {
      role: "USER" as const,
      text: redactedInput,
      topicKey: route.topicKey,
      createdAt: now.toISOString(),
    }].slice(-this.options.contextLimit);
    session.lastMessageAt = now.toISOString();
    session.expiresAt = new Date(now.getTime() + this.options.sessionTtlMs).toISOString();
    session.updatedAt = now.toISOString();
    await this.audit({
      tenantId: input.tenantId,
      sessionId: session.id,
      eventId: input.eventId,
      action: "CHAT_TURN_ACCEPTED",
      channel: input.channel,
      createdAt: now.toISOString(),
    });
    const phases: ChatPhaseEvent[] = [];
    await this.emitPhase(phases, { tenantId: input.tenantId, sessionId: session.id, eventId: input.eventId, phase: "TYPING", createdAt: now.toISOString() });
    await this.emitPhase(phases, { tenantId: input.tenantId, sessionId: session.id, eventId: input.eventId, phase: "ACK", createdAt: now.toISOString() });

    if (route.kind === "CANCEL") {
      session.status = "CANCELLED";
      session.handoffTopicKey = null;
      this.store.saveSession(session);
      this.activeControllers.get(session.id)?.abort();
      return this.complete(input, session, route.topicKey, topicChanged, false, phases, handoffTurn(session.id, "STAFF_REQUESTED", "ยกเลิกการสนทนาแล้ว"), { statusOverride: "CANCELLED", now });
    }
    if (route.kind === "STAFF_REQUEST") {
      return this.complete(input, session, route.topicKey, topicChanged, false, phases, handoffTurn(session.id, "STAFF_REQUESTED", "กำลังส่งต่อเรื่องนี้ให้เจ้าหน้าที่"), { statusOverride: "HANDOFF", now });
    }
    if (session.status === "HANDOFF" && !topicChanged && session.handoffTopicKey === route.topicKey) {
      return this.complete(input, session, route.topicKey, false, false, phases, handoffTurn(session.id, "STAFF_REQUESTED", "เรื่องนี้อยู่ระหว่างการส่งต่อให้เจ้าหน้าที่ หากมีข้อมูลเพิ่มเติมส่งมาได้เลย"), { statusOverride: "HANDOFF", now });
    }
    const envelope = buildPromptEnvelope({
      tenantId: input.tenantId,
      systemPolicy: this.options.systemPolicy,
      tenantPolicy: this.options.tenantPolicy?.(input.tenantId),
      evidence: [],
      userQuery: input.text,
      metadata: { channel: input.channel, eventId: input.eventId },
    });
    const promptGuard = guardPromptContext(envelope);
    if (!promptGuard.allowed) {
      return this.complete(input, session, route.topicKey, topicChanged, false, phases, handoffTurn(session.id, "SECURITY", "ไม่สามารถยืนยันคำขอนี้อย่างปลอดภัยได้ จึงขอส่งต่อให้เจ้าหน้าที่"), { now });
    }
    const truncatedInput = input.text.length > this.options.maxInputCharacters;
    if (truncatedInput) {
      return this.complete(input, session, route.topicKey, topicChanged, true, phases, clarifyTurn(session.id, "กรุณาส่งคำถามที่สั้นลงไม่เกิน " + this.options.maxInputCharacters + " ตัวอักษร"), { now });
    }

    const controller = new AbortController();
    this.activeControllers.set(session.id, controller);
    let generated: GroundedTurn | ChatGenerationResult;
    try {
      generated = await this.withTimeout(
        this.options.processor({
          tenantId: input.tenantId,
          session: cloneSession(session),
          userText: redactedInput,
          context: topicChanged ? [] : session.context.slice(-this.options.contextLimit),
          topicKey: route.topicKey,
          topicChanged,
          intent: route.kind,
          signal: controller.signal,
        }),
        controller,
      );
    } catch {
      generated = handoffTurn(session.id, "SYSTEM_ERROR", "ระบบไม่พร้อมตอบคำถามนี้ในขณะนี้ จึงขอส่งต่อให้เจ้าหน้าที่");
    } finally {
      this.activeControllers.delete(session.id);
    }
    const generatedTurn = "turn" in generated ? generated.turn : generated;
    const providerVerified = "turn" in generated ? generated.providerOutputVerified !== false : true;
    const usage = "turn" in generated ? generated.usage : undefined;
    const currentSession = this.store.getSession(input.tenantId, session.id) ?? session;
    if (currentSession.status === "CANCELLED" || !providerVerified || !isCanonicalTurn(generatedTurn)) {
      return this.complete(input, currentSession, route.topicKey, topicChanged, false, phases, handoffTurn(session.id, "SYSTEM_ERROR", "ระบบไม่สามารถตรวจสอบคำตอบได้ จึงขอส่งต่อให้เจ้าหน้าที่"), {
        now,
        usage,
        ...(currentSession.status === "CANCELLED" ? { statusOverride: "CANCELLED" as const } : {}),
      });
    }
    return this.complete(input, currentSession, route.topicKey, topicChanged, false, phases, generatedTurn, { now, usage });
  }

  cancelSession(tenantId: string, sessionId: string, eventId: string = randomUUID()): ChatSession {
    const session = this.store.getSession(tenantId, sessionId);
    if (!session) throw new ChatConversationError("NOT_FOUND", "chat session was not found");
    session.status = "CANCELLED";
    session.handoffTopicKey = null;
    session.updatedAt = this.now().toISOString();
    this.store.saveSession(session);
    this.activeControllers.get(sessionId)?.abort();
    void this.audit({
      tenantId,
      sessionId,
      eventId,
      action: "CHAT_SESSION_CANCELLED",
      channel: session.channel,
      createdAt: this.now().toISOString(),
    });
    return session;
  }

  async recordFeedback(input: {
    tenantId: string;
    sessionId: string;
    messageId: string;
    value: ChatFeedbackValue;
    comment?: string;
  }): Promise<ChatFeedback> {
    const message = this.store.getMessage(input.tenantId, input.messageId);
    if (!message || message.sessionId !== input.sessionId) throw new ChatConversationError("NOT_FOUND", "chat message was not found");
    const feedback = this.store.saveFeedback({
      id: randomUUID(),
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      value: input.value,
      ...(input.comment ? { commentRedacted: redactSensitiveText(input.comment) } : {}),
      createdAt: this.now().toISOString(),
    });
    await this.audit({
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      eventId: feedback.id,
      action: "CHAT_FEEDBACK_RECORDED",
      channel: "LINE",
      createdAt: feedback.createdAt,
    });
    return feedback;
  }

  private async complete(
    input: ChatInboundEvent,
    session: ChatSession,
    topicKey: string,
    topicChanged: boolean,
    truncatedInput: boolean,
    phases: ChatPhaseEvent[],
    turn: GroundedTurn,
    options: { statusOverride?: ChatSessionStatus; now: Date; usage?: ChatGenerationUsage },
  ): Promise<ChatConversationResponse> {
    const afterHours = this.options.isAfterHours?.({ tenantId: input.tenantId, channel: input.channel, now: options.now }) ?? false;
    let finalTurn = turn;
    let rendered = renderTurnForLine(turn, { afterHours, allowedUrlHosts: this.options.allowedUrlHosts });
    if (!rendered.safe) {
      finalTurn = handoffTurn(session.id, "SECURITY", "ไม่สามารถส่งข้อความนี้ได้อย่างปลอดภัย จึงขอส่งต่อให้เจ้าหน้าที่");
      rendered = renderTurnForLine(finalTurn, { afterHours: false, allowedUrlHosts: this.options.allowedUrlHosts });
    }
    const nextStatus = options.statusOverride ?? (finalTurn.overallOutcome === "HANDOFF" ? "HANDOFF" : "ACTIVE");
    session.status = nextStatus;
    session.topicKey = topicKey;
    session.handoffTopicKey = nextStatus === "HANDOFF" ? topicKey : null;
    session.context = [...session.context, {
      role: "ASSISTANT" as const,
      text: rendered.text,
      topicKey,
      createdAt: options.now.toISOString(),
    }].slice(-this.options.contextLimit);
    session.lastMessageAt = options.now.toISOString();
    session.expiresAt = new Date(options.now.getTime() + this.options.sessionTtlMs).toISOString();
    session.updatedAt = options.now.toISOString();
    session.rowVersion += 1;
    this.store.saveSession(session);
    const result = finalTurn.intentResults[0]!;
    const botMessage = this.store.appendMessage({
      tenantId: input.tenantId,
      sessionId: session.id,
      eventId: input.eventId,
      kind: "BOT",
      contentRedacted: rendered.text,
      outcome: finalTurn.overallOutcome,
      reasonCode: result.reasonCode,
      sourceLabels: rendered.sourceLabels,
      now: options.now,
    });
    const deliveryStatus = await this.dispatchFinal(input, session.id, rendered.text, options.now);
    await this.emitPhase(phases, {
      tenantId: input.tenantId,
      sessionId: session.id,
      eventId: input.eventId,
      phase: "FINAL",
      createdAt: options.now.toISOString(),
      deliveryStatus,
    });
    const usage: ChatUsage = {
      inputCharacters: input.text.length,
      outputCharacters: rendered.text.length,
      providerCalls: options.usage?.providerCalls ?? 0,
      totalTokens: options.usage?.totalTokens ?? 0,
      totalCostCents: options.usage?.totalCostCents ?? 0,
    };
    const response: ChatConversationResponse = {
      requestId: input.requestId ?? randomUUID(),
      correlationId: input.correlationId ?? randomUUID(),
      tenantId: input.tenantId,
      session: cloneSession(session),
      message: botMessage,
      turn: finalTurn,
      text: rendered.text,
      sourceLabels: rendered.sourceLabels,
      phases: phases.map((phase) => ({ ...phase })),
      deliveryStatus,
      duplicate: false,
      afterHours,
      topicChanged,
      truncatedInput,
      usage,
    };
    this.store.saveResponse(response);
    await this.audit({
      tenantId: input.tenantId,
      sessionId: session.id,
      eventId: input.eventId,
      action: "CHAT_TURN_COMPLETED",
      outcome: finalTurn.overallOutcome,
      reasonCode: result.reasonCode,
      channel: input.channel,
      createdAt: options.now.toISOString(),
    });
    return response;
  }

  private async dispatchFinal(
    input: ChatInboundEvent,
    sessionId: string,
    text: string,
    now: Date,
  ): Promise<LineDeliveryStatus | "NOT_CONFIGURED"> {
    if (!this.options.lineDelivery) return "NOT_CONFIGURED";
    try {
      const route = input.replyToken ? "reply" : "push";
      const queued = this.options.lineDelivery.dispatcher.enqueue({
        eventId: randomUUID(),
        tenantId: input.tenantId,
        route,
        recipientId: input.lineUserId,
        ...(input.replyToken ? { replyToken: input.replyToken } : {}),
        idempotencyKey: "chat:" + input.eventId + ":final",
        correlationId: isUuid(input.correlationId ?? "") ? input.correlationId! : randomUUID(),
        text,
      });
      const delivered = await this.options.lineDelivery.dispatcher.dispatch(
        queued.id,
        this.options.lineDelivery.provider,
        now,
      );
      return delivered.status;
    } catch {
      return "FAILED";
    }
  }

  private async emitPhase(phases: ChatPhaseEvent[], event: ChatPhaseEvent): Promise<void> {
    phases.push({ ...event });
    await this.options.onPhase?.({ ...event });
  }

  private async audit(event: ChatAuditEvent): Promise<void> {
    this.store.appendAudit(event);
    await this.options.onAudit?.({ ...event });
  }

  private async withTimeout<T>(promise: Promise<T>, controller: AbortController): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("chat processor timeout"));
      }, this.options.processTimeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private validateInput(input: ChatInboundEvent): void {
    if (!isUuid(input.tenantId)) throw new ChatConversationError("VALIDATION_ERROR", "tenantId is invalid");
    if (!["LINE", "LIFF", "WEB"].includes(input.channel)) throw new ChatConversationError("VALIDATION_ERROR", "channel is invalid");
    if (!input.eventId || input.eventId.length > 128 || CONTROL_PATTERN.test(input.eventId)) throw new ChatConversationError("VALIDATION_ERROR", "eventId is invalid");
    if (!input.text || CONTROL_PATTERN.test(input.text)) throw new ChatConversationError("VALIDATION_ERROR", "chat text is invalid");
    if (!input.lineUserId || CONTROL_PATTERN.test(input.lineUserId)) throw new ChatConversationError("VALIDATION_ERROR", "LINE user identity is invalid");
    if (input.replyToken && CONTROL_PATTERN.test(input.replyToken)) throw new ChatConversationError("VALIDATION_ERROR", "reply token is invalid");
  }

  private now(): Date {
    return this.options.clock();
  }
}
