import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleAlert,
  FileQuestion,
  LoaderCircle,
  RotateCcw,
  Search,
} from 'lucide-react'

export type ViewState = 'ready' | 'loading' | 'empty' | 'error'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'line'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}) {
  return (
    <button type={type} className={`button button--${variant} button--${size} ${className}`} {...props}>
      {icon ? <span className="button__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'teal'
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function SearchField({ className = '', placeholder, 'aria-label': ariaLabel, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`search-field ${className}`}>
      <Search size={17} aria-hidden="true" />
      <input type="search" placeholder={placeholder} aria-label={ariaLabel ?? placeholder ?? 'ค้นหา'} {...props} />
      <kbd>/</kbd>
    </label>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="select-field">
      {label ? <span>{label}</span> : null}
      <span className="select-field__control">
        <select aria-label={label ?? 'ตัวกรองรายการ'} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </label>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: readonly { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle" aria-hidden="true"><span /></span>
    </label>
  )
}

export function Panel({
  title,
  action,
  children,
  className = '',
  subtitle,
}: {
  title?: ReactNode
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <header className="panel__header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function MetricCard({
  label,
  value,
  delta,
  tone,
  icon,
}: {
  label: string
  value: string
  delta: string
  tone: string
  icon: ReactNode
}) {
  return (
    <article className={`metric metric--${tone}`}>
      <div className="metric__top">
        <span className="metric__icon">{icon}</span>
        <span className="mini-spark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{delta} <span>จากเมื่อวาน</span></small>
    </article>
  )
}

export function ProgressBar({ value, tone = 'blue', label }: { value: number; tone?: string; label?: string }) {
  return (
    <div className="progress" aria-label={label ?? `ความคืบหน้า ${value}%`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} className={`progress__bar progress__bar--${tone}`} />
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="surface-state surface-state--empty" role="status">
      <span className="surface-state__icon"><FileQuestion size={28} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="surface-state surface-state--error" role="alert">
      <span className="surface-state__icon"><CircleAlert size={28} /></span>
      <h2>แสดงข้อมูล {title} ไม่สำเร็จ</h2>
      <p>ระบบยังเก็บข้อมูลของคุณไว้ กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลหากปัญหายังคงอยู่</p>
      <Button variant="secondary" icon={<RotateCcw size={17} />} onClick={onRetry}>ลองอีกครั้ง</Button>
    </div>
  )
}

export function LoadingState({ title }: { title: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__label"><LoaderCircle className="spin" size={18} /> กำลังโหลด {title}</div>
      <div className="skeleton skeleton--title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
      <div className="skeleton skeleton--table" />
    </div>
  )
}

export function ViewStateBoundary({
  state,
  title,
  children,
  onReady,
}: {
  state: ViewState
  title: string
  children: ReactNode
  onReady: () => void
}) {
  if (state === 'loading') return <LoadingState title={title} />
  if (state === 'empty') {
    return (
      <EmptyState
        title={`ยังไม่มีข้อมูล${title}`}
        description="เมื่อมีข้อมูลใหม่ ระบบจะแสดงที่หน้านี้โดยอัตโนมัติ คุณสามารถปรับตัวกรองหรือเริ่มสร้างรายการใหม่ได้"
        action={<Button variant="secondary" onClick={onReady}>กลับไปดูข้อมูลตัวอย่าง</Button>}
      />
    )
  }
  if (state === 'error') return <ErrorState title={title} onRetry={onReady} />
  return children
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children: ReactNode
}) {
  const Icon = tone === 'success' ? Check : tone === 'warning' ? AlertTriangle : tone === 'danger' ? CircleAlert : CircleAlert
  return (
    <div className={`notice notice--${tone}`}>
      <Icon size={18} aria-hidden="true" />
      <div>{title ? <strong>{title}</strong> : null}<span>{children}</span></div>
    </div>
  )
}
