import { useState, type FormEvent } from 'react'
import Panel from './Panel'
import GenericTable from './GenericTable'
import {
  useVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  type Vendor,
  type VendorPayload,
} from '../services/vendors'

// ── Category options ───────────────────────────────────────────────────────────

const CATEGORIES = [
  'Audio y video',
  'Catering / Alimentos',
  'Decoración',
  'Flores y plantas',
  'Imprenta / Gráfica',
  'Limpieza',
  'Logística / Transporte',
  'Medios digitales',
  'Mobiliario / Alquiler',
  'Música / Entretenimiento',
  'Seguridad',
  'Tecnología',
  'Otros',
]

// ── Types ──────────────────────────────────────────────────────────────────────

type FormState = {
  name: string
  contact_name: string
  phone: string
  email: string
  category: string
  description: string
}

const emptyForm = (): FormState => ({
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  category: '',
  description: '',
})

const vendorToForm = (v: Vendor): FormState => ({
  name: v.name,
  contact_name: v.contact_name ?? '',
  phone: v.phone ?? '',
  email: v.email ?? '',
  category: v.category ?? '',
  description: v.description ?? '',
})

const formToPayload = (f: FormState): VendorPayload => ({
  name: f.name,
  contact_name: f.contact_name || null,
  phone: f.phone || null,
  email: f.email || null,
  category: f.category || null,
  description: f.description || null,
})

// ── Modal ──────────────────────────────────────────────────────────────────────

type VendorModalProps = {
  title: string
  form: FormState
  setForm: (f: FormState) => void
  error: string | null
  loading: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

const VendorModal = ({ title, form, setForm, error, loading, onSubmit, onClose }: VendorModalProps) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="action-button ghost" type="button" onClick={onClose}>✕</button>
      </div>
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          Nombre del proveedor *
          <input
            className="input"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Empresa o persona"
            required
          />
        </label>

        <label className="field">
          Empleado / Contacto
          <input
            className="input"
            type="text"
            value={form.contact_name}
            onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            placeholder="Nombre del contacto"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">
            Teléfono
            <input
              className="input"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 000 0000"
            />
          </label>

          <label className="field">
            Correo electrónico
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="contacto@empresa.com"
            />
          </label>
        </div>

        <label className="field">
          Categoría
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">— Sin categoría —</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Descripción del servicio
          <textarea
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="¿Qué servicio ofrece este proveedor?"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </label>

        {error && <div className="notice notice--error">{error}</div>}

        <div className="row-actions">
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar'}
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
  vendor: Vendor
  loading: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

const DeleteConfirm = ({ vendor, loading, error, onConfirm, onCancel }: DeleteConfirmProps) => (
  <div className="modal-backdrop" onClick={onCancel}>
    <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>Eliminar proveedor</h3>
        <button className="action-button ghost" type="button" onClick={onCancel}>✕</button>
      </div>
      <p style={{ margin: '12px 0' }}>
        ¿Confirmas que deseas eliminar a <strong>{vendor.name}</strong>?
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

const VendorsPanel: React.FC = () => {
  const { data: vendors = [], isLoading, error: fetchError } = useVendors()
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const deleteVendor = useDeleteVendor()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Vendor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [mutationError, setMutationError] = useState<string | null>(null)

  const filtered = vendors.filter((v) => {
    const q = search.toLowerCase()
    const matchesSearch =
      v.name.toLowerCase().includes(q) ||
      (v.contact_name ?? '').toLowerCase().includes(q) ||
      (v.category ?? '').toLowerCase().includes(q)
    const matchesCategory = !categoryFilter || v.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const openCreate = () => {
    setForm(emptyForm())
    setMutationError(null)
    setShowCreate(true)
  }

  const openEdit = (vendor: Vendor) => {
    setForm(vendorToForm(vendor))
    setMutationError(null)
    setEditTarget(vendor)
  }

  const openDelete = (vendor: Vendor) => {
    setMutationError(null)
    setDeleteTarget(vendor)
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
      await createVendor.mutateAsync(formToPayload(form))
      closeAll()
    } catch (err: unknown) {
      setMutationError(parseError(err))
    }
  }

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setMutationError(null)
    try {
      await updateVendor.mutateAsync({ id: editTarget.id, payload: formToPayload(form) })
      closeAll()
    } catch (err: unknown) {
      setMutationError(parseError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setMutationError(null)
    try {
      await deleteVendor.mutateAsync(deleteTarget.id)
      closeAll()
    } catch (err: unknown) {
      setMutationError(parseError(err))
    }
  }

  const isMutating = createVendor.isPending || updateVendor.isPending || deleteVendor.isPending

  const usedCategories = Array.from(new Set(vendors.map((v) => v.category).filter(Boolean))) as string[]

  return (
    <>
      <Panel
        title="Proveedores"
        subtitle="Gestiona los proveedores de servicios para actividades y eventos de la iglesia."
        className="module-panel--full"
        actions={
          <button className="primary" type="button" onClick={openCreate}>
            + Agregar proveedor
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            className="input"
            type="search"
            placeholder="Buscar por nombre, contacto o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', maxWidth: 360 }}
          />
          {usedCategories.length > 0 && (
            <select
              className="input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ flex: '0 1 200px' }}
            >
              <option value="">Todas las categorías</option>
              {usedCategories.sort().map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {fetchError && (
          <div className="notice notice--error">Error al cargar proveedores</div>
        )}

        <GenericTable<Vendor>
          loading={isLoading}
          emptyMessage="No hay proveedores registrados."
          rows={filtered}
          columns={[
            { key: 'name', label: 'Proveedor' },
            { key: 'contact_name', label: 'Contacto', render: (val) => val ?? '—' },
            { key: 'phone', label: 'Teléfono', render: (val) => val ?? '—' },
            { key: 'email', label: 'Correo', render: (val) => val ?? '—' },
            {
              key: 'category',
              label: 'Categoría',
              render: (val) =>
                val ? (
                  <span
                    className="module-chip"
                    style={{
                      background: 'rgba(99,102,241,.12)',
                      color: '#4f46e5',
                      borderColor: '#c7d2fe',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    {val}
                  </span>
                ) : (
                  '—'
                ),
            },
            { key: 'description', label: 'Descripción del servicio', render: (val) => val ?? '—' },
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
        <VendorModal
          title="Agregar proveedor"
          form={form}
          setForm={setForm}
          error={mutationError}
          loading={createVendor.isPending}
          onSubmit={handleCreate}
          onClose={closeAll}
        />
      )}

      {editTarget && (
        <VendorModal
          title={`Editar: ${editTarget.name}`}
          form={form}
          setForm={setForm}
          error={mutationError}
          loading={updateVendor.isPending}
          onSubmit={handleEdit}
          onClose={closeAll}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          vendor={deleteTarget}
          loading={deleteVendor.isPending}
          error={mutationError}
          onConfirm={handleDelete}
          onCancel={closeAll}
        />
      )}
    </>
  )
}

export default VendorsPanel

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message)
      if (parsed?.detail) return String(parsed.detail)
    } catch {}
    return err.message
  }
  return 'Error desconocido'
}
