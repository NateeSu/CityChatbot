import {
  Contrast,
  GalleryHorizontalEnd,
  Laptop,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
  Tablet,
} from 'lucide-react'
import type { ScreenDefinition } from '../data/screens'
import type { ViewState } from './Primitives'
import { SegmentedControl } from './Primitives'

export type ThemeMode = 'light' | 'dark' | 'contrast'
export type PreviewMode = 'auto' | 'desktop' | 'tablet' | 'mobile'

interface PrototypeToolbarProps {
  screen?: ScreenDefinition
  theme: ThemeMode
  state: ViewState
  preview: PreviewMode
  onThemeChange: (theme: ThemeMode) => void
  onStateChange: (state: ViewState) => void
  onPreviewChange: (preview: PreviewMode) => void
  onCatalog: () => void
}

export function PrototypeToolbar({
  screen,
  theme,
  state,
  preview,
  onThemeChange,
  onStateChange,
  onPreviewChange,
  onCatalog,
}: PrototypeToolbarProps) {
  return (
    <div className="prototype-toolbar">
      <button className="prototype-toolbar__catalog" onClick={onCatalog}>
        <GalleryHorizontalEnd size={18} />
        <span><strong>GUI Reference</strong><small>{screen ? `${screen.id} · ${screen.shortTitle}` : 'Screen catalog'}</small></span>
      </button>
      <div className="prototype-toolbar__controls">
        <SegmentedControl
          value={theme}
          onChange={onThemeChange}
          ariaLabel="เลือกธีม"
          options={[
            { value: 'light', label: 'สว่าง', icon: <Sun size={15} /> },
            { value: 'dark', label: 'มืด', icon: <Moon size={15} /> },
            { value: 'contrast', label: 'คอนทราสต์สูง', icon: <Contrast size={15} /> },
          ]}
        />
        <SegmentedControl
          value={preview}
          onChange={onPreviewChange}
          ariaLabel="เลือกขนาดตัวอย่าง"
          options={[
            { value: 'auto', label: 'อัตโนมัติ', icon: <RotateCcw size={15} /> },
            { value: 'desktop', label: 'Desktop', icon: <Laptop size={15} /> },
            { value: 'tablet', label: 'Tablet', icon: <Tablet size={15} /> },
            { value: 'mobile', label: 'Mobile', icon: <Smartphone size={15} /> },
          ]}
        />
        <label className="prototype-state-select">
          <span>สถานะข้อมูล</span>
          <select value={state} onChange={(event) => onStateChange(event.target.value as ViewState)}>
            <option value="ready">พร้อมใช้งาน</option>
            <option value="loading">กำลังโหลด</option>
            <option value="empty">ไม่มีข้อมูล</option>
            <option value="error">เกิดข้อผิดพลาด</option>
          </select>
        </label>
      </div>
    </div>
  )
}
