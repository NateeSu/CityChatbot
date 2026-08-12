import type { ReactNode } from 'react'
import {
  Bell,
  BookOpen,
  Bot,
  Building2,
  ChevronLeft,
  CircleGauge,
  ClipboardList,
  FileBarChart,
  Home,
  Menu,
  MessageCircleQuestion,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import type { ScreenDefinition } from '../data/screens'
import { Badge, Button, SearchField } from './Primitives'

interface ShellProps {
  screen: ScreenDefinition
  children: ReactNode
  navigate: (id: string) => void
}

const adminNavigation = [
  { id: 'A-10', label: 'ภาพรวม', icon: Home },
  { id: 'A-20', label: 'เรื่องร้องเรียน', icon: ClipboardList },
  { id: 'A-30', label: 'คำถามประชาชน', icon: MessageCircleQuestion },
  { id: 'A-40', label: 'คลังความรู้', icon: BookOpen },
  { id: 'A-60', label: 'ข่าวประชาสัมพันธ์', icon: Newspaper },
  { id: 'A-70', label: 'หน่วยงาน', icon: Building2 },
  { id: 'A-80', label: 'รายงาน', icon: FileBarChart },
  { id: 'A-91', label: 'ตั้งค่า', icon: Settings },
]

const systemNavigation = [
  { id: 'S-01', label: 'รายการ Tenant', icon: Building2 },
  { id: 'S-02', label: 'สร้าง Tenant', icon: Sparkles },
  { id: 'A-97', label: 'Audit ส่วนกลาง', icon: ShieldCheck },
]

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <span className="brand__mark" aria-hidden="true"><Building2 size={23} /></span>
      <span className="brand__copy">
        <strong>ศูนย์บริการประชาชน</strong>
        <small>เทศบาลเมืองตัวอย่าง</small>
      </span>
    </div>
  )
}

export function AdminShell({ screen, children, navigate }: ShellProps) {
  const navigation = screen.audience === 'system' ? systemNavigation : adminNavigation
  const activeId = screen.id
  return (
    <div className={`admin-shell admin-shell--${screen.audience}`}>
      <aside className="admin-sidebar">
        <BrandMark />
        <nav aria-label="เมนูหลักเจ้าหน้าที่">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeId === id || (id === 'A-91' && /^A-9/.test(activeId)) ? 'is-active' : ''} onClick={() => navigate(id)}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
              {id === 'A-30' ? <Badge tone="red">24</Badge> : null}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__profile">
          <span className="avatar">นว</span>
          <span><strong>นวิตรา มีสุข</strong><small>ผู้ดูแลระบบ</small></span>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <button className="mobile-menu" aria-label="เปิดเมนู"><Menu size={21} /></button>
          <SearchField placeholder="ค้นหาเรื่อง ผู้ร้องเรียน เอกสาร หรือเมนู…" />
          <div className="admin-header__context">
            <span className="tenant-seal"><Building2 size={19} /></span>
            <span className="tenant-name"><strong>เทศบาลเมืองตัวอย่าง</strong><small>รหัสหน่วยงาน: TM-001</small></span>
            <button className="icon-button notification-button" aria-label="การแจ้งเตือน"><Bell size={20} /><i>12</i></button>
            <button className="avatar avatar--button" aria-label="บัญชีผู้ใช้">นว</button>
          </div>
        </header>
        <main className="admin-main">
          <div className="page-heading">
            <div>
              <span className="screen-code">{screen.id}</span>
              <h1>{screen.title}</h1>
              <p>{screen.description}</p>
            </div>
            <div className="page-heading__actions">
              <Button variant="secondary" icon={<SlidersHorizontal size={17} />}>ตัวกรอง</Button>
              <Button>{screen.primaryAction}</Button>
            </div>
          </div>
          {children}
        </main>
      </div>
      <nav className="admin-bottom-nav" aria-label="เมนูมือถือ">
        {navigation.slice(0, 5).map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeId === id ? 'is-active' : ''} onClick={() => navigate(id)}>
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

const citizenNav = [
  { id: 'C-01', label: 'หน้าหลัก', icon: Home },
  { id: 'C-08', label: 'ติดตาม', icon: ClipboardList },
  { id: 'C-15', label: 'บริการ', icon: CircleGauge },
  { id: 'C-18', label: 'ติดต่อ', icon: UserRound },
]

export function CitizenShell({ screen, children, navigate }: ShellProps) {
  return (
    <div className="citizen-stage">
      <div className="citizen-device">
        <header className="citizen-header">
          <button aria-label="ย้อนกลับ" onClick={() => navigate('C-01')}><ChevronLeft size={24} /></button>
          <span className="citizen-header__logo"><Building2 size={17} /></span>
          <div><strong>{screen.shortTitle}</strong><small>เทศบาลเมืองตัวอย่าง</small></div>
          <button aria-label="ค้นหา"><Search size={21} /></button>
          <button className="notification-button" aria-label="การแจ้งเตือน"><Bell size={21} /><i>2</i></button>
        </header>
        <main className="citizen-main">{children}</main>
        <nav className="citizen-bottom-nav" aria-label="เมนูบริการประชาชน">
          {citizenNav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => navigate(id)} className={screen.id === id || (id === 'C-01' && ['C-02', 'C-07'].includes(screen.id)) ? 'is-active' : ''}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <aside className="citizen-context">
        <span className="citizen-context__icon"><Bot size={26} /></span>
        <h2>ต้นแบบ Mobile-first</h2>
        <p>หน้าจอนี้ออกแบบให้ใช้ด้วยมือเดียวบน LINE LIFF และขยายเป็น tablet/desktop โดยคงลำดับงานเดิม</p>
        <ul>
          <li><ShieldCheck size={16} /> พื้นที่กดไม่น้อยกว่า 44px</li>
          <li><Users size={16} /> ภาษาไทยอ่านง่ายสำหรับทุกวัย</li>
          <li><Sparkles size={16} /> สถานะและคำแนะนำชัดเจน</li>
        </ul>
      </aside>
    </div>
  )
}
