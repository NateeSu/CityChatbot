import type { BotSettingsActor } from "@citychatbot/bot-settings";

import {
  LOCAL_ADMIN_ACCOUNT_ID,
  LOCAL_STAFF_ACCOUNT_ID,
} from "../complaints/repository";

export const LOCAL_BOT_SETTINGS_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_KNOWLEDGE_ACCOUNT_ID = "10000000-0000-4000-8000-000000000005";

export const isBotSettingsLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localBotSettingsContext = (url: URL): BotSettingsActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_BOT_SETTINGS_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) return { tenantId: LOCAL_BOT_SETTINGS_TENANT_ID, accountId, role };
  if (role === "KNOWLEDGE_STAFF" && accountId === LOCAL_KNOWLEDGE_ACCOUNT_ID) return { tenantId: LOCAL_BOT_SETTINGS_TENANT_ID, accountId, role };
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_BOT_SETTINGS_TENANT_ID, accountId, role };
  return undefined;
};
