import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  FileBarChart,
  FileText,
  Filter,
  Gauge,
  ImagePlus,
  LockKeyhole,
  Megaphone,
  MoreVertical,
  PenLine,
  Plus,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
  WandSparkles,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { departments, metrics } from '../../data/sampleData'
import { Badge, Button, MetricCard, Notice, Panel, ProgressBar, SearchField, SegmentedControl, SelectField, Toggle } from '../../components/Primitives'

interface ManagementProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

const newsAdminRows = [
  { title: 'แจ้งปิดปรับปรุงระบบประปาชั่วคราว', category: 'ประกาศสำคัญ', status: 'เผยแพร่แล้ว', publish: '10 ส.ค. 2569 09:00', channel: 'เว็บไซต์ + LINE', owner: 'งานประชาสัมพันธ์' },
  { title: 'เชิญร่วมกิจกรรมปลูกต้นไม้ในชุมชน', category: 'กิจกรรม', status: 'ตั้งเวลา', publish: '12 ส.ค. 2569 08:00', channel: 'เว็บไซต์ + LINE', owner: 'กองยุทธศาสตร์ฯ' },
  { title: 'เปิดจุดบริการชำระภาษีนอกเวลาราชการ', category: 'บริการประชาชน', status: 'แบบร่าง', publish: '—', channel: 'เว็บไซต์', owner: 'กองคลัง' },
  { title: 'ผลการประชุมสภาเทศบาล สมัยสามัญ', category: 'ข่าวประชาสัมพันธ์', status: 'เผยแพร่แล้ว', publish: '8 ส.ค. 2569 14:30', channel: 'เว็บไซต์', owner: 'สำนักปลัดฯ' },
]

function NewsAdminListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [status, setStatus] = useState('ทั้งหมด')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => newsAdminRows.filter((row) => (status === 'ทั้งหมด' || row.status === status) && row.title.includes(query)), [query, status])
  return (
    <div className="table-page news-admin-page">
      <div className="table-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อข่าว หมวด หรือผู้เขียน…" /><SelectField value={status} options={['ทั้งหมด', 'แบบร่าง', 'ตั้งเวลา', 'เผยแพร่แล้ว', 'เก็บถาวร']} onChange={setStatus} /><Button variant="secondary" icon={<Filter size={17} />}>ตัวกรอง</Button><Button icon={<Plus size={17} />} onClick={() => navigate('A-61')}>เพิ่มข่าว</Button></div>
      <div className="news-summary"><article><span><FileText size={20} /></span><div><strong>7</strong><small>แบบร่าง</small></div></article><article><span><CalendarClock size={20} /></span><div><strong>3</strong><small>ตั้งเวลา</small></div></article><article><span><Megaphone size={20} /></span><div><strong>42</strong><small>เผยแพร่เดือนนี้</small></div></article><article><span><Bell size={20} /></span><div><strong>12,845</strong><small>ผู้รับ LINE ล่าสุด</small></div></article></div>
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>หัวข้อข่าว</th><th>หมวด</th><th>สถานะ</th><th>กำหนดเผยแพร่</th><th>ช่องทาง</th><th>เจ้าของเนื้อหา</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.title} onDoubleClick={() => navigate('A-61')}><td><span className="document-title"><span className="news-row-thumb"><Megaphone size={18} /></span><strong>{row.title}</strong></span></td><td>{row.category}</td><td><Badge tone={row.status === 'เผยแพร่แล้ว' ? 'green' : row.status === 'ตั้งเวลา' ? 'blue' : 'neutral'}>{row.status}</Badge></td><td>{row.publish}</td><td>{row.channel}</td><td>{row.owner}</td><td><button><MoreVertical size={17} /></button></td></tr>)}</tbody></table></div>
      <footer className="table-footer"><span>แสดง {rows.length} จาก 128 ข่าว</span><Button variant="secondary" size="sm">ดูปฏิทินการเผยแพร่</Button></footer>
    </div>
  )
}

function NewsEditorScreen() {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [title, setTitle] = useState('เปิดจุดบริการชำระภาษีนอกเวลาราชการ ประจำเดือนสิงหาคม')
  const [body, setBody] = useState('เทศบาลเมืองตัวอย่างเปิดให้บริการรับชำระภาษีที่ดินและสิ่งปลูกสร้างนอกเวลาราชการ เพื่ออำนวยความสะดวกแก่ประชาชนในพื้นที่\n\nให้บริการวันเสาร์ที่ 15 และ 22 สิงหาคม เวลา 09:00–15:00 น. ณ ห้องบริการประชาชน ชั้น 1 อาคารสำนักงานเทศบาล')
  const [notify, setNotify] = useState(true)
  return (
    <div className="news-editor-layout">
      <div className="editor-main">
        <div className="editor-toolbar"><SegmentedControl value={mode} onChange={setMode} ariaLabel="โหมดตัวแก้ไขข่าว" options={[{ value: 'edit', label: 'แก้ไข' }, { value: 'preview', label: 'ตัวอย่าง' }]} /><span /><Button variant="secondary" icon={<Save size={16} />}>บันทึกร่าง</Button><Button icon={<Check size={16} />}>บันทึกและตรวจสอบ</Button></div>
        {mode === 'edit' ? (
          <Panel>
            <div className="article-form">
              <label>หัวข้อข่าว <em>*</em><input value={title} onChange={(event) => setTitle(event.target.value)} /><small>{title.length}/120</small></label>
              <div className="form-grid"><SelectField label="หมวดข่าว" value="บริการประชาชน" options={['บริการประชาชน', 'ประกาศสำคัญ', 'กิจกรรม', 'ข่าวประชาสัมพันธ์']} onChange={() => undefined} /><SelectField label="สถานะ" value="แบบร่าง" options={['แบบร่าง', 'ตั้งเวลา', 'เผยแพร่ทันที']} onChange={() => undefined} /></div>
              <label>ภาพปก<div className="cover-upload"><ImagePlus size={28} /><span><strong>เพิ่มภาพปก</strong><small>แนะนำ 1600 × 900 px · JPG/PNG</small></span><Button variant="secondary" size="sm">เลือกภาพ</Button></div></label>
              <label>เนื้อหาข่าว <em>*</em><div className="rich-toolbar"><button>H2</button><button><strong>B</strong></button><button><em>I</em></button><button>• รายการ</button><button>🔗 ลิงก์</button></div><textarea value={body} onChange={(event) => setBody(event.target.value)} /></label>
            </div>
          </Panel>
        ) : (
          <Panel className="article-preview"><Badge tone="blue">บริการประชาชน</Badge><h1>{title}</h1><time>กำหนดเผยแพร่ 12 ส.ค. 2569 เวลา 08:00 น.</time><div className="article-cover"><Megaphone size={48} /></div>{body.split('\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</Panel>
        )}
      </div>
      <aside className="editor-inspector">
        <Panel title={<span className="ai-title"><WandSparkles size={18} />AI ช่วยเขียน</span>} subtitle="เนื้อหาที่ AI สร้างเป็นแบบร่าง เจ้าหน้าที่ต้องตรวจเสมอ">
          <div className="ai-writing-tools"><Button variant="secondary" size="sm">ปรับเป็นทางการ</Button><Button variant="secondary" size="sm">สรุปให้กระชับ</Button><Button variant="secondary" size="sm">ตรวจคำผิด</Button><Button variant="secondary" size="sm">สร้าง LINE caption</Button></div>
          <Notice tone="info">AI จะไม่เผยแพร่ข่าวหรือเปลี่ยนวันที่โดยอัตโนมัติ</Notice>
        </Panel>
        <Panel title="การเผยแพร่">
          <label className="field-label">วันที่และเวลา<input type="datetime-local" defaultValue="2026-08-12T08:00" /></label>
          <Toggle checked={notify} onChange={setNotify} label="ส่งแจ้งเตือนผ่าน LINE" description="ประมาณ 12,845 ผู้รับ" />
          <SelectField label="กลุ่มเป้าหมาย" value="ประชาชนทุกคน" options={['ประชาชนทุกคน', 'เฉพาะผู้ติดตามข่าว', 'เลือกชุมชน']} onChange={() => undefined} />
        </Panel>
        <Panel title="ตรวจความพร้อม"><ul className="publish-checklist"><li><CheckCircle2 size={16} />หัวข้อและเนื้อหาครบถ้วน</li><li><CheckCircle2 size={16} />วันที่เผยแพร่อยู่ในอนาคต</li><li className="is-warning"><AlertTriangle size={16} />ยังไม่มีภาพปก</li></ul></Panel>
      </aside>
    </div>
  )
}

function DepartmentListScreen() {
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [query, setQuery] = useState('')
  const filtered = departments.filter((department) => department.name.includes(query) || department.scope.includes(query))
  return (
    <div className="department-page">
      <div className="table-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาหน่วยงานหรือขอบเขตงาน…" /><SelectField value="ทุกสถานะ" options={['ทุกสถานะ', 'เปิดใช้งาน', 'ปิดใช้งาน']} onChange={() => undefined} /><SegmentedControl value={view} onChange={setView} ariaLabel="รูปแบบรายการหน่วยงาน" options={[{ value: 'cards', label: 'การ์ด' }, { value: 'table', label: 'ตาราง' }]} /><Button icon={<Plus size={17} />}>เพิ่มหน่วยงาน</Button></div>
      {view === 'cards' ? <div className="department-grid">{filtered.map((department, index) => <article key={department.name}><header><span className={`department-icon department-icon--${index + 1}`}><Building2 size={21} /></span><div><h2>{department.name}</h2><Badge tone="green">เปิดใช้งาน</Badge></div><button><MoreVertical size={17} /></button></header><p>{department.scope}</p><dl><div><dt>เจ้าหน้าที่</dt><dd>{department.people} คน</dd></div><div><dt>งานเปิดอยู่</dt><dd>{department.open} เรื่อง</dd></div><div><dt>SLA สำเร็จ</dt><dd>{department.sla}%</dd></div></dl><ProgressBar value={department.sla} tone={department.sla < 90 ? 'amber' : 'green'} /><footer><button>ดูขอบเขตงาน</button><button>จัดการสมาชิก <ChevronRight size={15} /></button></footer></article>)}</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>หน่วยงาน</th><th>ขอบเขตหลัก</th><th>เจ้าหน้าที่</th><th>งานเปิดอยู่</th><th>SLA สำเร็จ</th><th /></tr></thead><tbody>{filtered.map((department) => <tr key={department.name}><td><strong>{department.name}</strong></td><td>{department.scope}</td><td>{department.people}</td><td>{department.open}</td><td><Badge tone={department.sla < 90 ? 'amber' : 'green'}>{department.sla}%</Badge></td><td><ChevronRight size={16} /></td></tr>)}</tbody></table></div>}
    </div>
  )
}

const slaRules = [
  { name: 'ไฟฟ้าสาธารณะเร่งด่วน', category: 'ไฟฟ้าส่องสว่าง', priority: 'สูง', acknowledge: '30 นาที', resolve: '8 ชั่วโมง', calendar: '24/7', active: true },
  { name: 'ขยะและสิ่งปฏิกูล', category: 'ขยะ / สิ่งปฏิกูล', priority: 'ปานกลาง', acknowledge: '2 ชั่วโมง', resolve: '1 วัน', calendar: 'เวลาราชการ', active: true },
  { name: 'ถนนและทางเท้า', category: 'ถนน / ทางเท้า', priority: 'สูง', acknowledge: '1 ชั่วโมง', resolve: '3 วัน', calendar: 'เวลาราชการ', active: true },
  { name: 'คำถามประชาชนทั่วไป', category: 'Human Handoff', priority: 'ปานกลาง', acknowledge: '15 นาที', resolve: '1 ชั่วโมง', calendar: 'เวลาราชการ', active: false },
]

function SlaBuilderScreen() {
  const [selected, setSelected] = useState(0)
  const [enabled, setEnabled] = useState(slaRules[0].active)
  const rule = slaRules[selected]
  return (
    <div className="builder-layout sla-builder">
      <section className="builder-list"><div className="builder-list__toolbar"><SearchField placeholder="ค้นหากฎ SLA…" /><Button size="sm" icon={<Plus size={16} />}>เพิ่มกฎ</Button></div>{slaRules.map((item, index) => <button key={item.name} className={selected === index ? 'is-selected' : ''} onClick={() => { setSelected(index); setEnabled(item.active) }}><span><strong>{item.name}</strong><small>{item.category} · {item.priority}</small></span><Badge tone={item.active ? 'green' : 'neutral'}>{item.active ? 'ใช้งาน' : 'ปิด'}</Badge><ChevronRight size={17} /></button>)}</section>
      <section className="builder-editor">
        <Panel title="รายละเอียดกฎ" action={<Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} />}>
          <div className="form-grid"><label>ชื่อกฎ<input defaultValue={rule.name} key={rule.name} /></label><SelectField label="หมวดเรื่อง" value={rule.category} options={['ไฟฟ้าส่องสว่าง', 'ขยะ / สิ่งปฏิกูล', 'ถนน / ทางเท้า', 'Human Handoff']} onChange={() => undefined} /><SelectField label="ระดับความสำคัญ" value={rule.priority} options={['สูง', 'ปานกลาง', 'ต่ำ']} onChange={() => undefined} /><SelectField label="ปฏิทินทำงาน" value={rule.calendar} options={['24/7', 'เวลาราชการ', 'ปฏิทินเหตุฉุกเฉิน']} onChange={() => undefined} /></div>
        </Panel>
        <Panel title="เป้าหมายเวลา"><div className="sla-time-grid"><label><span><Clock3 size={17} />ตอบรับภายใน</span><input defaultValue={rule.acknowledge.split(' ')[0]} /><select defaultValue={rule.acknowledge.split(' ')[1]}><option>นาที</option><option>ชั่วโมง</option></select></label><label><span><Gauge size={17} />แก้ไขภายใน</span><input defaultValue={rule.resolve.split(' ')[0]} /><select defaultValue={rule.resolve.split(' ')[1]}><option>ชั่วโมง</option><option>วัน</option></select></label></div></Panel>
        <Panel title="ลำดับการแจ้งเตือน"><ol className="escalation-list"><li><span>1</span><div><strong>เมื่อใช้เวลา 75%</strong><small>แจ้งเตือนผู้รับผิดชอบผ่านระบบ</small></div><button><PenLine size={16} /></button></li><li><span>2</span><div><strong>เมื่อใช้เวลา 90%</strong><small>แจ้งหัวหน้าหน่วยงานและผู้รับผิดชอบ</small></div><button><PenLine size={16} /></button></li><li><span>3</span><div><strong>เมื่อเกิน SLA</strong><small>แจ้งผู้บริหารและเพิ่มเป็นรายการเร่งด่วน</small></div><button><PenLine size={16} /></button></li></ol><Button variant="secondary" size="sm" icon={<Plus size={15} />}>เพิ่มขั้น</Button></Panel>
        <div className="builder-actions"><Button variant="secondary">ยกเลิก</Button><Button icon={<Save size={16} />}>บันทึกกฎ SLA</Button></div>
      </section>
      <aside className="builder-preview"><Panel title="ตัวอย่างการคำนวณ"><div className="sla-preview-ring"><CircleGauge size={34} /><strong>02:15:30</strong><small>เวลาคงเหลือ</small></div><dl><div><dt>รับเรื่อง</dt><dd>10 ส.ค. 09:15</dd></div><div><dt>ครบกำหนด</dt><dd>10 ส.ค. 17:15</dd></div><div><dt>แจ้งเตือนครั้งแรก</dt><dd>15:15</dd></div></dl><Notice tone="warning">วันหยุดจะถูกนับตามปฏิทิน 24/7 ของกฎนี้</Notice></Panel></aside>
    </div>
  )
}

const staffRows = [
  { name: 'นวิตรา มีสุข', email: 'nawitra@municipality.go.th', department: 'สำนักปลัดเทศบาล', role: 'ผู้ดูแลเทศบาล', status: 'ใช้งาน', last: '10 ส.ค. 2569 10:22' },
  { name: 'สายฝน ศรีสุข', email: 'saifon@municipality.go.th', department: 'กองช่าง', role: 'เจ้าหน้าที่ปฏิบัติการ', status: 'ใช้งาน', last: '10 ส.ค. 2569 09:58' },
  { name: 'อรอนงค์ มีชัย', email: 'oranong@municipality.go.th', department: 'กองสาธารณสุขฯ', role: 'หัวหน้าหน่วยงาน', status: 'ใช้งาน', last: '9 ส.ค. 2569 16:40' },
  { name: 'วิทยา นิ่มนวล', email: 'wittaya@municipality.go.th', department: 'กองช่าง', role: 'เจ้าหน้าที่ปฏิบัติการ', status: 'ระงับ', last: '1 ส.ค. 2569 13:08' },
]

function StaffRbacScreen() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [permissions, setPermissions] = useState({ complaints: true, assign: true, knowledge: false, reports: true })
  const rows = staffRows.filter((row) => row.name.includes(query) || row.email.includes(query) || row.department.includes(query))
  return (
    <div className="staff-layout">
      <section className="staff-list"><div className="table-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือหน่วยงาน…" /><SelectField value="ทุกบทบาท" options={['ทุกบทบาท', 'ผู้ดูแลเทศบาล', 'หัวหน้าหน่วยงาน', 'เจ้าหน้าที่ปฏิบัติการ']} onChange={() => undefined} /><Button icon={<UserPlus size={17} />}>เชิญเจ้าหน้าที่</Button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>เจ้าหน้าที่</th><th>หน่วยงาน</th><th>บทบาท</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th></tr></thead><tbody>{rows.map((row) => { const originalIndex = staffRows.indexOf(row); return <tr key={row.email} className={selected === originalIndex ? 'is-selected' : ''} onClick={() => setSelected(originalIndex)}><td><span className="staff-cell"><span className="avatar">{row.name.slice(0, 2)}</span><span><strong>{row.name}</strong><small>{row.email}</small></span></span></td><td>{row.department}</td><td><Badge tone="blue">{row.role}</Badge></td><td><Badge tone={row.status === 'ใช้งาน' ? 'green' : 'red'}>{row.status}</Badge></td><td>{row.last}</td></tr>})}</tbody></table></div></section>
      <aside className="staff-inspector"><header><span className="avatar avatar--large">{staffRows[selected].name.slice(0, 2)}</span><div><h2>{staffRows[selected].name}</h2><p>{staffRows[selected].email}</p></div><button><MoreVertical size={18} /></button></header><SelectField label="บทบาทหลัก" value={staffRows[selected].role} options={['ผู้ดูแลเทศบาล', 'หัวหน้าหน่วยงาน', 'เจ้าหน้าที่ปฏิบัติการ', 'ผู้ดูรายงาน']} onChange={() => undefined} /><SelectField label="ขอบเขตหน่วยงาน" value={staffRows[selected].department} options={departments.map((department) => department.name)} onChange={() => undefined} /><h3>สิทธิ์สำคัญ</h3><Toggle checked={permissions.complaints} onChange={(value) => setPermissions((current) => ({ ...current, complaints: value }))} label="ดูและแก้ไขเรื่องร้องเรียน" /><Toggle checked={permissions.assign} onChange={(value) => setPermissions((current) => ({ ...current, assign: value }))} label="มอบหมายเจ้าหน้าที่" /><Toggle checked={permissions.knowledge} onChange={(value) => setPermissions((current) => ({ ...current, knowledge: value }))} label="เผยแพร่คลังความรู้" /><Toggle checked={permissions.reports} onChange={(value) => setPermissions((current) => ({ ...current, reports: value }))} label="ดูรายงานหน่วยงาน" /><Notice tone="info"><LockKeyhole size={15} /> การเปลี่ยนสิทธิ์ทุกครั้งจะถูกบันทึกใน Audit Log</Notice><Button className="full-width" icon={<ShieldCheck size={16} />}>บันทึกสิทธิ์</Button></aside>
    </div>
  )
}

function KpiScreen() {
  const [period, setPeriod] = useState('เดือนนี้')
  const reportMetrics = [metrics[0], metrics[3], { label: 'เกิน SLA', value: '4.8%', delta: '-1.2%', tone: 'green' }, { label: 'ตอบรับเฉลี่ย', value: '42 นาที', delta: '-8 นาที', tone: 'green' }, metrics[4]]
  const icons = [FileBarChart, CheckCircle2, AlertTriangle, Clock3, Users]
  return (
    <div className="kpi-page">
      <div className="report-toolbar"><SelectField value={period} options={['สัปดาห์นี้', 'เดือนนี้', 'ไตรมาสนี้', 'ปีงบประมาณ 2569']} onChange={setPeriod} /><SelectField value="ทุกหน่วยงาน" options={['ทุกหน่วยงาน', ...departments.map((department) => department.name)]} onChange={() => undefined} /><Button variant="secondary" icon={<Filter size={16} />}>ตัวกรอง</Button><Button icon={<FileBarChart size={16} />}>ส่งออกรายงาน</Button></div>
      <div className="metrics-grid metrics-grid--five">{reportMetrics.map((metric, index) => { const Icon = icons[index]; return <MetricCard key={metric.label} {...metric} icon={<Icon size={20} />} /> })}</div>
      <div className="kpi-grid"><Panel title="ผลงานตามหน่วยงาน" action={<Badge tone="blue">{period}</Badge>}><div className="bar-chart-admin">{departments.map((department) => <div key={department.name}><span>{department.name}</span><div><i style={{ width: `${department.sla}%` }} /><em>{department.sla}%</em></div></div>)}</div></Panel><Panel title="แนวโน้ม SLA"><svg className="mini-line-chart" viewBox="0 0 500 210" role="img" aria-label="แนวโน้ม SLA"><g><line x1="20" y1="40" x2="480" y2="40" /><line x1="20" y1="100" x2="480" y2="100" /><line x1="20" y1="160" x2="480" y2="160" /></g><path d="M20 145 C90 125 130 138 190 92 S290 72 350 55 S425 80 480 38" /><circle cx="480" cy="38" r="6" /></svg><div className="chart-kpis"><span><strong>94.2%</strong> SLA สำเร็จ</span><span><strong>+3.8%</strong> จากเดือนก่อน</span></div></Panel></div>
      <Panel title="เปรียบเทียบหน่วยงาน" action={<Button variant="secondary" size="sm">ดูรายละเอียด</Button>}><div className="data-table-wrap"><table className="data-table"><thead><tr><th>หน่วยงาน</th><th>รับเรื่อง</th><th>เสร็จสิ้น</th><th>ค้างอยู่</th><th>เกิน SLA</th><th>ตอบรับเฉลี่ย</th><th>ความพึงพอใจ</th></tr></thead><tbody>{departments.map((department, index) => <tr key={department.name}><td><strong>{department.name}</strong></td><td>{205 - index * 29}</td><td>{172 - index * 22}</td><td>{department.open}</td><td><Badge tone={department.sla < 90 ? 'red' : 'green'}>{100 - department.sla}%</Badge></td><td>{32 + index * 6} นาที</td><td>{(4.56 - index * 0.08).toFixed(2)}/5</td></tr>)}</tbody></table></div></Panel>
      <Notice tone="info" title="สรุปโดย AI จากข้อมูลช่วงที่เลือก">กองช่างมีสัดส่วนงานเกิน SLA สูงกว่าหน่วยงานอื่น ควรตรวจภาระงานช่วง 08:00–11:00 น. ตัวเลขทุกค่ามาจาก query report snapshot เท่านั้น</Notice>
    </div>
  )
}

export function ManagementScreen({ screen, navigate }: ManagementProps) {
  switch (screen.kind) {
    case 'news-admin-list': return <NewsAdminListScreen navigate={navigate} />
    case 'news-editor': return <NewsEditorScreen />
    case 'department-list': return <DepartmentListScreen />
    case 'sla-builder': return <SlaBuilderScreen />
    case 'staff-rbac': return <StaffRbacScreen />
    case 'kpi': return <KpiScreen />
    default: return null
  }
}
