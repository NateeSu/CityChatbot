import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { listAdminFaqCandidates, type LocalSupportAdminContext } from "../../api/v1/admin/support-tickets/repository";
import { FaqCandidateQueue } from "./FaqCandidateQueue";
import type { SupportAdminIdentity } from "../support-tickets/SupportTicketInbox";
import { isSyntheticEnvironment, localOperationalIdentity } from "../admin-access";

export const dynamic = "force-dynamic";

const toSupportIdentity = (identity: NonNullable<ReturnType<typeof localOperationalIdentity>>): SupportAdminIdentity => ({
  tenantId: identity.tenantId,
  accountId: identity.accountId,
  role: identity.role as SupportAdminIdentity["role"],
  synthetic: identity.synthetic,
});

export default async function AdminFaqCandidatesPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) {
    return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  if (!isSyntheticEnvironment()) {
    return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }

  const supportIdentity = toSupportIdentity(identity);
  const context: LocalSupportAdminContext = {
    tenantId: supportIdentity.tenantId,
    accountId: supportIdentity.accountId,
    role: supportIdentity.role,
    departmentIds: identity.departmentIds,
  };
  return <FaqCandidateQueue identity={supportIdentity} initialItems={listAdminFaqCandidates(context)} />;
}
