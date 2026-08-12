import type { NewsActor } from "@citychatbot/news";

import { newsRepository } from "../../api/v1/admin/news/repository";
import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../admin-access";
import type { AdminIdentity } from "../admin-navigation";

export type NewsAdminIdentity = AdminIdentity & { role: "PR_STAFF" | "TENANT_ADMIN" };

export function resolveNewsAdminIdentity(value: unknown): NewsAdminIdentity | undefined {
  const role = parseAdminRole(value);
  if (role !== "PR_STAFF" && role !== "TENANT_ADMIN") return undefined;
  const identity = localIdentityForRole(role);
  return identity ? { ...identity, role } : undefined;
}

export function newsActor(identity: NewsAdminIdentity): NewsActor {
  return { tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role };
}

export { isSyntheticEnvironment, newsRepository };
