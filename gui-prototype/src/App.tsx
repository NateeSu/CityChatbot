import { useCallback, useEffect, useState } from 'react'
import { AdminShell, CitizenShell } from './components/Shells'
import { PrototypeToolbar, type PreviewMode, type ThemeMode } from './components/PrototypeToolbar'
import { ScreenCatalog } from './components/ScreenCatalog'
import { ViewStateBoundary, type ViewState } from './components/Primitives'
import { findScreenFromLocation, screenMap, type ScreenDefinition } from './data/screens'
import { AdminScreen } from './features/admin/AdminScreens'
import { CitizenScreen } from './features/citizen/CitizenScreens'
import { SystemScreen } from './features/system/SystemScreens'

function readTheme(): ThemeMode {
  const queryTheme = new URLSearchParams(window.location.search).get('theme')
  if (queryTheme === 'dark' || queryTheme === 'contrast' || queryTheme === 'light') return queryTheme
  const stored = window.localStorage.getItem('citychatbot-prototype-theme')
  return stored === 'dark' || stored === 'contrast' ? stored : 'light'
}

function readPreview(): PreviewMode {
  const viewport = new URLSearchParams(window.location.search).get('viewport')
  return viewport === 'desktop' || viewport === 'tablet' || viewport === 'mobile' ? viewport : 'auto'
}

function readState(): ViewState {
  const state = new URLSearchParams(window.location.search).get('state')
  return state === 'loading' || state === 'empty' || state === 'error' ? state : 'ready'
}

function readScreen(): ScreenDefinition | undefined {
  return findScreenFromLocation(window.location)
}

export default function App() {
  const [screen, setScreen] = useState<ScreenDefinition | undefined>(() => readScreen())
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme())
  const [viewState, setViewState] = useState<ViewState>(() => readState())
  const [preview, setPreview] = useState<PreviewMode>(() => readPreview())
  const chromeHidden = new URLSearchParams(window.location.search).get('chrome') === '0'

  useEffect(() => {
    const onPopState = () => setScreen(readScreen())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark'
    window.localStorage.setItem('citychatbot-prototype-theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = screen ? `${screen.id} · ${screen.title} | CityChatbot GUI` : 'CityChatbot GUI Reference'
  }, [screen])

  const navigate = useCallback((id: string) => {
    const next = screenMap.get(id)
    if (!next) return
    const url = new URL(window.location.href)
    url.pathname = next.route
    url.searchParams.delete('screen')
    window.history.pushState({}, '', `${url.pathname}${url.search}`)
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const showCatalog = useCallback(() => {
    window.history.pushState({}, '', '/catalog')
    setScreen(undefined)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const content = screen ? (
    <ViewStateBoundary state={viewState} title={screen.shortTitle} onReady={() => setViewState('ready')}>
      {screen.audience === 'citizen' ? <CitizenScreen screen={screen} navigate={navigate} /> : screen.audience === 'admin' ? <AdminScreen screen={screen} navigate={navigate} /> : <SystemScreen screen={screen} navigate={navigate} />}
    </ViewStateBoundary>
  ) : null

  return (
    <div className={`prototype-app preview-${preview} ${chromeHidden ? 'is-chrome-hidden' : ''}`}>
      {chromeHidden ? null : <PrototypeToolbar screen={screen} theme={theme} state={viewState} preview={preview} onThemeChange={setTheme} onStateChange={setViewState} onPreviewChange={setPreview} onCatalog={showCatalog} />}
      <div className="preview-viewport">
        {screen ? screen.audience === 'citizen' ? <CitizenShell screen={screen} navigate={navigate}>{content}</CitizenShell> : <AdminShell screen={screen} navigate={navigate}>{content}</AdminShell> : <ScreenCatalog navigate={navigate} />}
      </div>
    </div>
  )
}
