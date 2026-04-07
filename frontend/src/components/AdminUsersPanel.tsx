import { useState, type FormEvent } from 'react'
import Panel from './Panel'
import GenericTable from './GenericTable'
import {
  useUsers,
  useRoles,
  usePermissions,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  type User,
  type Role,
  type Permission,
} from '../services/users'
import { getRoleVariant, MODULE_PERMISSION_OPTIONS, VIEW_OPTIONS, type AppVariant } from '../services/api'

// ── Types ──────────────────────────────────────────────────────────────────────

type FormState = {
  username: string
  email: string
  password: string
  active: boolean
  roleIds: number[]
  permissionIds: number[]
}

const emptyForm = (): FormState => ({
  username: '',
  email: '',
  password: '',
  active: true,
  roleIds: [],
  permissionIds: [],
})

// ── Modal ──────────────────────────────────────────────────────────────────────

type UserModalProps = {
  title: string
  form: FormState
  roles: Role[]
  permissions: Permission[]
  setForm: (f: FormState) => void
  error: string | null
  loading: boolean
  isEdit: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

const variantLabelMap: Record<AppVariant, string> = {
  admin: 'Administración',
  music: 'Músicos',
  volunteers: 'Voluntarios',
}

const roleLabel = (roleName: string) => {
  const variant = getRoleVariant(roleName)
  if (variant === 'admin') return 'Administración'
  if (variant === 'music') return 'Músicos'
  if (variant === 'volunteers') return 'Voluntarios'
  return roleName
}

const UserModal = ({ title, form, roles, permissions, setForm, error, loading, isEdit, onSubmit, onClose }: UserModalProps) => {
  const roleByVariant = VIEW_OPTIONS.reduce<Record<AppVariant, Role | null>>((acc, option) => {
    const matches = roles.filter((role) => getRoleVariant(role.name) === option.variant)
    const exact = matches.find((role) => role.name.trim().toLowerCase() === option.variant)
    acc[option.variant] = exact ?? matches[0] ?? null
    return acc
  }, { admin: null, music: null, volunteers: null })

  const permissionByName = new Map(permissions.map((permission) => [permission.name.toLowerCase(), permission]))

  return (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="action-button ghost" type="button" onClick={onClose}>✕</button>
      </div>
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          Usuario (o correo como username)
          <input
            className="input"
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="usuario o correo"
            required
          />
        </label>
        <label className="field">
          Correo electrónico
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="correo@ejemplo.com"
            required
          />
        </label>
        <label className="field">
          {isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={isEdit ? '••••••••' : 'Mínimo 6 caracteres'}
            required={!isEdit}
          />
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Cuenta activa
        </label>
        <div className="field">
          <span>Vistas con acceso</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {VIEW_OPTIONS.map((option) => {
              const role = roleByVariant[option.variant]
              if (!role) return null
              const checked = form.roleIds.includes(role.id)
              return (
                <label
                  key={option.variant}
                  className="module-chip"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    background: checked ? 'rgba(34,197,94,.14)' : undefined,
                    borderColor: checked ? '#86efac' : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const nextRoleIds = checked
                        ? form.roleIds.filter((roleId) => roleId !== role.id)
                        : [...form.roleIds, role.id]

                      const variantPermissions = MODULE_PERMISSION_OPTIONS[option.variant]
                        .map((item) => permissionByName.get(item.permissionName)?.id)
                        .filter((permissionId): permissionId is number => Boolean(permissionId))

                      const nextPermissionIds = checked
                        ? form.permissionIds.filter((permissionId) => !variantPermissions.includes(permissionId))
                        : [...new Set([...form.permissionIds, ...variantPermissions])]

                      setForm({ ...form, roleIds: nextRoleIds, permissionIds: nextPermissionIds })
                    }}
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        </div>
        {VIEW_OPTIONS.map((option) => {
          const role = roleByVariant[option.variant]
          const enabled = Boolean(role && form.roleIds.includes(role.id))
          return (
            <div
              className="field"
              key={`permissions-${option.variant}`}
              style={{ opacity: enabled ? 1 : 0.55 }}
            >
              <span>
                Módulos de {variantLabelMap[option.variant]}
                {!enabled ? ' (activa primero la vista)' : ''}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {MODULE_PERMISSION_OPTIONS[option.variant].map((optionPermission) => {
                  const permission = permissionByName.get(optionPermission.permissionName)
                  if (!permission) return null
                  const checked = form.permissionIds.includes(permission.id)
                  return (
                    <label
                      key={optionPermission.permissionName}
                      className="module-chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: enabled ? 'pointer' : 'not-allowed',
                        background: checked ? 'rgba(59,130,246,.14)' : undefined,
                        borderColor: checked ? '#93c5fd' : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!enabled}
                        onChange={() => {
                          const nextPermissionIds = checked
                            ? form.permissionIds.filter((permissionId) => permissionId !== permission.id)
                            : [...form.permissionIds, permission.id]
                          setForm({ ...form, permissionIds: nextPermissionIds })
                        }}
                      />
                      {optionPermission.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="field">
          <span>Vistas asignadas</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {form.roleIds.length === 0 ? (
              <span className="module-chip">Sin accesos</span>
            ) : (
              VIEW_OPTIONS.filter((option) => {
                const role = roleByVariant[option.variant]
                return role ? form.roleIds.includes(role.id) : false
              }).map((option) => (
                <span key={`selected-${option.variant}`} className="module-chip">{option.label}</span>
              ))
            )}
          </div>
        </div>
        {error && <div className="notice notice--error">{error}</div>}
        <div className="row-actions">
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </button>
          <button className="action-button ghost" type="button" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  </div>
)}

// ── Delete confirm ─────────────────────────────────────────────────────────────

type DeleteConfirmProps = {
  user: User
  loading: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

const DeleteConfirm = ({ user, loading, error, onConfirm, onCancel }: DeleteConfirmProps) => (
  <div className="modal-backdrop" onClick={onCancel}>
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>Eliminar usuario</h3>
        <button className="action-button ghost" type="button" onClick={onCancel}>✕</button>
      </div>
      <p style={{ margin: '12px 0' }}>
        ¿Confirmas que deseas eliminar a <strong>{user.username}</strong> ({user.email})?
        Esta acción no se puede deshacer.
      </p>
      {error && <div className="notice notice--error">{error}</div>}
      <div className="row-actions">
        <button className="action-button danger" type="button" onClick={onConfirm} disabled={loading}>
          {loading ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
        <button className="action-button ghost" type="button" onClick={onCancel} disabled={loading}>
          Cancelar
        </button>
      </div>
    </div>
  </div>
)

// ── Panel principal ────────────────────────────────────────────────────────────

const AdminUsersPanel: React.FC = () => {
  const { data: users = [], isLoading, error: fetchError } = useUsers()
  const { data: allRoles = [], error: rolesError } = useRoles()
  const { data: permissions = [], error: permissionsError } = usePermissions()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [mutationError, setMutationError] = useState<string | null>(null)

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  })

  const roles = allRoles.filter((role) => getRoleVariant(role.name) !== null)

  const openCreate = () => {
    setForm(emptyForm())
    setMutationError(null)
    setShowCreate(true)
  }

  const openEdit = (user: User) => {
    setForm({
      username: user.username,
      email: user.email,
      password: '',
      active: user.active,
      roleIds: user.roles.map((role) => role.id),
      permissionIds: user.permissions.map((permission) => permission.id),
    })
    setMutationError(null)
    setEditTarget(user)
  }

  const openDelete = (user: User) => {
    setMutationError(null)
    setDeleteTarget(user)
  }

  const closeAll = () => {
    setShowCreate(false)
    setEditTarget(null)
    setDeleteTarget(null)
    setMutationError(null)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setMutationError(null)
    try {
      await createUser.mutateAsync({
        username: form.username,
        email: form.email,
        password: form.password,
        active: form.active,
        person_id: null,
        role_ids: form.roleIds,
        permission_ids: form.permissionIds,
      })
      closeAll()
    } catch (err: any) {
      setMutationError(parseError(err))
    }
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setMutationError(null)
    try {
      await updateUser.mutateAsync({
        id: editTarget.id,
        payload: {
          username: form.username,
          email: form.email,
          password: form.password || undefined,
          active: form.active,
          person_id: editTarget.person_id ?? null,
          role_ids: form.roleIds,
          permission_ids: form.permissionIds,
        },
      })
      closeAll()
    } catch (err: any) {
      setMutationError(parseError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setMutationError(null)
    try {
      await deleteUser.mutateAsync(deleteTarget.id)
      closeAll()
    } catch (err: any) {
      setMutationError(parseError(err))
    }
  }

  const isMutating =
    createUser.isPending || updateUser.isPending || deleteUser.isPending

  return (
    <>
      <Panel
        title="Usuarios"
        subtitle="Gestiona las cuentas de acceso a la plataforma."
        className="module-panel--full"
        actions={
          <button className="primary" type="button" onClick={openCreate}>
            + Crear usuario
          </button>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <input
            className="input"
            type="search"
            placeholder="Buscar por usuario o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 340 }}
          />
        </div>

        {fetchError && (
          <div className="notice notice--error">Error al cargar usuarios</div>
        )}

        {rolesError && (
          <div className="notice notice--error">Error al cargar roles</div>
        )}

        {permissionsError && (
          <div className="notice notice--error">Error al cargar permisos</div>
        )}

        <GenericTable<User>
          className="admin-users-table"
          loading={isLoading}
          emptyMessage="No hay usuarios registrados."
          rows={filtered}
          columns={[
            { key: 'username', label: 'Usuario' },
            { key: 'email', label: 'Correo' },
            {
              key: 'roles',
              label: 'Accesos',
              render: (value) => {
                const userRoles = Array.isArray(value) ? value as Role[] : []
                if (userRoles.length === 0) return 'Sin accesos'
                const seen = new Set<string>()
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {userRoles
                      .filter((role) => {
                        const variant = getRoleVariant(role.name)
                        if (!variant || seen.has(variant)) return false
                        seen.add(variant)
                        return true
                      })
                      .map((role) => (
                        <span key={role.id} className="module-chip">
                          {roleLabel(role.name)}
                        </span>
                      ))}
                  </div>
                )
              },
            },
            {
              key: 'active',
              label: 'Activo',
              render: (val) => (
                <span
                  className={`module-chip`}
                  style={{
                    background: val ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.12)',
                    color: val ? '#16a34a' : '#dc2626',
                    borderColor: val ? '#bbf7d0' : '#fca5a5',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                  }}
                >
                  {val ? 'Activo' : 'Inactivo'}
                </span>
              ),
            },
            {
              key: 'id',
              label: 'Acciones',
              render: (_, row) => (
                <div className="row-actions" style={{ gap: 6 }}>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => openEdit(row)}
                    disabled={isMutating}
                    style={{ fontSize: '0.82rem', padding: '4px 10px' }}
                  >
                    Editar
                  </button>
                  <button
                    className="action-button danger"
                    type="button"
                    onClick={() => openDelete(row)}
                    disabled={isMutating}
                    style={{ fontSize: '0.82rem', padding: '4px 10px' }}
                  >
                    Eliminar
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Panel>

      {showCreate && (
        <UserModal
          title="Crear usuario"
          form={form}
          roles={roles}
          permissions={permissions}
          setForm={setForm}
          error={mutationError}
          loading={createUser.isPending}
          isEdit={false}
          onSubmit={handleCreate}
          onClose={closeAll}
        />
      )}

      {editTarget && (
        <UserModal
          title={`Editar: ${editTarget.username}`}
          form={form}
          roles={roles}
          permissions={permissions}
          setForm={setForm}
          error={mutationError}
          loading={updateUser.isPending}
          isEdit={true}
          onSubmit={handleEdit}
          onClose={closeAll}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          user={deleteTarget}
          loading={deleteUser.isPending}
          error={mutationError}
          onConfirm={handleDelete}
          onCancel={closeAll}
        />
      )}
    </>
  )
}

export default AdminUsersPanel

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message)
      if (parsed?.detail) return parsed.detail
    } catch {}
    return err.message
  }
  return 'Error desconocido'
}

