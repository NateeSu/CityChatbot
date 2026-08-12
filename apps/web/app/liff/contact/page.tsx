import Link from "next/link";

import { EmptyState, FeatureDisabledState } from "../../ui/states";
import { servicesRepository } from "../../api/v1/admin/services/repository";
import { LiffFrame, type LiffCitizenIdentity } from "../LiffHome";
import "../services/services.css";

const LOCAL_IDENTITY: LiffCitizenIdentity = { tenantId: "00000000-0000-4000-8000-000000000001", lineUserId: "U11111111111111111111111111111111", tenantName: "เทศบาลเมืองตัวอย่าง", synthetic: true };

export default function ContactPage() {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /></main>;
  const items = servicesRepository.listPublished(LOCAL_IDENTITY.tenantId);
  return <LiffFrame backHref="/liff" identity={LOCAL_IDENTITY} title="ติดต่อเทศบาล"><section className="citizen-services"><div className="citizen-services__heading"><div><span className="citizen-services__kicker">C-18 · VERIFIED CONTACTS</span><h1>หน่วยงานที่ติดต่อได้</h1><p>เบอร์โทรและแผนที่จาก service facts ที่ผ่านการ review</p></div></div>{items.length === 0 ? <EmptyState title="ยังไม่มีช่องทางติดต่อที่เผยแพร่" message="ข้อมูล contact จะแสดงเมื่อมี service revision ที่ได้รับอนุมัติ" action={<Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>} /> : <div className="citizen-services__grid">{items.map((item) => <article className="citizen-service-card" key={item.slug}><div><span className="citizen-service-card__module">{item.verified ? "ตรวจสอบแล้ว" : "รอตรวจสอบ"}</span><h2>{item.title}</h2><p>{item.location}</p>{item.phone ? <a className="liff-button liff-button--primary" href={`tel:${item.phone}`}>โทร {item.phone}</a> : null}{item.mapUrl ? <a className="liff-button liff-button--secondary" href={item.mapUrl} rel="noreferrer" target="_blank">เปิดแผนที่</a> : null}</div></article>)}</div>}</section></LiffFrame>;
}
