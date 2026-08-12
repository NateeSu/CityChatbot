import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../admin-access";
import { SupportTicketInbox, type SupportAdminIdentity } from "./SupportTicketInbox";

export const dynamic = "force-dynamic";

const toSupportIdentity = (identity: NonNullable<ReturnType<typeof localOperationalIdentity>>): SupportAdminIdentity => ({
  tenantId: identity.tenantId,
  accountId: identity.accountId,
  role: identity.role as SupportAdminIdentity["role"],
  synthetic: identity.synthetic,
});

export default async function AdminSupportTicketsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) {
    return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  if (!isSyntheticEnvironment()) {
    return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  return <SupportTicketInbox identity={toSupportIdentity(identity)} />;
}
