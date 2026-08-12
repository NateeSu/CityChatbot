import Link from "next/link";
import type { Metadata } from "next";

import { FeatureDisabledState, EmptyState } from "../../ui/states";
import { newsRepository } from "../../api/v1/admin/news/repository";
import { LiffFrame, type LiffCitizenIdentity } from "../LiffHome";

import "./news.css";

const LOCAL_IDENTITY: LiffCitizenIdentity = { tenantId: "00000000-0000-4000-8000-000000000001", lineUserId: "U11111111111111111111111111111111", tenantName: "เทศบาลเมืองตัวอย่าง", synthetic: true };

export const metadata: Metadata = { title: "ข่าวเทศบาล | CityChatbot", description: "ประกาศข่าวสารที่เทศบาลตรวจสอบและเผยแพร่แล้ว" };

const dateText = (value: string): string => { try { return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { dateStyle: "medium" }).format(new Date(value)); } catch { return value; } };

export default function NewsPage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /></main>;
  const items = newsRepository.listPublished(LOCAL_IDENTITY.tenantId);
  return <LiffFrame backHref="/liff" identity={LOCAL_IDENTITY} title="ข่าวเทศบาล"><section aria-labelledby="citizen-news-title" className="liff-news-page"><div className="liff-news-heading"><span aria-hidden="true" className="liff-news-mark">▤</span><div><h1 id="citizen-news-title">ประกาศล่าสุด</h1><p>ข่าวที่เทศบาลตรวจสอบและเผยแพร่แล้ว</p></div></div>{items.length === 0 ? <EmptyState title="ยังไม่มีข่าวเผยแพร่" message="เมื่อมีประกาศที่ผ่านการอนุมัติแล้ว ข่าวจะแสดงที่หน้านี้" /> : <div className="liff-news-list">{items.map((item) => <Link className="liff-news-card" href={`/liff/news/${item.slug}`} key={item.slug}><span className="liff-news-card__copy"><strong>{item.title}</strong><span>{item.excerpt}</span><small>เผยแพร่ {dateText(item.publishedAt)} · ไฟล์แนบ {item.attachmentCount} รายการ</small></span><span aria-hidden="true" className="liff-news-card__arrow">›</span></Link>)}</div>}</section></LiffFrame>;
}
