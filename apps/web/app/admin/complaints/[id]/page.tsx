import Link from "next/link";

import { PermissionDeniedState, FeatureDisabledState } from "../../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../../admin-access";
import { AdminComplaintDetail } from "./AdminComplaintDetail";

export const dynamic = "force-dynamic";

export default async function AdminComplaintDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ role?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams ?? Promise.resolve<{ role?: string }>({})]);
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  return <AdminComplaintDetail complaintId={id} identity={{ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role as "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN", departmentIds: identity.departmentIds, synthetic: identity.synthetic }} />;
}
