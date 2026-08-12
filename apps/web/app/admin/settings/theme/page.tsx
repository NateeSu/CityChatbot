import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../ui/states";
import { localIdentityForRole, parseAdminRole, isSyntheticEnvironment } from "../../admin-access";
import { themeSettingsRepository } from "../../../api/v1/admin/theme-versions/repository";
import { ThemeSettingsConsole } from "./ThemeSettingsConsole";
import type { ThemeSettingsActor } from "@citychatbot/theme-settings";
import "./theme-settings.css";

export const dynamic = "force-dynamic";

export default async function ThemeSettingsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const role = parseAdminRole(query.role ?? "TENANT_ADMIN");
  if (role !== "TENANT_ADMIN") return <main className="theme-settings-page"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="theme-settings-page"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const identity = localIdentityForRole(role);
  if (!identity) return <main className="theme-settings-page"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const actor: ThemeSettingsActor = { tenantId: identity.tenantId, accountId: identity.accountId, role: "TENANT_ADMIN" };
  return <ThemeSettingsConsole identity={identity} initialSnapshot={themeSettingsRepository.snapshot(actor)} />;
}
