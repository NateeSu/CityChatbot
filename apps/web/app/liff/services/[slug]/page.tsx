import type { Metadata } from "next";
import Link from "next/link";

import { FeatureDisabledState, ErrorState } from "../../../ui/states";
import { servicesRepository } from "../../../api/v1/admin/services/repository";
import { LiffFrame, type LiffCitizenIdentity } from "../../LiffHome";
import "../services.css";

const LOCAL_IDENTITY: LiffCitizenIdentity = { tenantId: "00000000-0000-4000-8000-000000000001", lineUserId: "U11111111111111111111111111111111", tenantName: "เทศบาลเมืองตัวอย่าง", synthetic: true };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = servicesRepository.getPublishedBySlug(LOCAL_IDENTITY.tenantId, (await params).slug);
  return { title: `${item.title} | บริการประชาชน`, description: item.summary };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  if (environment !== "local" && environment !== "test") return <main className="liff-unavailable"><FeatureDisabledState action={<Link className="liff-button liff-button--secondary" href="/liff/services">กลับรายการบริการ</Link>} /></main>;
  let item;
  try { item = servicesRepository.getPublishedBySlug(LOCAL_IDENTITY.tenantId, (await params).slug); } catch { return <LiffFrame backHref="/liff/services" identity={LOCAL_IDENTITY} title="บริการประชาชน"><ErrorState message="ไม่พบบริการที่เผยแพร่แล้ว หรือข้อมูลหมดอายุ" action={<Link className="liff-button liff-button--secondary" href="/liff/services">กลับรายการบริการ</Link>} /></LiffFrame>; }
  return <LiffFrame backHref="/liff/services" identity={LOCAL_IDENTITY} title="รายละเอียดบริการ"><article className="citizen-service-detail"><span className="citizen-services__kicker">C-16 · APPROVED FACTS</span><h1>{item.title}</h1><p className="citizen-service-detail__summary">{item.summary}</p><div className="citizen-service-detail__verified">{item.verified ? "✓ แหล่งข้อมูลผ่านการ review" : "ข้อมูลอยู่ระหว่างตรวจสอบ"} · มีผล {new Date(item.effectiveFrom).toLocaleDateString("th-TH")}</div><section><h2>ขั้นตอน</h2><ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol></section><section><h2>เอกสารและข้อกำหนด</h2>{item.documents.length === 0 && item.requirements.length === 0 ? <p>ตรวจสอบกับเจ้าหน้าที่ก่อนเข้ารับบริการ</p> : <ul>{[...item.documents, ...item.requirements].map((value) => <li key={value}>{value}</li>)}</ul>}</section><section><h2>ข้อมูลสำคัญ</h2><dl className="citizen-service-detail__facts"><div><dt>ค่าธรรมเนียม</dt><dd>{item.fee}</dd></div><div><dt>เวลาทำการ</dt><dd>{item.hours}</dd></div><div><dt>สถานที่</dt><dd>{item.location}</dd></div><div><dt>ตรวจสอบล่าสุด</dt><dd>{new Date(item.source.lastReviewedAt).toLocaleDateString("th-TH")}</dd></div></dl></section>{item.phone || item.mapUrl ? <section><h2>ติดต่อ</h2><div className="citizen-service-detail__contacts">{item.phone ? <a className="liff-button liff-button--primary" href={`tel:${item.phone}`}>โทร {item.phone}</a> : null}{item.mapUrl ? <a className="liff-button liff-button--secondary" href={item.mapUrl} rel="noreferrer" target="_blank">เปิดแผนที่</a> : null}</div></section> : null}{item.staleWarning ? <p className="citizen-service-card__warning" role="alert">ข้อมูล module นี้อาจล้าสมัย กรุณาตรวจสอบกับเทศบาลก่อนทำธุรกรรม</p> : null}<p className="citizen-service-detail__source">แหล่งข้อมูล: {item.source.reference}</p></article></LiffFrame>;
}
