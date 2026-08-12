import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react'
import { audienceLabels, screens, type Audience } from '../data/screens'
import { Badge, SearchField, SegmentedControl } from './Primitives'

export function ScreenCatalog({ navigate }: { navigate: (id: string) => void }) {
  const [audience, setAudience] = useState<'all' | Audience>('all')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => screens.filter((screen) => (audience === 'all' || screen.audience === audience) && `${screen.id} ${screen.title} ${screen.description}`.toLowerCase().includes(query.toLowerCase())), [audience, query])
  return (
    <main className="catalog-page">
      <header className="catalog-hero">
        <span className="catalog-brand"><Building2 size={26} /></span>
        <div><h1>CityChatbot GUI Reference</h1><p>ต้นแบบหน้าจอหลักสำหรับ citizen, back office และ super admin — เปิดทุกหน้าได้ด้วย route หรือ query parameter</p></div>
        <Badge tone="green"><CheckCircle2 size={14} /> {screens.length} หน้าจอพร้อมตรวจ</Badge>
      </header>
      <section className="catalog-toolbar">
        <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารหัสหรือชื่อหน้าจอ…" />
        <SegmentedControl value={audience} onChange={setAudience} ariaLabel="กรองกลุ่มผู้ใช้" options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'citizen', label: 'ประชาชน' }, { value: 'admin', label: 'เจ้าหน้าที่' }, { value: 'system', label: 'ระบบกลาง' }]} />
      </section>
      <section className="catalog-stats">
        <article><Smartphone size={21} /><span><strong>Mobile-first</strong><small>Citizen LIFF / LINE</small></span></article>
        <article><LayoutDashboard size={21} /><span><strong>Responsive back office</strong><small>Desktop · Tablet · Mobile</small></span></article>
        <article><ShieldCheck size={21} /><span><strong>4 data states</strong><small>Ready · Loading · Empty · Error</small></span></article>
        <article><Sparkles size={21} /><span><strong>3 themes</strong><small>Light · Dark · High contrast</small></span></article>
      </section>
      <section className="catalog-grid">
        {filtered.map((screen) => (
          <button key={screen.id} className={`catalog-card catalog-card--${screen.audience}`} onClick={() => navigate(screen.id)}>
            <span className="catalog-card__visual">
              {screen.audience === 'citizen' ? <Smartphone size={30} /> : screen.audience === 'admin' ? <LayoutDashboard size={30} /> : <Users size={30} />}
              <i>{screen.id}</i>
            </span>
            <span className="catalog-card__body">
              <span><Badge tone={screen.audience === 'citizen' ? 'teal' : screen.audience === 'admin' ? 'blue' : 'amber'}>{audienceLabels[screen.audience]}</Badge><code>{screen.route}</code></span>
              <strong>{screen.title}</strong>
              <small>{screen.description}</small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </section>
      {filtered.length === 0 ? <div className="catalog-empty"><Search size={28} /><h2>ไม่พบหน้าจอที่ค้นหา</h2><p>ลองใช้รหัส เช่น A-20 หรือเลือกกลุ่มผู้ใช้ใหม่</p></div> : null}
    </main>
  )
}
