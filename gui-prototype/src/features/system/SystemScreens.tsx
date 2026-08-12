import { useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CloudCog,
  Copy,
  KeyRound,
  Link2,
  MessageCircle,
  MoreVertical,
  Plus,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { Badge, Button, Notice, Panel, ProgressBar, SearchField, SelectField, Toggle } from '../../components/Primitives'

interface SystemProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

const tenantRows = [
  { name: 'เทศบาลเมืองตัวอย่าง', code: 'TM-001', plan: 'Professional', status: 'เปิดใช้งาน', users: '12,845', docs: 128, health: 100, owner: 'นวิตรา มีสุข' },
  { name: 'เทศบาลนครสุขใจ', code: 'TN-014', plan: 'Professional', status: 'เปิดใช้งาน', users: '28,391', docs: 246, health: 96, owner: 'กิตติคุณ แสงดี' },
  { name: 'เทศบาลตำบลริมคลอง', code: 'TT-021', plan: 'Standard', status: 'กำลังตั้งค่า', users: '—', docs: 18, health: 64, owner: 'อรอนงค์ สายใจ' },
  { name: 'เทศบาลเมืองศรีพัฒนา', code: 'TM-028', plan: 'Standard', status: 'ระงับชั่วคราว', users: '8,104', docs: 74, health: 82, owner: 'ฝ่ายสนับสนุนระบบ' },
]

function TenantListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ทุกสถานะ')
  const filtered = tenantRows.filter((tenant) => (status === 'ทุกสถานะ' || tenant.status === status) && (tenant.name.includes(query) || tenant.code.toLowerCase().includes(query.toLowerCase())))
  return (
    <div className="tenant-page">
      <div className="tenant-overview"><Panel><span className="system-stat-icon"><Building2 size={21} /></span><strong>18</strong><small>Tenant ทั้งหมด</small></Panel><Panel><span className="system-stat-icon"><BadgeCheck size={21} /></span><strong>15</strong><small>เปิดใช้งาน</small></Panel><Panel><span className="system-stat-icon"><CloudCog size={21} /></span><strong>2</strong><small>กำลังตั้งค่า</small></Panel><Panel><span className="system-stat-icon"><CircleAlert size={21} /></span><strong>1</strong><small>ต้องดำเนินการ</small></Panel></div>
      <div className="table-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อเทศบาล รหัส หรือเจ้าของ…" /><SelectField value={status} options={['ทุกสถานะ', 'เปิดใช้งาน', 'กำลังตั้งค่า', 'ระงับชั่วคราว']} onChange={setStatus} /><SelectField value="ทุกแพ็กเกจ" options={['ทุกแพ็กเกจ', 'Starter', 'Standard', 'Professional']} onChange={() => undefined} /><Button icon={<Plus size={17} />} onClick={() => navigate('S-02')}>เพิ่มเทศบาล</Button></div>
      <div className="tenant-grid">{filtered.map((tenant, index) => <article key={tenant.code}><header><span className={`tenant-logo tenant-logo--${index + 1}`}><Building2 size={22} /></span><div><h2>{tenant.name}</h2><small>{tenant.code}</small></div><button><MoreVertical size={17} /></button></header><div className="tenant-badges"><Badge tone={tenant.status === 'เปิดใช้งาน' ? 'green' : tenant.status === 'กำลังตั้งค่า' ? 'blue' : 'red'}>{tenant.status}</Badge><Badge tone="neutral">{tenant.plan}</Badge></div><dl><div><dt>ผู้ติดตาม LINE</dt><dd>{tenant.users}</dd></div><div><dt>เอกสาร RAG</dt><dd>{tenant.docs}</dd></div><div><dt>ผู้ดูแลหลัก</dt><dd>{tenant.owner}</dd></div></dl><div className="tenant-health"><span>ความพร้อมระบบ <strong>{tenant.health}%</strong></span><ProgressBar value={tenant.health} tone={tenant.health < 80 ? 'amber' : 'green'} /></div><footer><button>เปิด Dashboard</button><button>จัดการ Tenant <ChevronRight size={15} /></button></footer></article>)}</div>
    </div>
  )
}

const provisionSteps = [
  { label: 'ข้อมูลองค์กร', icon: Building2 },
  { label: 'ผู้ดูแลหลัก', icon: UserRoundPlus },
  { label: 'แบรนด์และธีม', icon: Sparkles },
  { label: 'เชื่อมต่อ LINE OA', icon: MessageCircle },
  { label: 'เลือกโมดูล', icon: Settings2 },
  { label: 'ตรวจความพร้อม', icon: Rocket },
]

function TenantProvisionScreen() {
  const [step, setStep] = useState(1)
  const [modules, setModules] = useState({ ai: true, complaints: true, handoff: true, news: true, pawn: false, executive: true })
  const [confirmed, setConfirmed] = useState(false)
  const current = provisionSteps[step - 1]
  return (
    <div className="provision-layout">
      <aside className="provision-steps"><header><span><Sparkles size={21} /></span><div><strong>สร้าง Tenant ใหม่</strong><small>ตั้งค่าพร้อมใช้งานใน 6 ขั้นตอน</small></div></header><ol>{provisionSteps.map(({ label, icon: Icon }, index) => <li key={label} className={index + 1 === step ? 'is-active' : index + 1 < step ? 'is-done' : ''}><button onClick={() => setStep(index + 1)}><span>{index + 1 < step ? <Check size={15} /> : <Icon size={17} />}</span><div><small>ขั้นตอนที่ {index + 1}</small><strong>{label}</strong></div></button></li>)}</ol></aside>
      <section className="provision-main">
        <Panel title={`${step}. ${current.label}`} subtitle="ข้อมูลทั้งหมดแก้ไขได้ภายหลัง และยังไม่เปิดบริการจนกว่าจะยืนยัน Go-live">
          {step === 1 ? <div className="wizard-form"><div className="form-grid"><label>ชื่อทางการ <em>*</em><input defaultValue="เทศบาลเมืองใหม่" /></label><label>ชื่อย่อ<input defaultValue="ทม.ใหม่" /></label><label>รหัส Tenant <em>*</em><input defaultValue="TM-029" /></label><SelectField label="แพ็กเกจ" value="Professional" options={['Starter', 'Standard', 'Professional']} onChange={() => undefined} /><label>โดเมนย่อย <em>*</em><span className="input-addon"><input defaultValue="new-city" /><i>.cityservice.local</i></span></label><label>เขตเวลา<input value="Asia/Bangkok (UTC+7)" readOnly /></label></div><label className="field-label">ที่อยู่สำนักงาน<textarea defaultValue="99 ถนนเทศบาล ตำบลในเมือง อำเภอเมือง จังหวัดตัวอย่าง 11000" /></label></div> : null}
          {step === 2 ? <div className="wizard-form"><div className="form-grid"><label>ชื่อผู้ดูแลหลัก <em>*</em><input defaultValue="สุภาวดี เมืองใหม่" /></label><label>อีเมลราชการ <em>*</em><input type="email" defaultValue="admin@new-city.go.th" /></label><label>เบอร์โทร<input defaultValue="038-000-999" /></label><SelectField label="บทบาท" value="ผู้ดูแลเทศบาล" options={['ผู้ดูแลเทศบาล', 'เจ้าของ Tenant']} onChange={() => undefined} /></div><Notice tone="info">ระบบจะส่งคำเชิญหลังสร้าง Tenant สำเร็จ ลิงก์มีอายุ 72 ชั่วโมง</Notice></div> : null}
          {step === 3 ? <div className="brand-provision"><div className="logo-drop"><Building2 size={42} /><strong>อัปโหลดตราเทศบาล</strong><small>PNG โปร่งใส 512 × 512 px</small><Button variant="secondary" size="sm">เลือกไฟล์</Button></div><div className="form-grid"><label>สีหลัก<input type="color" defaultValue="#0066B3" /></label><label>สีรอง<input type="color" defaultValue="#0097A7" /></label><SelectField label="ชุดตัวอักษร" value="Noto Sans Thai" options={['Noto Sans Thai', 'Prompt', 'Sarabun']} onChange={() => undefined} /></div><Notice tone="success">สีที่เลือกผ่าน WCAG 2.2 AA</Notice></div> : null}
          {step === 4 ? <div className="line-connection"><span><MessageCircle size={36} /></span><h3>เชื่อมต่อ LINE Official Account</h3><p>ใช้ Channel ID และ Secret จาก LINE Developers ของเทศบาล ระบบจะเก็บค่า secret แบบเข้ารหัส</p><label>Channel ID<input placeholder="กรอก Channel ID" /></label><label>Channel Secret<span className="secret-input"><input type="password" value="••••••••••••••••" readOnly /><KeyRound size={17} /></span></label><Button variant="secondary" icon={<Link2 size={16} />}>ทดสอบการเชื่อมต่อ</Button></div> : null}
          {step === 5 ? <div className="module-grid"><Toggle checked={modules.ai} onChange={(value) => setModules((current) => ({ ...current, ai: value }))} label="AI Chat + RAG" description="ตอบจากคลังความรู้เทศบาล" /><Toggle checked={modules.complaints} onChange={(value) => setModules((current) => ({ ...current, complaints: value }))} label="เรื่องร้องเรียน" description="รับเรื่อง ติดตาม และ SLA" /><Toggle checked={modules.handoff} onChange={(value) => setModules((current) => ({ ...current, handoff: value }))} label="Human Handoff" description="ส่งคำถามให้เจ้าหน้าที่" /><Toggle checked={modules.news} onChange={(value) => setModules((current) => ({ ...current, news: value }))} label="ข่าวประชาสัมพันธ์" description="เว็บไซต์และ LINE notification" /><Toggle checked={modules.pawn} onChange={(value) => setModules((current) => ({ ...current, pawn: value }))} label="สถานธนานุบาล" description="ราคาอ้างอิงและข้อมูลบริการ" /><Toggle checked={modules.executive} onChange={(value) => setModules((current) => ({ ...current, executive: value }))} label="Executive Dashboard" description="KPI เปรียบเทียบหน่วยงาน" /></div> : null}
          {step === 6 ? <div className="readiness-review"><div className="readiness-score"><ShieldCheck size={38} /><strong>92%</strong><span>พร้อมสร้าง Tenant</span></div><ul><li><CheckCircle2 size={17} />ข้อมูลองค์กรครบถ้วน</li><li><CheckCircle2 size={17} />อีเมลผู้ดูแลผ่านการตรวจรูปแบบ</li><li><CheckCircle2 size={17} />สีและตัวอักษรผ่าน Accessibility</li><li><CircleAlert size={17} />LINE OA ยังไม่ได้ทดสอบการเชื่อมต่อ</li><li><CheckCircle2 size={17} />เลือกโมดูลและแพ็กเกจแล้ว</li></ul><Toggle checked={confirmed} onChange={setConfirmed} label="ยืนยันว่าข้อมูลถูกต้อง" description="การสร้าง Tenant จะเริ่ม migration และ provisioning ทันที" /></div> : null}
          <div className="wizard-actions"><Button variant="secondary" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>ย้อนกลับ</Button><span /><Button disabled={step === 6 && !confirmed} onClick={() => setStep((value) => Math.min(6, value + 1))}>{step === 6 ? 'สร้าง Tenant' : 'บันทึกและถัดไป'} <ArrowRight size={17} /></Button></div>
        </Panel>
      </section>
      <aside className="provision-summary"><Panel title="สรุปการตั้งค่า"><dl><div><dt>ชื่อ</dt><dd>เทศบาลเมืองใหม่</dd></div><div><dt>รหัส</dt><dd>TM-029</dd></div><div><dt>แพ็กเกจ</dt><dd>Professional</dd></div><div><dt>โมดูล</dt><dd>{Object.values(modules).filter(Boolean).length} โมดูล</dd></div><div><dt>ผู้ดูแล</dt><dd>สุภาวดี เมืองใหม่</dd></div></dl><Button variant="secondary" size="sm" icon={<Copy size={15} />}>คัดลอกสรุป</Button></Panel><Notice tone="warning">Tenant จะอยู่สถานะ “กำลังตั้งค่า” จนกว่าจะผ่าน onboarding checklist และกด Go-live</Notice></aside>
    </div>
  )
}

export function SystemScreen({ screen, navigate }: SystemProps) {
  switch (screen.kind) {
    case 'tenant-list': return <TenantListScreen navigate={navigate} />
    case 'tenant-provision': return <TenantProvisionScreen />
    default: return null
  }
}
