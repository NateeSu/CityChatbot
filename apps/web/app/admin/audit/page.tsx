import Link from "next/link";

import type { AuditOperationsActor } from "@citychatbot/audit-observability";
import type { SloDashboard } from "@citychatbot/slo";
import type { JobOperationsSnapshot } from "@citychatbot/job-ops";
import type { IncidentSnapshot } from "@citychatbot/incident-ops";

import { PermissionDeniedState, FeatureDisabledState } from "../../ui/states";
import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../admin-access";
import { AuditConsole } from "./AuditConsole";
import { auditOperationsRepository } from "../../api/v1/admin/audit-operations/repository";
import { getLocalSloDashboard } from "../../api/v1/admin/slo/repository";
import { getLocalJobOperationsSnapshot } from "../../api/v1/admin/job-operations/repository";
import { getLocalIncidentSnapshot } from "../../api/v1/admin/incident-operations/repository";
import "./audit.css";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const role = parseAdminRole(query.role ?? "TENANT_ADMIN");
  const identity = role === "TENANT_ADMIN" || role === "EXECUTIVE" ? localIdentityForRole(role) : undefined;
  if (!identity || !["TENANT_ADMIN", "EXECUTIVE"].includes(identity.role)) return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const actor: AuditOperationsActor = { tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, mfaVerified: true };
  const initialSloSnapshot: SloDashboard = getLocalSloDashboard();
  const initialJobSnapshot: JobOperationsSnapshot = getLocalJobOperationsSnapshot();
  const initialIncidentSnapshot: IncidentSnapshot = getLocalIncidentSnapshot();
  return <AuditConsole identity={identity} initialSnapshot={auditOperationsRepository.snapshot(actor)} initialSloSnapshot={initialSloSnapshot} initialJobSnapshot={initialJobSnapshot} initialIncidentSnapshot={initialIncidentSnapshot} />;
}
