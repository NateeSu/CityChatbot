import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../ui/states";
import { localIdentityForRole, parseAdminRole, isSyntheticEnvironment } from "../../admin-access";
import { botSettingsRepository } from "../../../api/v1/admin/bot-settings/repository";
import { BotSettingsConsole } from "./BotSettingsConsole";
import type { BotSettingsActor } from "@citychatbot/bot-settings";
import "./bot-settings.css";

export const dynamic = "force-dynamic";

export default async function BotSettingsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const role = parseAdminRole(query.role ?? "TENANT_ADMIN");
  if (role !== "TENANT_ADMIN") return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="shell"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const identity = localIdentityForRole(role);
  if (!identity) return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  const actor: BotSettingsActor = { tenantId: identity.tenantId, accountId: identity.accountId, role: "TENANT_ADMIN" };
  return <BotSettingsConsole identity={identity} initialSnapshot={botSettingsRepository.snapshot(actor)} />;
}
