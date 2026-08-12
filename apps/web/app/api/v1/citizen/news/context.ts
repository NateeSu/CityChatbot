export const LOCAL_CITIZEN_NEWS_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const isCitizenNewsLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};
