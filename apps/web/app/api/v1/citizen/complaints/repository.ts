import { ComplaintRecoveryService, InMemoryComplaintRepository } from "@citychatbot/complaints";

export const LOCAL_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_QUEUE_ID = "34000000-0000-4000-8000-000000000001";
export const LOCAL_LINE_USER_ID = "U11111111111111111111111111111111";

export const complaintRepository = new InMemoryComplaintRepository({
  prefixForTenant: () => "CCM",
  departmentPublicNameForId: () => undefined,
});

export const complaintRecoveryService = new ComplaintRecoveryService({
  repository: complaintRepository,
  defaultIntakeQueueForTenant: (tenantId) => tenantId === LOCAL_TENANT_ID ? LOCAL_QUEUE_ID : undefined,
});

export const isLocalSyntheticEnvironment = (): boolean => ["local", "test"].includes(process.env.CITYCHATBOT_ENV ?? "local");

export const hasLocalCitizenIdentity = (request: Request): boolean => {
  const url = new URL(request.url);
  return url.searchParams.get("tenantId") === LOCAL_TENANT_ID && url.searchParams.get("lineUserId") === LOCAL_LINE_USER_ID;
};

export const hasLocalComplaintIdentity = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.tenantId === LOCAL_TENANT_ID && record.lineUserId === LOCAL_LINE_USER_ID;
};
