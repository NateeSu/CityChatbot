import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../../../ui/states";
import { NewsConsole } from "../../NewsConsole";
import { isSyntheticEnvironment, newsActor, newsRepository, resolveNewsAdminIdentity } from "../../page-context";
import "../../news.css";

export const dynamic = "force-dynamic";

export default async function NewsEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const identity = resolveNewsAdminIdentity(query.role ?? "TENANT_ADMIN");
  if (!identity) return <main className="news-admin-page"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  if (!isSyntheticEnvironment()) return <main className="news-admin-page"><FeatureDisabledState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  return <NewsConsole identity={identity} initialPostId={(await params).id} initialSnapshot={newsRepository.snapshot(newsActor(identity))} />;
}
