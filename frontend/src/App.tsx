import React, { useEffect, useState, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'
import AdminApp from './pages/AdminApp'
import LoginPage from './pages/LoginPage'
import { withQueryClientProvider } from './utils/withQueryClientProvider'
import VolunteersApp from './pages/VolunteersApp'
import { clearAuthToken, clearAuthUser, fetchCurrentUser, getAllowedVariants, setAuthUser, type AppVariant } from './services/api'
const LazyMusicApp = React.lazy(() => import('./pages/MusicApp'))

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
  const [isCheckingAccess, setIsCheckingAccess] = useState(false)
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
    clearAuthToken()
    clearAuthUser()
    setIsAuthenticated(false)
  }

  useEffect(() => {
    if (!isAuthenticated) return
    let isMounted = true
    setIsCheckingAccess(true)
    fetchCurrentUser()
      .then((user) => {
        if (!isMounted) return
        setAuthUser(user)
        const allowedVariants = getAllowedVariants(user.roles)
        if (allowedVariants.length === 0) {
          handleLogout()
          return
        }
        if (!allowedVariants.includes(activeApp)) {
          const nextVariant = allowedVariants[0]
          setActiveApp(nextVariant)
          localStorage.setItem('appVariant', nextVariant)
        }
      })
      .catch(() => {
        if (!isMounted) return
        handleLogout()
      })
      .finally(() => {
        if (isMounted) setIsCheckingAccess(false)
      })
    return () => {
      isMounted = false
    }
  }, [isAuthenticated, activeApp])

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} initialVariant={activeApp} />
  }

  if (isCheckingAccess) {
    return <div className="loading">Validando acceso...</div>
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
