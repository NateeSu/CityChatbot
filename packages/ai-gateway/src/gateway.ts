import { createHash } from "node:crypto";

export type JsonObject = Record<string, unknown>;

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiModelStatus = "DRAFT" | "UNIT_APPROVED" | "CERTIFIED";
export type AiPrivacyProfile = "PUBLIC_SAFE" | "CONFIDENTIAL_REDACTED";

export type AiRoute = {
  providerId: string;
  providerKind: "OPENROUTER" | "CUSTOM";
  endpoint: string;
  modelId: string;
  modelRevision: string;
  modelStatus: AiModelStatus;
  privacyProfile: AiPrivacyProfile;
  apiKeyEnv?: string;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
};

export type AiModelRegistryRouteRow = {
  provider_id: string;
  provider_kind: string;
  endpoint: string;
  model_id: string;
  model_revision: string;
  state: string;
  privacy_profile: string;
  api_key_env: string;
  config_json?: unknown;
};

export type StructuredOutputSchema<T> = {
  name: string;
  jsonSchema?: JsonObject;
  parse(value: unknown): T;
};

export type GatewayPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  maxRepairAttempts: number;
  retryBackoffMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  maxCostUsd: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
};

export const DEFAULT_GATEWAY_POLICY: Readonly<GatewayPolicy> = Object.freeze({
  timeoutMs: 15_000,
  maxAttempts: 3,
  maxRepairAttempts: 1,
  retryBackoffMs: 100,
  maxInputTokens: 6_000,
  maxOutputTokens: 1_000,
  maxTotalTokens: 7_000,
  maxCostUsd: 0.50,
  circuitFailureThreshold: 3,
  circuitCooldownMs: 5_000,
});

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
};

export type ProviderCall = {
  requestId: string;
  route: AiRoute;
  messages: readonly AiMessage[];
  maxOutputTokens: number;
  responseSchema?: StructuredOutputSchema<unknown>;
  signal: AbortSignal;
  configHash: string;
};

export type ProviderResponse = {
  status: number;
  body: unknown;
  usage?: Partial<TokenUsage>;
  providerRequestId?: string;
};

export interface AiProvider {
  complete(call: ProviderCall): Promise<ProviderResponse>;
}

export type AiGatewayRequest<T> = {
  requestId: string;
  tenantId: string;
  feature: string;
  messages: readonly AiMessage[];
  responseSchema: StructuredOutputSchema<T>;
  maxOutputTokens?: number;
};

export type AiGatewayEvent = {
  type: "attempt" | "success" | "failure" | "circuit_open";
  requestId: string;
  tenantId: string;
  feature: string;
  providerId: string;
  modelRevision: string;
  attempt: number;
  durationMs: number;
  errorCode?: AiGatewayErrorCode;
  usage?: TokenUsage;
  circuitState: "CLOSED" | "OPEN" | "HALF_OPEN";
};

export type AiGatewayTrace = {
  requestId: string;
  tenantId: string;
  feature: string;
  providerId: string;
  modelId: string;
  modelRevision: string;
  configHash: string;
  attempts: number;
  latencyMs: number;
  usage: TokenUsage;
};

export type AiGatewayResult<T> = {
  output: T;
  trace: AiGatewayTrace;
};

export type AiGatewayErrorCode =
  | "INVALID_REQUEST"
  | "ROUTE_NOT_APPROVED"
  | "BUDGET_EXCEEDED"
  | "CIRCUIT_OPEN"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "AUTHENTICATION_FAILED"
  | "EMPTY_RESPONSE"
  | "MALFORMED_RESPONSE"
  | "SCHEMA_INVALID"
  | "REPAIR_EXHAUSTED";

export class AiGatewayError extends Error {
  constructor(
    public readonly code: AiGatewayErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(`${code}: ${message}`);
    this.name = "AiGatewayError";
  }
}

export type RepairContext = {
  requestId: string;
  feature: string;
  rawOutput: unknown;
  validationError: string;
  attempt: number;
};

export type AiGatewayConfig = {
  route: AiRoute;
  provider: AiProvider;
  policy?: Partial<GatewayPolicy>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  repair?: (context: RepairContext) => unknown | Promise<unknown>;
  onEvent?: (event: AiGatewayEvent) => void;
};

type CircuitState = {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  openedAt: number;
  probeInFlight: boolean;
};

const isRecord = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
const estimateTokens = (value: string): number => Math.max(1, Math.ceil(Array.from(value).length / 4));
const stableHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clamp = (value: number, lower: number, upper: number): number => Math.max(lower, Math.min(upper, value));

const validatePolicy = (input: Partial<GatewayPolicy> | undefined): GatewayPolicy => {
  const policy = { ...DEFAULT_GATEWAY_POLICY, ...input };
  for (const field of [
    "timeoutMs", "maxAttempts", "maxRepairAttempts", "retryBackoffMs", "maxInputTokens", "maxOutputTokens",
    "maxTotalTokens", "circuitFailureThreshold", "circuitCooldownMs",
  ] as const) {
    if (!Number.isInteger(policy[field]) || policy[field] < 0) throw new AiGatewayError("INVALID_REQUEST", `${field} must be a non-negative integer`);
  }
  if (policy.maxAttempts < 1 || policy.maxInputTokens < 1 || policy.maxOutputTokens < 1 || policy.maxTotalTokens < policy.maxOutputTokens) {
    throw new AiGatewayError("INVALID_REQUEST", "gateway token/attempt policy is invalid");
  }
  if (!Number.isFinite(policy.maxCostUsd) || policy.maxCostUsd < 0) throw new AiGatewayError("INVALID_REQUEST", "maxCostUsd is invalid");
  return policy;
};

const validateRoute = (route: AiRoute): void => {
  if (!route.providerId || !route.modelId || !route.modelRevision) throw new AiGatewayError("INVALID_REQUEST", "route identity is required");
  if (route.modelStatus === "DRAFT") throw new AiGatewayError("ROUTE_NOT_APPROVED", "model route is not approved");
  if (route.privacyProfile !== "PUBLIC_SAFE" && route.privacyProfile !== "CONFIDENTIAL_REDACTED") {
    throw new AiGatewayError("INVALID_REQUEST", "route privacy profile is invalid");
  }
  let endpoint: URL;
  try { endpoint = new URL(route.endpoint); } catch { throw new AiGatewayError("INVALID_REQUEST", "route endpoint is invalid"); }
  if (endpoint.protocol !== "https:") throw new AiGatewayError("INVALID_REQUEST", "provider endpoint must use HTTPS");
  for (const cost of [route.inputCostPerMillionTokens, route.outputCostPerMillionTokens]) {
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) throw new AiGatewayError("INVALID_REQUEST", "route cost is invalid");
  }
};

const normalizeProviderError = (error: unknown): AiGatewayError => {
  if (error instanceof AiGatewayError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new AiGatewayError("TIMEOUT", "provider request timed out", true);
  if (error instanceof Error && error.name === "AbortError") return new AiGatewayError("TIMEOUT", "provider request timed out", true);
  return new AiGatewayError("PROVIDER_ERROR", "provider request failed", true);
};

const providerErrorFromStatus = (status: number): AiGatewayError => {
  if (status === 401 || status === 403) return new AiGatewayError("AUTHENTICATION_FAILED", "provider authentication failed", false, status);
  if (status === 429) return new AiGatewayError("RATE_LIMITED", "provider rate limit reached", true, status);
  if (status >= 500) return new AiGatewayError("PROVIDER_ERROR", "provider returned a server error", true, status);
  return new AiGatewayError("PROVIDER_ERROR", "provider rejected the request", false, status);
};

const extractResponseContent = (body: unknown): unknown => {
  if (!isRecord(body)) return body;
  const choices = body.choices;
  if (Array.isArray(choices) && choices.length > 0 && isRecord(choices[0])) {
    const message = choices[0].message;
    if (isRecord(message)) return message.content;
  }
  const output = body.output;
  if (Array.isArray(output)) {
    const textParts = output.flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return [];
      return item.content.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []);
    });
    if (textParts.length > 0) return textParts.join("");
  }
  return body.output_text ?? body.content ?? body;
};

const parseJsonContent = (value: unknown): unknown => {
  if (value === null || value === undefined || value === "") throw new AiGatewayError("EMPTY_RESPONSE", "provider returned no structured content", false);
  if (typeof value !== "string") return value;
  try { return JSON.parse(value) as unknown; } catch { throw new AiGatewayError("MALFORMED_RESPONSE", "provider content is not valid JSON", false); }
};

const usageFrom = (response: ProviderResponse, inputTokens: number, output: unknown, route: AiRoute): TokenUsage => {
  const outputEstimate = estimateTokens(JSON.stringify(output));
  const input = Math.max(0, Math.floor(response.usage?.inputTokens ?? inputTokens));
  const completion = Math.max(0, Math.floor(response.usage?.outputTokens ?? outputEstimate));
  const total = Math.max(input + completion, Math.floor(response.usage?.totalTokens ?? input + completion));
  const calculatedCost = (input / 1_000_000) * (route.inputCostPerMillionTokens ?? 0)
    + (completion / 1_000_000) * (route.outputCostPerMillionTokens ?? 0);
  return {
    inputTokens: input,
    outputTokens: completion,
    totalTokens: total,
    costUsd: Math.max(0, response.usage?.costUsd ?? calculatedCost),
  };
};

class CircuitBreaker {
  private state: CircuitState = { state: "CLOSED", failures: 0, openedAt: 0, probeInFlight: false };

  constructor(private readonly threshold: number, private readonly cooldownMs: number) {}

  beforeRequest(now: number): "CLOSED" | "HALF_OPEN" {
    if (this.state.state === "OPEN") {
      if (now - this.state.openedAt < this.cooldownMs) throw new AiGatewayError("CIRCUIT_OPEN", "AI provider circuit is open", false);
      if (this.state.probeInFlight) throw new AiGatewayError("CIRCUIT_OPEN", "AI provider circuit half-open probe is busy", false);
      this.state.state = "HALF_OPEN";
      this.state.probeInFlight = true;
      return "HALF_OPEN";
    }
    if (this.state.state === "HALF_OPEN") {
      if (this.state.probeInFlight) throw new AiGatewayError("CIRCUIT_OPEN", "AI provider circuit half-open probe is busy", false);
      this.state.probeInFlight = true;
      return "HALF_OPEN";
    }
    return "CLOSED";
  }

  success(): void {
    this.state = { state: "CLOSED", failures: 0, openedAt: 0, probeInFlight: false };
  }

  failure(now: number): void {
    this.state.probeInFlight = false;
    this.state.failures += 1;
    if (this.state.failures >= this.threshold) {
      this.state.state = "OPEN";
      this.state.openedAt = now;
    }
  }

  releaseProbe(): void { this.state.probeInFlight = false; }
  snapshot(): CircuitState["state"] { return this.state.state; }
}

export class AiGateway {
  private readonly policy: GatewayPolicy;
  private readonly configHash: string;
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly config: AiGatewayConfig) {
    validateRoute(config.route);
    this.policy = validatePolicy(config.policy);
    this.now = config.now ?? (() => Date.now());
    this.sleep = config.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.configHash = stableHash({
      route: { ...config.route, apiKeyEnv: config.route.apiKeyEnv ?? null },
      policy: this.policy,
    });
  }

  get configurationHash(): string { return this.configHash; }

  async execute<T>(request: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    this.validateRequest(request);
    const inputTokens = request.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    if (inputTokens > this.policy.maxInputTokens) throw new AiGatewayError("BUDGET_EXCEEDED", "input token budget exceeded", false);
    if (inputTokens > this.policy.maxTotalTokens) throw new AiGatewayError("BUDGET_EXCEEDED", "total token budget exceeded before provider call", false);
    const breaker = this.breakerFor(request.feature);
    let circuitState: "CLOSED" | "HALF_OPEN";
    try {
      circuitState = breaker.beforeRequest(this.now());
    } catch (error) {
      const normalized = normalizeProviderError(error);
      this.emit({ type: "circuit_open", request, attempt: 0, durationMs: 0, errorCode: normalized.code, circuitState: "OPEN" });
      throw normalized;
    }
    let lastError: AiGatewayError | undefined;
    const startedAt = this.now();
    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt += 1) {
      const attemptStarted = this.now();
      this.emit({ type: "attempt", request, attempt, durationMs: 0, circuitState });
      try {
        const response = await this.callProvider(request, inputTokens);
        const raw = parseJsonContent(extractResponseContent(response.body));
        const output = await this.validateOrRepair(raw, request, attempt);
        const usage = usageFrom(response, inputTokens, output, this.config.route);
        this.assertBudget(usage, request.maxOutputTokens ?? this.policy.maxOutputTokens);
        breaker.success();
        this.emit({ type: "success", request, attempt, durationMs: this.now() - attemptStarted, usage, circuitState: breaker.snapshot() });
        return {
          output,
          trace: {
            requestId: request.requestId,
            tenantId: request.tenantId,
            feature: request.feature,
            providerId: this.config.route.providerId,
            modelId: this.config.route.modelId,
            modelRevision: this.config.route.modelRevision,
            configHash: this.configHash,
            attempts: attempt,
            latencyMs: this.now() - startedAt,
            usage,
          },
        };
      } catch (error) {
        const normalized = normalizeProviderError(error);
        lastError = normalized;
        this.emit({ type: "failure", request, attempt, durationMs: this.now() - attemptStarted, errorCode: normalized.code, circuitState });
        if (!normalized.retryable || attempt >= this.policy.maxAttempts) {
          if (normalized.retryable) breaker.failure(this.now()); else breaker.releaseProbe();
          throw normalized;
        }
        await this.sleep(this.policy.retryBackoffMs * 2 ** (attempt - 1));
      }
    }
    breaker.failure(this.now());
    throw lastError ?? new AiGatewayError("PROVIDER_ERROR", "AI provider failed", true);
  }

  private validateRequest<T>(request: AiGatewayRequest<T>): void {
    if (!request.requestId || !request.tenantId || !request.feature) throw new AiGatewayError("INVALID_REQUEST", "request identity is required");
    if (request.messages.length === 0 || request.messages.some((message) => !message.content || message.content.length > 50_000)) {
      throw new AiGatewayError("INVALID_REQUEST", "messages are invalid");
    }
    if (!request.responseSchema.name || !request.responseSchema.parse) throw new AiGatewayError("INVALID_REQUEST", "strict response schema is required");
    if (request.maxOutputTokens !== undefined && (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > this.policy.maxOutputTokens)) {
      throw new AiGatewayError("BUDGET_EXCEEDED", "requested output budget is invalid", false);
    }
  }

  private async callProvider<T>(request: AiGatewayRequest<T>, inputTokens: number): Promise<ProviderResponse> {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const providerPromise = this.config.provider.complete({
        requestId: request.requestId,
        route: this.config.route,
        messages: request.messages,
        maxOutputTokens: request.maxOutputTokens ?? this.policy.maxOutputTokens,
        responseSchema: request.responseSchema as StructuredOutputSchema<unknown>,
        signal: controller.signal,
        configHash: this.configHash,
      });
      const timeoutPromise = new Promise<ProviderResponse>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new AiGatewayError("TIMEOUT", "provider request timed out", true));
        }, this.policy.timeoutMs);
      });
      const response = await Promise.race([providerPromise, timeoutPromise]);
      if (response.status < 200 || response.status >= 300) throw providerErrorFromStatus(response.status);
      if (!isRecord(response.body) && response.body !== null && response.body !== undefined) return response;
      if (isRecord(response.body) && response.body.error) throw providerErrorFromStatus(response.status >= 400 ? response.status : 502);
      return response;
    } catch (error) {
      if (timedOut) throw new AiGatewayError("TIMEOUT", "provider request timed out", true);
      throw normalizeProviderError(error);
    } finally {
      if (timeout) clearTimeout(timeout);
      void inputTokens;
    }
  }

  private async validateOrRepair<T>(raw: unknown, request: AiGatewayRequest<T>, attempt: number): Promise<T> {
    try { return request.responseSchema.parse(raw); } catch (error) {
      const validationError = error instanceof Error ? error.message : "schema validation failed";
      if (!this.config.repair || this.policy.maxRepairAttempts === 0) throw new AiGatewayError("SCHEMA_INVALID", "structured output failed schema validation", false);
      let candidate: unknown = raw;
      for (let repairAttempt = 1; repairAttempt <= this.policy.maxRepairAttempts; repairAttempt += 1) {
        try {
          candidate = await this.config.repair({ requestId: request.requestId, feature: request.feature, rawOutput: candidate, validationError, attempt: repairAttempt });
          return request.responseSchema.parse(candidate);
        } catch {
          if (repairAttempt === this.policy.maxRepairAttempts) throw new AiGatewayError("REPAIR_EXHAUSTED", "structured output repair cap exhausted", false);
        }
      }
      throw new AiGatewayError("SCHEMA_INVALID", "structured output failed schema validation", false);
    }
  }

  private assertBudget(usage: TokenUsage, requestedOutputTokens: number): void {
    if (usage.inputTokens > this.policy.maxInputTokens || usage.outputTokens > requestedOutputTokens || usage.totalTokens > this.policy.maxTotalTokens || usage.costUsd > this.policy.maxCostUsd) {
      throw new AiGatewayError("BUDGET_EXCEEDED", "AI budget exceeded", false);
    }
  }

  private breakerFor(feature: string): CircuitBreaker {
    const key = `${this.config.route.providerId}:${this.config.route.modelRevision}:${feature}`;
    const existing = this.breakers.get(key);
    if (existing) return existing;
    const created = new CircuitBreaker(this.policy.circuitFailureThreshold, this.policy.circuitCooldownMs);
    this.breakers.set(key, created);
    return created;
  }

  private emit(input: { type: AiGatewayEvent["type"]; request: AiGatewayRequest<unknown>; attempt: number; durationMs: number; errorCode?: AiGatewayErrorCode; usage?: TokenUsage; circuitState: AiGatewayEvent["circuitState"] }): void {
    this.config.onEvent?.({
      type: input.type,
      requestId: input.request.requestId,
      tenantId: input.request.tenantId,
      feature: input.request.feature,
      providerId: this.config.route.providerId,
      modelRevision: this.config.route.modelRevision,
      attempt: input.attempt,
      durationMs: input.durationMs,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.usage ? { usage: input.usage } : {}),
      circuitState: input.circuitState,
    });
  }
}

export const createOpenRouterProvider = (options: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch }): AiProvider => ({
  async complete(call): Promise<ProviderResponse> {
    if (typeof window !== "undefined") throw new AiGatewayError("INVALID_REQUEST", "AI provider calls are server-only");
    const apiKeyEnv = call.route.apiKeyEnv ?? "OPENROUTER_API_KEY";
    const apiKey = options.env?.[apiKeyEnv] ?? (typeof process !== "undefined" ? process.env[apiKeyEnv] : undefined);
    if (!apiKey) throw new AiGatewayError("AUTHENTICATION_FAILED", "provider credential is not configured", false);
    const fetchImpl = options.fetchImpl ?? fetch;
    const schema = call.responseSchema?.jsonSchema ? {
      type: "json_schema",
      json_schema: { name: call.responseSchema.name, strict: true, schema: call.responseSchema.jsonSchema },
    } : undefined;
    const response = await fetchImpl(call.route.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: call.route.modelId,
        messages: call.messages,
        max_tokens: call.maxOutputTokens,
        stream: false,
        ...(schema ? { response_format: schema } : {}),
      }),
      signal: call.signal,
    });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    const responseRecord = isRecord(body) ? body : undefined;
    const usageRecord = responseRecord && isRecord(responseRecord.usage) ? responseRecord.usage : undefined;
    return {
      status: response.status,
      body,
      providerRequestId: response.headers.get("x-request-id") ?? response.headers.get("x-generation-id") ?? undefined,
      usage: usageRecord ? {
        inputTokens: typeof usageRecord.prompt_tokens === "number" ? usageRecord.prompt_tokens : typeof usageRecord.input_tokens === "number" ? usageRecord.input_tokens : undefined,
        outputTokens: typeof usageRecord.completion_tokens === "number" ? usageRecord.completion_tokens : typeof usageRecord.output_tokens === "number" ? usageRecord.output_tokens : undefined,
        totalTokens: typeof usageRecord.total_tokens === "number" ? usageRecord.total_tokens : undefined,
        costUsd: typeof usageRecord.cost === "number" ? usageRecord.cost : undefined,
      } : undefined,
    };
  },
});

export const strictJsonObjectSchema = <T>(name: string, parse: (value: unknown) => T, jsonSchema?: JsonObject): StructuredOutputSchema<T> => ({ name, parse, jsonSchema });

export const aiRouteFromRegistryRow = (row: AiModelRegistryRouteRow): AiRoute => {
  if (row.provider_kind !== "OPENROUTER" && row.provider_kind !== "CUSTOM") throw new AiGatewayError("INVALID_REQUEST", "registry provider kind is invalid");
  if (row.state !== "UNIT_APPROVED" && row.state !== "CERTIFIED") throw new AiGatewayError("ROUTE_NOT_APPROVED", "registry model route is not approved");
  if (row.privacy_profile !== "PUBLIC_SAFE" && row.privacy_profile !== "CONFIDENTIAL_REDACTED") throw new AiGatewayError("INVALID_REQUEST", "registry privacy profile is invalid");
  return {
    providerId: row.provider_id,
    providerKind: row.provider_kind,
    endpoint: row.endpoint,
    modelId: row.model_id,
    modelRevision: row.model_revision,
    modelStatus: row.state,
    privacyProfile: row.privacy_profile,
    apiKeyEnv: row.api_key_env,
  };
};

export const gatewayConfigHash = (route: AiRoute, policy: Partial<GatewayPolicy> = {}): string => stableHash({ route, policy: validatePolicy(policy) });

export const safeCost = (value: number): number => clamp(Number.isFinite(value) ? value : 0, 0, Number.MAX_SAFE_INTEGER);
