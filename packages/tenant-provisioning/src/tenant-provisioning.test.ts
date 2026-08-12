import { describe, expect, it } from "vitest";

import {
  SYNTHETIC_PILOT_TENANT_ID,
  TenantProvisioningError,
  createSyntheticTenantProvisioningRepository,
  type SuperAdminActor,
} from "./tenant-provisioning";

const NOW = new Date("2026-08-11T04:00:00.000Z");
const admin: SuperAdminActor = { accountId: "90000000-0000-4000-8000-000000000001", systemRole: "SUPER_ADMIN", mfaVerified: true, reauthenticatedAt: "2026-08-11T03:59:00.000Z" };
const notSuperAdmin: SuperAdminActor = { accountId: "10000000-0000-4000-8000-000000000003", systemRole: "SUPER_ADMIN", mfaVerified: false, reauthenticatedAt: null };

const expectCode = (operation: () => unknown, code: TenantProvisioningError["code"]): void => {
  try { operation(); throw new Error("expected tenant-provisioning error"); } catch (error) { expect(error).toBeInstanceOf(TenantProvisioningError); expect((error as TenantProvisioningError).code).toBe(code); }
};

describe("tenant provisioning and server-side limits", () => {
  it("provisions a tenant in deterministic steps and replays idempotently", () => {
    const repository = createSyntheticTenantProvisioningRepository();
    const input = { slug: "district-a", displayName: "เทศบาล A", packageCode: "PILOT" as const, isTestTenant: true, reason: "pilot onboarding", idempotencyKey: "tenant-provision-001" };
    const first = repository.provisionTenant(admin, input, NOW);
    const replay = repository.provisionTenant(admin, input, NOW);
    expect(replay).toEqual(first);
    expect(first.tenant.status).toBe("ACTIVE");
    expect(first.tenant.provisioningStatus).toBe("COMPLETE");
    expect(first.run.steps).toHaveLength(9);
    expect(first.run.steps.every((step) => step.status === "SUCCEEDED")).toBe(true);
    expect(repository.listTenants(admin, NOW).some((tenant) => tenant.slug === "district-a")).toBe(true);
  });

  it("pauses safely at a failed step and resumes without duplicating the tenant", () => {
    const repository = createSyntheticTenantProvisioningRepository();
    const first = repository.provisionTenant(admin, { slug: "district-partial", displayName: "เทศบาล Partial", isTestTenant: true, reason: "fault injection test", idempotencyKey: "tenant-partial-001" }, NOW, { failAtStep: "CHANNEL" });
    expect(first.tenant.status).toBe("SUSPENDED");
    expect(first.tenant.provisioningStatus).toBe("PARTIAL");
    expect(first.run.steps.find((step) => step.key === "CHANNEL")?.status).toBe("FAILED");
    const resumed = repository.resumeProvisioning(admin, first.tenant.id, "resume after provider recovery", "tenant-partial-resume-001", NOW);
    expect(resumed.tenant.status).toBe("ACTIVE");
    expect(resumed.run.status).toBe("COMPLETE");
    expect(resumed.run.steps.find((step) => step.key === "CHANNEL")?.attempt).toBe(2);
    expect(repository.listTenants(admin, NOW).filter((tenant) => tenant.slug === "district-partial")).toHaveLength(1);
  });

  it("keeps feature flags and usage limits server-enforced and tenant-scoped", () => {
    const repository = createSyntheticTenantProvisioningRepository();
    expectCode(() => repository.setFeatureFlag(notSuperAdmin, SYNTHETIC_PILOT_TENANT_ID, { key: "ai_chat_enabled", enabled: true, reason: "no step-up", idempotencyKey: "flag-deny-001" }, NOW), "FORBIDDEN");
    expectCode(() => repository.assertFeatureEnabled(SYNTHETIC_PILOT_TENANT_ID, "ai_chat_enabled", NOW), "FEATURE_DISABLED");
    const enabled = repository.setFeatureFlag(admin, SYNTHETIC_PILOT_TENANT_ID, { key: "ai_chat_enabled", enabled: true, reason: "certified feature", idempotencyKey: "flag-enable-001" }, NOW);
    expect(enabled.enabled).toBe(true);
    expect(() => repository.assertFeatureEnabled(SYNTHETIC_PILOT_TENANT_ID, "ai_chat_enabled", NOW)).not.toThrow();
    const limit = repository.setUsageLimit(admin, SYNTHETIC_PILOT_TENANT_ID, { key: "ai_runs_monthly", window: "MONTH", limit: 1, reason: "pilot limit", idempotencyKey: "limit-ai-001" }, NOW);
    expect(limit.limit).toBe(1);
    repository.consumeUsage(SYNTHETIC_PILOT_TENANT_ID, "ai_runs_monthly", 1, "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", NOW);
    expectCode(() => repository.consumeUsage(SYNTHETIC_PILOT_TENANT_ID, "ai_runs_monthly", 1, "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", NOW), "USAGE_LIMIT_EXCEEDED");
  });

  it("suspends/reactivates only complete tenants and archives only verified test targets", () => {
    const repository = createSyntheticTenantProvisioningRepository();
    const current = repository.getTenant(admin, SYNTHETIC_PILOT_TENANT_ID, NOW);
    const suspended = repository.suspendTenant(admin, current.id, current.rowVersion, "maintenance", "tenant-suspend-001", NOW);
    expect(suspended.status).toBe("SUSPENDED");
    expectCode(() => repository.assertFeatureEnabled(SYNTHETIC_PILOT_TENANT_ID, "ai_chat_enabled", NOW), "FEATURE_DISABLED");
    const active = repository.reactivateTenant(admin, current.id, suspended.rowVersion, "maintenance complete", "tenant-reactivate-001", NOW);
    expect(active.status).toBe("ACTIVE");
    expectCode(() => repository.archiveTestTenant(admin, current.id, active.rowVersion, "wrong", "archive", "tenant-archive-wrong-001", NOW), "TEST_TARGET_REQUIRED");
    const archived = repository.archiveTestTenant(admin, current.id, active.rowVersion, "citychatbot-pilot", "archive verified pilot", "tenant-archive-001", NOW);
    expect(archived.status).toBe("ARCHIVED");
    expectCode(() => repository.reactivateTenant(admin, current.id, archived.rowVersion, "should not reactivate", "tenant-reactivate-002", NOW), "INVALID_STATE");
  });
});
