import { describe, expect, it } from "vitest";
import {
  AiGateway,
  AiGatewayError,
  aiRouteFromRegistryRow,
  type AiProvider,
  type AiRoute,
  type ProviderResponse,
  createOpenRouterProvider,
  strictJsonObjectSchema,
} from "./gateway";

type Output = { value: string };

const route: AiRoute = {
  providerId: "openrouter-primary",
  providerKind: "OPENROUTER",
  endpoint: "https://openrouter.example.invalid/api/v1/chat/completions",
  modelId: "synthetic/model",
  modelRevision: "synthetic-revision-1",
  modelStatus: "UNIT_APPROVED",
  privacyProfile: "PUBLIC_SAFE",
  apiKeyEnv: "OPENROUTER_API_KEY",
  inputCostPerMillionTokens: 1,
  outputCostPerMillionTokens: 2,
};

const schema = strictJsonObjectSchema<Output>("synthetic_output", (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("object required");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "value") || typeof record.value !== "string" || record.value.length === 0) throw new Error("strict value required");
  return { value: record.value };
}, {
  type: "object",
  properties: { value: { type: "string" } },
  required: ["value"],
  additionalProperties: false,
});

const success = (value: unknown = { value: "ok" }): ProviderResponse => ({
  status: 200,
  body: { choices: [{ message: { content: JSON.stringify(value) } }] },
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001 },
});

const providerQueue = (queue: Array<ProviderResponse | Error>): AiProvider & { calls: number } => {
  const provider = {
    calls: 0,
    complete: async (): Promise<ProviderResponse> => {
      provider.calls += 1;
      const next = queue.shift();
      if (!next) throw new Error("synthetic provider queue exhausted");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return provider;
};

const request = (overrides: Partial<{ requestId: string; feature: string; messages: Array<{ role: "user"; content: string }>; maxOutputTokens: number }> = {}) => ({
  requestId: overrides.requestId ?? "request-1",
  tenantId: "tenant-a",
  feature: overrides.feature ?? "chat.answer",
  messages: overrides.messages ?? [{ role: "user" as const, content: "hello" }],
  responseSchema: schema,
  ...(overrides.maxOutputTokens === undefined ? {} : { maxOutputTokens: overrides.maxOutputTokens }),
});

describe("AI gateway", () => {
  it("returns only schema-validated output with deterministic trace and safe events", async () => {
    const events: Array<Record<string, unknown>> = [];
    const gateway = new AiGateway({
      route,
      provider: providerQueue([success()]),
      onEvent: (event) => events.push(event),
    });
    const result = await gateway.execute(request());
    expect(result.output).toEqual({ value: "ok" });
    expect(result.trace.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.trace.usage.totalTokens).toBe(15);
    expect(events.some((event) => "rawOutput" in event || "messages" in event)).toBe(false);
  });

  it("repairs once when configured, but never returns unvalidated output", async () => {
    const gateway = new AiGateway({
      route,
      provider: providerQueue([success({ invalid: true })]),
      repair: () => ({ value: "repaired" }),
      policy: { maxRepairAttempts: 1 },
    });
    await expect(gateway.execute(request())).resolves.toMatchObject({ output: { value: "repaired" } });

    const failing = new AiGateway({
      route,
      provider: providerQueue([success({ invalid: true })]),
      repair: () => ({ stillInvalid: true }),
      policy: { maxRepairAttempts: 1 },
    });
    await expect(failing.execute(request())).rejects.toMatchObject({ code: "REPAIR_EXHAUSTED" });
  });

  it("retries rate limits/transient failures with a bounded retry cap", async () => {
    const provider = providerQueue([{ status: 429, body: { error: { code: 429 } } }, success()]);
    const sleeps: number[] = [];
    const gateway = new AiGateway({ route, provider, policy: { maxAttempts: 3, retryBackoffMs: 7 }, sleep: async (ms) => { sleeps.push(ms); } });
    const result = await gateway.execute(request());
    expect(result.trace.attempts).toBe(2);
    expect(provider.calls).toBe(2);
    expect(sleeps).toEqual([7]);

    const capped = providerQueue([
      { status: 503, body: { error: "down" } },
      { status: 503, body: { error: "down" } },
      { status: 503, body: { error: "down" } },
    ]);
    const cappedGateway = new AiGateway({ route, provider: capped, policy: { maxAttempts: 3 }, sleep: async () => undefined });
    await expect(cappedGateway.execute(request())).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(capped.calls).toBe(3);
  });

  it("fails closed on input/output/cost budgets before business output", async () => {
    const provider = providerQueue([success()]);
    const gateway = new AiGateway({ route, provider, policy: { maxInputTokens: 1 } });
    await expect(gateway.execute(request({ messages: [{ role: "user", content: "this input is over the tiny budget" }] }))).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(provider.calls).toBe(0);

    const costly = new AiGateway({ route, provider: providerQueue([{ ...success(), usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 9 } }]), policy: { maxCostUsd: 1 } });
    await expect(costly.execute(request())).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("opens the circuit after bounded transient failures and blocks the next call", async () => {
    const provider = providerQueue([{ status: 503, body: {} }, { status: 503, body: {} }, success()]);
    const gateway = new AiGateway({ route, provider, policy: { maxAttempts: 1, circuitFailureThreshold: 2, circuitCooldownMs: 60_000 }, sleep: async () => undefined });
    await expect(gateway.execute(request({ requestId: "r1" }))).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(gateway.execute(request({ requestId: "r2" }))).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(gateway.execute(request({ requestId: "r3" }))).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(provider.calls).toBe(2);
  });

  it("blocks draft model routes and keeps OpenRouter transport server-side with strict schema payload", async () => {
    expect(() => new AiGateway({ route: { ...route, modelStatus: "DRAFT" }, provider: providerQueue([success()]) })).toThrowError(AiGatewayError);
    let sentHeaders: Headers | undefined;
    let sentBody: Record<string, unknown> | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentHeaders = new Headers(init?.headers);
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ value: "ok" }) } }] }), { status: 200, headers: { "x-request-id": "synthetic-request" } });
    }) as typeof fetch;
    const httpGateway = new AiGateway({ route, provider: createOpenRouterProvider({ env: { OPENROUTER_API_KEY: "synthetic-secret" }, fetchImpl }) });
    const result = await httpGateway.execute(request());
    expect(result.output).toEqual({ value: "ok" });
    expect(sentHeaders?.get("authorization")).toBe("Bearer synthetic-secret");
    const responseFormat = sentBody?.response_format as { type: string; json_schema: { strict: boolean; name: string } };
    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.json_schema.strict).toBe(true);
    expect(responseFormat.json_schema.name).toBe("synthetic_output");
  });

  it("accepts only approved model registry rows as gateway routes", () => {
    expect(aiRouteFromRegistryRow({
      provider_id: "openrouter-primary", provider_kind: "OPENROUTER", endpoint: route.endpoint,
      model_id: route.modelId, model_revision: route.modelRevision, state: "UNIT_APPROVED",
      privacy_profile: "PUBLIC_SAFE", api_key_env: "OPENROUTER_API_KEY",
    })).toMatchObject({ modelStatus: "UNIT_APPROVED", providerId: "openrouter-primary" });
    expect(() => aiRouteFromRegistryRow({
      provider_id: "openrouter-primary", provider_kind: "OPENROUTER", endpoint: route.endpoint,
      model_id: route.modelId, model_revision: route.modelRevision, state: "DRAFT",
      privacy_profile: "PUBLIC_SAFE", api_key_env: "OPENROUTER_API_KEY",
    })).toThrowError(/ROUTE_NOT_APPROVED/);
  });

  it("fails closed on malformed/empty responses and validates request identity", async () => {
    const malformed = new AiGateway({ route, provider: providerQueue([{ status: 200, body: { choices: [{ message: { content: "not-json" } }] } }]) });
    await expect(malformed.execute(request())).rejects.toMatchObject({ code: "MALFORMED_RESPONSE" });
    const empty = new AiGateway({ route, provider: providerQueue([{ status: 200, body: { choices: [{ message: { content: "" } }] } }]) });
    await expect(empty.execute(request())).rejects.toMatchObject({ code: "EMPTY_RESPONSE" });
    await expect(new AiGateway({ route, provider: providerQueue([success()]) }).execute(request({ requestId: "" }))).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
