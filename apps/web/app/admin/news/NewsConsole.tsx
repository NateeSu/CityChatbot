"use client";

import type { AdminIdentity } from "../admin-navigation";
import type { NewsCategory, NewsPost, NewsSnapshot, NewsState } from "@citychatbot/news";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "../AdminShell";
import { ConflictState, EmptyState, ErrorState, ExpiredSessionState, FeatureDisabledState, LoadingState, OfflineState, PermissionDeniedState, StaleState } from "../../ui/states";

type NewsConsoleProps = { identity: AdminIdentity & { role: "PR_STAFF" | "TENANT_ADMIN" }; initialSnapshot: NewsSnapshot; initialPostId?: string };
type NewsError = { reasonCode: string; message: string };
type DraftForm = { slug: string; title: string; excerpt: string; bodyHtml: string; categoryId: string; tags: string; effectiveFrom: string; expiresAt: string; aiDraft: boolean; attachmentStorageKey: string; attachmentContentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; attachmentSizeBytes: string; attachmentWidth: string; attachmentHeight: string; attachmentSha256: string; attachmentAltText: string };

const stateLabel: Record<NewsState, string> = { DRAFT: "ฉบับร่าง", IN_REVIEW: "รอตรวจสอบ", APPROVED: "อนุมัติแล้ว", SCHEDULED: "ตั้งเวลาแล้ว", PUBLISHED: "เผยแพร่แล้ว", ARCHIVED: "เก็บถาวร" };
const stateTone = (state: NewsState): string => state === "PUBLISHED" ? "published" : state === "DRAFT" ? "draft" : state === "ARCHIVED" ? "archived" : "review";
const emptyForm = (category?: NewsCategory): DraftForm => ({ slug: "", title: "", excerpt: "", bodyHtml: "", categoryId: category?.id ?? "", tags: "", effectiveFrom: "", expiresAt: "", aiDraft: false, attachmentStorageKey: "", attachmentContentType: "image/png", attachmentSizeBytes: "", attachmentWidth: "", attachmentHeight: "", attachmentSha256: "", attachmentAltText: "" });
const localDateValue = (value?: string): string => value ? new Date(value).toISOString().slice(0, 16) : "";
const formFromPost = (post: NewsPost): DraftForm => { const attachment = post.currentRevision.attachments[0]; return { slug: post.slug, title: post.currentRevision.title, excerpt: post.currentRevision.excerpt, bodyHtml: post.currentRevision.bodyHtml, categoryId: post.currentRevision.categoryIds[0] ?? "", tags: post.currentRevision.tags.join(", "), effectiveFrom: localDateValue(post.currentRevision.effectiveFrom), expiresAt: localDateValue(post.currentRevision.expiresAt), aiDraft: post.currentRevision.aiDraft, attachmentStorageKey: attachment?.storageKey ?? "", attachmentContentType: attachment?.contentType ?? "image/png", attachmentSizeBytes: attachment ? String(attachment.sizeBytes) : "", attachmentWidth: attachment?.width ? String(attachment.width) : "", attachmentHeight: attachment?.height ? String(attachment.height) : "", attachmentSha256: attachment?.sha256 ?? "", attachmentAltText: attachment?.altText ?? "" }; };
const makeIdempotency = (operation: string): string => `${operation}-${crypto.randomUUID()}`;
const identityQuery = (identity: AdminIdentity): string => new URLSearchParams({ tenantId: identity.tenantId, accountId: identity.accountId, role: identity.role }).toString();
const apiUrl = (identity: AdminIdentity, suffix = ""): string => `/api/v1/admin/news${suffix}?${identityQuery(identity)}`;
const dateText = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => undefined) as { error?: { reasonCode?: string; message?: string } } | undefined;
  if (!response.ok) throw { reasonCode: payload?.error?.reasonCode ?? "PROCESSING_FAILED", message: payload?.error?.message ?? "ไม่สามารถดำเนินการกับข่าวได้" } satisfies NewsError;
  return payload as T;
}

function formPayload(form: DraftForm, categoryIds: readonly string[], reason: string, idempotencyKey: string, sourcePostId?: string) {
  const effectiveDate = form.effectiveFrom ? new Date(form.effectiveFrom) : undefined;
  const expiresDate = form.expiresAt ? new Date(form.expiresAt) : undefined;
  const effective = effectiveDate && !Number.isNaN(effectiveDate.getTime()) ? effectiveDate.toISOString() : "";
  const expires = expiresDate && !Number.isNaN(expiresDate.getTime()) ? expiresDate.toISOString() : undefined;
  const attachments = form.attachmentStorageKey.trim() ? [{ storageKey: form.attachmentStorageKey.trim(), contentType: form.attachmentContentType, sizeBytes: Number(form.attachmentSizeBytes), ...(form.attachmentWidth ? { width: Number(form.attachmentWidth) } : {}), ...(form.attachmentHeight ? { height: Number(form.attachmentHeight) } : {}), sha256: form.attachmentSha256.trim(), altText: form.attachmentAltText.trim() }] : [];
  return { slug: form.slug, title: form.title, excerpt: form.excerpt, bodyHtml: form.bodyHtml, categoryIds: form.categoryId ? [form.categoryId] : categoryIds, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), attachments, effectiveFrom: effective, ...(expires ? { expiresAt: expires } : {}), timezone: "Asia/Bangkok", aiDraft: form.aiDraft, reason, idempotencyKey, ...(sourcePostId ? { sourcePostId } : {}) };
}

function NewsStatus({ post }: { post: NewsPost }) {
  return <span className={`news-status news-status--${stateTone(post.status)}`}>{stateLabel[post.status]}</span>;
}

function NewsMediaMetadata({ disabled, form, identity, update }: { disabled: boolean; form: DraftForm; identity: NewsConsoleProps["identity"]; update: (field: keyof DraftForm, value: string | boolean) => void }) {
  return <section aria-labelledby="news-media-title" className="news-panel news-media-panel"><div className="news-section-heading"><div><span className="news-kicker">PRIVATE STORAGE</span><h2 id="news-media-title">Media metadata</h2></div><span className="news-preview-meta">optional · one attachment in local editor</span></div><p className="news-media-help">ผูกเฉพาะไฟล์ที่อัปโหลดผ่าน storage policy แล้วเท่านั้น ระบบจะตรวจ tenant path, hash, ขนาด, มิติภาพ และ alt text ก่อนบันทึก</p><div className="news-form-grid"><label className="news-form-wide">Storage key<input disabled={disabled} onChange={(event) => update("attachmentStorageKey", event.target.value)} placeholder={`private/tenants/${identity.tenantId}/news/...`} value={form.attachmentStorageKey} /></label><label>ชนิดไฟล์<select disabled={disabled} onChange={(event) => update("attachmentContentType", event.target.value)} value={form.attachmentContentType}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option><option value="application/pdf">PDF</option></select></label><label>ขนาดไฟล์ (bytes)<input disabled={disabled} inputMode="numeric" onChange={(event) => update("attachmentSizeBytes", event.target.value)} value={form.attachmentSizeBytes} /></label><label>กว้าง / สูง (px)<div className="news-media-dimensions"><input aria-label="กว้าง (px)" disabled={disabled} inputMode="numeric" onChange={(event) => update("attachmentWidth", event.target.value)} value={form.attachmentWidth} /><input aria-label="สูง (px)" disabled={disabled} inputMode="numeric" onChange={(event) => update("attachmentHeight", event.target.value)} value={form.attachmentHeight} /></div></label><label>SHA-256<input disabled={disabled} maxLength={64} onChange={(event) => update("attachmentSha256", event.target.value)} value={form.attachmentSha256} /></label><label>คำอธิบายภาพ/ไฟล์<input disabled={disabled} maxLength={240} onChange={(event) => update("attachmentAltText", event.target.value)} value={form.attachmentAltText} /></label></div></section>;
}

export function NewsConsole({ identity, initialSnapshot, initialPostId }: NewsConsoleProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState(initialPostId ?? initialSnapshot.items[0]?.id);
  const [form, setForm] = useState<DraftForm>(() => { const post = initialSnapshot.items.find((item) => item.id === initialPostId) ?? initialSnapshot.items[0]; return post ? formFromPost(post) : emptyForm(initialSnapshot.categories[0]); });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<NewsError>();
  const [notice, setNotice] = useState<string>();
  const [broadcastPreview, setBroadcastPreview] = useState<{ audienceCount: number; quotaRemaining: number; estimatedCostMinor: number; confirmationRequired: boolean }>();
  const selected = useMemo(() => snapshot.items.find((item) => item.id === selectedId), [selectedId, snapshot.items]);
  const canEdit = identity.role === "PR_STAFF" || identity.role === "TENANT_ADMIN";
  const canApprove = identity.role === "TENANT_ADMIN";

  useEffect(() => {
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);

  const refresh = async (preferredId = selectedId) => {
    setLoading(true); setError(undefined);
    try {
      const next = await requestJson<NewsSnapshot>(apiUrl(identity));
      setSnapshot(next);
      const nextPost = next.items.find((item) => item.id === preferredId) ?? next.items[0];
      setSelectedId(nextPost?.id);
      setForm(nextPost ? formFromPost(nextPost) : emptyForm(next.categories[0]));
      setBroadcastPreview(undefined);
    } catch (requestError) { setError(requestError as NewsError); } finally { setLoading(false); }
  };

  const selectPost = (post: NewsPost) => { setSelectedId(post.id); setForm(formFromPost(post)); setError(undefined); setNotice(undefined); setBroadcastPreview(undefined); };
  const update = (field: keyof DraftForm, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const bodyFor = (reason: string, key: string, sourcePostId?: string) => formPayload(form, selected?.currentRevision.categoryIds ?? snapshot.categories.slice(0, 1).map((category) => category.id), reason, key, sourcePostId);

  const createDraft = async () => {
    setBusy("create"); setError(undefined); setNotice(undefined);
    try {
      const result = await requestJson<{ post: NewsPost }>(apiUrl(identity), { method: "POST", headers: { "idempotency-key": makeIdempotency("news-create") }, body: JSON.stringify(bodyFor("สร้างฉบับร่างข่าวจาก A-60", makeIdempotency("news-create-body"))) });
      setNotice("สร้างข่าวฉบับร่างแล้ว"); await refresh(result.post.id);
    } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  const saveDraft = async () => {
    if (!selected || selected.status !== "DRAFT") return;
    const key = makeIdempotency("news-update"); setBusy("save"); setError(undefined); setNotice(undefined);
    try { await requestJson<{ post: NewsPost }>(apiUrl(identity, `/${selected.id}`), { method: "PATCH", headers: { "if-match": `"${selected.rowVersion}"`, "idempotency-key": key }, body: JSON.stringify({ ...bodyFor("แก้ไขฉบับร่างข่าวจาก A-61", key), expectedVersion: selected.rowVersion }) }); setNotice("บันทึกฉบับร่างแล้ว"); await refresh(selected.id); } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  const action = async (name: "submit-review" | "approve" | "publish" | "archive") => {
    if (!selected) return;
    const key = makeIdempotency(`news-${name}`); setBusy(name); setError(undefined); setNotice(undefined);
    try { await requestJson<{ post: NewsPost }>(apiUrl(identity, `/${selected.id}/${name}`), { method: "POST", headers: { "if-match": `"${selected.rowVersion}"`, "idempotency-key": key }, body: JSON.stringify({ expectedVersion: selected.rowVersion, idempotencyKey: key, reason: `ดำเนินการ ${name} จาก A-60/A-61` }) }); setNotice(name === "submit-review" ? "ส่งข่าวเข้าคิวตรวจสอบแล้ว" : name === "approve" ? "อนุมัติข่าวแล้ว" : name === "publish" ? "เผยแพร่ข่าวตาม version ที่อนุมัติแล้ว" : "เก็บข่าวฉบับปัจจุบันแล้ว"); await refresh(selected.id); } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  const previewBroadcast = async () => {
    if (!selected) return;
    setBusy("broadcast-preview"); setError(undefined); setNotice(undefined);
    try { const result = await requestJson<{ preview: { audienceCount: number; quotaRemaining: number; estimatedCostMinor: number; confirmationRequired: boolean } }>(apiUrl(identity, `/${selected.id}/broadcasts`), { method: "POST", body: JSON.stringify({ action: "preview" }) }); setBroadcastPreview(result.preview); setNotice("ตรวจสอบกลุ่มผู้รับแล้ว ต้องยืนยันก่อนเข้าคิวส่ง"); } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  const queueBroadcast = async () => {
    if (!selected || !broadcastPreview?.confirmationRequired) return;
    const key = makeIdempotency("news-broadcast"); setBusy("broadcast-queue"); setError(undefined);
    try { await requestJson(apiUrl(identity, `/${selected.id}/broadcasts`), { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ action: "queue", idempotencyKey: key, reason: "ยืนยันกลุ่มผู้รับและเข้าคิวประกาศข่าว" }) }); setNotice("เข้าคิว broadcast แล้วและบันทึก delivery log"); await refresh(selected.id); } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  const createRevision = async () => {
    if (!selected || selected.status !== "PUBLISHED") return;
    const key = makeIdempotency("news-revision"); setBusy("revision"); setError(undefined);
    try { const result = await requestJson<{ post: NewsPost }>(apiUrl(identity), { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify(bodyFor("สร้าง revision ใหม่จากข่าวที่เผยแพร่แล้ว", key, selected.id)) }); setNotice("สร้าง revision ฉบับร่างแล้ว ข่าวที่เผยแพร่ยัง immutable"); await refresh(result.post.id); } catch (requestError) { setError(requestError as NewsError); } finally { setBusy(undefined); }
  };

  if (loading && snapshot.items.length === 0) return <main className="news-admin-page"><LoadingState />;</main>;
  if (error?.reasonCode === "CONFIGURATION_UNAVAILABLE") return <main className="news-admin-page"><FeatureDisabledState />;</main>;
  if (error?.reasonCode === "FORBIDDEN") return <main className="news-admin-page"><PermissionDeniedState action={<button className="news-button news-button--secondary" onClick={() => void refresh()} type="button">ลองใหม่</button>} /></main>;

  return <AdminShell activeId="news" breadcrumbs={["ข่าวเทศบาล"]} identity={identity}>
    <main className="news-admin-page">
      <header className="news-heading"><div><span className="news-kicker">A-60 · A-61</span><h1>ข่าวเทศบาล</h1><p>สร้าง ตรวจสอบ กำหนดเวลา และเผยแพร่ประกาศตาม version ที่มีหลักฐาน</p></div><button className="news-button news-button--primary" disabled={!canEdit || busy !== undefined} onClick={() => { setSelectedId(undefined); setForm(emptyForm(snapshot.categories[0])); setNotice("กรอกข้อมูลข่าวแล้วกดสร้างฉบับร่าง"); }} type="button">+ สร้างข่าว</button></header>
      <p className="news-synthetic">local synthetic สำหรับตรวจ contract เท่านั้น · production ต้องต่อ server session, storage และ LINE delivery จริง</p>
      {offline ? <OfflineState action={<button className="news-button news-button--secondary" onClick={() => void refresh()} type="button">ลองเชื่อมต่อใหม่</button>} /> : null}
      {error && !["FORBIDDEN", "CONFIGURATION_UNAVAILABLE", "SESSION_EXPIRED", "VERSION_CONFLICT"].includes(error.reasonCode) ? <ErrorState message={`${error.message} (${error.reasonCode})`} action={<button className="news-button news-button--secondary" onClick={() => void refresh()} type="button">ลองใหม่</button>} /> : null}
      {error?.reasonCode === "SESSION_EXPIRED" ? <ExpiredSessionState action={<button className="news-button news-button--secondary" onClick={() => void refresh()} type="button">เริ่ม session ใหม่</button>} /> : null}
      {error?.reasonCode === "VERSION_CONFLICT" ? <ConflictState action={<button className="news-button news-button--secondary" onClick={() => void refresh(selected?.id)} type="button">โหลด version ล่าสุด</button>} /> : null}
      {notice ? <p aria-live="polite" className="news-notice" role="status">{notice}</p> : null}
      <div className="news-layout">
        <section aria-labelledby="news-list-title" className="news-panel news-list-panel"><div className="news-section-heading"><div><span className="news-kicker">VERSIONED CONTENT</span><h2 id="news-list-title">รายการข่าว</h2></div><span className="news-count">{snapshot.items.length} รายการ</span></div>{snapshot.items.length === 0 ? <EmptyState title="ยังไม่มีข่าว" message="สร้างฉบับร่างแรกจากตัวแก้ไขด้านขวา ข้อมูลจะไม่เผยแพร่จนกว่าจะอนุมัติ" /> : <div className="news-table-wrap"><table className="news-table"><caption className="sr-only">รายการข่าวตามสถานะ</caption><thead><tr><th scope="col">ข่าว</th><th scope="col">สถานะ</th><th scope="col">ปรับปรุง</th></tr></thead><tbody>{snapshot.items.map((post) => <tr className={selected?.id === post.id ? "is-selected" : undefined} key={post.id}><td><button className="news-row-button" onClick={() => selectPost(post)} type="button"><strong>{post.currentRevision.title || "ไม่มีชื่อ"}</strong><small>{post.slug}</small></button></td><td><NewsStatus post={post} /></td><td><small>{dateText(post.updatedAt)}</small></td></tr>)}</tbody></table></div>}<div className="news-audit"><h3>Audit และ delivery</h3>{snapshot.audit.length === 0 && snapshot.broadcasts.length === 0 ? <p>ยังไม่มีรายการ audit</p> : <><ol>{snapshot.audit.slice(-5).reverse().map((entry) => <li key={entry.id}><strong>{entry.action}</strong><span>{entry.reason}</span></li>)}</ol>{snapshot.broadcasts.length > 0 ? <p>delivery runs: {snapshot.broadcasts.length} · ล่าสุด {snapshot.broadcasts.at(-1)?.status}</p> : null}</>}</div></section>
        <section aria-labelledby="news-editor-title" className="news-panel news-editor-panel"><div className="news-section-heading"><div><span className="news-kicker">EDITOR · ASIA/BANGKOK</span><h2 id="news-editor-title">{selected ? `v${selected.currentRevision.revision} · ${stateLabel[selected.status]}` : "ฉบับร่างใหม่"}</h2></div>{selected ? <NewsStatus post={selected} /> : <span className="news-status news-status--draft">ยังไม่บันทึก</span>}</div><div className="news-workflow-note"><strong>Publish guard</strong><span>AI draft เป็นเพียงฉบับร่าง · revision ที่เผยแพร่แล้วแก้ตรง ๆ ไม่ได้ · กำหนดเวลาจะเก็บเป็น UTC พร้อม timezone Asia/Bangkok</span></div><div className="news-form-grid"><label>Slug<input disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} maxLength={81} onChange={(event) => update("slug", event.target.value)} value={form.slug} /></label><label>หมวดข่าว<select disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("categoryId", event.target.value)} value={form.categoryId}><option value="">เลือกหมวดข่าว</option>{snapshot.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="news-form-wide">หัวข้อข่าว<input disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} maxLength={160} onChange={(event) => update("title", event.target.value)} value={form.title} /></label><label className="news-form-wide">คำโปรย<textarea disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} maxLength={300} onChange={(event) => update("excerpt", event.target.value)} rows={2} value={form.excerpt} /></label><label>เริ่มเผยแพร่ (เวลาท้องถิ่น)<input disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("effectiveFrom", event.target.value)} type="datetime-local" value={form.effectiveFrom} /><small>ระบบบันทึก canonical เป็น UTC / Asia-Bangkok</small></label><label>หมดอายุ (ถ้ามี)<input disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("expiresAt", event.target.value)} type="datetime-local" value={form.expiresAt} /></label><label className="news-form-wide">Tags <input disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("tags", event.target.value)} placeholder="คั่นด้วยจุลภาค" value={form.tags} /></label><label className="news-form-wide">Rich text ที่ผ่าน sanitization<textarea aria-describedby="news-body-help" disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("bodyHtml", event.target.value)} placeholder="ใช้ p, strong, em, ul, ol, li, h2, h3 และลิงก์ https เท่านั้น" rows={8} value={form.bodyHtml} /><small id="news-body-help">ระบบจะลบ tag/attribute ที่ไม่อนุญาตและปฏิเสธ script, iframe, javascript/data URL</small></label><label className="news-check"><input checked={form.aiDraft} disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} onChange={(event) => update("aiDraft", event.target.checked)} type="checkbox" /> เนื้อหานี้มาจาก AI draft (ต้องตรวจสอบก่อน publish)</label></div><div className="news-action-row"><button className="news-button news-button--secondary" disabled={!canEdit || busy !== undefined} onClick={() => void createDraft()} type="button">{busy === "create" ? "กำลังสร้าง…" : "บันทึกเป็นฉบับร่าง"}</button>{selected ? <><button className="news-button news-button--secondary" disabled={!canEdit || selected.status !== "DRAFT" || busy !== undefined} onClick={() => void saveDraft()} type="button">{busy === "save" ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button><button className="news-button news-button--secondary" disabled={!canEdit || selected.status !== "DRAFT" || busy !== undefined} onClick={() => void action("submit-review")} type="button">ส่งตรวจสอบ</button><button className="news-button news-button--secondary" disabled={!canApprove || selected.status !== "IN_REVIEW" || busy !== undefined} onClick={() => void action("approve")} type="button">อนุมัติ</button><button className="news-button news-button--primary" disabled={!canEdit || selected.status !== "APPROVED" || busy !== undefined} onClick={() => void action("publish")} type="button">เผยแพร่</button><button className="news-button news-button--danger" disabled={!canEdit || !["PUBLISHED", "SCHEDULED"].includes(selected.status) || busy !== undefined} onClick={() => void action("archive")} type="button">เก็บข่าว</button><Link className="news-button news-button--secondary" href={`/admin/news/${selected.id}/edit?role=${identity.role}`}>เปิด A-61</Link><button className="news-button news-button--secondary" disabled={!canEdit || selected.status !== "PUBLISHED" || busy !== undefined} onClick={() => void createRevision()} type="button">สร้าง revision ใหม่</button></> : null}</div>{selected?.status === "PUBLISHED" ? <section className="news-broadcast"><div><h3>LINE broadcast</h3><p>ต้อง preview audience/quota/cost และยืนยันก่อนเข้าคิว</p></div><div className="news-action-row"><button className="news-button news-button--secondary" disabled={busy !== undefined} onClick={() => void previewBroadcast()} type="button">{busy === "broadcast-preview" ? "กำลังคำนวณ…" : "Preview กลุ่มผู้รับ"}</button><button className="news-button news-button--primary" disabled={!broadcastPreview?.confirmationRequired || busy !== undefined} onClick={() => void queueBroadcast()} type="button">{busy === "broadcast-queue" ? "กำลังเข้าคิว…" : "ยืนยันและเข้าคิว"}</button></div>{broadcastPreview ? <p className="news-broadcast-preview" aria-live="polite">ผู้รับ {broadcastPreview.audienceCount} · quota เหลือ {broadcastPreview.quotaRemaining} · ประมาณ {broadcastPreview.estimatedCostMinor} หน่วย · ยืนยันแล้วหรือยัง: {broadcastPreview.confirmationRequired ? "ต้องยืนยัน" : "ไม่ต้องยืนยัน"}</p> : null}</section> : null}{selected && selected.status !== "DRAFT" ? <StaleState action={<p>เวอร์ชันนี้แก้ตรง ๆ ไม่ได้ ให้สร้าง revision draft ใหม่ก่อน</p>} /> : null}</section>
      </div>
      <NewsMediaMetadata disabled={!canEdit || (selected !== undefined && selected.status !== "DRAFT")} form={form} identity={identity} update={update} />
      {selected ? <section aria-labelledby="news-preview-title" className="news-panel news-preview-panel"><div className="news-section-heading"><div><span className="news-kicker">SAFE PREVIEW</span><h2 id="news-preview-title">ตัวอย่างข่าว</h2></div><span className="news-preview-meta">{selected.currentRevision.aiDraft ? "AI DRAFT · ต้องตรวจสอบ" : "เนื้อหาจาก revision ปัจจุบัน"}</span></div><article className="news-preview"><h3>{selected.currentRevision.title || "ยังไม่มีหัวข้อ"}</h3><p className="news-preview__excerpt">{selected.currentRevision.excerpt}</p><div dangerouslySetInnerHTML={{ __html: selected.currentRevision.bodyHtml }} /><small>แก้ไขล่าสุด {dateText(selected.updatedAt)} · สถานะ {stateLabel[selected.status]}</small></article></section> : null}
    </main>
  </AdminShell>;
}
