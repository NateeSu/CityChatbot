import type { NewsActor } from "@citychatbot/news";

import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID } from "../complaints/repository";

export const LOCAL_NEWS_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const isNewsLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localNewsContext = (url: URL): NewsActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_NEWS_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) return { tenantId: LOCAL_NEWS_TENANT_ID, accountId, role };
  if (role === "PR_STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_NEWS_TENANT_ID, accountId, role };
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_NEWS_TENANT_ID, accountId, role };
  return undefined;
};

export const localCitizenNewsContext = (url: URL): NewsActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_NEWS_TENANT_ID || url.searchParams.get("lineUserId") !== "U11111111111111111111111111111111") return undefined;
  return { tenantId: LOCAL_NEWS_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000002", role: "STAFF" };
};
