import Link from "next/link";

import type { ServiceActor } from "@citychatbot/services";

import { FeatureDisabledState, PermissionDeniedState } from "../../../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../../../admin-access";
import { ServiceConsole } from "../../ServiceConsole";
import { servicesRepository } from "../../../../api/v1/admin/services/repository";
import "../../services.css";

export const dynamic = "force-dynamic";

export default async function ServiceEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  const serviceRole = identity && (identity.role === "PR_STAFF" || identity.role === "TENANT_ADMIN" || identity.role === "DEPARTMENT_HEAD") ? identity.role : undefined;
  if (!identity || !serviceRole) return <main className="shell"><PermissionDeniedState action={<Link href="/admin/services">กลับรายการบริการ</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin/services">กลับรายการบริการ</Link>} /></main>;
  const actor: ServiceActor = { tenantId: identity.tenantId, accountId: identity.accountId, role: serviceRole, departmentIds: identity.departmentIds };
  return <ServiceConsole identity={identity} initialSnapshot={servicesRepository.snapshot(actor)} selectedId={(await params).id} />;
}
