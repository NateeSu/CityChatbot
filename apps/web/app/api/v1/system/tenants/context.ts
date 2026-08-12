import type { SuperAdminActor } from "@citychatbot/tenant-provisioning";

import { SYSTEM_TENANT_ADMIN_ACCOUNT_ID } from "@citychatbot/tenant-provisioning";

export const isTenantSystemLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localSystemContext = (url: URL): SuperAdminActor | undefined => {
  if (url.searchParams.get("systemRole") !== "SUPER_ADMIN" || url.searchParams.get("accountId") !== SYSTEM_TENANT_ADMIN_ACCOUNT_ID) return undefined;
  const steppedUp = url.searchParams.get("stepUp") !== "0";
  return { accountId: SYSTEM_TENANT_ADMIN_ACCOUNT_ID, systemRole: "SUPER_ADMIN", mfaVerified: steppedUp, reauthenticatedAt: steppedUp ? new Date().toISOString() : null };
};
