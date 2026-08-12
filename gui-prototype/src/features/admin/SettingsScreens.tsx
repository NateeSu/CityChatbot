import { useMemo, useState } from 'react'
import {
  Accessibility,
  Bell,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  GripVertical,
  Image,
  Megaphone,
  MoreVertical,
  Newspaper,
  Palette,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { Badge, Button, Notice, Panel, SearchField, SegmentedControl, SelectField } from '../../components/Primitives'

interface SettingsProps {
  screen: ScreenDefinition
}

const tokenDefaults = [
  { name: 'Primary', value: '#0066B3' },
  { name: 'Secondary', value: '#0097A7' },
  { name: 'Accent', value: '#00BFA5' },
  { name: 'Neutral', value: '#687280' },
  { name: 'Background', value: '#FBFAFC' },
]

function ThemeScreen() {
  const [tokens, setTokens] = useState(tokenDefaults)
  const [preview, setPreview] = useState<'chat' | 'dashboard' | 'high'>('chat')
  const [radius, setRadius] = useState('12')
  const changeToken = (index: number, value: string) => setTokens((current) => current.map((token, tokenIndex) => tokenIndex === index ? { ...token, value } : token))
  return (
    <div className="theme-builder">
      <nav className="settings-subnav"><button className="is-active"><Palette size={18} />ภาพรวม</button><button><Image size={18} />สีและโทเค็น</button><button><Type size={18} />ตัวอักษร</button><button><Accessibility size={18} />การเข้าถึง</button><button><Eye size={18} />ตัวอย่างการแสดงผล</button></nav>
      <section className="theme-content">
        <Panel title="โทเค็นสี" subtitle="ทุกช่องทางจะอ้างอิงสีชุดเดียวกัน เพื่อให้แบรนด์สม่ำเสมอ">
          <div className="color-token-grid">{tokens.map((token, index) => <label key={token.name}><input type="color" value={token.value} onChange={(event) => changeToken(index, event.target.value)} /><span><strong>{token.name}</strong><input value={token.value.toUpperCase()} onChange={(event) => changeToken(index, event.target.value)} /></span></label>)}</div>
        </Panel>
        <div className="theme-two-columns">
          <Panel title="ตรวจสอบคอนทราสต์" action={<Button variant="secondary" size="sm" icon={<Accessibility size={15} />}>ตรวจทุกคู่สี</Button>}><div className="contrast-list"><div><span>Primary บน Background</span><Badge tone="green">AA 4.85 : 1</Badge></div><div><span>Secondary บน Background</span><Badge tone="green">AA 4.62 : 1</Badge></div><div><span>ข้อความหลักบน Background</span><Badge tone="green">AAA 12.63 : 1</Badge></div></div><Notice tone="success">ผ่านเกณฑ์ WCAG 2.2 AA สำหรับข้อความปกติ</Notice></Panel>
          <Panel title="ตัวอักษรและรูปทรง"><div className="typography-preview"><span><small>หัวข้อ</small><strong>พร้อมบริการ Aa</strong></span><span><small>เนื้อหา</small><p>เทศบาลยินดีให้บริการประชาชน Aa</p></span></div><label className="range-field">รัศมีมุม <strong>{radius}px</strong><input type="range" min="0" max="24" value={radius} onChange={(event) => setRadius(event.target.value)} /></label></Panel>
        </div>
        <Panel title="ตัวอย่างการแสดงผล" action={<SegmentedControl value={preview} onChange={setPreview} ariaLabel="ตัวอย่างธีม" options={[{ value: 'chat', label: 'LINE Chat' }, { value: 'dashboard', label: 'Dashboard' }, { value: 'high', label: 'High contrast' }]} />}>
          <div className={`theme-preview theme-preview--${preview}`} style={{ '--preview-primary': tokens[0].value, '--preview-secondary': tokens[1].value, '--preview-radius': `${radius}px` } as React.CSSProperties}>
            <div className="theme-preview__header"><span><Building2 size={17} /></span><strong>เทศบาลเมืองตัวอย่าง</strong><Bell size={18} /></div>
            <div className="theme-preview__body"><div className="preview-bubble">สวัสดีค่ะ วันนี้ให้เทศบาลช่วยเรื่องอะไรดีคะ?</div><div className="preview-menu"><button><Building2 size={21} />บริการ</button><button><Megaphone size={21} />แจ้งปัญหา</button><button><Search size={21} />ค้นหา</button></div></div>
          </div>
        </Panel>
        <div className="builder-actions"><span /><Button variant="secondary">คืนค่าเริ่มต้น</Button><Button icon={<Save size={16} />}>บันทึกธีม</Button></div>
      </section>
    </div>
  )
}

const menuDefaults = [
  { label: 'บริการของเรา', type: 'ข้อความ', icon: Building2, tone: 'teal' },
  { label: 'แจ้งเรื่องร้องเรียน', type: 'แบบฟอร์ม', icon: Megaphone, tone: 'green' },
  { label: 'ตรวจสอบสถานะ', type: 'ข้อความ', icon: Search, tone: 'blue' },
  { label: 'ข่าวสารประชาสัมพันธ์', type: 'ลิงก์', icon: Newspaper, tone: 'amber' },
  { label: 'ติดต่อเรา', type: 'ข้อความ', icon: Phone, tone: 'purple' },
]

function RichMenuScreen() {
  const [layout, setLayout] = useState(0)
  const [selected, setSelected] = useState(0)
  const [menuItems, setMenuItems] = useState(menuDefaults)
  const moveItem = (index: number, direction: -1 | 1) => {
    const destination = index + direction
    if (destination < 0 || destination >= menuItems.length) return
    setMenuItems((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(destination, 0, item)
      return next
    })
    setSelected(destination)
  }
  return (
    <div className="richmenu-builder">
      <section className="richmenu-config">
        <Panel title="1. เลือกเทมเพลต" action={<Button variant="secondary" size="sm">เทมเพลตเพิ่มเติม</Button>}><div className="layout-options">{[0, 1, 2, 3].map((value) => <button key={value} className={layout === value ? 'is-selected' : ''} onClick={() => setLayout(value)}><span className={`layout-mini layout-mini--${value + 1}`}><i /><i /><i /><i /><i /></span>{layout === value ? <Check size={15} /> : null}</button>)}</div></Panel>
        <Panel title={`2. ตั้งค่ารายการ (${menuItems.length} รายการ)`} action={<Button variant="secondary" size="sm">รีเซ็ตเป็นค่าเริ่มต้น</Button>}>
          <div className="menu-item-list">{menuItems.map(({ label, type, icon: Icon, tone }, index) => <div key={label} className={`menu-item-row ${selected === index ? 'is-selected' : ''}`}><button type="button" className="menu-item-select" aria-pressed={selected === index} onClick={() => setSelected(index)}><GripVertical size={17} /><span className={`rich-icon rich-icon--${tone}`}><Icon size={20} /></span><span><strong>{label}</strong><small>ประเภท: {type}</small></span><ChevronRight size={17} /></button><span className="reorder-buttons"><button type="button" aria-label={`เลื่อน ${label} ขึ้น`} disabled={index === 0} onClick={() => moveItem(index, -1)}>↑</button><button type="button" aria-label={`เลื่อน ${label} ลง`} disabled={index === menuItems.length - 1} onClick={() => moveItem(index, 1)}>↓</button></span></div>)}</div>
          <Button className="full-width" variant="secondary" icon={<Plus size={17} />}>เพิ่มรายการ (สูงสุด 6 รายการ)</Button>
        </Panel>
        <Panel title="3. ตั้งค่าการแสดงผล"><div className="form-grid"><label>ข้อความเมนูเมื่อย่อ<input defaultValue="เมนูหลัก" /></label><label>สีพื้นหลังเมนู<input type="color" defaultValue="#0F4F8F" /></label></div><Notice tone="info">ขนาดที่แนะนำ 2500 × 1686 px · อัตราส่วน 5:3</Notice></Panel>
      </section>
      <aside className="richmenu-preview">
        <div className="preview-header"><h2>ตัวอย่าง</h2><SegmentedControl value="phone" onChange={() => undefined} ariaLabel="อุปกรณ์ตัวอย่าง" options={[{ value: 'phone', label: 'มือถือ', icon: <Smartphone size={16} /> }, { value: 'tablet', label: 'แท็บเล็ต', icon: <Tablet size={16} /> }]} /></div>
        <div className="phone-mockup"><div className="phone-mockup__top">9:41 <span>▰ ◉ ▮</span></div><div className="phone-mockup__chat"><header><Building2 size={16} /><strong>เทศบาลเมืองตัวอย่าง</strong></header><span className="skyline"><Building2 size={48} /></span></div><div className={`phone-richmenu phone-richmenu--${layout + 1}`}>{menuItems.map(({ label, icon: Icon, tone }) => <button key={label} className={`menu-tone--${tone}`}><Icon size={25} /><span>{label}</span></button>)}</div></div>
        <Notice tone="info" title="พื้นที่ความปลอดภัย">เนื้อหาและข้อความสำคัญควรอยู่ภายในพื้นที่สีฟ้า</Notice>
      </aside>
      <footer className="richmenu-actions"><div><span>สถานะปัจจุบัน <Badge tone="amber">ฉบับร่าง</Badge></span><small>เวอร์ชัน v1.2.0 · บันทึกล่าสุด 10 ส.ค. 2569 14:35</small></div><Button variant="secondary">บันทึกฉบับร่าง</Button><Button icon={<Sparkles size={16} />}>เผยแพร่</Button><Button variant="secondary">ย้อนกลับเวอร์ชัน</Button></footer>
    </div>
  )
}

const auditRows = [
  { at: '10 ส.ค. 2569 10:22:14', actor: 'นวิตรา มีสุข', action: 'UPDATE_ROLE', resource: 'staff_profile', detail: 'แก้ไขสิทธิ์ของสายฝน ศรีสุข', ip: '203.0.113.42', tone: 'blue' },
  { at: '10 ส.ค. 2569 10:15:03', actor: 'สายฝน ศรีสุข', action: 'COMPLAINT_STATUS', resource: 'COM-2026-000987', detail: 'เปลี่ยนสถานะเป็น กำลังดำเนินการ', ip: '203.0.113.81', tone: 'green' },
  { at: '10 ส.ค. 2569 09:58:47', actor: 'ระบบ', action: 'RAG_REPROCESS', resource: 'document_version', detail: 'ประมวลผลเอกสารเวอร์ชัน 2.1 สำเร็จ', ip: 'internal', tone: 'teal' },
  { at: '10 ส.ค. 2569 09:45:12', actor: 'นวิตรา มีสุข', action: 'RICHMENU_PUBLISH', resource: 'rich_menu', detail: 'เผยแพร่ Rich Menu เวอร์ชัน 1.2.0', ip: '203.0.113.42', tone: 'amber' },
  { at: '10 ส.ค. 2569 09:31:08', actor: 'ระบบ', action: 'LOGIN_FAILED', resource: 'staff_profile', detail: 'เข้าสู่ระบบไม่สำเร็จ 3 ครั้ง', ip: '198.51.100.27', tone: 'red' },
]

function AuditLogScreen() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const rows = useMemo(() => auditRows.filter((row) => Object.values(row).some((value) => value.includes(query))), [query])
  return (
    <div className="audit-layout">
      <section className="audit-list">
        <Notice tone="info" title="บันทึกแก้ไขไม่ได้">Audit Log เป็น append-only และเก็บตามนโยบาย 365 วัน การส่งออกจะถูกบันทึกเป็นเหตุการณ์ใหม่</Notice>
        <div className="table-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาผู้ใช้ การกระทำ ทรัพยากร หรือ IP…" /><SelectField value="ทุกการกระทำ" options={['ทุกการกระทำ', 'สิทธิ์และผู้ใช้', 'เรื่องร้องเรียน', 'คลังความรู้', 'การตั้งค่า']} onChange={() => undefined} /><SelectField value="7 วันล่าสุด" options={['วันนี้', '7 วันล่าสุด', '30 วันล่าสุด']} onChange={() => undefined} /><Button variant="secondary" icon={<Download size={16} />}>ส่งออก</Button></div>
        <div className="data-table-wrap"><table className="data-table audit-table"><thead><tr><th>วันเวลา</th><th>ผู้กระทำ</th><th>การกระทำ</th><th>ทรัพยากร</th><th>รายละเอียด</th><th>IP</th><th /></tr></thead><tbody>{rows.map((row) => { const originalIndex = auditRows.indexOf(row); return <tr key={row.at} className={selected === originalIndex ? 'is-selected' : ''} onClick={() => setSelected(originalIndex)}><td>{row.at}</td><td><strong>{row.actor}</strong></td><td><Badge tone={row.tone as 'blue' | 'green' | 'teal' | 'amber' | 'red'}>{row.action}</Badge></td><td>{row.resource}</td><td>{row.detail}</td><td><code>{row.ip}</code></td><td><ChevronRight size={16} /></td></tr>})}</tbody></table></div>
      </section>
      <aside className="audit-inspector"><header><span><ShieldCheck size={22} /></span><div><h2>รายละเอียดเหตุการณ์</h2><p>Event ID: evt_01J5TN8R2K</p></div><button><MoreVertical size={18} /></button></header><dl><div><dt>วันเวลา</dt><dd>{auditRows[selected].at}</dd></div><div><dt>ผู้กระทำ</dt><dd>{auditRows[selected].actor}</dd></div><div><dt>การกระทำ</dt><dd>{auditRows[selected].action}</dd></div><div><dt>ทรัพยากร</dt><dd>{auditRows[selected].resource}</dd></div><div><dt>IP address</dt><dd>{auditRows[selected].ip}</dd></div></dl><h3>ค่าที่เปลี่ยนแปลง</h3><div className="diff-view"><div><span>ก่อน</span><code>"role": "officer"</code><code>"knowledge.publish": false</code></div><div><span>หลัง</span><code>"role": "department_head"</code><code>"knowledge.publish": true</code></div></div><Button className="full-width" variant="secondary" icon={<Copy size={16} />}>คัดลอก Event JSON</Button></aside>
    </div>
  )
}

export function SettingsScreen({ screen }: SettingsProps) {
  switch (screen.kind) {
    case 'theme': return <ThemeScreen />
    case 'richmenu': return <RichMenuScreen />
    case 'audit-log': return <AuditLogScreen />
    default: return null
  }
}
