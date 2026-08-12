import type { ThemeSettingsActor } from "@citychatbot/theme-settings";

import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID } from "../complaints/repository";

export const LOCAL_THEME_SETTINGS_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const isThemeSettingsLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localThemeSettingsContext = (url: URL): ThemeSettingsActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_THEME_SETTINGS_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) return { tenantId: LOCAL_THEME_SETTINGS_TENANT_ID, accountId, role };
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_THEME_SETTINGS_TENANT_ID, accountId, role };
  return undefined;
};
