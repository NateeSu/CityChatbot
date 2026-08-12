import { describe, expect, it } from "vitest";

import { OperationsHandoffRegistry, REQUIRED_PRODUCTION_KEYS, type HandoffAsset, type HandoffConfigContract, type HandoffDocument, type HandoffRunbook } from "./operations-handoff";

const FILES = ["docs/operations/p9-kt-001.md", "docs/operations/production-asset-inventory.json", "docs/operations/p9-line-chat-runbook.md"];
const DOCUMENTS: HandoffDocument[] = [
  { id: "ops-guide", path: FILES[0]!, version: "2026.08.13", owner: "SYSTEM_UNIT_GATE", required: true, links: ["p9-line-chat-runbook.md", "production-asset-inventory.json"] },
  { id: "asset-inventory", path: FILES[1]!, version: "2026.08.13", owner: "SYSTEM_UNIT_GATE", required: true, links: [] },
  { id: "line-runbook", path: FILES[2]!, version: "2026.08.13", owner: "SYSTEM_UNIT_GATE", required: true, links: ["p9-kt-001.md"] },
];
const RUNBOOKS: HandoffRunbook[] = [{ id: "line-runtime", owner: "SYSTEM_UNIT_GATE", steps: [{ id: "verify", command: "pnpm test:unit", rollbackCommand: "disable feature flag and redeploy last-known-good" }] }];
const ASSETS: HandoffAsset[] = [
  { id: "db-prod", category: "DATABASE", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "supabase:qiaklpfojbdajpskmjze", secretRef: false },
  { id: "hosting-prod", category: "HOSTING", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "vercel:city-chatbot", secretRef: false },
  { id: "line-prod", category: "LINE_CHANNEL", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "line:dedicated-pilot-channel", secretRef: false },
  { id: "webhook-prod", category: "WEBHOOK", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "vercel:/api/v1/line/webhooks/webhook-key", secretRef: false },
  { id: "migration-prod", category: "MIGRATION", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "file:supabase/migrations/20260813010000_line_chat_runtime.sql", secretRef: false },
  { id: "rollback-prod", category: "ROLLBACK", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "git:main:last-known-good", secretRef: false },
  { id: "observability-prod", category: "OBSERVABILITY", environment: "production", owner: "SYSTEM_UNIT_GATE", reference: "vercel:runtime-logs", secretRef: false },
];
const CONFIG: HandoffConfigContract = { environment: "production", configuredKeys: [...REQUIRED_PRODUCTION_KEYS], secretReferences: { DATABASE_URL: "env:DATABASE_URL", TENANT_CREDENTIAL_KEY: "vault:TENANT_CREDENTIAL_KEY", TENANT_CREDENTIAL_KEY_VERSION: "env:TENANT_CREDENTIAL_KEY_VERSION", LINE_WEBHOOK_HASH_SECRET: "vault:LINE_WEBHOOK_HASH_SECRET", LINE_USER_HASH_SECRET: "vault:LINE_USER_HASH_SECRET", LINE_WORKER_SECRET: "vault:LINE_WORKER_SECRET" }, featureDefaults: { ai_chat_enabled: false } };

describe("P9-KT-001 operations handoff", () => {
  it("validates docs, runbook, inventory and fail-closed config as one contract", () => {
    const registry = new OperationsHandoffRegistry();
    expect(registry.assertComplete({ repositoryFiles: FILES, documents: DOCUMENTS, runbooks: RUNBOOKS, assets: ASSETS, config: CONFIG }).status).toBe("COMPLETE");
  });

  it("rejects broken documentation links and missing rollback steps", () => {
    const registry = new OperationsHandoffRegistry();
    const result = registry.validate({ repositoryFiles: FILES, documents: [{ ...DOCUMENTS[0]!, links: ["missing.md"] }], runbooks: [{ ...RUNBOOKS[0]!, steps: [{ id: "verify", command: "pnpm test:unit", rollbackCommand: "" }] }], assets: ASSETS, config: CONFIG });
    expect(result.status).toBe("INCOMPLETE");
    expect(result.errors).toEqual(expect.arrayContaining(["DOCUMENT_LINK_MISSING:ops-guide:missing.md", "RUNBOOK_ROLLBACK_MISSING:line-runtime:verify"]));
  });

  it("rejects secret literals, incomplete inventory and unsafe config", () => {
    const registry = new OperationsHandoffRegistry();
    const result = registry.validate({ repositoryFiles: FILES, documents: DOCUMENTS, runbooks: [{ ...RUNBOOKS[0]!, steps: [{ id: "verify", command: "echo secret=x", rollbackCommand: "rm -rf /" }] }], assets: ASSETS.filter((asset) => asset.category !== "ROLLBACK"), config: { ...CONFIG, featureDefaults: { ai_chat_enabled: true }, secretReferences: { ...CONFIG.secretReferences, LINE_WORKER_SECRET: "literal-secret" } } });
    expect(result.status).toBe("INCOMPLETE");
    expect(result.errors).toEqual(expect.arrayContaining(["RUNBOOK_SECRET_LITERAL:line-runtime:verify", "RUNBOOK_DESTRUCTIVE_COMMAND:line-runtime:verify", "ASSET_CATEGORY_MISSING:ROLLBACK", "CONFIG_AI_CHAT_MUST_DEFAULT_OFF"]));
  });
});
