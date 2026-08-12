import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../ui/states";
import { isTenantSystemLocalEnvironment, localSystemContext } from "../../../api/v1/system/tenants/context";
import { tenantProvisioningRepository } from "../../../api/v1/system/tenants/repository";
import { SystemTenantConsole } from "../SystemTenantConsole";
import "../system.css";

export const dynamic = "force-dynamic";

export default async function SystemTenantNewPage() {
  if (!isTenantSystemLocalEnvironment()) return <main className="system-shell"><FeatureDisabledState action={<Link href="/">กลับหน้าเริ่มต้น</Link>} /></main>;
  const identity = localSystemContext(new URL("http://localhost/?systemRole=SUPER_ADMIN&accountId=90000000-0000-4000-8000-000000000001&stepUp=1"));
  if (!identity) return <main className="system-shell"><PermissionDeniedState action={<Link href="/">กลับหน้าเริ่มต้น</Link>} /></main>;
  return <SystemTenantConsole initialSnapshot={tenantProvisioningRepository.snapshot(identity)} mode="new" />;
}
