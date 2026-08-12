import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleEllipsis,
  Clock3,
  Construction,
  FileCheck2,
  FileText,
  Download,
  ExternalLink,
  HandCoins,
  HeartHandshake,
  Landmark,
  LocateFixed,
  MapPin,
  MessageCircle,
  Megaphone,
  Navigation,
  Newspaper,
  Paperclip,
  Phone,
  Recycle,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react'
import type { ScreenDefinition } from '../../data/screens'
import { Badge, Button, Notice, Panel, ProgressBar, SearchField, SegmentedControl } from '../../components/Primitives'

interface CitizenScreenProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

const quickActions = [
  { id: 'C-02', label: 'แจ้งปัญหา', icon: Megaphone, tone: 'teal' },
  { id: 'C-08', label: 'ติดตามสถานะ', icon: FileCheck2, tone: 'blue' },
  { id: 'C-13', label: 'ข่าวเทศบาล', icon: Newspaper, tone: 'amber' },
  { id: 'C-15', label: 'บริการ', icon: Landmark, tone: 'purple' },
  { id: 'C-18', label: 'ติดต่อ', icon: Phone, tone: 'green' },
]

const trackingItems = [
  { id: 'R2569-000123', title: 'ถนนชำรุด บริเวณซอยเทศบาล 5', status: 'กำลังดำเนินการ', tone: 'blue', date: '10 ส.ค. 2569 10:30', icon: Construction },
  { id: 'R2569-000122', title: 'ไฟฟ้าสาธารณะดับ', status: 'เสร็จสิ้น', tone: 'green', date: '8 ส.ค. 2569 16:45', icon: BadgeCheck },
  { id: 'R2569-000121', title: 'ขยะล้นถัง บริเวณตลาดสด', status: 'รอรับเรื่อง', tone: 'amber', date: '8 ส.ค. 2569 09:15', icon: Trash2 },
  { id: 'R2569-000120', title: 'น้ำรั่วซึมบริเวณทางเท้า', status: 'กำลังดำเนินการ', tone: 'blue', date: '7 ส.ค. 2569 14:20', icon: Wrench },
] as const

const newsItems = [
  { category: 'ประกาศสำคัญ', title: 'แจ้งปิดปรับปรุงระบบประปาชั่วคราว คืนวันที่ 12 สิงหาคม', date: '10 ส.ค. 2569', tone: 'red' },
  { category: 'กิจกรรม', title: 'เชิญร่วมกิจกรรมปลูกต้นไม้ เพิ่มพื้นที่สีเขียวในชุมชน', date: '9 ส.ค. 2569', tone: 'green' },
  { category: 'บริการประชาชน', title: 'เปิดจุดบริการชำระภาษีนอกเวลาราชการ ประจำเดือนสิงหาคม', date: '8 ส.ค. 2569', tone: 'blue' },
]

const serviceItems = [
  { title: 'ขออนุญาตก่อสร้างอาคาร', meta: 'ยื่นคำขอออนไลน์ได้ตลอด 24 ชั่วโมง', icon: FileText, tone: 'blue' },
  { title: 'แจ้งไฟฟ้าสาธารณะดับ', meta: 'เจ้าหน้าที่ดำเนินการตรวจสอบภายใน 1 วัน', icon: Wrench, tone: 'green' },
  { title: 'ขอรับบริการเก็บขยะขนาดใหญ่', meta: 'นัดหมายวันเข้ารับบริการ', icon: Recycle, tone: 'amber' },
  { title: 'ลงทะเบียนเบี้ยยังชีพผู้สูงอายุ', meta: 'ตรวจคุณสมบัติและเอกสารประกอบ', icon: HeartHandshake, tone: 'purple' },
]

const contactItems = [
  { name: 'สำนักปลัดเทศบาล', scope: 'งานธุรการและสาธารณภัย', hours: 'จันทร์–ศุกร์ 08:30–16:30 น.', phone: '038-000-101', tone: 'green' },
  { name: 'กองคลัง', scope: 'ภาษี การเงิน และพัสดุ', hours: 'จันทร์–ศุกร์ 08:30–16:30 น.', phone: '038-000-102', tone: 'blue' },
  { name: 'กองช่าง', scope: 'โยธา สาธารณูปโภค และอาคาร', hours: 'จันทร์–ศุกร์ 08:30–16:30 น.', phone: '038-000-103', tone: 'amber' },
  { name: 'กองสวัสดิการสังคม', scope: 'ผู้สูงอายุ ผู้พิการ และชุมชน', hours: 'จันทร์–ศุกร์ 08:30–16:30 น.', phone: '038-000-104', tone: 'purple' },
]

function Stepper({ active }: { active: 1 | 2 | 3 }) {
  return (
    <ol className="citizen-stepper" aria-label="ขั้นตอนการแจ้งปัญหา">
      {['รายละเอียด', 'ตรวจสอบ', 'เสร็จสิ้น'].map((label, index) => {
        const step = index + 1
        return (
          <li key={label} className={step <= active ? 'is-active' : ''}>
            <span>{step < active ? <Check size={15} /> : step}</span>
            <small>{label}</small>
          </li>
        )
      })}
    </ol>
  )
}

function HomeScreen({ navigate }: { navigate: (id: string) => void }) {
  const [question, setQuestion] = useState('')
  const [selected, setSelected] = useState('C-02')
  const selectedAction = quickActions.find((item) => item.id === selected)
  return (
    <div className="citizen-screen citizen-home">
      <section className="citizen-hero">
        <span className="citizen-hero__crest"><Building2 size={26} /></span>
        <div>
          <p>สวัสดีค่ะ 👋</p>
          <h1>วันนี้ให้เทศบาลช่วยเรื่องอะไรดีคะ?</h1>
          <span>สอบถามข้อมูลหรือเลือกบริการด้านล่างได้เลย</span>
        </div>
      </section>
      <div className="citizen-ask">
        <label>
          <Search size={19} />
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="เช่น ต้องใช้เอกสารอะไรในการขออนุญาต…" />
        </label>
        <Button aria-label="ส่งคำถาม" icon={<Send size={18} />}>ถาม AI</Button>
      </div>
      <div className="trust-line"><ShieldCheck size={16} /> AI ตอบจากข้อมูลทางการของเทศบาล พร้อมแสดงแหล่งอ้างอิง</div>
      <section className="quick-actions">
        <h2>ทางลัดบริการ</h2>
        <div className="quick-actions__grid">
          {quickActions.map(({ id, label, icon: Icon, tone }) => (
            <button
              key={id}
              className={`${selected === id ? 'is-selected' : ''} action--${tone}`}
              onClick={() => setSelected(id)}
              onDoubleClick={() => navigate(id)}
            >
              <span><Icon size={24} /></span>{label}
            </button>
          ))}
        </div>
      </section>
      <Button className="citizen-wide-action" size="lg" onClick={() => navigate(selected)} icon={<ArrowRight size={19} />}>
        เปิด {selectedAction?.label}
      </Button>
      <Panel className="citizen-announcement" title="ประกาศล่าสุด" action={<button>ดูทั้งหมด</button>}>
        <button className="announcement-row" onClick={() => navigate('C-13')}>
          <span><Megaphone size={19} /></span>
          <div><strong>แจ้งปิดปรับปรุงระบบประปาชั่วคราว</strong><small>คืนวันที่ 12 สิงหาคม เวลา 22:00–04:00 น.</small></div>
          <ChevronRight size={18} />
        </button>
      </Panel>
    </div>
  )
}

function ComplaintFormScreen({ navigate }: { navigate: (id: string) => void }) {
  const [category, setCategory] = useState('ขยะ / สิ่งปฏิกูล')
  const [description, setDescription] = useState('ถังขยะเต็ม ไม่มีการจัดเก็บบริเวณหน้าบ้าน')
  const categories = ['ขยะ / สิ่งปฏิกูล', 'ถนน / ทางเท้า', 'ไฟฟ้าสาธารณะ', 'น้ำเสีย / กลิ่นรบกวน']
  return (
    <div className="citizen-screen complaint-form">
      <Stepper active={1} />
      <h1>1. รายละเอียดปัญหา</h1>
      <label className="field-label">ประเภทปัญหา <em>*</em>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      </label>
      <label className="field-label">รายละเอียดเพิ่มเติม <em>*</em>
        <textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
        <small>{description.length}/500</small>
      </label>
      <div className="field-label"><span>รูปภาพประกอบ <small>(สูงสุด 5 รูป)</small></span>
        <div className="upload-grid">
          <button className="uploaded-file"><span className="scene scene--one"><Trash2 size={25} /></span><i>ลบ</i></button>
          <button className="uploaded-file"><span className="scene scene--two"><Trash2 size={25} /></span><i>ลบ</i></button>
          <button className="upload-tile"><Camera size={25} /><span>เพิ่มรูป</span></button>
        </div>
      </div>
      <div className="field-label"><span>ตำแหน่งที่เกิดเหตุ <em>*</em></span>
        <button className="location-card">
          <MapPin size={22} />
          <span><strong>123/1 ถนนสุขใจ ตำบลสุขใจ</strong><small>อำเภอเมือง จังหวัดตัวอย่าง 10110</small><a>ปักหมุดใหม่บนแผนที่</a></span>
          <ChevronRight size={20} />
        </button>
      </div>
      <Notice tone="success">บันทึกแล้ว คุณสามารถกลับมาแก้ไขได้เสมอ</Notice>
      <Button className="citizen-wide-action" size="lg" onClick={() => navigate('C-07')}>ถัดไป</Button>
    </div>
  )
}

function SuccessScreen({ navigate }: { navigate: (id: string) => void }) {
  return (
    <div className="citizen-screen success-screen">
      <Stepper active={3} />
      <span className="success-orbit"><CheckCircle2 size={46} /></span>
      <h1>เทศบาลรับเรื่องของคุณแล้ว</h1>
      <p>เราได้ส่งข้อมูลให้กองสาธารณสุขและสิ่งแวดล้อม เจ้าหน้าที่จะเริ่มตรวจสอบภายในเวลาทำการ</p>
      <div className="ticket-number"><small>เลขคำร้อง</small><strong>R2569-000123</strong><button>คัดลอก</button></div>
      <Panel title="ขั้นตอนถัดไป">
        <ol className="next-steps">
          <li><span>1</span><div><strong>ตรวจสอบข้อมูล</strong><small>ภายใน 1 วันทำการ</small></div></li>
          <li><span>2</span><div><strong>มอบหมายหน่วยงาน</strong><small>แจ้งผ่าน LINE เมื่อมีความคืบหน้า</small></div></li>
          <li><span>3</span><div><strong>ดำเนินการแก้ไข</strong><small>ติดตามสถานะได้ตลอดเวลา</small></div></li>
        </ol>
      </Panel>
      <Button className="citizen-wide-action" size="lg" onClick={() => navigate('C-08')}>ติดตามสถานะ</Button>
      <Button className="citizen-wide-action" variant="secondary" onClick={() => navigate('C-01')}>กลับหน้าหลัก</Button>
    </div>
  )
}

function TrackingListScreen({ navigate }: { navigate: (id: string) => void }) {
  const [status, setStatus] = useState<'all' | 'active' | 'closed'>('all')
  const filtered = useMemo(() => trackingItems.filter((item) => status === 'all' || (status === 'closed' ? item.status === 'เสร็จสิ้น' : item.status !== 'เสร็จสิ้น')), [status])
  return (
    <div className="citizen-screen tracking-list">
      <div className="citizen-title"><h1>ติดตามสถานะ</h1><p>ติดตามคำร้องและคำขอของคุณ</p></div>
      <SearchField placeholder="ค้นหาด้วยเลขที่คำร้อง" />
      <SegmentedControl
        value={status}
        onChange={setStatus}
        ariaLabel="กรองสถานะคำร้อง"
        options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'active', label: 'กำลังดำเนินการ' }, { value: 'closed', label: 'เสร็จสิ้น' }]}
      />
      <div className="tracking-cards">
        {filtered.map(({ id, title, status: itemStatus, tone, date, icon: Icon }) => (
          <button key={id} onClick={() => navigate('C-09')}>
            <span className={`tracking-card__icon icon-tone--${tone}`}><Icon size={23} /></span>
            <span><small>คำร้องเลขที่</small><strong>{id}</strong><b>{title}</b><time>อัปเดตล่าสุด {date}</time></span>
            <Badge tone={tone as 'blue' | 'green' | 'amber'}>{itemStatus}</Badge>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      <Notice tone="info">หากอินเทอร์เน็ตขัดข้อง รายการล่าสุดจะถูกเก็บไว้และซิงก์ใหม่อัตโนมัติ</Notice>
    </div>
  )
}

function TrackingDetailScreen() {
  const [tab, setTab] = useState<'timeline' | 'details'>('timeline')
  const steps = [
    { title: 'รับเรื่องแล้ว', meta: '8 ส.ค. 2569 09:12', done: true },
    { title: 'ตรวจสอบข้อมูล', meta: '8 ส.ค. 2569 14:20', done: true },
    { title: 'ลงพื้นที่ตรวจสอบ', meta: '10 ส.ค. 2569 10:30', done: true, active: true },
    { title: 'ดำเนินการแก้ไข', meta: 'รอดำเนินการ', done: false },
    { title: 'เสร็จสิ้น', meta: 'รอดำเนินการ', done: false },
  ]
  return (
    <div className="citizen-screen tracking-detail">
      <div className="request-summary">
        <span className="request-summary__icon"><Construction size={25} /></span>
        <div><small>คำร้องเลขที่</small><h1>R2569-000123</h1><p>ถนนชำรุด บริเวณซอยเทศบาล 5</p></div>
        <Badge tone="blue">กำลังดำเนินการ</Badge>
      </div>
      <SegmentedControl value={tab} onChange={setTab} ariaLabel="รายละเอียดคำร้อง" options={[{ value: 'timeline', label: 'ความคืบหน้า' }, { value: 'details', label: 'ข้อมูลที่แจ้ง' }]} />
      {tab === 'timeline' ? (
        <>
          <section className="latest-update">
            <div><small>ข้อมูลล่าสุด</small><strong>เจ้าหน้าที่ลงพื้นที่ตรวจสอบแล้ว</strong><time>10 ส.ค. 2569 เวลา 10:30 น.</time><p>พบหลุมขนาดใหญ่ อยู่ระหว่างจัดทำแผนซ่อมแซม</p></div>
            <span className="road-scene"><Construction size={30} /></span>
          </section>
          <Notice tone="success" title="ขั้นตอนถัดไป">คาดว่าจะดำเนินการซ่อมแซมภายใน 3–5 วันทำการ</Notice>
          <ol className="status-timeline">
            {steps.map((step) => (
              <li key={step.title} className={`${step.done ? 'is-done' : ''} ${step.active ? 'is-active' : ''}`}>
                <span>{step.done ? <Check size={14} /> : null}</span><div><strong>{step.title}</strong><small>{step.meta}</small></div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <Panel title="ข้อมูลที่แจ้ง">
          <dl className="citizen-detail-list"><div><dt>ประเภท</dt><dd>ถนน / ทางเท้า</dd></div><div><dt>สถานที่</dt><dd>ซอยเทศบาล 5 หน้าอาคาร 12</dd></div><div><dt>หน่วยงาน</dt><dd>กองช่าง</dd></div><div><dt>วันที่แจ้ง</dt><dd>8 ส.ค. 2569 09:12</dd></div></dl>
        </Panel>
      )}
      <Button className="citizen-wide-action" variant="secondary" icon={<MessageCircle size={18} />}>ส่งข้อมูลเพิ่มเติม</Button>
    </div>
  )
}

function NewsListScreen() {
  const [category, setCategory] = useState('ทั้งหมด')
  const categories = ['ทั้งหมด', 'ประกาศ', 'กิจกรรม', 'บริการ']
  return (
    <div className="citizen-screen news-screen">
      <div className="citizen-title"><h1>ข่าวประชาสัมพันธ์</h1><p>ข่าวสารและประกาศที่ควรรู้จากเทศบาล</p></div>
      <Notice tone="danger" title="ประกาศสำคัญ">ปิดปรับปรุงระบบประปาชั่วคราว คืนวันที่ 12 สิงหาคม เวลา 22:00–04:00 น.</Notice>
      <SearchField placeholder="ค้นหาข่าวหรือประกาศ" />
      <div className="scroll-chips">{categories.map((item) => <button key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="news-list">
        {newsItems.map((item, index) => (
          <article key={item.title}>
            <span className={`news-thumb news-thumb--${index + 1}`}><Newspaper size={27} /></span>
            <div><Badge tone={item.tone as 'red' | 'green' | 'blue'}>{item.category}</Badge><h2>{item.title}</h2><time>{item.date} · อ่าน 2 นาที</time></div>
            <ChevronRight size={19} />
          </article>
        ))}
      </div>
    </div>
  )
}

function ServicesScreen() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const filtered = serviceItems.filter((item) => item.title.includes(search))
  return (
    <div className="citizen-screen services-screen">
      <div className="citizen-title"><h1>ค้นหาบริการเทศบาล</h1><p>บอกสิ่งที่ต้องการ ระบบจะพาไปยังบริการที่ถูกต้อง</p></div>
      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="เช่น ขออนุญาตก่อสร้าง จ่ายภาษี…" />
      <div className="service-categories">
        {[
          ['ทั้งหมด', CircleEllipsis], ['ใบอนุญาต', FileText], ['สิ่งแวดล้อม', Recycle], ['สวัสดิการ', Users],
        ].map(([label, Icon]) => {
          const CategoryIcon = Icon as typeof FileText
          return <button key={label as string} className={category === label ? 'is-active' : ''} onClick={() => setCategory(label as string)}><CategoryIcon size={20} /><span>{label as string}</span></button>
        })}
      </div>
      <div className="service-list">
        {filtered.map(({ title, meta, icon: Icon, tone }) => (
          <button key={title}><span className={`icon-tone--${tone}`}><Icon size={21} /></span><span><strong>{title}</strong><small>{meta}</small></span><ChevronRight size={18} /></button>
        ))}
      </div>
      <div className="service-info-grid"><article><Clock3 size={20} /><strong>เวลาทำการ</strong><span>จันทร์–ศุกร์<br />08:30–16:30 น.</span></article><article><HandCoins size={20} /><strong>ค่าธรรมเนียม</strong><span>ตรวจสอบได้ในหน้ารายละเอียดบริการ</span></article></div>
    </div>
  )
}

function ContactDirectoryScreen() {
  const [query, setQuery] = useState('')
  const filtered = contactItems.filter((item) => item.name.includes(query) || item.scope.includes(query))
  return (
    <div className="citizen-screen contact-screen">
      <div className="citizen-title"><h1>ติดต่อหน่วยงาน</h1><p>เลือกหน่วยงานเพื่อโทรติดต่อหรือดูข้อมูลเพิ่มเติม</p></div>
      <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาหน่วยงานหรือเรื่องที่ต้องการติดต่อ" />
      <div className="contact-list">
        {filtered.map((contact) => (
          <article key={contact.name}>
            <span className={`contact-avatar icon-tone--${contact.tone}`}><Building2 size={21} /></span>
            <div><strong>{contact.name} <BadgeCheck size={15} /></strong><p>{contact.scope}</p><small>{contact.hours}</small></div>
            <Button variant="line" size="sm" icon={<Phone size={16} />} onClick={() => undefined}>โทร</Button>
          </article>
        ))}
      </div>
      <button className="view-all-link">ดูหน่วยงานทั้งหมด <ChevronRight size={17} /></button>
      <Panel title="ที่ตั้งเทศบาล">
        <div className="map-card">
          <div><MapPin size={19} /><span>123 ถนนเทศบาล ตำบลในเมือง<br />อำเภอเมือง จังหวัดตัวอย่าง 11000</span></div>
          <span className="map-visual"><MapPin size={30} /></span>
          <Button variant="secondary" size="sm" icon={<Navigation size={16} />}>นำทาง</Button>
        </div>
      </Panel>
    </div>
  )
}

function RichMenuPublicScreen({ navigate }: { navigate: (id: string) => void }) {
  return <div className="citizen-screen richmenu-public"><div className="chat-canvas"><div className="chat-bot-bubble"><span><Building2 size={18} /></span><p>สวัสดีค่ะ เทศบาลเมืองตัวอย่างยินดีให้บริการผ่าน LINE ค่ะ</p></div></div><section className="line-richmenu"><header><span>เมนูบริการ</span><small>แตะเพื่อเลือกบริการ</small></header><div>{quickActions.map(({ id, label, icon: Icon, tone }) => <button key={id} className={`action--${tone}`} onClick={() => navigate(id)}><Icon size={27} /><strong>{label}</strong></button>)}</div><footer>หากเมนูไม่แสดง พิมพ์ “เมนู” ในช่องแชต</footer></section></div>
}

function ChatStateScreen({ kind, navigate }: { kind: 'welcome' | 'answer' | 'clarify' | 'handoff'; navigate: (id: string) => void }) {
  const [choice, setChoice] = useState('ขออนุญาตก่อสร้างบ้าน')
  return <div className="citizen-screen chat-state-screen"><div className="chat-canvas">
    <div className="chat-bot-bubble"><span><Building2 size={18} /></span><div>{kind === 'welcome' ? <><strong>สวัสดีค่ะ 👋</strong><p>ดิฉันเป็นผู้ช่วย AI ของเทศบาล ช่วยค้นข้อมูลบริการ ขั้นตอน เอกสาร และช่องทางติดต่อจากข้อมูลทางการค่ะ</p></> : kind === 'answer' ? <><p>รถเก็บขยะทั่วไปในเขตเทศบาลให้บริการทุกวัน เวลา 08:00–16:00 น. กรุณานำถังขยะออกก่อน 08:00 น. ค่ะ</p><button type="button" className="citation-link" onClick={() => navigate('C-19')}>[1] ประกาศการให้บริการเก็บขยะ พ.ศ. 2569</button><small>มีผลตั้งแต่ 1 ม.ค. 2569</small></> : kind === 'clarify' ? <><strong>ขอถามเพิ่มอีกหนึ่งข้อนะคะ</strong><p>คุณต้องการข้อมูลการขออนุญาตประเภทใด?</p></> : <><strong>ส่งคำถามให้เจ้าหน้าที่แล้ว</strong><p>คำถามนี้ต้องตรวจสอบข้อมูลเฉพาะกรณี กองช่างจะตอบกลับผ่าน LINE ภายในเวลาทำการ</p></>}</div></div>
    {kind === 'welcome' ? <div className="chat-quick-replies">{['เวลาทำการ', 'เอกสารขออนุญาต', 'เบอร์ติดต่อ', 'แจ้งปัญหา'].map((item) => <button key={item}>{item}</button>)}</div> : null}
    {kind === 'answer' ? <div className="chat-answer-meta"><Notice tone="success">คำตอบอ้างอิงข้อมูลทางการ · ความเชื่อมั่นสูง</Notice><span>คำตอบนี้มีประโยชน์หรือไม่? <button><ThumbsUp size={17} /></button><button><ThumbsDown size={17} /></button></span><Button variant="secondary" onClick={() => navigate('C-02')}>แจ้งปัญหาเกี่ยวกับขยะ</Button></div> : null}
    {kind === 'clarify' ? <div className="clarify-options">{['ขออนุญาตก่อสร้างบ้าน', 'ดัดแปลงหรือต่อเติมอาคาร', 'รื้อถอนอาคาร', 'ยังไม่แน่ใจ'].map((item) => <button key={item} className={choice === item ? 'is-selected' : ''} onClick={() => setChoice(item)}>{item}<ChevronRight size={16} /></button>)}</div> : null}
    {kind === 'handoff' ? <div className="handoff-card"><small>หมายเลขคำถาม</small><strong>TKT-2569-00124</strong><dl><div><dt>หน่วยงาน</dt><dd>กองช่าง</dd></div><div><dt>สถานะ</dt><dd><Badge tone="blue">รอเจ้าหน้าที่ตอบ</Badge></dd></div><div><dt>เวลาคาดการณ์</dt><dd>ภายใน 1 วันทำการ</dd></div></dl><Button className="full-width" onClick={() => navigate('C-08')}>ติดตามคำถาม</Button></div> : null}
  </div><div className="chat-composer"><input aria-label="ข้อความถึงเทศบาล" placeholder="พิมพ์ข้อความ…" /><button type="button" aria-label="ส่งข้อความ"><Send size={20} /></button></div></div>
}

function ComplaintMediaScreen() {
  const [retrying, setRetrying] = useState(false)
  return <div className="citizen-screen"><Stepper active={1} /><h1>รูปภาพและตำแหน่ง</h1><p className="section-intro">เพิ่มหลักฐานเพื่อช่วยเจ้าหน้าที่ตรวจสอบได้เร็วขึ้น</p><div className="media-upload-list"><article><span className="scene scene--one"><Trash2 size={24} /></span><div><strong>photo_01.jpg</strong><small>1.8 MB · อัปโหลดแล้ว</small><ProgressBar value={100} tone="green" /></div><Badge tone="green">สำเร็จ</Badge></article><article className="is-error"><span className="scene scene--two"><Trash2 size={24} /></span><div><strong>photo_02.jpg</strong><small>การเชื่อมต่อขัดข้อง</small><ProgressBar value={retrying ? 72 : 24} tone="red" /></div><Button size="sm" variant="secondary" onClick={() => setRetrying(true)}>ลองใหม่</Button></article><button className="drop-zone-mini"><Camera size={24} />เพิ่มรูปภาพ</button></div><Panel title="ตำแหน่งที่เกิดเหตุ"><div className="map-card"><div><MapPin size={19} /><span>123/1 ถนนสุขใจ ตำบลสุขใจ</span></div><span className="map-visual"><MapPin size={30} /></span><Button variant="secondary" size="sm"><LocateFixed size={16} />ใช้ตำแหน่งปัจจุบัน</Button></div></Panel><Button size="lg" className="citizen-wide-action">บันทึกและถัดไป</Button></div>
}

function ContactConsentScreen() {
  const [consent, setConsent] = useState(true)
  const [notify, setNotify] = useState<'line' | 'phone'>('line')
  return <div className="citizen-screen"><Stepper active={2} /><h1>ข้อมูลผู้ติดต่อ</h1><div className="citizen-form-stack"><label className="field-label">ชื่อผู้แจ้ง<input defaultValue="กาญจนา แสงดี" /></label><label className="field-label">เบอร์โทรศัพท์<input defaultValue="089-123-4567" /></label><label className="field-label">ช่องทางรับความคืบหน้า<SegmentedControl value={notify} onChange={setNotify} ariaLabel="ช่องทางรับการแจ้งเตือน" options={[{ value: 'line', label: 'LINE' }, { value: 'phone', label: 'โทรศัพท์' }]} /></label></div><Panel title="ความยินยอมและความเป็นส่วนตัว"><label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>ยินยอมให้เทศบาลใช้ข้อมูลเพื่อดำเนินการคำร้อง</strong><small>ใช้เฉพาะการติดต่อ ตรวจสอบ และแจ้งความคืบหน้าของเรื่องนี้</small></span></label><button type="button" className="text-link">อ่านประกาศความเป็นส่วนตัว</button></Panel><Notice tone="info">คุณถอนความยินยอมได้ แต่เทศบาลอาจไม่สามารถแจ้งความคืบหน้าผ่านช่องทางที่เลือก</Notice><Button size="lg" className="citizen-wide-action" disabled={!consent}>บันทึกและถัดไป</Button></div>
}

function ComplaintReviewScreen({ navigate }: { navigate: (id: string) => void }) {
  return <div className="citizen-screen"><Stepper active={2} /><h1>ตรวจสอบก่อนส่ง</h1><div className="review-cards"><Panel title="รายละเอียด" action={<button>แก้ไข</button>}><dl><div><dt>ประเภท</dt><dd>ขยะ / สิ่งปฏิกูล</dd></div><div><dt>รายละเอียด</dt><dd>ถังขยะเต็ม ไม่มีการจัดเก็บบริเวณหน้าบ้าน</dd></div></dl></Panel><Panel title="หลักฐานและตำแหน่ง" action={<button>แก้ไข</button>}><p>2 รูปภาพ · 123/1 ถนนสุขใจ ตำบลสุขใจ</p></Panel><Panel title="ผู้ติดต่อ" action={<button>แก้ไข</button>}><p>กาญจนา แสงดี · 089-123-4567 · แจ้งผ่าน LINE</p></Panel></div><Notice tone="success">ข้อมูลครบถ้วน พร้อมส่งให้เทศบาล</Notice><Button size="lg" className="citizen-wide-action" onClick={() => navigate('C-07')}>ยืนยันและส่ง</Button></div>
}

function AdditionalInfoScreen() {
  const [text, setText] = useState('เพิ่มเติม: บริเวณดังกล่าวอยู่หน้าร้านสะดวกซื้อ ตรงข้ามอาคาร 12 ค่ะ')
  return <div className="citizen-screen"><div className="request-summary"><span className="request-summary__icon"><Construction size={25} /></span><div><small>คำร้อง R2569-000123</small><h1>ส่งข้อมูลเพิ่มเติม</h1><p>ถนนชำรุด บริเวณซอยเทศบาล 5</p></div></div><Notice tone="info">ข้อความและไฟล์ที่ส่งจะมองเห็นโดยเจ้าหน้าที่ผู้รับผิดชอบ และอาจแสดงในไทม์ไลน์ของคุณ</Notice><label className="field-label">ข้อความ<textarea value={text} onChange={(event) => setText(event.target.value)} /><small>{text.length}/500</small></label><button className="attachment-row"><Paperclip size={19} /><span><strong>แนบรูปหรือเอกสาร</strong><small>สูงสุด 5 ไฟล์ ไฟล์ละไม่เกิน 10 MB</small></span><ChevronRight size={18} /></button><Button size="lg" className="citizen-wide-action" icon={<Send size={18} />}>ส่งข้อมูล</Button></div>
}

function NewsDetailScreen() {
  return <article className="citizen-screen citizen-article"><Badge tone="red">ประกาศสำคัญ</Badge><h1>แจ้งปิดปรับปรุงระบบประปาชั่วคราว คืนวันที่ 12 สิงหาคม</h1><time>เผยแพร่ 10 ส.ค. 2569 · งานประชาสัมพันธ์</time><div className="article-hero"><Megaphone size={46} /></div><p>เทศบาลเมืองตัวอย่างจะดำเนินการปรับปรุงระบบประปาบริเวณสถานีสูบน้ำหลัก เพื่อเพิ่มประสิทธิภาพการให้บริการ</p><h2>ช่วงเวลาดำเนินการ</h2><p>วันที่ 12 สิงหาคม 2569 เวลา 22:00 น. ถึงวันที่ 13 สิงหาคม 2569 เวลา 04:00 น.</p><Notice tone="warning">โปรดสำรองน้ำไว้ใช้ล่วงหน้า และปิดวาล์วน้ำภายในบ้านระหว่างดำเนินการ</Notice><button className="attachment-row"><FileText size={19} /><span><strong>ประกาศฉบับเต็ม.pdf</strong><small>PDF · 284 KB</small></span><Download size={18} /></button><Button className="citizen-wide-action" variant="secondary" icon={<Share2 size={17} />}>แชร์ข่าว</Button></article>
}

function ServiceDetailScreen({ navigate }: { navigate: (id: string) => void }) {
  const [tab, setTab] = useState<'steps' | 'docs' | 'fee'>('steps')
  return <div className="citizen-screen service-detail"><span className="service-detail__icon"><FileText size={28} /></span><h1>ขออนุญาตก่อสร้างอาคาร</h1><p>ยื่นคำขอและติดตามผลกับกองช่างเทศบาล</p><SegmentedControl value={tab} onChange={setTab} ariaLabel="รายละเอียดบริการ" options={[{ value: 'steps', label: 'ขั้นตอน' }, { value: 'docs', label: 'เอกสาร' }, { value: 'fee', label: 'ค่าธรรมเนียม' }]} />{tab === 'steps' ? <ol className="service-steps"><li><span>1</span><div><strong>เตรียมเอกสารและแบบแปลน</strong><small>ตรวจรายการในแท็บเอกสาร</small></div></li><li><span>2</span><div><strong>ยื่นคำขอที่กองช่าง</strong><small>หรือยื่นคำขอออนไลน์</small></div></li><li><span>3</span><div><strong>เจ้าหน้าที่ตรวจสถานที่และแบบ</strong><small>ภายใน 15 วันทำการ</small></div></li><li><span>4</span><div><strong>รับใบอนุญาต</strong><small>ชำระค่าธรรมเนียมตามจริง</small></div></li></ol> : tab === 'docs' ? <ul className="document-checklist"><li><CheckCircle2 size={17} />สำเนาบัตรประชาชน</li><li><CheckCircle2 size={17} />สำเนาทะเบียนบ้าน</li><li><CheckCircle2 size={17} />แบบแปลนและแผนผังบริเวณ</li><li><CheckCircle2 size={17} />หนังสือยินยอมเจ้าของที่ดิน</li></ul> : <Panel><p>ค่าธรรมเนียมขึ้นอยู่กับประเภทและขนาดอาคาร เจ้าหน้าที่จะแจ้งยอดที่ตรวจสอบแล้วก่อนชำระ</p></Panel>}<Notice tone="info">แหล่งข้อมูล: คู่มือบริการกองช่าง เวอร์ชัน 1.3 มีผล 1 ก.ค. 2569</Notice><Button className="citizen-wide-action" onClick={() => navigate('C-18')}>ติดต่อกองช่าง</Button></div>
}

function CitationViewerScreen() {
  return <div className="citizen-screen citation-viewer"><header><FileText size={25} /><div><h1>ประกาศการให้บริการเก็บขยะ พ.ศ. 2569</h1><p>เทศบาลเมืองตัวอย่าง · เวอร์ชัน 2.1</p></div></header><dl><div><dt>มีผลตั้งแต่</dt><dd>1 ม.ค. 2569</dd></div><div><dt>ตำแหน่งอ้างอิง</dt><dd>หน้า 3 · หัวข้อ “เวลาการให้บริการ”</dd></div><div><dt>สถานะ</dt><dd><Badge tone="green">ฉบับที่มีผล</Badge></dd></div></dl><blockquote>“รถเก็บขยะทั่วไปให้บริการทุกวัน ระหว่างเวลา 08:00–16:00 น. ประชาชนควรนำภาชนะรองรับขยะออกวางก่อนเวลา 08:00 น.”</blockquote><Notice tone="success">ข้อความนี้ตรงกับเอกสารเผยแพร่ของเทศบาลและยังอยู่ในช่วงมีผล</Notice><Button className="citizen-wide-action" variant="secondary" icon={<Download size={17} />}>ดาวน์โหลดเอกสารฉบับเต็ม</Button><Button className="citizen-wide-action" variant="ghost" icon={<ExternalLink size={17} />}>เปิดเว็บไซต์เทศบาล</Button></div>
}

function HelpPrivacyScreen() {
  const [tab, setTab] = useState<'help' | 'access' | 'consent'>('help')
  return <div className="citizen-screen"><div className="citizen-title"><h1>ช่วยเหลือและสิทธิ์ของคุณ</h1><p>วิธีใช้ การเข้าถึง และการจัดการข้อมูลส่วนบุคคล</p></div><SegmentedControl value={tab} onChange={setTab} ariaLabel="หัวข้อความช่วยเหลือ" options={[{ value: 'help', label: 'วิธีใช้' }, { value: 'access', label: 'การเข้าถึง' }, { value: 'consent', label: 'ความยินยอม' }]} />{tab === 'help' ? <div className="help-list"><button><MessageCircle size={20} /><span><strong>วิธีถาม AI ให้ได้คำตอบที่ตรง</strong><small>ระบุบริการ พื้นที่ และสิ่งที่ต้องการทราบ</small></span><ChevronRight size={17} /></button><button><Megaphone size={20} /><span><strong>วิธีแจ้งปัญหาและติดตาม</strong><small>ขั้นตอน แนบรูป และแก้ไขข้อมูล</small></span><ChevronRight size={17} /></button></div> : tab === 'access' ? <div className="help-list"><button><Sparkles size={20} /><span><strong>โหมดคอนทราสต์สูง</strong><small>เพิ่มความชัดของข้อความและปุ่ม</small></span><Badge tone="green">พร้อมใช้</Badge></button><button><BookOpenText size={20} /><span><strong>ขนาดตัวอักษร</strong><small>รองรับการขยายถึง 200%</small></span><Badge tone="green">รองรับ</Badge></button></div> : <div className="consent-history"><article><CheckCircle2 size={18} /><div><strong>ข้อมูลคำร้อง R2569-000123</strong><small>ให้ความยินยอม 8 ส.ค. 2569 · แจ้งผ่าน LINE</small></div><button>ดูรายละเอียด</button></article><article><CheckCircle2 size={18} /><div><strong>ข่าวประชาสัมพันธ์</strong><small>ให้ความยินยอม 1 ม.ค. 2569</small></div><button>ถอนความยินยอม</button></article></div>}<Button className="citizen-wide-action" variant="secondary">ติดต่อเจ้าหน้าที่</Button></div>
}

export function CitizenScreen({ screen, navigate }: CitizenScreenProps) {
  switch (screen.kind) {
    case 'richmenu-public': return <RichMenuPublicScreen navigate={navigate} />
    case 'chat-welcome': return screen.id === 'CHAT-01' ? <ChatStateScreen kind="welcome" navigate={navigate} /> : <HomeScreen navigate={navigate} />
    case 'chat-answer': return <ChatStateScreen kind="answer" navigate={navigate} />
    case 'chat-clarify': return <ChatStateScreen kind="clarify" navigate={navigate} />
    case 'chat-handoff': return <ChatStateScreen kind="handoff" navigate={navigate} />
    case 'complaint-form': return <ComplaintFormScreen navigate={navigate} />
    case 'complaint-media': return <ComplaintMediaScreen />
    case 'contact-consent': return <ContactConsentScreen />
    case 'complaint-review': return <ComplaintReviewScreen navigate={navigate} />
    case 'complaint-success': return <SuccessScreen navigate={navigate} />
    case 'tracking-list': return <TrackingListScreen navigate={navigate} />
    case 'tracking-detail': return <TrackingDetailScreen />
    case 'additional-info': return <AdditionalInfoScreen />
    case 'news-list': return <NewsListScreen />
    case 'news-detail': return <NewsDetailScreen />
    case 'services': return <ServicesScreen />
    case 'service-detail': return <ServiceDetailScreen navigate={navigate} />
    case 'contact-directory': return <ContactDirectoryScreen />
    case 'citation-viewer': return <CitationViewerScreen />
    case 'help-privacy': return <HelpPrivacyScreen />
    default:
      return <Notice tone="warning">ยังไม่มีองค์ประกอบสำหรับหน้าจอนี้</Notice>
  }
}
