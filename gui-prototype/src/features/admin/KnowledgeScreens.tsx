import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileCheck2,
  FileSearch,
  FileText,
  Filter,
  FlaskConical,
  FolderUp,
  MoreVertical,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { documents } from '../../data/sampleData'
import { Badge, Button, MetricCard, Notice, Panel, ProgressBar, SearchField, SegmentedControl, SelectField, Toggle } from '../../components/Primitives'

interface KnowledgeProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

function KnowledgeListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState('ทั้งหมด')
  const selected = documents[selectedIndex]
  const rows = useMemo(() => documents.filter((document) => (filter === 'ทั้งหมด' || document.status === filter) && document.title.includes(query)), [filter, query])
  return (
    <div className="knowledge-layout">
      <section className="knowledge-table-section">
        <div className="table-toolbar">
          <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเอกสาร ชื่อไฟล์ หรือหน่วยงาน…" />
          <SelectField value={filter} options={['ทั้งหมด', 'พร้อมใช้งาน', 'กำลังประมวลผล', 'มีข้อผิดพลาด']} onChange={setFilter} />
          <Button variant="secondary" icon={<Filter size={17} />}>กรอง</Button>
          <Button icon={<UploadCloud size={17} />} onClick={() => navigate('A-41')}>อัปโหลดเอกสาร</Button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table knowledge-table">
            <thead><tr><th>เอกสาร</th><th>หน่วยงาน</th><th>เวอร์ชัน</th><th>วันที่มีผล</th><th>สถานะประมวลผล</th><th>ตัวชี้ประเด็น</th><th>Chunks</th><th>อัปเดตล่าสุด</th><th /></tr></thead>
            <tbody>{rows.map((document) => {
              const originalIndex = documents.indexOf(document)
              return (
                <tr key={document.title} className={selectedIndex === originalIndex ? 'is-selected' : ''} onClick={() => setSelectedIndex(originalIndex)}>
                  <td><span className="document-title"><FileText size={18} /><strong>{document.title}</strong></span></td><td>{document.department}</td><td>{document.version}</td><td>{document.date}</td>
                  <td><Badge tone={document.status === 'พร้อมใช้งาน' ? 'green' : 'blue'}>{document.status}</Badge></td>
                  <td>{document.issues ? <span className="issue-count"><AlertTriangle size={15} />{document.issues}</span> : <span><Check size={15} />0</span>}</td><td>{document.chunks || '—'}</td><td>10 ส.ค. 2569<br /><small>09:15</small></td><td><button aria-label="การทำงานเพิ่มเติม"><MoreVertical size={17} /></button></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <footer className="table-footer"><span>แสดง 1–5 จาก 128 รายการ</span><div className="pagination"><button>‹</button><button className="is-active">1</button><button>2</button><button>3</button><button>…</button><button>13</button><button>›</button></div></footer>
      </section>
      <aside className="knowledge-inspector">
        <header><FileText size={22} /><div><strong>{selected.title}</strong><small>เวอร์ชัน {selected.version} · ใช้งานตั้งแต่ {selected.date}</small></div><button aria-label="ปิด"><X size={18} /></button></header>
        <SegmentedControl value="quality" onChange={() => undefined} ariaLabel="ข้อมูลเอกสาร" options={[{ value: 'quality', label: 'คุณภาพเอกสาร' }, { value: 'detail', label: 'รายละเอียด' }, { value: 'history', label: 'ประวัติเวอร์ชัน' }]} />
        <section><h3>เอกสารขัดแย้ง <Badge tone="amber">{selected.issues}</Badge></h3>{selected.issues ? <Notice tone="warning" title="พบเนื้อหาขัดแย้ง">เนื้อหาบางส่วนอ้างถึงระเบียบเวอร์ชันก่อนหน้า กรุณาตรวจสอบความถูกต้อง</Notice> : <Notice tone="success">ไม่พบเอกสารซ้ำซ้อนในระดับสูง</Notice>}</section>
        <section><h3>ตัวอย่างข้อความที่ถูกแบ่ง (Chunk Preview)</h3><div className="chunk-preview"><span>Chunk 128 <Badge tone="green">คะแนน 0.92</Badge></span><p>มาตรา 16 ห้ามมิให้ผู้ใดทิ้ง วาง หรือเทขยะมูลฝอยในที่หรือทางสาธารณะ นอกเหนือจากที่เทศบาลกำหนด…</p><small>แหล่งที่มา: ข้อบัญญัติเทศบาล · หน้า 18</small></div></section>
        <div className="inspector-actions"><Button variant="secondary" icon={<Download size={16} />}>ดาวน์โหลดรายงาน</Button><Button onClick={() => navigate('A-46')} icon={<FlaskConical size={16} />}>ทดสอบเอกสารนี้</Button></div>
      </aside>
    </div>
  )
}

const uploadSteps = ['เลือกไฟล์', 'ระบุข้อมูล', 'ช่วงเวลามีผล', 'ตรวจสอบ', 'ประมวลผล']

function UploadWizardScreen() {
  const [step, setStep] = useState(2)
  const [department, setDepartment] = useState('กองสาธารณสุขและสิ่งแวดล้อม')
  const [category, setCategory] = useState('ข้อบัญญัติและระเบียบ')
  const [active, setActive] = useState(true)
  return (
    <div className="wizard-layout knowledge-upload">
      <ol className="wizard-steps">
        {uploadSteps.map((label, index) => <li key={label} className={index + 1 <= step ? 'is-active' : ''}><button onClick={() => setStep(index + 1)}>{index + 1 < step ? <Check size={16} /> : index + 1}</button><span>{label}</span></li>)}
      </ol>
      <Panel title={`${step}. ${uploadSteps[step - 1]}`} subtitle="ระบบจะตรวจไฟล์และข้อมูลก่อนเริ่มสร้างคลังความรู้">
        {step === 1 ? <div className="drop-zone"><UploadCloud size={36} /><h3>ลากไฟล์มาวาง หรือเลือกจากเครื่อง</h3><p>รองรับ PDF, DOCX, XLSX, TXT และ Markdown ขนาดไม่เกิน 50 MB</p><Button variant="secondary">เลือกไฟล์</Button></div> : null}
        {step === 2 ? <div className="wizard-form"><div className="file-summary"><span><FileCheck2 size={24} /></span><div><strong>ข้อบัญญัติการจัดการขยะมูลฝอย_ฉบับแก้ไข.docx</strong><small>DOCX · 2.4 MB · ตรวจไวรัสแล้ว</small></div><Badge tone="green">พร้อม</Badge></div><div className="form-grid"><label>ชื่อเอกสาร<input defaultValue="ข้อบัญญัติเทศบาล เรื่อง การจัดการขยะมูลฝอย พ.ศ. 2569" /></label><SelectField label="หน่วยงานเจ้าของเอกสาร" value={department} options={['กองสาธารณสุขและสิ่งแวดล้อม', 'สำนักปลัดเทศบาล', 'กองช่าง']} onChange={setDepartment} /><SelectField label="หมวดเอกสาร" value={category} options={['ข้อบัญญัติและระเบียบ', 'ประกาศ', 'คู่มือบริการ', 'คำถามที่พบบ่อย']} onChange={setCategory} /><label>วันที่ออกเอกสาร<input type="date" defaultValue="2026-08-10" /></label></div></div> : null}
        {step === 3 ? <div className="wizard-form"><div className="form-grid"><label>เริ่มมีผล<input type="date" defaultValue="2026-09-01" /></label><label>สิ้นสุดการใช้งาน<input type="date" /></label></div><Toggle checked={active} onChange={setActive} label="เปิดใช้งานหลังประมวลผลสำเร็จ" description="AI จะใช้เอกสารนี้ตอบคำถามเมื่อถึงวันที่เริ่มมีผล" /><Notice tone="warning">เอกสารเวอร์ชัน 2.1 มีช่วงเวลาทับซ้อน 1 วัน ระบบจะแนะนำให้ปิดเวอร์ชันเดิมอัตโนมัติ</Notice></div> : null}
        {step === 4 ? <div className="review-stack"><Notice tone="success">ตรวจรูปแบบไฟล์และ metadata ครบถ้วน</Notice><dl><div><dt>ไฟล์</dt><dd>ข้อบัญญัติการจัดการขยะมูลฝอย_ฉบับแก้ไข.docx</dd></div><div><dt>หน่วยงาน</dt><dd>{department}</dd></div><div><dt>หมวด</dt><dd>{category}</dd></div><div><dt>ช่วงมีผล</dt><dd>1 ก.ย. 2569 – ไม่กำหนดวันสิ้นสุด</dd></div></dl></div> : null}
        {step === 5 ? <div className="processing-state"><span><RefreshCw className="spin" size={32} /></span><h3>กำลังสกัดและจัดโครงสร้างเนื้อหา</h3><ProgressBar value={64} /><p>ขั้นตอน 4/6 · กำลังสร้าง embeddings สำหรับ 84 chunks</p></div> : null}
        <div className="wizard-actions"><Button variant="secondary" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>ย้อนกลับ</Button><span /><Button onClick={() => setStep((value) => Math.min(5, value + 1))}>{step >= 4 ? 'เริ่มประมวลผล' : 'ถัดไป'} <ArrowRight size={17} /></Button></div>
      </Panel>
      <aside className="wizard-help"><BookOpenCheck size={24} /><h3>เคล็ดลับเพื่อคำตอบที่แม่นยำ</h3><ul><li>กำหนดหน่วยงานเจ้าของข้อมูลให้ถูกต้อง</li><li>ระบุวันที่มีผลและวันสิ้นสุดทุกครั้ง</li><li>หลีกเลี่ยงไฟล์ที่รวมหลายเรื่องโดยไม่มีหัวข้อ</li><li>ตรวจรายการขัดแย้งหลังประมวลผล</li></ul></aside>
    </div>
  )
}

const evidenceItems = [
  { rank: 1, score: 0.92, title: 'ประกาศเทศบาล เรื่อง หลักเกณฑ์การขออนุญาตก่อสร้าง ดัดแปลง รื้อถอน พ.ศ. 2564', ref: 'มาตรา 7, 8 · หน้า 5–6' },
  { rank: 2, score: 0.86, title: 'กฎกระทรวง ฉบับที่ 55 ออกตามความใน พ.ร.บ. ควบคุมอาคาร', ref: 'ข้อ 3 (3), ข้อ 8 · หน้า 2, 5' },
  { rank: 3, score: 0.73, title: 'พระราชบัญญัติควบคุมอาคาร พ.ศ. 2522', ref: 'มาตรา 21, 39 · หน้า 11–12' },
  { rank: 4, score: 0.61, title: 'คู่มือปฏิบัติงาน การออกใบอนุญาตก่อสร้างอาคาร', ref: 'หัวข้อ 2.1 · หน้า 14–15' },
]

function AnswerTestScreen() {
  const [question, setQuestion] = useState('ประชาชนต้องขออนุญาตก่อสร้างอาคารขนาดเล็กเมื่อใด และใช้เอกสารอะไรบ้าง')
  const [threshold, setThreshold] = useState(48)
  const [ran, setRan] = useState(true)
  const [sort, setSort] = useState<'relevance' | 'source'>('relevance')
  return (
    <div className="test-lab">
      <section className="test-query">
        <label>คำถามตัวอย่าง<textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
        <div><span>{question.length}/500</span><Button icon={<Search size={16} />} onClick={() => setRan(true)}>ค้นและร่างคำตอบ</Button></div>
      </section>
      <Panel title="หลักฐานที่ใช้" className="evidence-panel" action={<SegmentedControl value={sort} onChange={setSort} ariaLabel="เรียงหลักฐาน" options={[{ value: 'relevance', label: 'ความเกี่ยวข้อง' }, { value: 'source', label: 'แหล่งข้อมูล' }]} />}>
        <div className="evidence-list">{ran ? evidenceItems.map((item) => <button key={item.rank} className={item.rank === 1 ? 'is-selected' : ''}><span>{item.rank}</span><div><strong>{item.title}</strong><small>{item.ref}</small></div><Badge tone={item.score > 0.8 ? 'green' : 'neutral'}>{item.score.toFixed(2)}</Badge><ChevronRight size={16} /></button>) : <Notice tone="info">กดค้นหาเพื่อแสดงหลักฐาน</Notice>}</div>
      </Panel>
      <Panel title="ร่างคำตอบพร้อมอ้างอิง" className="answer-draft" action={<Badge tone="blue">GPT-5.6 Luna</Badge>}>
        <div className="draft-content"><p>กรณีอาคารขนาดเล็กที่เข้าข่ายอาคารควบคุม ประชาชนต้องขออนุญาตก่อนเริ่มดำเนินการ โดยมีหลักเกณฑ์และเอกสารที่เกี่ยวข้อง ดังนี้</p><ol><li>ต้องยื่นคำขอก่อสร้างต่อเทศบาลตามมาตรา 21 <a>[1: มาตรา 7, หน้า 5]</a></li><li>เอกสารที่ใช้ ได้แก่ แบบแปลน แผนผังบริเวณ รายการคำนวณโครงสร้าง และหนังสือยินยอมจากเจ้าของที่ดิน <a>[1: มาตรา 8, หน้า 6]</a></li><li>หากเป็นอาคารที่ได้รับการยกเว้นบางกรณี ให้ตรวจรายละเอียดกับกองช่างก่อนเริ่มงาน <a>[2: ข้อ 3, หน้า 2]</a></li></ol></div>
        <div className="answer-actions"><Button variant="secondary" size="sm">คัดลอก</Button><Button variant="secondary" size="sm" icon={<Download size={15} />}>ดาวน์โหลด</Button><Button variant="secondary" size="sm">บันทึกกรณีทดสอบ</Button></div>
      </Panel>
      <aside className="sufficiency-panel">
        <h2>ประเมินความเพียงพอของหลักฐาน</h2>
        <Notice tone="danger" title="หลักฐานยังไม่เพียงพอ">ยังไม่มีหลักฐานค่าธรรมเนียมและระยะเวลาดำเนินการ</Notice>
        <label className="confidence-slider">เกณฑ์ความมั่นใจ <strong>{(threshold / 100).toFixed(2)}</strong><input type="range" min="0" max="100" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><span><small>ต่ำ</small><small>สูง</small></span></label>
        <dl className="answer-diagnostics"><div><dt>Intent</dt><dd>building_permit</dd></div><div><dt>แหล่งข้อมูล</dt><dd>4 เอกสาร</dd></div><div><dt>Latency</dt><dd>1.84 วินาที</dd></div><div><dt>Answerability</dt><dd><Badge tone="amber">ส่งต่อ</Badge></dd></div></dl>
        <Button className="full-width" variant="danger" icon={<ShieldAlert size={17} />}>ส่งต่อเจ้าหน้าที่</Button>
      </aside>
    </div>
  )
}

const suiteRows = [
  { question: 'ศูนย์ KCC เปิดวันเสาร์หรือไม่', expected: 'วันเสาร์–อาทิตย์ 09:00–18:00 น.', answer: 'ตรงตามหลักฐาน', citation: 100, grade: 'ผ่าน' },
  { question: 'ขอรับเบี้ยยังชีพผู้สูงอายุใช้เอกสารอะไร', expected: 'บัตรประชาชน ทะเบียนบ้าน สมุดบัญชี', answer: 'ขาดสมุดบัญชีธนาคาร', citation: 67, grade: 'ทบทวน' },
  { question: 'ฟิตเนสเทศบาลมีค่าบริการเท่าไร', expected: 'ตามประกาศฉบับปัจจุบัน', answer: 'ส่งต่อเพราะเอกสารขัดแย้ง', citation: 100, grade: 'ผ่าน' },
  { question: 'แจ้งเกิดเกินกำหนดต้องทำอย่างไร', expected: 'ส่งต่อเจ้าหน้าที่ทะเบียน', answer: 'ส่งต่ออย่างปลอดภัย', citation: 100, grade: 'ผ่าน' },
]

function EvaluationSuitesScreen() {
  const [suite, setSuite] = useState('Regression ชุดหลัก')
  const [running, setRunning] = useState(false)
  const runSuite = () => {
    setRunning(true)
    window.setTimeout(() => setRunning(false), 900)
  }
  return (
    <div className="evaluation-page">
      <div className="evaluation-toolbar"><SelectField value={suite} options={['Regression ชุดหลัก', 'บริการประชาชน', 'คำถามข้ามหน่วยงาน', 'Safety & Handoff']} onChange={setSuite} /><Button variant="secondary" icon={<FolderUp size={17} />}>นำเข้าคำถาม</Button><Button onClick={runSuite} icon={running ? <RefreshCw className="spin" size={17} /> : <Play size={17} />}>{running ? 'กำลังประเมิน…' : 'เริ่มประเมิน'}</Button></div>
      <div className="metrics-grid metrics-grid--four"><MetricCard label="ความถูกต้องรวม" value="96.8%" delta="+1.4%" tone="green" icon={<BadgeCheck size={20} />} /><MetricCard label="Citation precision" value="98.2%" delta="+0.8%" tone="blue" icon={<FileSearch size={20} />} /><MetricCard label="Handoff ถูกต้อง" value="100%" delta="คงที่" tone="green" icon={<ShieldAlert size={20} />} /><MetricCard label="คำถามต้องทบทวน" value="7" delta="-3" tone="amber" icon={<CircleAlert size={20} />} /></div>
      <Panel title={`ผลการประเมิน · ${suite}`} action={<div className="inline-actions"><Badge tone="green">ผ่าน 121</Badge><Badge tone="amber">ทบทวน 7</Badge><Button variant="secondary" size="sm" icon={<Download size={15} />}>ส่งออก</Button></div>}>
        <div className="evaluation-progress"><div><strong>128/128 คำถาม</strong><span>รุ่นทดสอบ: rag-pipeline v2.4.1 · เอกสาร snapshot 10 ส.ค. 2569</span></div><ProgressBar value={100} tone="green" /></div>
        <div className="data-table-wrap"><table className="data-table evaluation-table"><thead><tr><th>คำถามมาตรฐาน</th><th>คำตอบที่คาดหวัง</th><th>ผลของระบบ</th><th>Citation</th><th>ผล</th><th /></tr></thead><tbody>{suiteRows.map((row) => <tr key={row.question}><td><strong>{row.question}</strong></td><td>{row.expected}</td><td>{row.answer}</td><td>{row.citation}%</td><td><Badge tone={row.grade === 'ผ่าน' ? 'green' : 'amber'}>{row.grade}</Badge></td><td><button><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div>
      </Panel>
      <Notice tone="info" title="เกณฑ์ Release Gate">ต้องผ่าน Critical set 100%, citation precision ≥ 98%, unsupported-claim rate = 0% และทุกเคสก้ำกึ่งต้องส่งต่อเจ้าหน้าที่</Notice>
    </div>
  )
}

export function KnowledgeScreen({ screen, navigate }: KnowledgeProps) {
  switch (screen.kind) {
    case 'knowledge-list': return <KnowledgeListScreen navigate={navigate} />
    case 'knowledge-upload': return <UploadWizardScreen />
    case 'answer-test': return <AnswerTestScreen />
    case 'evaluation-suites': return <EvaluationSuitesScreen />
    default: return null
  }
}
