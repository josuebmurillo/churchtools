import { useState } from 'react'
import './App.css'
import AdminApp from './pages/AdminApp'
import LoginPage from './pages/LoginPage'
import MusicApp from './pages/MusicApp'
import VolunteersApp from './pages/VolunteersApp'

type AppVariant = 'admin' | 'music' | 'volunteers'

const APP_VARIANT = (import.meta.env.VITE_APP_VARIANT || 'admin') as AppVariant

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

  return activeApp === 'music' ? (
    <MusicApp onLogout={handleLogout} />
  ) : activeApp === 'volunteers' ? (
    <VolunteersApp onLogout={handleLogout} />
  ) : (
    <AdminApp onLogout={handleLogout} />
  )
}

export default App
