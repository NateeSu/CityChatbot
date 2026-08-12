import {
  createRateLimitKey,
  InMemoryRateLimiter,
  type RateLimitPolicy,
  type RateLimitResult,
} from "./rate-limit";

export type PromptSegmentKind =
  | "SYSTEM_POLICY"
  | "TENANT_POLICY"
  | "EVIDENCE"
  | "USER_QUERY"
  | "METADATA";

export type PromptSegment = {
  kind: PromptSegmentKind;
  content: string;
  trusted: boolean;
  tenantId?: string;
  sourceId?: string;
};

export type PromptInjectionFindingCode =
  | "OVERRIDE_POLICY"
  | "SYSTEM_PROMPT_EXTRACTION"
  | "TOOL_ACTION"
  | "ENCODED_INSTRUCTION"
  | "EXFILTRATION"
  | "CROSS_TENANT";

export type PromptInjectionFinding = {
  code: PromptInjectionFindingCode;
  severity: "low" | "medium" | "high";
  segmentKind?: PromptSegmentKind;
  sourceId?: string;
  evidence: string;
  index: number;
};

export type PromptScanResult = {
  blocked: boolean;
  findings: PromptInjectionFinding[];
};

export type PromptEnvelopeInput = {
  tenantId: string;
  systemPolicy: string;
  tenantPolicy?: string;
  evidence: readonly {
    content: string;
    sourceId?: string;
    tenantId?: string;
  }[];
  userQuery: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type PromptEnvelope = {
  tenantId: string;
  segments: PromptSegment[];
  serialized: string;
};

export type PromptGuardResult = {
  allowed: boolean;
  reasonCode: "SECURITY" | null;
  findings: PromptInjectionFinding[];
  envelope: PromptEnvelope;
};

export type ToolAuthorizationInput = {
  tenantId: string;
  actorId: string;
  toolName: string;
  targetTenantId?: string;
  requestedAction?: string;
  allowedTools: readonly string[];
  serverAuthorize?: (input: ToolAuthorizationInput) => boolean | Promise<boolean>;
};

export type ToolAuthorizationResult = {
  allowed: boolean;
  reasonCode: "ALLOWED" | "NOT_ALLOWLISTED" | "TENANT_MISMATCH" | "SERVER_DENIED";
};

export type SensitiveTextOptions = {
  allowlistedPhones?: readonly string[];
};

export type OutputSafetyFindingCode =
  | "DANGEROUS_MARKUP"
  | "UNSAFE_URL"
  | "MARKDOWN_LINK_BLOCKED"
  | "SENSITIVE_DATA_REDACTED";

export type OutputSafetyFinding = {
  code: OutputSafetyFindingCode;
  detail: string;
};

export type OutputSafetyOptions = SensitiveTextOptions & {
  allowedUrlHosts?: readonly string[];
  allowMarkdownLinks?: boolean;
};

export type OutputSafetyResult = {
  safe: boolean;
  text: string;
  findings: OutputSafetyFinding[];
};

const HIGH_RISK_CODES = new Set<PromptInjectionFindingCode>([
  "OVERRIDE_POLICY",
  "SYSTEM_PROMPT_EXTRACTION",
  "TOOL_ACTION",
  "ENCODED_INSTRUCTION",
  "EXFILTRATION",
  "CROSS_TENANT",
]);

const PROMPT_RULES: readonly {
  code: PromptInjectionFindingCode;
  severity: PromptInjectionFinding["severity"];
  pattern: RegExp;
}[] = [
  {
    code: "OVERRIDE_POLICY",
    severity: "high",
    pattern:
      /(?:ignore|disregard|forget|override|bypass|replace)\b[\s\S]{0,100}\b(?:previous|prior|system|developer|policy|instruction|คำสั่ง|นโยบาย)\b|(?:ละเว้น|ข้าม|ลืมคำสั่ง|แทนที่|ไม่ต้องทำตาม|ฝ่าฝืน)/i,
  },
  {
    code: "SYSTEM_PROMPT_EXTRACTION",
    severity: "high",
    pattern:
      /(?:reveal|show|print|repeat|dump|expose|แสดง|เปิดเผย|บอก)\b[\s\S]{0,100}\b(?:system prompt|developer message|hidden prompt|secret|api key|token|password|chain of thought|internal reasoning|พรอมต์ระบบ|คีย์|รหัสผ่าน|เหตุผลภายใน)\b/i,
  },
  {
    code: "TOOL_ACTION",
    severity: "high",
    pattern:
      /(?:call|invoke|execute|run|use|เรียก|รัน|ใช้|ส่ง|ลบ|แก้ไข|โอน)\b[\s\S]{0,100}\b(?:tool|function|webhook|sql|shell|browser|email|delete|update|transfer|เครื่องมือ|ฟังก์ชัน|ฐานข้อมูล)\b/i,
  },
  {
    code: "ENCODED_INSTRUCTION",
    severity: "high",
    pattern:
      /(?:base64|base-64|rot13|decode|encoded instruction|ถอดรหัส|ข้อความเข้ารหัส|คำสั่งที่เข้ารหัส)|[A-Za-z0-9+/]{48,}={0,2}/i,
  },
  {
    code: "EXFILTRATION",
    severity: "high",
    pattern:
      /(?:exfiltrate|exfiltration|steal|leak|dump|send|post|upload|forward|share|ขโมย|รั่วไหล|ส่งต่อ|อัปโหลด)\b[\s\S]{0,120}\b(?:data|secret|token|password|pii|personal|private|another tenant|external|outside|system prompt|ข้อมูล|ความลับ|ส่วนบุคคล|ผู้เช่าอื่น|ภายนอก)\b/i,
  },
];

const DELIMITER_PREFIX = "<<<CITYCHATBOT_";
const delimiterOpen = (kind: PromptSegmentKind): string => DELIMITER_PREFIX + kind + "_START>>>";
const delimiterClose = (kind: PromptSegmentKind): string => DELIMITER_PREFIX + kind + "_END>>>";

const escapeDelimiterMarkers = (value: string): string =>
  value.replaceAll(DELIMITER_PREFIX, "<<<CITYCHATBOT_ESCAPED_");

const excerpt = (text: string, index: number): string =>
  text.slice(Math.max(0, index - 32), Math.min(text.length, index + 160)).replace(/\s+/g, " ").trim();

const findingKey = (finding: PromptInjectionFinding): string =>
  [finding.code, finding.segmentKind ?? "", finding.sourceId ?? "", finding.index].join("|");

const scanSegment = (
  text: string,
  segmentKind?: PromptSegmentKind,
  sourceId?: string,
): PromptInjectionFinding[] => {
  const findings: PromptInjectionFinding[] = [];
  for (const rule of PROMPT_RULES) {
    const match = rule.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    findings.push({
      code: rule.code,
      severity: rule.severity,
      segmentKind,
      sourceId,
      evidence: excerpt(text, match.index),
      index: match.index,
    });
  }
  return findings;
};

export const scanPromptInjection = (text: string): PromptScanResult => {
  if (typeof text !== "string" || text.length === 0) return { blocked: false, findings: [] };
  const findings = scanSegment(text);
  const unique = [...new Map(findings.map((finding) => [findingKey(finding), finding])).values()];
  return {
    blocked: unique.some((finding) => HIGH_RISK_CODES.has(finding.code)),
    findings: unique,
  };
};

const metadataText = (
  metadata: Readonly<Record<string, string | number | boolean>> | undefined,
): string => {
  if (!metadata) return "";
  return Object.keys(metadata)
    .sort()
    .map((key) => key + "=" + redactSensitiveText(String(metadata[key])))
    .join("\n");
};

const renderSegment = (segment: PromptSegment): string => {
  const trust = segment.trusted ? "TRUSTED_POLICY" : "UNTRUSTED_DATA";
  const source = segment.sourceId ? "\nSOURCE_ID=" + segment.sourceId : "";
  return [
    delimiterOpen(segment.kind),
    "TRUST_LEVEL=" + trust + source,
    escapeDelimiterMarkers(segment.content),
    delimiterClose(segment.kind),
  ].join("\n");
};

export const buildPromptEnvelope = (input: PromptEnvelopeInput): PromptEnvelope => {
  if (!input.tenantId.trim()) throw new Error("tenantId is required");
  if (!input.systemPolicy.trim()) throw new Error("systemPolicy is required");
  const segments: PromptSegment[] = [
    {
      kind: "SYSTEM_POLICY",
      content: input.systemPolicy,
      trusted: true,
      tenantId: input.tenantId,
    },
  ];
  if (input.tenantPolicy?.trim()) {
    segments.push({
      kind: "TENANT_POLICY",
      content: input.tenantPolicy,
      trusted: true,
      tenantId: input.tenantId,
    });
  }
  for (const evidence of input.evidence) {
    segments.push({
      kind: "EVIDENCE",
      content: evidence.content,
      trusted: false,
      tenantId: evidence.tenantId,
      sourceId: evidence.sourceId,
    });
  }
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    segments.push({
      kind: "METADATA",
      content: metadataText(input.metadata),
      trusted: false,
      tenantId: input.tenantId,
    });
  }
  segments.push({
    kind: "USER_QUERY",
    content: input.userQuery,
    trusted: false,
    tenantId: input.tenantId,
  });
  return {
    tenantId: input.tenantId,
    segments,
    serialized: segments.map(renderSegment).join("\n\n"),
  };
};

export const guardPromptContext = (envelope: PromptEnvelope): PromptGuardResult => {
  if (!envelope.tenantId.trim()) throw new Error("tenantId is required");
  const findings: PromptInjectionFinding[] = [];
  for (const segment of envelope.segments) {
    findings.push(...scanSegment(segment.content, segment.kind, segment.sourceId));
    if (segment.tenantId && segment.tenantId !== envelope.tenantId) {
      findings.push({
        code: "CROSS_TENANT",
        severity: "high",
        segmentKind: segment.kind,
        sourceId: segment.sourceId,
        evidence: "tenant boundary mismatch",
        index: 0,
      });
    }
  }
  const unique = [...new Map(findings.map((finding) => [findingKey(finding), finding])).values()];
  const blocked = unique.some((finding) => finding.severity === "high" || HIGH_RISK_CODES.has(finding.code));
  return {
    allowed: !blocked,
    reasonCode: blocked ? "SECURITY" : null,
    findings: unique,
    envelope,
  };
};

export const authorizeToolAction = async (
  input: ToolAuthorizationInput,
): Promise<ToolAuthorizationResult> => {
  if (input.targetTenantId && input.targetTenantId !== input.tenantId) {
    return { allowed: false, reasonCode: "TENANT_MISMATCH" };
  }
  if (!input.tenantId.trim() || !input.actorId.trim() || !input.toolName.trim()) {
    return { allowed: false, reasonCode: "SERVER_DENIED" };
  }
  if (!input.allowedTools.includes(input.toolName)) {
    return { allowed: false, reasonCode: "NOT_ALLOWLISTED" };
  }
  if (!input.serverAuthorize) {
    return { allowed: false, reasonCode: "SERVER_DENIED" };
  }
  try {
    const authorized = await input.serverAuthorize(input);
    return authorized
      ? { allowed: true, reasonCode: "ALLOWED" }
      : { allowed: false, reasonCode: "SERVER_DENIED" };
  } catch {
    return { allowed: false, reasonCode: "SERVER_DENIED" };
  }
};

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

const normalizePhone = (value: string): string => {
  const digits = digitsOnly(value);
  return digits.startsWith("66") ? "0" + digits.slice(2) : digits;
};

const isAllowlistedPhone = (value: string, options: SensitiveTextOptions): boolean => {
  const normalized = normalizePhone(value);
  return (options.allowlistedPhones ?? []).some((phone) => normalizePhone(phone) === normalized);
};

export const redactSensitiveText = (text: string, options: SensitiveTextOptions = {}): string => {
  let result = text;
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED_TOKEN]");
  result = result.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g, "[REDACTED_TOKEN]");
  result = result.replace(
    /\b(?:api[_ -]?key|secret|password|passwd|token|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*[^\s,;]+/gi,
    "[REDACTED_SECRET]",
  );
  result = result.replace(/\b\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d\b/g, "[REDACTED_PERSONAL_ID]");
  result = result.replace(
    /(?:\+66|0)[ -]?(?:6|8|9)\d{1,2}[ -]?\d{3}[ -]?\d{4}\b/g,
    (match) => (isAllowlistedPhone(match, options) ? match : "[REDACTED_PHONE]"),
  );
  result = result.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    "[REDACTED_EMAIL]",
  );
  return result;
};

const URL_PATTERN = /\b(?:https?|javascript|data|vbscript):[^\s<>"')\]]+/gi;
const MARKDOWN_LINK_PATTERN = /\[([^\]]{0,240})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const DANGEROUS_HTML_PATTERN =
  /<\s*(?:script|iframe|object|embed|style|form|svg|math|base|link|meta)\b[^>]*>/i;

const hostAllowed = (host: string, allowedHosts: readonly string[]): boolean => {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\.$/, "");
    return normalizedHost === normalizedAllowed || normalizedHost.endsWith("." + normalizedAllowed);
  });
};

const urlIsSafe = (value: string, allowedHosts: readonly string[]): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    return allowedHosts.length > 0 && hostAllowed(url.hostname, allowedHosts);
  } catch {
    return false;
  }
};

export const sanitizeAiOutput = (
  text: string,
  options: OutputSafetyOptions = {},
): OutputSafetyResult => {
  const findings: OutputSafetyFinding[] = [];
  let safeText = text;
  if (DANGEROUS_HTML_PATTERN.test(safeText)) {
    findings.push({ code: "DANGEROUS_MARKUP", detail: "active HTML markup was removed" });
  } else if (HTML_TAG_PATTERN.test(safeText)) {
    findings.push({ code: "DANGEROUS_MARKUP", detail: "raw HTML was removed" });
  }
  HTML_TAG_PATTERN.lastIndex = 0;
  safeText = safeText.replace(HTML_TAG_PATTERN, "");

  safeText = safeText.replace(URL_PATTERN, (url) => {
    if (urlIsSafe(url, options.allowedUrlHosts ?? [])) return url;
    findings.push({ code: "UNSAFE_URL", detail: "URL scheme or host is not allowed" });
    return "[ลิงก์ถูกบล็อก]";
  });

  if (!options.allowMarkdownLinks) {
    const hadMarkdown = MARKDOWN_LINK_PATTERN.test(safeText);
    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    if (hadMarkdown) {
      findings.push({ code: "MARKDOWN_LINK_BLOCKED", detail: "markdown links are disabled by default" });
      safeText = safeText.replace(MARKDOWN_LINK_PATTERN, "$1");
    }
  }

  const redacted = redactSensitiveText(safeText, options);
  if (redacted !== safeText) {
    findings.push({ code: "SENSITIVE_DATA_REDACTED", detail: "secret or PII was redacted" });
    safeText = redacted;
  }
  return {
    safe: findings.length === 0,
    text: safeText,
    findings,
  };
};

export type AiAbuseRequest = {
  tenantId?: string;
  actorId?: string;
  ipHash?: string;
  feature: string;
  cost?: number;
};

export class AiAbuseGuard {
  private readonly limiter: InMemoryRateLimiter;

  constructor(
    readonly policy: RateLimitPolicy,
    limiter = new InMemoryRateLimiter(policy),
  ) {
    this.limiter = limiter;
  }

  consume(request: AiAbuseRequest, now?: number): RateLimitResult {
    const key = createRateLimitKey(request);
    return this.limiter.consume(key, request.cost ?? 1, now);
  }

  clear(request?: AiAbuseRequest): void {
    if (!request) {
      this.limiter.clear();
      return;
    }
    this.limiter.clear(createRateLimitKey(request));
  }
}

export const DEFAULT_AI_ABUSE_POLICY: RateLimitPolicy = {
  capacity: 30,
  refillPerSecond: 0.5,
};

export const createAiAbuseGuard = (
  policy: RateLimitPolicy = DEFAULT_AI_ABUSE_POLICY,
): AiAbuseGuard => new AiAbuseGuard(policy);
