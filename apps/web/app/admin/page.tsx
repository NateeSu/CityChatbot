import Link from "next/link";

import { PermissionDeniedState } from "../ui/states";
import { AdminDashboard } from "./AdminDashboard";
import { dashboardIdentity, parseAdminRole } from "./admin-access";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  if (query.role && !parseAdminRole(query.role)) {
    return <main className="shell"><PermissionDeniedState action={<Link className="admin-dashboard-button admin-dashboard-button--secondary" href="/admin">กลับหน้าภาพรวม</Link>} /></main>;
  }
  return <AdminDashboard identity={dashboardIdentity(query.role)} />;
}
