import { useState, type FormEvent } from 'react'
import Panel from './Panel'
import GenericTable from './GenericTable'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  type User,
} from '../services/users'

// ── Types ──────────────────────────────────────────────────────────────────────

type FormState = {
  username: string
  email: string
  password: string
  active: boolean
}

const emptyForm = (): FormState => ({
  username: '',
  email: '',
  password: '',
  active: true,
})

// ── Modal ──────────────────────────────────────────────────────────────────────

type UserModalProps = {
  title: string
  form: FormState
  setForm: (f: FormState) => void
  error: string | null
  loading: boolean
  isEdit: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

const UserModal = ({ title, form, setForm, error, loading, isEdit, onSubmit, onClose }: UserModalProps) => (
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
)

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

  const openCreate = () => {
    setForm(emptyForm())
    setMutationError(null)
    setShowCreate(true)
  }

  const openEdit = (user: User) => {
    setForm({ username: user.username, email: user.email, password: '', active: user.active })
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

        <GenericTable<User>
          loading={isLoading}
          emptyMessage="No hay usuarios registrados."
          rows={filtered}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'username', label: 'Usuario' },
            { key: 'email', label: 'Correo' },
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

