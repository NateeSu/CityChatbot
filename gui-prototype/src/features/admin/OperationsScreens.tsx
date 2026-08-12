import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Image,
  LayoutList,
  Map,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Sparkles,
  TimerReset,
  UserRoundCheck,
  Users,
  WandSparkles,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { complaints, metrics, tickets } from '../../data/sampleData'
import { Badge, Button, MetricCard, Notice, Panel, ProgressBar, SearchField, SegmentedControl, SelectField } from '../../components/Primitives'

interface OperationsProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

const metricIcons = [FileText, Clock3, BellRing, CheckCircle2, Users]

function TrendChart() {
  return (
    <div className="trend-chart">
      <div className="chart-legend"><span><i className="dot dot--blue" />เรื่องใหม่</span><span><i className="dot dot--green" />ดำเนินการแล้ว</span><span><i className="dash" />ค่าเฉลี่ย 7 วัน</span></div>
      <svg viewBox="0 0 620 220" role="img" aria-label="แนวโน้มเรื่องร้องเรียนระหว่างวันที่ 4 ถึง 10 สิงหาคม">
        <g className="chart-grid"><line x1="40" y1="30" x2="600" y2="30" /><line x1="40" y1="80" x2="600" y2="80" /><line x1="40" y1="130" x2="600" y2="130" /><line x1="40" y1="180" x2="600" y2="180" /></g>
        <path className="chart-average" d="M40 120 C170 115 300 100 600 108" />
        <path className="chart-line chart-line--primary" d="M40 147 C95 150 125 151 165 100 S220 55 270 90 S340 120 385 78 S450 35 500 118 S560 150 600 128" />
        <path className="chart-area" d="M40 147 C95 150 125 151 165 100 S220 55 270 90 S340 120 385 78 S450 35 500 118 S560 150 600 128 L600 190 L40 190 Z" />
        <path className="chart-line chart-line--success" d="M40 164 C90 168 130 169 170 142 S225 105 270 130 S335 110 382 142 S440 150 492 160 S550 170 600 150" />
      </svg>
      <div className="chart-axis"><span>4 ส.ค.</span><span>5 ส.ค.</span><span>6 ส.ค.</span><span>7 ส.ค.</span><span>8 ส.ค.</span><span>9 ส.ค.</span><span>10 ส.ค.</span></div>
    </div>
  )
}

function DashboardScreen() {
  const [period, setPeriod] = useState('7 วันล่าสุด')
  return (
    <div className="dashboard-grid">
      <div className="dashboard-filters">
        <SelectField value={period} options={['วันนี้', '7 วันล่าสุด', '30 วันล่าสุด', 'ไตรมาสนี้']} onChange={setPeriod} />
        <Badge tone="green">อัปเดตเมื่อ 10:30 น.</Badge>
      </div>
      <div className="metrics-grid metrics-grid--five">
        {metrics.map((metric, index) => {
          const Icon = metricIcons[index]
          return <MetricCard key={metric.label} {...metric} icon={<Icon size={21} />} />
        })}
      </div>
      <Panel title="แนวโน้มเรื่องร้องเรียน" className="dashboard-trend" action={<button className="text-link">ดูรายงาน</button>}><TrendChart /></Panel>
      <Panel title="เรื่องใกล้เกิน SLA" className="dashboard-sla" action={<Badge tone="red">38 รายการ</Badge>}>
        <div className="compact-table">
          {complaints.slice(0, 4).map((item, index) => (
            <button key={item.id}><span><b>{item.id.replace('COM-2026-', '#')}</b><small>{item.title}</small></span><span>{item.department}</span><Badge tone={index < 2 ? 'red' : 'amber'}>{index + 2} ชม.</Badge><ChevronRight size={16} /></button>
          ))}
        </div>
      </Panel>
      <Panel title="ภาระงานรายหน่วยงาน" className="dashboard-workload">
        <div className="workload-list">
          {[
            ['สำนักปลัดฯ', 84, 205], ['กองช่าง', 74, 193], ['กองสาธารณสุขฯ', 61, 134], ['กองการศึกษา', 47, 108], ['กองคลัง', 39, 78],
          ].map(([label, value, total]) => <div key={label as string}><span>{label}</span><ProgressBar value={value as number} tone={(value as number) > 70 ? 'amber' : 'green'} /><b>{total}</b></div>)}
        </div>
      </Panel>
      <Panel title="เรื่องร้องเรียนบนแผนที่" className="dashboard-map" action={<button className="text-link">ดูทั้งหมด</button>}>
        <div className="map-visual-admin"><span className="map-pin pin--1">8</span><span className="map-pin pin--2">12</span><span className="map-pin pin--3">24</span><span className="map-pin pin--4">7</span><i /><i /><i /></div>
      </Panel>
      <Panel title="สรุปภาพรวมโดย AI" className="dashboard-ai" subtitle="อ้างอิงเฉพาะตัวเลขจากรายงานช่วงเวลาที่เลือก">
        <ul className="ai-insights"><li><BarChart3 size={17} />เรื่องใหม่เพิ่มขึ้น 18.2% โดยหมวดไฟฟ้าสาธารณะเพิ่มมากที่สุด</li><li><AlertTriangle size={17} />กองช่างมีภาระงานสูง ควรจัดสรรกำลังคนเพิ่มในช่วงเวลาเร่งด่วน</li><li><CheckCircle2 size={17} />ความพึงพอใจดีขึ้นต่อเนื่องและยังอยู่เหนือเป้าหมาย</li></ul>
        <Button variant="secondary" size="sm">ดูรายละเอียดการวิเคราะห์</Button>
      </Panel>
    </div>
  )
}

function ComplaintListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<Set<string>>(() => new Set([complaints[0].id, complaints[1].id]))
  const rows = useMemo(() => complaints.filter((item) => (status === 'ทั้งหมด' || item.status === status) && (item.title.includes(query) || item.id.toLowerCase().includes(query.toLowerCase()))), [query, status])
  const toggleRow = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  return (
    <div className="table-page">
      <div className="table-toolbar">
        <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเรื่องร้องเรียน เลขที่เรื่อง สถานที่ หรือผู้แจ้ง…" />
        <SelectField value={status} options={['ทั้งหมด', 'รอรับเรื่อง', 'รอตรวจสอบ', 'กำลังดำเนินการ', 'เสร็จสิ้น']} onChange={setStatus} />
        <Button variant="secondary" icon={<Filter size={17} />}>ตัวกรองเพิ่มเติม <Badge tone="blue">2</Badge></Button>
        <SegmentedControl value="list" onChange={() => undefined} ariaLabel="รูปแบบการแสดงผล" options={[{ value: 'list', label: 'รายการ', icon: <LayoutList size={16} /> }, { value: 'map', label: 'แผนที่', icon: <Map size={16} /> }]} />
      </div>
      {selected.size ? <div className="bulk-bar"><strong>เลือกแล้ว {selected.size} รายการ</strong><button>เลือกทั้งหมด 50 รายการในหน้านี้</button><span /><Button variant="secondary" size="sm" icon={<UserRoundCheck size={16} />}>มอบหมาย</Button><Button variant="secondary" size="sm">เปลี่ยนสถานะ</Button><Button variant="ghost" size="sm" icon={<MoreHorizontal size={17} />}>เพิ่มเติม</Button></div> : null}
      <div className="data-table-wrap">
        <table className="data-table complaint-table">
          <thead><tr><th aria-label="เลือก" /><th>เลขที่เรื่อง</th><th>หัวข้อเรื่อง</th><th>ประเภทเรื่อง</th><th>สถานะ</th><th>ความสำคัญ</th><th>หน่วยงาน</th><th>ผู้รับผิดชอบ</th><th>SLA</th><th>รับเรื่องเมื่อ</th></tr></thead>
          <tbody>{rows.map((item, index) => (
            <tr key={item.id} className={selected.has(item.id) ? 'is-selected' : ''} onDoubleClick={() => navigate('A-25')}>
              <td><input type="checkbox" aria-label={`เลือก ${item.id}`} checked={selected.has(item.id)} onChange={() => toggleRow(item.id)} /></td>
              <td><button className="cell-link" onClick={() => navigate('A-25')}>{item.id}</button></td>
              <td><strong>{item.title}</strong><small><MapPin size={13} />เทศบาลเมืองตัวอย่าง</small></td>
              <td>{item.category}</td><td><Badge tone={item.status === 'เสร็จสิ้น' ? 'green' : item.status === 'กำลังดำเนินการ' ? 'blue' : 'neutral'}>{item.status}</Badge></td>
              <td><Badge tone={item.priority === 'สูง' ? 'red' : item.priority === 'ปานกลาง' ? 'amber' : 'green'}>{item.priority}</Badge></td><td>{item.department}</td><td>{item.owner}</td>
              <td><span className={index === 0 ? 'sla-danger' : ''}>{index === 0 ? 'ใกล้เกิน SLA' : item.sla}</span></td><td>{item.updated}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <footer className="table-footer"><span>แสดง 1–{rows.length} จากทั้งหมด 1,248 รายการ</span><div className="pagination"><button>‹</button><button className="is-active">1</button><button>2</button><button>3</button><button>…</button><button>25</button><button>›</button></div></footer>
    </div>
  )
}

function ComplaintDetailScreen() {
  const [tab, setTab] = useState<'timeline' | 'notes' | 'messages' | 'audit'>('timeline')
  const [status, setStatus] = useState('กำลังดำเนินการ')
  const [assignee, setAssignee] = useState('สายฝน ศ.')
  return (
    <div className="detail-layout complaint-detail">
      <div className="detail-main">
        <Panel className="complaint-overview">
          <div className="record-heading"><span><Users size={19} /></span><div><small>ผู้แจ้ง</small><strong>นางสาวกาญจนา แสงดี</strong><p>089-123-4567 · แจ้งผ่าน LINE</p></div><div className="record-heading__subject"><small>หัวข้อเรื่อง</small><h2>ไฟฟ้าส่องสว่างดับ บริเวณหน้าหมู่บ้านสุขสันต์</h2><p><MapPin size={14} />ถนนสุขใจ ตำบลในเมือง</p></div></div>
        </Panel>
        <div className="complaint-evidence">
          <Panel title="รายละเอียดจากผู้แจ้ง"><p>ไฟฟ้าหน้าหมู่บ้านดับ 3 ดวง ทำให้บริเวณดังกล่าวมืด อันตรายต่อการสัญจร โดยเฉพาะเวลากลางคืน</p><h3>ไฟล์แนบ 3 ไฟล์</h3><div className="photo-grid"><span><Image size={28} /></span><span><Image size={28} /></span><span><Image size={28} /></span></div></Panel>
          <Panel title="ตำแหน่งบนแผนที่"><div className="detail-map"><MapPin size={29} /><button>เปิดในแผนที่</button></div></Panel>
        </div>
        <Panel>
          <SegmentedControl value={tab} onChange={setTab} ariaLabel="รายละเอียดกิจกรรม" options={[{ value: 'timeline', label: 'ไทม์ไลน์' }, { value: 'notes', label: 'บันทึกภายใน' }, { value: 'messages', label: 'อัปเดตประชาชน' }, { value: 'audit', label: 'Audit' }]} />
          <div className="activity-timeline">
            <article><span className="avatar">รบ</span><div><strong>เจ้าหน้าที่ระบบ</strong><Badge tone="neutral">บันทึกภายใน</Badge><time>10 ส.ค. 2569 09:16</time><p>{tab === 'notes' ? 'ประสานรถกระเช้าและทีมไฟฟ้าเข้าตรวจพื้นที่' : 'มอบหมายให้สายฝน ศ. กองช่าง ตรวจสอบหน้างาน'}</p></div></article>
            <article><span className="avatar avatar--blue">สฝ</span><div><strong>สายฝน ศ.</strong><Badge tone="blue">อัปเดตประชาชน</Badge><time>10 ส.ค. 2569 09:30</time><p>เจ้าหน้าที่ได้รับเรื่องเรียบร้อยแล้ว อยู่ระหว่างดำเนินการ คาดว่าจะมีความคืบหน้าภายในวันนี้</p></div></article>
          </div>
        </Panel>
      </div>
      <aside className="detail-sidebar">
        <Panel title="สถานะและการดำเนินการ">
          <SelectField label="สถานะ" value={status} options={['รอตรวจสอบ', 'มอบหมายแล้ว', 'กำลังดำเนินการ', 'รอข้อมูลเพิ่ม', 'เสร็จสิ้น']} onChange={setStatus} />
          <SelectField label="หน่วยงาน" value="กองช่าง" options={['กองช่าง', 'กองสาธารณสุขฯ', 'สำนักปลัดฯ']} onChange={() => undefined} />
          <SelectField label="ผู้รับผิดชอบ" value={assignee} options={['สายฝน ศ.', 'วิทยา น.', 'ยังไม่มอบหมาย']} onChange={setAssignee} />
          <div className="sla-panel"><span>เวลาคงเหลือ</span><Badge tone="red">ใกล้เกิน SLA</Badge><strong>02:15:30</strong><ProgressBar value={84} tone="red" /></div>
          <Button className="full-width">ยืนยันและมอบหมาย</Button><Button className="full-width" variant="secondary">บันทึกภายใน</Button><Button className="full-width" variant="secondary">อัปเดตประชาชน</Button>
        </Panel>
        <Panel title={<span className="ai-title"><Sparkles size={18} />คำแนะนำจาก AI</span>} action={<Badge tone="green">มั่นใจ 86%</Badge>}>
          <div className="ai-recommendation"><h3>สรุปปัญหา</h3><p>ไฟฟ้าส่องสว่างดับบริเวณหน้าหมู่บ้าน 3 จุด เกิดจากหลอดไฟชำรุด</p><h3>แนะนำการดำเนินการ</h3><ol><li>ตรวจสอบและเปลี่ยนหลอดไฟ/บัลลาสต์</li><li>ตรวจสอบระบบสายไฟและตู้ควบคุม</li><li>แจ้งประชาชนเมื่อดำเนินการเสร็จ</li></ol><Notice tone="info">AI ช่วยแนะนำเท่านั้น การตัดสินใจเป็นของเจ้าหน้าที่เสมอ</Notice></div>
        </Panel>
      </aside>
    </div>
  )
}

const queueSteps = [
  { n: 1, label: 'คำถามประชาชน', icon: MessageCircle },
  { n: 2, label: 'รอเจ้าหน้าที่ตอบ', icon: TimerReset },
  { n: 3, label: 'หลักฐานที่ AI ใช้', icon: FileCheck2 },
  { n: 4, label: 'ตอบผ่าน LINE', icon: Send },
  { n: 5, label: 'กำหนดผู้รับผิดชอบ', icon: UserRoundCheck },
  { n: 6, label: 'SLA', icon: CircleGauge },
  { n: 7, label: 'เสนอเป็น FAQ', icon: ClipboardCheck },
]

function TicketListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(tickets[0].id)
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0]
  const [expanded, setExpanded] = useState(1)
  return (
    <div className="support-queue">
      <div className="support-list">
        <div className="support-list__top"><strong>24 รายการ</strong><button><Filter size={16} />ตัวกรอง</button></div>
        {tickets.map((ticket) => <button key={ticket.id} className={ticket.id === selectedId ? 'is-selected' : ''} onClick={() => setSelectedId(ticket.id)}><span><strong>{ticket.id}</strong><Badge tone={ticket.channel === 'LINE' ? 'green' : 'blue'}>{ticket.channel}</Badge></span><b>{ticket.person}</b><small>{ticket.wait}</small><em>{ticket.score}</em></button>)}
      </div>
      <div className="support-workflow">
        <div className="support-workflow__header"><div><strong>{selected.id}</strong><Badge tone="green">LINE</Badge><Badge tone="red">เกิน SLA 15 นาที</Badge></div><button aria-label="ปิดรายละเอียด">×</button></div>
        <div className="workflow-desktop-grid">
          {queueSteps.map(({ n, label, icon: Icon }) => <article key={n}><header><span>{n}</span><strong>{label}</strong></header><Icon size={23} /><p>{n === 1 ? 'สอบถามการขอรับถังขยะจากเทศบาล ต้องทำอย่างไรบ้าง' : n === 2 ? 'รอเจ้าหน้าที่ 15 นาที' : n === 3 ? 'AI สรุปหลักฐาน 4 รายการ' : n === 4 ? 'ร่างข้อความตอบกลับพร้อมส่ง' : n === 5 ? 'กองสาธารณสุขฯ · น.ส. สมฤดี' : n === 6 ? '115% · เกิน SLA' : 'ความเชื่อมั่น 87%'}</p>{n === 4 ? <Button variant="line" size="sm">ตอบผ่าน LINE</Button> : null}</article>)}
        </div>
        <div className="workflow-accordion">
          {queueSteps.map(({ n, label }) => <button key={n} className={expanded === n ? 'is-expanded' : ''} onClick={() => setExpanded(n)}><span>{n}</span><strong>{label}</strong><small>{n === 2 ? 'เกิน SLA 15 นาที' : n === 3 ? 'ความเชื่อมั่น 92%' : ''}</small><ChevronDown size={17} />{expanded === n ? <p>{n === 1 ? 'สอบถามการขอรับถังขยะจากเทศบาล ต้องทำอย่างไรบ้าง' : 'ข้อมูลรายละเอียดพร้อมสำหรับเจ้าหน้าที่ตรวจสอบ'}</p> : null}</button>)}
        </div>
        <Button className="support-reply" size="lg" icon={<MessageCircle size={18} />} onClick={() => navigate('A-31')}>เปิดและตอบผ่าน LINE</Button>
      </div>
    </div>
  )
}

function TicketDetailScreen() {
  const [active, setActive] = useState(4)
  const [reply, setReply] = useState('สวัสดีค่ะ คุณอรอนงค์ สามารถยื่นคำขอรับถังขยะได้ที่กองสาธารณสุขและสิ่งแวดล้อม โดยใช้สำเนาบัตรประชาชนและสำเนาทะเบียนบ้านค่ะ')
  return (
    <div className="ticket-detail-layout">
      <aside className="ticket-mini-list">{tickets.map((ticket, index) => <button key={ticket.id} className={index === 0 ? 'is-selected' : ''}><strong>{ticket.id}</strong><span>{ticket.person}</span><Badge tone={index === 0 ? 'red' : 'neutral'}>{ticket.score}</Badge></button>)}</aside>
      <section className="ticket-conversation">
        <Panel title="บทสนทนา LINE" action={<Badge tone="red">เกิน SLA 15 นาที</Badge>}>
          <div className="chat-log"><div className="chat-bubble chat-bubble--citizen"><small>คุณอรอนงค์ · 10:32</small><p>ขอรับถังขยะจากเทศบาลต้องใช้เอกสารอะไร และติดต่อที่ไหนคะ?</p></div><div className="chat-event"><Bot size={17} />AI ส่งต่อ เนื่องจากหลักฐานเรื่องค่าธรรมเนียมยังไม่เพียงพอ</div></div>
        </Panel>
        <Panel title="ร่างคำตอบถึงประชาชน" action={<Button variant="secondary" size="sm" icon={<WandSparkles size={16} />}>AI ช่วยร่าง</Button>}>
          <textarea className="reply-editor" value={reply} onChange={(event) => setReply(event.target.value)} />
          <div className="editor-actions"><span>{reply.length}/500</span><Button variant="secondary" size="sm">บันทึกร่าง</Button><Button size="sm" icon={<Send size={16} />}>ตอบผ่าน LINE</Button></div>
        </Panel>
      </section>
      <aside className="ticket-evidence">
        {queueSteps.map(({ n, label }) => <button key={n} onClick={() => setActive(n)} className={active === n ? 'is-active' : ''}><span>{n}</span><strong>{label}</strong><ChevronDown size={16} />{active === n ? <div><p>{n === 3 ? 'พบหลักฐานที่เกี่ยวข้อง 4 รายการ · ความเชื่อมั่น 92%' : n === 5 ? 'แนะนำกองสาธารณสุขและสิ่งแวดล้อม' : 'ตรวจสอบข้อมูลส่วนนี้แล้ว'}</p>{n === 7 ? <Button variant="secondary" size="sm">เสนอเป็น FAQ</Button> : null}</div> : null}</button>)}
      </aside>
    </div>
  )
}

export function OperationsScreen({ screen, navigate }: OperationsProps) {
  switch (screen.kind) {
    case 'dashboard': return <DashboardScreen />
    case 'complaint-list': return <ComplaintListScreen navigate={navigate} />
    case 'complaint-detail': return <ComplaintDetailScreen />
    case 'ticket-list': return <TicketListScreen navigate={navigate} />
    case 'ticket-detail': return <TicketDetailScreen />
    default: return null
  }
}
