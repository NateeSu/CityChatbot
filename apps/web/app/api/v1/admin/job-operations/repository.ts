import {
  CORE_RECONCILIATION_JOB_TYPES,
  JobOperationsRepository,
  type JobOperationsSnapshot,
} from "@citychatbot/job-ops";

import { LOCAL_ADMIN_TENANT_ID } from "../../../../admin/admin-access";

export const LOCAL_JOB_OPS_TENANT_ID = LOCAL_ADMIN_TENANT_ID;
export const LOCAL_JOB_OPS_NOW = new Date("2026-08-11T04:00:00.000Z");

const localCorrelation = "77777777-7777-4777-8777-777777777777";

const repository = new JobOperationsRepository();

const seedSuccessful = (jobType: (typeof CORE_RECONCILIATION_JOB_TYPES)[number], index: number): void => {
  const job = repository.enqueue({
    tenantId: LOCAL_JOB_OPS_TENANT_ID,
    jobType,
    idempotencyKey: `${jobType}:local:${index}`,
    payloadRefs: { referenceId: `local-${index}`, revision: index + 1 },
    correlationId: localCorrelation,
    now: new Date(LOCAL_JOB_OPS_NOW.getTime() - (index + 1) * 60_000),
  });
  repository.claim(job.id, `local-worker-${index}`, new Date(LOCAL_JOB_OPS_NOW.getTime() - (index + 1) * 60_000));
  repository.complete(job.id, `local-worker-${index}`, new Date(LOCAL_JOB_OPS_NOW.getTime() - (index + 1) * 60_000 + 2_000));
};

CORE_RECONCILIATION_JOB_TYPES.forEach(seedSuccessful);

const failedNotification = repository.enqueue({
  tenantId: LOCAL_JOB_OPS_TENANT_ID,
  jobType: "notification.dispatch",
  idempotencyKey: "notification.dispatch:local:dead-001",
  payloadRefs: { notificationId: "local-notification-001", channel: "LINE" },
  correlationId: localCorrelation,
  now: new Date(LOCAL_JOB_OPS_NOW.getTime() - 30_000),
});
let failedNotificationAt = new Date(LOCAL_JOB_OPS_NOW.getTime() - 30_000);
for (let attempt = 0; attempt < 5; attempt += 1) {
  repository.claim(failedNotification.id, "local-provider-worker", failedNotificationAt);
  repository.fail(failedNotification.id, "local-provider-worker", { errorCode: "PROVIDER_503", retryable: true, reason: "Provider outage fixture", now: new Date(failedNotificationAt.getTime() + 1_000) });
  failedNotificationAt = new Date(failedNotificationAt.getTime() + [6_000, 31_000, 121_000, 601_000, 1_801_000][attempt]!);
}

export const getLocalJobOperationsSnapshot = (): JobOperationsSnapshot => repository.snapshot(LOCAL_JOB_OPS_TENANT_ID, LOCAL_JOB_OPS_NOW);

export const replayLocalJob = (input: { jobId: string; reason: string; idempotencyKey: string; quarantineApproved?: boolean; accountId: string; role: "TENANT_ADMIN" | "EXECUTIVE" }) => repository.replay({
  tenantId: LOCAL_JOB_OPS_TENANT_ID,
  actor: { accountId: input.accountId, role: input.role },
  jobId: input.jobId,
  reason: input.reason,
  idempotencyKey: input.idempotencyKey,
  ...(input.quarantineApproved !== undefined ? { quarantineApproved: input.quarantineApproved } : {}),
  now: LOCAL_JOB_OPS_NOW,
});

export const localJobOperationsRepository = repository;
