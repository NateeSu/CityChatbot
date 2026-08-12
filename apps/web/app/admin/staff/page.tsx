import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../admin-access";
import { StaffConsole } from "./StaffConsole";
import { userManagementRepository } from "../../api/v1/admin/staff/repository";
import "./staff.css";

export const dynamic = "force-dynamic";

export default async function StaffManagementPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity || identity.role !== "TENANT_ADMIN") return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const actor = { tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role, departmentIds: identity.departmentIds, mfaVerified: true, reauthenticatedAt: new Date().toISOString() } as const;
  return <StaffConsole identity={identity} initialSnapshot={userManagementRepository.snapshot(actor)} />;
}
