import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../ui/states";
import { localIdentityForRole, parseAdminRole } from "../../admin-access";
import { RichMenuBuilder, type RichMenuAdminIdentity } from "./RichMenuBuilder";

export const dynamic = "force-dynamic";

const toRichMenuIdentity = (identity: NonNullable<ReturnType<typeof localIdentityForRole>>): RichMenuAdminIdentity => ({
  tenantId: identity.tenantId,
  accountId: identity.accountId,
  role: "TENANT_ADMIN",
  synthetic: identity.synthetic,
});

export default async function RichMenuSettingsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const role = parseAdminRole(query.role ?? "TENANT_ADMIN");
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (role !== "TENANT_ADMIN") {
    return <main className="rm-disabled-page"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  if (environment !== "local" && environment !== "test") {
    return <main className="rm-disabled-page"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  const identity = localIdentityForRole(role);
  return identity ? <RichMenuBuilder identity={toRichMenuIdentity(identity)} /> : <main className="rm-disabled-page"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
}
