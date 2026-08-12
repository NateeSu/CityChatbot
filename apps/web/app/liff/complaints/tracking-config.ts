export type ComplaintCitizenIdentity = {
  tenantId: string;
  lineUserId: string;
  synthetic: boolean;
};

export type ComplaintRuntimeConfig = {
  tenantName: string;
  intakeQueueId: string | null;
  categories: readonly { id: string; code: string; label: string }[];
  csrfToken: string;
};

export const LOCAL_CITIZEN_IDENTITY: ComplaintCitizenIdentity = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  lineUserId: "U11111111111111111111111111111111",
  synthetic: true,
};

export const PRODUCTION_CITIZEN_IDENTITY: ComplaintCitizenIdentity = {
  tenantId: "",
  lineUserId: "",
  synthetic: false,
};
