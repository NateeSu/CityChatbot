"use client";

import Link from "next/link";

import { LiffFrame, type LiffCitizenIdentity } from "./LiffHome";

import "./info-page.css";

const CONTENT = {
  help: { title: "ช่วยเหลือและความเป็นส่วนตัว", heading: "คำแนะนำการใช้งาน", body: "หากเซสชันหมดอายุ ให้กลับเข้า LINE ใหม่ ข้อมูลที่ยังไม่ส่งจะไม่ถูกลบโดยอัตโนมัติ", items: ["ระบบใช้ตัวตนจาก LINE ที่ยืนยันโดยเซิร์ฟเวอร์", "ข้อมูลคำร้องแสดงเฉพาะเจ้าของเรื่อง", "ติดต่อเจ้าหน้าที่เมื่อข้อมูลไม่ถูกต้องหรือไม่ครบ"] },
} as const;

export type LiffInfoKind = keyof typeof CONTENT;

export function LiffInfoPage({ identity, kind }: { identity: LiffCitizenIdentity; kind: LiffInfoKind }) {
  const content = CONTENT[kind];
  return <LiffFrame backHref="/liff" identity={identity} title={content.title}><section className="liff-info-page"><h1>{content.heading}</h1><p>{content.body}</p><div className="liff-info-list">{content.items.map((item) => <article key={item}><span aria-hidden="true">✓</span><strong>{item}</strong></article>)}</div>{kind === "help" ? <Link className="liff-button liff-button--primary" href="/liff">กลับหน้าหลัก</Link> : <Link className="liff-button liff-button--secondary" href="/liff">กลับหน้าหลัก</Link>}</section></LiffFrame>;
}
