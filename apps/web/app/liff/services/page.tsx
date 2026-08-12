import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FeatureDisabledState } from "../../ui/states";
import { servicesRepository } from "../../api/v1/admin/services/repository";
import { LiffFrame, type LiffCitizenIdentity } from "../LiffHome";
import "./services.css";

const LOCAL_IDENTITY: LiffCitizenIdentity = { tenantId: "00000000-0000-4000-8000-000000000001", lineUserId: "U11111111111111111111111111111111", tenantName: "เทศบาลเมืองตัวอย่าง", synthetic: true };

export const metadata: Metadata = { title: "บริการประชาชน | CityChatbot", description: "ค้นหาข้อมูลบริการประชาชนที่เทศบาลตรวจสอบและเผยแพร่แล้ว" };

export default async function ServicesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /></main>;
  const query = searchParams ? await searchParams : {};
  const items = servicesRepository.listPublished(LOCAL_IDENTITY.tenantId, query.q ?? "");
  return <LiffFrame backHref="/liff" identity={LOCAL_IDENTITY} title="บริการประชาชน"><section aria-labelledby="services-title" className="citizen-services"><div className="citizen-services__heading"><div><span className="citizen-services__kicker">C-15 · VERIFIED DIRECTORY</span><h1 id="services-title">ค้นหาบริการเทศบาล</h1><p>ข้อมูลขั้นตอน เอกสาร ค่าธรรมเนียม และช่องทางติดต่อจากแหล่งที่เทศบาลตรวจสอบแล้ว</p></div><span className="citizen-services__count">{items.length} รายการ</span></div><form className="citizen-services__search" action="/liff/services" method="get"><label htmlFor="service-query">ค้นหาชื่อบริการหรือสถานที่</label><div><input id="service-query" name="q" placeholder="เช่น ใบอนุญาต, ศูนย์บริการ" type="search" defaultValue={query.q ?? ""} /><button className="liff-button liff-button--primary" type="submit">ค้นหา</button></div></form>{items.length === 0 ? <EmptyState title={query.q ? "ไม่พบบริการที่ค้นหา" : "ยังไม่มีบริการที่เผยแพร่"} message={query.q ? "ลองใช้คำค้นอื่น หรือกลับมาดูภายหลัง" : "เมื่อมีข้อมูลที่ผ่านการอนุมัติแล้ว รายการจะแสดงที่นี่"} action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /> : <div className="citizen-services__grid">{items.map((item) => <article className="citizen-service-card" key={item.slug}><Link href={`/liff/services/${item.slug}`}><span className="citizen-service-card__module">{item.module === "STANDARD" ? "บริการ" : item.module}</span><h2>{item.title}</h2><p>{item.summary}</p><dl><div><dt>เวลา</dt><dd>{item.hours}</dd></div><div><dt>สถานที่</dt><dd>{item.location}</dd></div>{item.phone ? <div><dt>โทร</dt><dd>{item.phone}</dd></div> : null}</dl>{item.staleWarning ? <p className="citizen-service-card__warning" role="status">ข้อมูล module นี้อาจล้าสมัย กรุณาตรวจสอบก่อนทำธุรกรรม</p> : null}</Link></article>)}</div>}</section></LiffFrame>;
}
