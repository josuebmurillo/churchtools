import { useState, type FormEvent } from 'react'

type AppVariant = 'admin' | 'music' | 'volunteers'

type LoginPageProps = {
  onLogin: (variant: AppVariant) => void
  initialVariant: AppVariant
}

const variantCopy: Record<AppVariant, { title: string; subtitle: string }> = {
  admin: {
    title: 'Administración',
    subtitle: 'Gestiona ministerios, personas, calendario y métricas.',
  },
  music: {
    title: 'Música',
    subtitle: 'Prepara cultos, setlists y ensayos del equipo de alabanza.',
  },
  volunteers: {
    title: 'Voluntarios',
    subtitle: 'Organiza eventos, turnos y asignaciones del equipo.',
  },
}

const LoginPage = ({ onLogin, initialVariant }: LoginPageProps) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [variant, setVariant] = useState<AppVariant>(initialVariant)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'signup' && !name.trim()) {
      setError('Ingresa tu nombre')
      return
    }
    if (!email.trim() || !password.trim()) {
      setError('Ingresa tu correo y contraseña')
      return
    }
    setError(null)
    localStorage.setItem('auth', 'true')
    onLogin(variant)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="kicker">Acceso</span>
          <h1>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
          <p>{mode === 'login' ? variantCopy[variant].subtitle : 'Completa tus datos para crear tu cuenta.'}</p>
        </div>
        <div className="login-toggle">
          <button
            className={mode === 'login' ? 'action-button active' : 'action-button'}
            type="button"
            onClick={() => setMode('login')}
          >
            Ingresar
          </button>
          <button
            className={mode === 'signup' ? 'action-button active' : 'action-button'}
            type="button"
            onClick={() => setMode('signup')}
          >
            Registrarme
          </button>
        </div>
        <div className="login-switcher">
          <span>Entrar al módulo</span>
          <div className="login-switcher-buttons">
            {([
              { key: 'admin', label: 'Administración' },
              { key: 'music', label: 'Músicos' },
              { key: 'volunteers', label: 'Voluntarios' },
            ] as const).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`action-button ${variant === item.key ? 'active' : ''}`}
                onClick={() => setVariant(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="module-chip">Módulo activo: {variantCopy[variant].title}</div>
        <form className="form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label className="field">
              Nombre
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                required
              />
            </label>
          )}
          <label className="field">
            Correo
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@ejemplo.com"
              required
            />
          </label>
          <label className="field">
            Contraseña
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && <div className="notice notice--error">{error}</div>}
          <button className="primary" type="submit">
            {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
