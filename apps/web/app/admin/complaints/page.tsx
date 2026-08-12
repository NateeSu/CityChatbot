import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { AdminComplaintInbox, type AdminIdentity } from "./AdminComplaintInbox";
import { isSyntheticEnvironment, localOperationalIdentity } from "../admin-access";

export const dynamic = "force-dynamic";

const toComplaintIdentity = (identity: NonNullable<ReturnType<typeof localOperationalIdentity>>): AdminIdentity => ({
  tenantId: identity.tenantId,
  accountId: identity.accountId,
  role: identity.role as AdminIdentity["role"],
  departmentIds: identity.departmentIds,
  synthetic: identity.synthetic,
});

export default async function AdminComplaintsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) {
    return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  if (!isSyntheticEnvironment()) {
    return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  return <AdminComplaintInbox identity={toComplaintIdentity(identity)} />;
}
