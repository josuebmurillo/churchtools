const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export type AppVariant = 'admin' | 'music' | 'volunteers'

export type AuthRole = {
  id: number
  name: string
  description?: string | null
}

export type AuthPermission = {
  id: number
  name: string
  description?: string | null
}

export type AuthUser = {
  id: number
  person_id?: number | null
  username: string
  email: string
  active: boolean
  roles: AuthRole[]
  permissions: AuthPermission[]
}

export const VIEW_OPTIONS: Array<{ variant: AppVariant; label: string }> = [
  { variant: 'admin', label: 'Administración' },
  { variant: 'music', label: 'Músicos' },
  { variant: 'volunteers', label: 'Voluntarios' },
]

export const MODULE_PERMISSION_OPTIONS: Record<AppVariant, Array<{ key: string; permissionName: string; label: string }>> = {
  admin: [
    { key: 'resumen', permissionName: 'admin:resumen', label: 'Resumen' },
    { key: 'usuarios', permissionName: 'admin:usuarios', label: 'Usuarios' },
    { key: 'ministerios', permissionName: 'admin:ministerios', label: 'Ministerios' },
    { key: 'voluntarios', permissionName: 'admin:voluntarios', label: 'Voluntarios' },
    { key: 'seguimiento', permissionName: 'admin:seguimiento', label: 'Seguimiento' },
    { key: 'consejerias', permissionName: 'admin:consejerias', label: 'Consejerías' },
    { key: 'calendario', permissionName: 'admin:calendario', label: 'Calendario' },
    { key: 'metricas', permissionName: 'admin:metricas', label: 'Métricas' },
    { key: 'mapa', permissionName: 'admin:mapa', label: 'Mapa' },
    { key: 'proveedores', permissionName: 'admin:proveedores', label: 'Proveedores' },
  ],
  music: [
    { key: 'general', permissionName: 'music:general', label: 'General' },
    { key: 'ensayo', permissionName: 'music:ensayo', label: 'Ensayo' },
    { key: 'setlist', permissionName: 'music:setlist', label: 'Setlist' },
    { key: 'canciones', permissionName: 'music:canciones', label: 'Canciones' },
  ],
  volunteers: [
    { key: 'eventos', permissionName: 'volunteers:eventos', label: 'Eventos' },
    { key: 'turnos', permissionName: 'volunteers:turnos', label: 'Turnos' },
    { key: 'asignaciones', permissionName: 'volunteers:asignaciones', label: 'Asignaciones' },
  ],
}

const normalizeRoleName = (roleName: string) =>
  roleName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const getRoleVariant = (roleName: string): AppVariant | null => {
  const normalized = normalizeRoleName(roleName)
  if (normalized === 'admin' || normalized === 'administracion') return 'admin'
  if (normalized === 'music' || normalized === 'musica' || normalized === 'musicos') return 'music'
  if (normalized === 'volunteers' || normalized === 'volunteer' || normalized === 'voluntario' || normalized === 'voluntarios') {
    return 'volunteers'
  }
  return null
}

export const buildUrl = (service: string, path: string) => `${API_BASE_URL}/${service}${path}`

// Token helpers
export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token')
}
export function setAuthToken(token: string) {
  localStorage.setItem('auth_token', token)
}
export function clearAuthToken() {
  localStorage.removeItem('auth_token')
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem('auth_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setAuthUser(user: AuthUser) {
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export function clearAuthUser() {
  localStorage.removeItem('auth_user')
}

export const fetchJson = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
  const token = getAuthToken()
  const headers = new Headers(options.headers || {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const detail = await response.text()
    if (response.status === 401) {
      clearAuthToken()
      clearAuthUser()
      localStorage.removeItem('auth')
      throw new Error('Sesion expirada. Inicia sesion nuevamente.')
    }
    throw new Error(detail || `HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export const postJson = async <T,>(url: string, payload: T) =>
  fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const fetchCurrentUser = () => fetchJson<AuthUser>(buildUrl('security', '/auth/me'))

export const getAllowedVariants = (roles: AuthRole[]): AppVariant[] => {
  const allowed = new Set<AppVariant>()
  roles.forEach((role) => {
    const variant = getRoleVariant(role.name)
    if (variant) {
      allowed.add(variant)
    }
  })
  return Array.from(allowed)
}

export const getAllowedSections = (variant: AppVariant, permissions: AuthPermission[]): string[] => {
  const granted = new Set(permissions.map((permission) => permission.name.trim().toLowerCase()))
  return MODULE_PERMISSION_OPTIONS[variant]
    .filter((option) => granted.has(option.permissionName))
    .map((option) => option.key)
}
