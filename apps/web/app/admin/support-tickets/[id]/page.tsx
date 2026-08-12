import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../ui/states";
import { isSyntheticEnvironment, localOperationalIdentity } from "../../admin-access";
import { SupportTicketDetail } from "./SupportTicketDetail";
import type { SupportAdminIdentity } from "../SupportTicketInbox";

export const dynamic = "force-dynamic";

export default async function AdminSupportTicketDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ role?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams ?? Promise.resolve<{ role?: string }>({})]);
  const identity = localOperationalIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const supportIdentity: SupportAdminIdentity = { tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role as SupportAdminIdentity["role"], synthetic: identity.synthetic };
  return <SupportTicketDetail identity={supportIdentity} ticketId={id} />;
}
