import Link from "next/link";

import type { OrganizationActor } from "@citychatbot/org-config";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../admin-access";
import { OrganizationConfigConsole } from "./OrganizationConfigConsole";
import { organizationConfigRepository } from "../../api/v1/admin/organization/repository";
import "./organization.css";

export const dynamic = "force-dynamic";

export default async function OrganizationConfigPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity || (identity.role !== "TENANT_ADMIN" && identity.role !== "DEPARTMENT_HEAD")) return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const actor: OrganizationActor = { tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, departmentIds: identity.departmentIds };
  return <OrganizationConfigConsole identity={identity} initialSnapshot={organizationConfigRepository.snapshot(actor)} />;
}
