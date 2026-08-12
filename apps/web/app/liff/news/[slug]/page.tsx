import Link from "next/link";
import type { Metadata } from "next";

import { ErrorState, FeatureDisabledState } from "../../../ui/states";
import { newsRepository } from "../../../api/v1/admin/news/repository";
import { LiffFrame, type LiffCitizenIdentity } from "../../LiffHome";

import "../news.css";

export const dynamic = "force-dynamic";

const LOCAL_IDENTITY: LiffCitizenIdentity = { tenantId: "00000000-0000-4000-8000-000000000001", lineUserId: "U11111111111111111111111111111111", tenantName: "เทศบาลเมืองตัวอย่าง", synthetic: true };
const dateText = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if ((process.env.CITYCHATBOT_ENV ?? "local") !== "local" && (process.env.CITYCHATBOT_ENV ?? "local") !== "test") return { title: "ข่าวเทศบาล | CityChatbot" };
  try { const item = newsRepository.getPublishedBySlug(LOCAL_IDENTITY.tenantId, (await params).slug); return { title: `${item.title} | ข่าวเทศบาล`, description: item.excerpt }; } catch { return { title: "ไม่พบข่าว | CityChatbot" }; }
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff/news">กลับรายการข่าว</Link>} /></main>;
  let item;
  try { item = newsRepository.getPublishedBySlug(LOCAL_IDENTITY.tenantId, (await params).slug); } catch { return <LiffFrame backHref="/liff/news" identity={LOCAL_IDENTITY} title="ข่าวเทศบาล"><ErrorState title="ไม่พบข่าว" message="ข่าวนี้อาจหมดอายุหรือยังไม่ได้เผยแพร่" action={<Link className="liff-button liff-button--secondary" href="/liff/news">กลับรายการข่าว</Link>} /></LiffFrame>; }
  return <LiffFrame backHref="/liff/news" identity={LOCAL_IDENTITY} title="รายละเอียดข่าว"><article className="liff-news-detail"><Link className="liff-news-back" href="/liff/news">← ข่าวทั้งหมด</Link><h1>{item.title}</h1><p className="liff-news-detail__meta">เผยแพร่ {dateText(item.publishedAt)}{item.expiresAt ? ` · หมดอายุ ${dateText(item.expiresAt)}` : ""}</p><p className="liff-news-detail__excerpt">{item.excerpt}</p><div className="liff-news-detail__body" dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />{item.attachments.length > 0 ? <section aria-labelledby="news-attachments-title" className="liff-news-attachments"><h2 id="news-attachments-title">เอกสารแนบ</h2><ul>{item.attachments.map((attachment) => <li key={attachment.sha256}><span>{attachment.altText}</span><small>{attachment.contentType} · {Math.ceil(attachment.sizeBytes / 1024)} KB</small></li>)}</ul></section> : null}</article></LiffFrame>;
}
