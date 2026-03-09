import { useMemo } from 'react'
import type { FormEvent } from 'react'
import type { Consejeria, Person } from '../types'
import GenericTable from './GenericTable'
import Panel from './Panel'

type ConsejeriaForm = {
  id: string
  solicitante_person_id: string
  consejero_person_id: string
  fecha: string
  motivo: string
  observaciones: string
  estado: string
}

type ConsejeriaPanelProps = {
  consejerias: Consejeria[]
  consejeriasLoading: boolean
  consejeriasError?: string | null
  people: Person[]
  serverPeople: Person[]
  peopleById: Map<number, Person>
  consejeriaForm: ConsejeriaForm
  setConsejeriaForm: (value: ConsejeriaForm) => void
  consejeriaSearch: string
  setConsejeriaSearch: (value: string) => void
  handleCreateConsejeria: (event: FormEvent<HTMLFormElement>) => void
  handleStartEditConsejeria: (id: number) => void
  handleCloseConsejeria: (id: number) => void
  handleCancelConsejeriaEdit: () => void
}

const ConsejeriaPanel = ({
  consejerias,
  consejeriasLoading,
  consejeriasError,
  people,
  serverPeople,
  peopleById,
  consejeriaForm,
  setConsejeriaForm,
  consejeriaSearch,
  setConsejeriaSearch,
  handleCreateConsejeria,
  handleStartEditConsejeria,
  handleCloseConsejeria,
  handleCancelConsejeriaEdit,
}: ConsejeriaPanelProps) => {
  const filteredRows = useMemo(() => {
    const rows = consejerias.map((item) => ({
      id: item.id,
      fecha: item.fecha,
      solicitante:
        peopleById.get(item.solicitante_person_id)?.name ?? `#${item.solicitante_person_id}`,
      consejero: peopleById.get(item.consejero_person_id)?.name ?? `#${item.consejero_person_id}`,
      motivo: item.motivo,
      estado: item.estado ?? '—',
      observaciones: item.observaciones ?? '—',
      actions: '',
    }))
    const query = consejeriaSearch.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(query))
    )
  }, [consejerias, peopleById, consejeriaSearch])

  return (
    <section className="section-grid">
      <Panel
        title="Registro de consejerías"
        subtitle="Registra casos y da seguimiento por solicitante y consejero."
      >
        <form className="form" onSubmit={handleCreateConsejeria}>
          <label className="field">
            Persona solicitante
            <select
              className="input"
              value={consejeriaForm.solicitante_person_id}
              onChange={(event) =>
                setConsejeriaForm({ ...consejeriaForm, solicitante_person_id: event.target.value })
              }
              required
            >
              <option value="">Selecciona una persona</option>
              {people.map((person) => (
                <option key={`consejeria-solicitante-${person.id}`} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Consejero
            <select
              className="input"
              value={consejeriaForm.consejero_person_id}
              onChange={(event) =>
                setConsejeriaForm({ ...consejeriaForm, consejero_person_id: event.target.value })
              }
              required
            >
              <option value="">Selecciona un consejero</option>
              {serverPeople.map((person) => (
                <option key={`consejeria-consejero-${person.id}`} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Fecha
            <input
              className="input"
              type="date"
              value={consejeriaForm.fecha}
              onChange={(event) => setConsejeriaForm({ ...consejeriaForm, fecha: event.target.value })}
              required
            />
          </label>

          <label className="field">
            Motivo
            <input
              className="input"
              value={consejeriaForm.motivo}
              onChange={(event) => setConsejeriaForm({ ...consejeriaForm, motivo: event.target.value })}
              required
            />
          </label>

          <label className="field">
            Observaciones
            <input
              className="input"
              value={consejeriaForm.observaciones}
              onChange={(event) =>
                setConsejeriaForm({ ...consejeriaForm, observaciones: event.target.value })
              }
            />
          </label>

          <label className="field">
            Estado
            <select
              className="input"
              value={consejeriaForm.estado}
              onChange={(event) => setConsejeriaForm({ ...consejeriaForm, estado: event.target.value })}
            >
              <option value="abierta">Abierta</option>
              <option value="en_proceso">En proceso</option>
              <option value="cerrada">Cerrada</option>
            </select>
          </label>

          <div className="row-actions">
            <button className="primary" type="submit">
              {consejeriaForm.id ? 'Actualizar consejería' : 'Guardar consejería'}
            </button>
            {consejeriaForm.id && (
              <button className="action-button ghost" type="button" onClick={handleCancelConsejeriaEdit}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Seguimiento de consejerías" subtitle="Busca y filtra por persona, motivo o estado.">
        <label className="field">
          Buscar consejería
          <input
            className="input"
            value={consejeriaSearch}
            onChange={(event) => setConsejeriaSearch(event.target.value)}
            placeholder="Solicitante, consejero, motivo o estado"
          />
        </label>

        <GenericTable
          columns={[
            { key: 'fecha', label: 'Fecha' },
            { key: 'solicitante', label: 'Solicitante' },
            { key: 'consejero', label: 'Consejero' },
            { key: 'motivo', label: 'Motivo' },
            { key: 'estado', label: 'Estado' },
            { key: 'observaciones', label: 'Observaciones' },
            {
              key: 'actions',
              label: 'Acciones',
              render: (_, row) => (
                <div className="row-actions">
                  <button
                    className="action-button ghost"
                    type="button"
                    onClick={() => handleStartEditConsejeria(Number(row.id))}
                  >
                    Editar
                  </button>
                  <button
                    className="action-button"
                    type="button"
                    onClick={() => handleCloseConsejeria(Number(row.id))}
                    disabled={String(row.estado).toLowerCase() === 'cerrada'}
                  >
                    {String(row.estado).toLowerCase() === 'cerrada' ? 'Cerrada' : 'Cerrar'}
                  </button>
                </div>
              ),
            },
          ]}
          rows={filteredRows}
          loading={consejeriasLoading}
          emptyMessage={consejeriasError ?? 'No hay consejerías registradas.'}
        />
      </Panel>
    </section>
  )
}

export default ConsejeriaPanel
