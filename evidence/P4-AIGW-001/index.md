# P4-AIGW-001 Evidence

Status: DONE (2026-08-11, auto-approved under `SPEC-MVP-001` after L1 unit tests green)

## Requirements and scope

- Requirements: `RF-08`, `RF-13`, `RF-15`, `RF-17`.
- Prerequisite verified: `P1-OBS-001` and the approved-route boundary are present.
- Gateway is the only provider boundary used by the package; provider credentials are read at server execution time from an environment variable name and are never persisted, returned or logged.

## Changed files

- `packages/ai-gateway/package.json`, `packages/ai-gateway/tsconfig.json` — server-side workspace package.
- `packages/ai-gateway/src/gateway.ts` — route validation, deterministic config hash, centralized timeout/retry, strict JSON-schema output validation/repair cap, token/context/cost budgets, per-feature circuit breaker, safe events/traces, OpenRouter transport and registry-row mapping.
- `packages/ai-gateway/src/gateway.test.ts` — 8 L1 tests covering success, validation/repair, retry/429/5xx, budget fail-closed, circuit open, draft-route rejection, OpenRouter request shape and malformed/empty input.
- `package.json` — package typecheck inclusion.
- `supabase/migrations/20260810090000_ai_model_registry_schema.sql` — tenant-scoped provider/model/revision registry with approval status, privacy profile, structured-output capability, forced RLS, immutable approved routes and lifecycle functions.
- `scripts/test_ai_model_registry_schema.py` — static registry contract.
- `supabase/tests/ai_model_registry_schema_contract.sql` — PostgreSQL registry/RLS/function/index contract.

## Verification commands and actual results

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/ai-gateway/src/gateway.test.ts` | PASS, 8/8 |
| `pnpm exec tsc -p packages/ai-gateway/tsconfig.json --noEmit` | PASS |
| `python -m unittest scripts.test_ai_model_registry_schema -v` | PASS, 5/5 |
| Apply `20260810090000_ai_model_registry_schema.sql` with `psql -v ON_ERROR_STOP=1` | PASS; re-apply also PASS/idempotent |
| Apply `supabase/tests/ai_model_registry_schema_contract.sql` with `psql -v ON_ERROR_STOP=1` | PASS, `AI_MODEL_REGISTRY_SQL_CONTRACT_PASS` |
| Synthetic tenant-admin route approval transaction | PASS: `DRAFT → UNIT_APPROVED`, tenant B visibility `0`; transaction rolled back |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm test:all` | PASS; 26 files, 174/174 unit tests, 63/63 static tests, lint, typecheck, build, secret scan |
| `pnpm security:sbom` | PASS; 95 components, digest `0aece6f8590eb6baa12fb3ae3308fa7b1d209a626a654022d1f089f12468b97a` |
| `pnpm release:manifest; pnpm release:verify` | PASS; digest `c84e8b842224e51e9ee6c037b900914d856af52f5cf8eb6d8b73a3433f86a33d` |

## Acceptance criteria

- Provider/model route is selected from an approved registry row; `DRAFT` routes fail before any provider call.
- OpenRouter transport is server-only, sends bearer auth from external environment configuration, uses non-streaming structured output and strict `response_format.json_schema`, and does not expose the key in traces.
- Timeout, network, 429 and 5xx failures use a bounded centralized retry policy; authentication, malformed, empty and schema failures do not retry as provider failures.
- Invalid structured output is repaired at most the configured cap and is validated again; otherwise the gateway returns an error and no machine-consumable output.
- Input/output/total token and cost budgets fail closed before or after provider execution.
- Circuit breaker is scoped by provider/model revision/feature, opens after the configured transient failure threshold and blocks subsequent calls during cooldown.
- Event/trace payloads contain request/tenant/feature/route/version/attempt/latency/usage only; raw prompt, raw output, provider body and secrets are excluded.
- Registry has tenant ownership, forced RLS, approved/effective read policy, composite-safe tenant boundary and immutable approved route configuration.

## API example

```ts
const gateway = new AiGateway({
  route: aiRouteFromRegistryRow(activeRegistryRow),
  provider: createOpenRouterProvider({ env: process.env }),
  policy: activeGatewayPolicy,
  onEvent: telemetrySink,
});

const result = await gateway.execute({
  requestId, tenantId, feature: "chat.answer", messages, responseSchema,
});
```

The OpenRouter request uses the documented `response_format: { type: "json_schema", json_schema: { strict: true, ... } }` shape; see [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

## Rollback procedure

1. Disable the AI feature flag or route traffic to deterministic retrieval/manual handoff.
2. Retain gateway traces and the failed model/policy revision for audit; never delete them as a rollback mechanism.
3. Switch to the previous approved registry route/model revision and previous gateway policy/config hash.
4. If a credential exposure is suspected, revoke/rotate the external environment secret without placing it in the repository or logs.
5. Re-run gateway unit, schema contract and synthetic provider failure tests before re-enabling traffic.

## Known limitations

- No production provider call or credential was used; the OpenRouter transport is covered by a deterministic mock and current wire-shape contract.
- Model certification, privacy/DPA/provider routing approval and production cost/latency calibration remain external/post-production decisions (`OD-003`, `OD-011`).
- Durable AI run/audit persistence and grounded answer/citation policy are delivered by later P4-CHAT/P4-QA tasks; the gateway only guarantees the provider boundary and validated output.

