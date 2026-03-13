import React, { useState, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'
import AdminApp from './pages/AdminApp'
import LoginPage from './pages/LoginPage'
import { withQueryClientProvider } from './utils/withQueryClientProvider'
import VolunteersApp from './pages/VolunteersApp'
const LazyMusicApp = React.lazy(() => import('./pages/MusicApp'))

type AppVariant = 'admin' | 'music' | 'volunteers'

const APP_VARIANT = (import.meta.env.VITE_APP_VARIANT || 'admin') as AppVariant

const MusicAppWithProvider = withQueryClientProvider((props: any) => (
  <Suspense fallback={<div className="loading">Cargando módulo de música…</div>}>
    {/* eslint-disable-next-line react/jsx-props-no-spreading */}
    <LazyMusicApp {...props} />
  </Suspense>
))

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('auth') === 'true'
  })
  const [activeApp, setActiveApp] = useState<AppVariant>(() => {
    const stored = localStorage.getItem('appVariant')
    if (stored === 'admin' || stored === 'music' || stored === 'volunteers') {
      return stored
    }
    return APP_VARIANT
  })

  const handleLogin = (variant: AppVariant) => {
    setActiveApp(variant)
    localStorage.setItem('appVariant', variant)
    localStorage.setItem('auth', 'true')
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('auth')
    setIsAuthenticated(false)
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} initialVariant={activeApp} />
  }

  return (
    <ErrorBoundary>
      {activeApp === 'music' ? (
        <MusicAppWithProvider onLogout={handleLogout} />
      ) : activeApp === 'volunteers' ? (
        <VolunteersApp onLogout={handleLogout} />
      ) : (
        <AdminApp onLogout={handleLogout} />
      )}
    </ErrorBoundary>
  )
}

export default App
