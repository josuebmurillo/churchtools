import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { Event, Facility, Ministry, Person, Reservation } from '../types'
import type { CalendarItem } from '../utils/calendar'

type CalendarEventForm = {
  id: string
  name: string
  date: string
  ministry_id: string
  schedule: string
  timeline_blocks: string
}

type CalendarReservationForm = {
  id: string
  facility_id: string
  event_id: string
  inicio: string
  fin: string
  responsable_person_id: string
  estado: string
}

type CalendarPanelProps = {
  calendarMonthLabel: string
  calendarDays: Array<Date | null>
  calendarItemsByDate: Map<string, CalendarItem[]>
  onPrevMonth: () => void
  onNextMonth: () => void
  onDayClick: (dateKey: string) => void
  eventsById: Map<number, Event>
  reservations: Reservation[]
  peopleById: Map<number, Person>
  timelineByEventId: Map<number, string>
  calendarEventForm: CalendarEventForm
  setCalendarEventForm: (value: CalendarEventForm) => void
  calendarReservationForm: CalendarReservationForm
  setCalendarReservationForm: (value: CalendarReservationForm) => void
  reservationStartTime: string
  setReservationStartTime: (value: string) => void
  reservationEndTime: string
  setReservationEndTime: (value: string) => void
  responsableName: string
  setResponsableName: (value: string) => void
  ministries: Ministry[]
  facilities: Facility[]
  people: Person[]
  serverPeople: Person[]
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onClear: () => void
  onDelete: () => void
}

type TimelineBlock = {
  inicio: string
  fin: string
  tipo: string
  observacion: string
  encargado_person_id: string
}

const LOCKED_TIMELINE_TYPE = 'Alabanza y Adoración'
const DEFAULT_TIMELINE_TYPES = [
  'Bienvenida',
  LOCKED_TIMELINE_TYPE,
  'Ofrendas',
  'Predica',
]

const TIMELINE_TYPES_STORAGE_KEY = 'calendar_timeline_types'

const normalizeTimelineType = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const ensureLockedTimelineType = (items: string[]) => {
  const sanitized = items
    .map((item) => item.trim())
    .filter(Boolean)
  const unique = Array.from(new Set(sanitized))
  if (!unique.some((item) => normalizeTimelineType(item) === normalizeTimelineType(LOCKED_TIMELINE_TYPE))) {
    unique.unshift(LOCKED_TIMELINE_TYPE)
  }
  return unique.length ? unique : [LOCKED_TIMELINE_TYPE]
}

const parseTimelineBlocks = (value: string): TimelineBlock[] => {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [timePart, rawType, rawObservation = '', rawEncargadoId = ''] = line
        .split('|')
        .map((item) => item.trim())
      const [inicio, fin] = (timePart ?? '').split('-').map((item) => item.trim())
      return {
        inicio: inicio ?? '',
        fin: fin ?? '',
        tipo: rawType?.trim() ?? '',
        observacion: rawObservation?.trim() ?? '',
        encargado_person_id: rawEncargadoId,
      }
    })
}

const serializeTimelineBlocks = (blocks: TimelineBlock[]): string => {
  return blocks
    .filter((block) => block.inicio || block.fin || block.tipo || block.observacion || block.encargado_person_id)
    .map((block) => `${block.inicio || '--:--'}-${block.fin || '--:--'} | ${block.tipo || 'general'} | ${block.observacion || ''} | ${block.encargado_person_id || ''}`)
    .join('\n')
}

const addMinutesToTime = (time: string, minutesToAdd: number): string => {
  if (!time || !time.includes(':')) return '09:10'
  const [hoursRaw, minutesRaw] = time.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return '09:10'
  const total = hours * 60 + minutes + minutesToAdd
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  const nextHours = String(Math.floor(normalized / 60)).padStart(2, '0')
  const nextMinutes = String(normalized % 60).padStart(2, '0')
  return `${nextHours}:${nextMinutes}`
}

const CalendarPanel = ({
  calendarMonthLabel,
  calendarDays,
  calendarItemsByDate,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  eventsById,
  reservations,
  peopleById,
  timelineByEventId,
  calendarEventForm,
  setCalendarEventForm,
  calendarReservationForm,
  setCalendarReservationForm,
  reservationStartTime,
  setReservationStartTime,
  reservationEndTime,
  setReservationEndTime,
  responsableName,
  setResponsableName,
  ministries,
  facilities,
  people,
  serverPeople,
  onSubmit,
  onClear,
  onDelete,
}: CalendarPanelProps) => {
  const [timelineTypes, setTimelineTypes] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(TIMELINE_TYPES_STORAGE_KEY)
      if (!raw) return ensureLockedTimelineType(DEFAULT_TIMELINE_TYPES)
      const parsed = JSON.parse(raw) as string[]
      if (!Array.isArray(parsed) || !parsed.length) return ensureLockedTimelineType(DEFAULT_TIMELINE_TYPES)
      return ensureLockedTimelineType(parsed)
    } catch {
      return ensureLockedTimelineType(DEFAULT_TIMELINE_TYPES)
    }
  })
  const [timelineTypeForm, setTimelineTypeForm] = useState('')
  const [editingTimelineTypeIndex, setEditingTimelineTypeIndex] = useState<number | null>(null)
  const [calendarTooltip, setCalendarTooltip] = useState<{
    content: string
    x: number
    y: number
  } | null>(null)
  const [draggingTimelineIndex, setDraggingTimelineIndex] = useState<number | null>(null)
  const [dragOverTimelineIndex, setDragOverTimelineIndex] = useState<number | null>(null)
  const [encargadoSearchByIndex, setEncargadoSearchByIndex] = useState<Record<number, string>>({})
  const [activeEncargadoIndex, setActiveEncargadoIndex] = useState<number | null>(null)
  const encargadoBlurTimeoutRef = useRef<number | null>(null)

  const normalizeType = (value: string) =>
    normalizeTimelineType(value)

  useEffect(() => {
    localStorage.setItem(TIMELINE_TYPES_STORAGE_KEY, JSON.stringify(ensureLockedTimelineType(timelineTypes)))
  }, [timelineTypes])

  const timelineBlocks = parseTimelineBlocks(calendarEventForm.timeline_blocks)
  const visibleTimelineBlocks = timelineBlocks.length
    ? timelineBlocks
    : [{ inicio: '', fin: '', tipo: '', observacion: '', encargado_person_id: '' }]

  const timelineTypeRows = useMemo(
    () => timelineTypes.map((type, index) => ({ index, type, actions: '' })),
    [timelineTypes]
  )

  const serverPeopleById = useMemo(() => {
    const map = new Map<number, Person>()
    serverPeople.forEach((person) => map.set(person.id, person))
    return map
  }, [serverPeople])

  const isLockedType = (value: string) => normalizeType(value) === normalizeType(LOCKED_TIMELINE_TYPE)

  const handleTimelineChange = (
    blockIndex: number,
    field: keyof TimelineBlock,
    value: string
  ) => {
    const blocks = timelineBlocks.length ? [...timelineBlocks] : [{ inicio: '', fin: '', tipo: '', observacion: '', encargado_person_id: '' }]
    while (blocks.length <= blockIndex) {
      blocks.push({ inicio: '', fin: '', tipo: '', observacion: '', encargado_person_id: '' })
    }
    blocks[blockIndex] = { ...blocks[blockIndex], [field]: value }
    setCalendarEventForm({
      ...calendarEventForm,
      timeline_blocks: serializeTimelineBlocks(blocks),
    })
  }

  const handleAddTimelineBlock = () => {
    const lastBlock = timelineBlocks[timelineBlocks.length - 1]
    const startTime = lastBlock?.fin || '09:00'
    const nextBlock = {
      inicio: startTime,
      fin: addMinutesToTime(startTime, 10),
      tipo: '',
      observacion: '',
      encargado_person_id: '',
    }
    const blocks = [...timelineBlocks, nextBlock]
    setCalendarEventForm({
      ...calendarEventForm,
      timeline_blocks: serializeTimelineBlocks(blocks),
    })
  }

  const handleRemoveTimelineBlock = (blockIndex: number) => {
    const blocks = [...timelineBlocks]
    blocks.splice(blockIndex, 1)
    setCalendarEventForm({
      ...calendarEventForm,
      timeline_blocks: serializeTimelineBlocks(blocks),
    })
  }

  const reorderTimelineBlocks = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return
    const nextBlocks = [...visibleTimelineBlocks]
    const [moved] = nextBlocks.splice(sourceIndex, 1)
    nextBlocks.splice(targetIndex, 0, moved)
    setCalendarEventForm({
      ...calendarEventForm,
      timeline_blocks: serializeTimelineBlocks(nextBlocks),
    })
  }

  const handleTimelineDragStart = (event: DragEvent<HTMLElement>, index: number) => {
    setDraggingTimelineIndex(index)
    setDragOverTimelineIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const handleTimelineDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverTimelineIndex !== index) {
      setDragOverTimelineIndex(index)
    }
  }

  const handleTimelineDrop = (event: DragEvent<HTMLDivElement>, targetIndex: number) => {
    event.preventDefault()
    const sourceRaw = event.dataTransfer.getData('text/plain')
    const sourceIndex = Number(sourceRaw)
    const fromIndex = Number.isFinite(sourceIndex) ? sourceIndex : draggingTimelineIndex
    setDraggingTimelineIndex(null)
    setDragOverTimelineIndex(null)
    if (fromIndex === null || fromIndex < 0 || fromIndex >= visibleTimelineBlocks.length) return
    reorderTimelineBlocks(fromIndex, targetIndex)
  }

  const handleTimelineDragEnd = () => {
    setDraggingTimelineIndex(null)
    setDragOverTimelineIndex(null)
  }

  const clearEncargadoBlurTimeout = () => {
    if (encargadoBlurTimeoutRef.current === null) return
    window.clearTimeout(encargadoBlurTimeoutRef.current)
    encargadoBlurTimeoutRef.current = null
  }

  const getTimelineEncargadoSearchValue = (index: number, block: TimelineBlock) => {
    const typed = encargadoSearchByIndex[index]
    if (typed !== undefined) return typed
    if (!block.encargado_person_id) return ''
    return serverPeopleById.get(Number(block.encargado_person_id))?.name ?? ''
  }

  const getTimelineEncargadoMatches = (index: number, block: TimelineBlock) => {
    const query = getTimelineEncargadoSearchValue(index, block).trim().toLowerCase()
    if (query.length < 2) return []
    return serverPeople
      .filter((person) => person.name.toLowerCase().includes(query))
      .slice(0, 8)
  }

  const handleTimelineEncargadoInputFocus = (index: number, block: TimelineBlock) => {
    clearEncargadoBlurTimeout()
    setActiveEncargadoIndex(index)
    setEncargadoSearchByIndex((previous) => {
      if (previous[index] !== undefined) return previous
      const currentName = block.encargado_person_id
        ? serverPeopleById.get(Number(block.encargado_person_id))?.name ?? ''
        : ''
      return { ...previous, [index]: currentName }
    })
  }

  const handleTimelineEncargadoInputBlur = () => {
    clearEncargadoBlurTimeout()
    encargadoBlurTimeoutRef.current = window.setTimeout(() => {
      setActiveEncargadoIndex(null)
      encargadoBlurTimeoutRef.current = null
    }, 120)
  }

  const handleTimelineEncargadoSearchChange = (index: number, value: string) => {
    setEncargadoSearchByIndex((previous) => ({ ...previous, [index]: value }))
    handleTimelineChange(index, 'encargado_person_id', '')
    setActiveEncargadoIndex(index)
  }

  const handleTimelineEncargadoSelect = (index: number, person: Person) => {
    clearEncargadoBlurTimeout()
    setEncargadoSearchByIndex((previous) => ({ ...previous, [index]: person.name }))
    handleTimelineChange(index, 'encargado_person_id', String(person.id))
    setActiveEncargadoIndex(null)
  }

  useEffect(() => {
    return () => {
      clearEncargadoBlurTimeout()
    }
  }, [])

  const handleSaveTimelineType = () => {
    const normalized = normalizeType(timelineTypeForm)
    if (!normalized) return
    const exists = timelineTypes.some(
      (item, index) => normalizeType(item) === normalized && index !== editingTimelineTypeIndex
    )
    if (exists) return

    if (editingTimelineTypeIndex !== null) {
      const previousValue = timelineTypes[editingTimelineTypeIndex]
      const next = [...timelineTypes]
      next[editingTimelineTypeIndex] = normalized
      setTimelineTypes(ensureLockedTimelineType(next))

      const updatedBlocks = timelineBlocks.map((block) =>
        normalizeType(block.tipo) === normalizeType(previousValue)
          ? { ...block, tipo: normalized }
          : block
      )
      setCalendarEventForm({
        ...calendarEventForm,
        timeline_blocks: serializeTimelineBlocks(updatedBlocks),
      })
    } else {
      setTimelineTypes((prev) => ensureLockedTimelineType([...prev, normalized]))
    }

    setTimelineTypeForm('')
    setEditingTimelineTypeIndex(null)
  }

  const handleStartEditTimelineType = (index: number) => {
    if (isLockedType(timelineTypes[index])) return
    setEditingTimelineTypeIndex(index)
    setTimelineTypeForm(timelineTypes[index])
  }

  const handleDeleteTimelineType = (index: number) => {
    const removed = timelineTypes[index]
    if (isLockedType(removed)) return
    const next = [...timelineTypes]
    next.splice(index, 1)
    setTimelineTypes(ensureLockedTimelineType(next))

    const updatedBlocks = timelineBlocks.map((block) =>
      normalizeType(block.tipo) === normalizeType(removed)
        ? { ...block, tipo: 'general' }
        : block
    )
    setCalendarEventForm({
      ...calendarEventForm,
      timeline_blocks: serializeTimelineBlocks(updatedBlocks),
    })

    if (editingTimelineTypeIndex === index) {
      setTimelineTypeForm('')
      setEditingTimelineTypeIndex(null)
    }
  }

  const getTypeOptionsForBlock = (value: string) => {
    const normalizedValue = normalizeType(value)
    if (!normalizedValue) return timelineTypes
    if (timelineTypes.some((item) => normalizeType(item) === normalizedValue)) {
      return timelineTypes
    }
    return [...timelineTypes, value]
  }

  const buildCalendarItemTooltip = (item: CalendarItem) => {
    const baseLines = [item.title, ...item.lines]
    if (!item.eventId) {
      return baseLines.join('\n')
    }

    const timelineRaw = timelineByEventId.get(item.eventId) ?? ''
    const timelineLines = timelineRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (timelineLines.length === 0) {
      return baseLines.join('\n')
    }

    const formattedTimeline = timelineLines.map((line) => {
      const [timePart, rawType, rawObservation = '', rawEncargadoId = ''] = line
        .split('|')
        .map((item) => item.trim())
      const type = rawType?.trim() ?? 'general'
      const observation = rawObservation?.trim() ?? ''
      const encargadoName = rawEncargadoId ? (peopleById.get(Number(rawEncargadoId))?.name ?? '') : ''
      const base = observation
        ? `${timePart?.trim() ?? '--:--'} · ${type} | "${observation}"`
        : `${timePart?.trim() ?? '--:--'} · ${type}`
      return encargadoName ? `${base} · Encargado: ${encargadoName}` : base
    })

    return [...baseLines, 'Cronograma:', ...formattedTimeline].join('\n')
  }

  const clampTooltipLeft = (value: number) => {
    const maxLeft = window.innerWidth - 340
    return Math.max(12, Math.min(value, maxLeft))
  }

  const showCalendarTooltipAt = (content: string, x: number, y: number) => {
    setCalendarTooltip({
      content,
      x: clampTooltipLeft(x),
      y: Math.max(12, y),
    })
  }

  const handleCalendarTooltipMouseEnter = (
    event: React.MouseEvent<HTMLButtonElement>,
    item: CalendarItem
  ) => {
    const content = buildCalendarItemTooltip(item)
    showCalendarTooltipAt(content, event.clientX + 14, event.clientY + 14)
  }

  const handleCalendarTooltipMouseMove = (event: React.MouseEvent<HTMLButtonElement>) => {
    setCalendarTooltip((previous) =>
      previous
        ? {
            ...previous,
            x: clampTooltipLeft(event.clientX + 14),
            y: Math.max(12, event.clientY + 14),
          }
        : previous
    )
  }

  const handleCalendarTooltipFocus = (
    event: React.FocusEvent<HTMLButtonElement>,
    item: CalendarItem
  ) => {
    const content = buildCalendarItemTooltip(item)
    const rect = event.currentTarget.getBoundingClientRect()
    showCalendarTooltipAt(content, rect.right + 10, rect.top + 10)
  }

  const hideCalendarTooltip = () => {
    setCalendarTooltip(null)
  }

  return (
  <section className="calendar-page">
    <div className="calendar-main calendar-main--full">
      <div className="calendar-header calendar-header--toolbar">
        <div>
          <h3>Calendario de eventos</h3>
          <p>Vista mensual estilo Google Calendar.</p>
        </div>
        <div className="calendar-toolbar">
          <button className="action-button" type="button" onClick={onPrevMonth}>
            ◀
          </button>
          <span className="calendar-month-label">{calendarMonthLabel}</span>
          <button className="action-button" type="button" onClick={onNextMonth}>
            ▶
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => (
          <div key={`calendar-header-${day}`} className="calendar-grid__header">
            {day}
          </div>
        ))}
        {calendarDays.map((day, index) => {
          if (!day) {
            return (
              <div key={`calendar-empty-${index}`} className="calendar-day calendar-day--empty" />
            )
          }
          const dateKey = day.toISOString().split('T')[0]
          const items = calendarItemsByDate.get(dateKey) ?? []
          return (
            <div
              key={`calendar-day-${dateKey}`}
              className="calendar-day"
              onClick={() => onDayClick(dateKey)}
              role="button"
              tabIndex={0}
            >
              <div className="calendar-day__header">{day.getDate()}</div>
              <div className="calendar-day__events">
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`calendar-event calendar-event--${item.type}`}
                    type="button"
                    onMouseEnter={(event) => handleCalendarTooltipMouseEnter(event, item)}
                    onMouseMove={handleCalendarTooltipMouseMove}
                    onMouseLeave={hideCalendarTooltip}
                    onFocus={(event) => handleCalendarTooltipFocus(event, item)}
                    onBlur={hideCalendarTooltip}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (item.eventId) {
                        const selectedEvent = eventsById.get(item.eventId)
                        if (selectedEvent) {
                          setCalendarEventForm({
                            id: String(selectedEvent.id),
                            name: selectedEvent.name,
                            date: selectedEvent.date ?? '',
                            ministry_id: selectedEvent.ministry_id
                              ? String(selectedEvent.ministry_id)
                              : '',
                            schedule: selectedEvent.schedule ?? '',
                            timeline_blocks: timelineByEventId.get(selectedEvent.id) ?? '',
                          })
                        }
                      }
                      if (item.reservationId) {
                        const selectedReservation = reservations.find(
                          (reservation) => reservation.id === item.reservationId
                        )
                        if (selectedReservation) {
                          setCalendarReservationForm({
                            id: String(selectedReservation.id),
                            facility_id: String(selectedReservation.facility_id),
                            event_id: selectedReservation.event_id
                              ? String(selectedReservation.event_id)
                              : '',
                            inicio: selectedReservation.inicio ?? '',
                            fin: selectedReservation.fin ?? '',
                            responsable_person_id: selectedReservation.responsable_person_id
                              ? String(selectedReservation.responsable_person_id)
                              : '',
                            estado: selectedReservation.estado ?? '',
                          })
                          setReservationStartTime(
                            selectedReservation.inicio
                              ? selectedReservation.inicio.split('T')[1]?.slice(0, 5) ?? ''
                              : ''
                          )
                          setReservationEndTime(
                            selectedReservation.fin
                              ? selectedReservation.fin.split('T')[1]?.slice(0, 5) ?? ''
                              : ''
                          )
                          setResponsableName(
                            selectedReservation.responsable_person_id
                              ? peopleById.get(selectedReservation.responsable_person_id)?.name ?? ''
                              : ''
                          )
                        }
                      }
                    }}
                  >
                    <span>{item.title}</span>
                    {item.lines.map((line) => (
                      <small key={`${item.id}-${line}`}>{line}</small>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {calendarTooltip ? (
        <div
          className="calendar-event-tooltip"
          role="tooltip"
          style={{ left: `${calendarTooltip.x}px`, top: `${calendarTooltip.y}px` }}
        >
          {calendarTooltip.content}
        </div>
      ) : null}
    </div>

    <div className="calendar-layout calendar-layout--management">
      <div className="module-panel calendar-combined-card">
        <div className="module-summary">
          <div>
            <h3>Evento y reserva de espacio</h3>
            <p>Gestiona el evento y la reserva en un solo formulario.</p>
          </div>
        </div>

        <form className="form calendar-combined-form" onSubmit={onSubmit}>
          <div className="module-subsection">
            <h4>Evento</h4>
            <label className="field">
              Nombre
              <input
                className="input"
                value={calendarEventForm.name}
                onChange={(event) =>
                  setCalendarEventForm({ ...calendarEventForm, name: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              Fecha
              <input
                className="input"
                type="date"
                value={calendarEventForm.date}
                onChange={(event) =>
                  setCalendarEventForm({ ...calendarEventForm, date: event.target.value })
                }
              />
            </label>
            <label className="field">
              Ministerio
              <select
                className="input"
                value={calendarEventForm.ministry_id}
                onChange={(event) =>
                  setCalendarEventForm({
                    ...calendarEventForm,
                    ministry_id: event.target.value,
                  })
                }
              >
                <option value="">Sin ministerio asignado</option>
                {ministries.map((ministry) => (
                  <option key={`calendar-ministry-${ministry.id}`} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Nota breve
              <input
                className="input"
                value={calendarEventForm.schedule}
                onChange={(event) =>
                  setCalendarEventForm({
                    ...calendarEventForm,
                    schedule: event.target.value,
                  })
                }
                placeholder="Ej: Culto dominical"
              />
            </label>
            <label className="field">
              Cronograma (bloques)
              <div className="module-table">
                <div className="table-header">
                  <span>Arrastre</span>
                  <span>Tipo</span>
                  <span>Inicio</span>
                  <span>Fin</span>
                  <span>Comentario</span>
                  <span>Encargado</span>
                  <span>Acción</span>
                </div>
                {visibleTimelineBlocks.map((block, index) => (
                  (() => {
                    const encargadoMatches = getTimelineEncargadoMatches(index, block)
                    const searchQuery = getTimelineEncargadoSearchValue(index, block).trim()
                    return (
                  <div
                    className={`table-row timeline-block-row ${draggingTimelineIndex === index ? 'is-dragging' : ''} ${dragOverTimelineIndex === index && draggingTimelineIndex !== index ? 'is-drop-target' : ''}`}
                    key={`timeline-block-${index}`}
                    onDragOver={(event) => handleTimelineDragOver(event, index)}
                    onDrop={(event) => handleTimelineDrop(event, index)}
                  >
                    <span
                      className="timeline-drag-handle"
                      aria-hidden="true"
                      title="Arrastra para reordenar"
                      draggable
                      onDragStart={(event) => handleTimelineDragStart(event, index)}
                      onDragEnd={handleTimelineDragEnd}
                    >
                      ⋮⋮
                    </span>
                    <select
                      className="input input-inline"
                      value={block.tipo}
                      onChange={(event) => handleTimelineChange(index, 'tipo', event.target.value)}
                    >
                      <option value="">Selecciona tipo</option>
                      {getTypeOptionsForBlock(block.tipo).map((item) => (
                        <option key={`timeline-type-option-${index}-${item}`} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input input-inline"
                      type="time"
                      value={block.inicio}
                      onChange={(event) => handleTimelineChange(index, 'inicio', event.target.value)}
                    />
                    <input
                      className="input input-inline"
                      type="time"
                      value={block.fin}
                      onChange={(event) => handleTimelineChange(index, 'fin', event.target.value)}
                    />
                    <input
                      className="input input-inline"
                      value={block.observacion}
                      onChange={(event) => handleTimelineChange(index, 'observacion', event.target.value)}
                      placeholder='Comentario del bloque (ej: Predica | "Aplicar en casa")'
                    />
                    <div className="timeline-encargado-picker">
                      <input
                        className="input input-inline"
                        value={getTimelineEncargadoSearchValue(index, block)}
                        onChange={(event) =>
                          handleTimelineEncargadoSearchChange(index, event.target.value)
                        }
                        onFocus={() => handleTimelineEncargadoInputFocus(index, block)}
                        onBlur={handleTimelineEncargadoInputBlur}
                        placeholder="Buscar encargado por nombre"
                      />
                      {activeEncargadoIndex === index ? (
                        <div className="timeline-encargado-menu">
                          {encargadoMatches.length === 0 ? (
                            <button type="button" className="timeline-encargado-option" disabled>
                              {searchQuery.length < 2
                                ? 'Escribe al menos 2 letras'
                                : 'Sin coincidencias'}
                            </button>
                          ) : (
                            encargadoMatches.map((person) => (
                              <button
                                key={`timeline-encargado-option-${index}-${person.id}`}
                                type="button"
                                className="timeline-encargado-option"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleTimelineEncargadoSelect(index, person)}
                              >
                                {person.name}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="action-button danger"
                      type="button"
                      onClick={() => handleRemoveTimelineBlock(index)}
                      disabled={timelineBlocks.length === 0}
                    >
                      Quitar
                    </button>
                  </div>
                    )
                  })()
                ))}
              </div>
              <button className="action-button" type="button" onClick={handleAddTimelineBlock}>
                Agregar bloque
              </button>
            </label>
          </div>

          <div className="module-subsection">
            <h4>Reserva de espacio</h4>
            <label className="field">
              Espacio
              <select
                className="input"
                value={calendarReservationForm.facility_id}
                onChange={(event) =>
                  setCalendarReservationForm({
                    ...calendarReservationForm,
                    facility_id: event.target.value,
                  })
                }
                required
              >
                <option value="">Selecciona un espacio</option>
                {facilities.map((facility) => (
                  <option key={`facility-${facility.id}`} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Inicio
              <input
                className="input"
                type="time"
                value={reservationStartTime}
                onChange={(event) => setReservationStartTime(event.target.value)}
              />
            </label>
            <label className="field">
              Fin
              <input
                className="input"
                type="time"
                value={reservationEndTime}
                onChange={(event) => setReservationEndTime(event.target.value)}
              />
            </label>
            <label className="field">
              Responsable
              <input
                className="input"
                value={responsableName}
                onChange={(event) => {
                  const value = event.target.value
                  setResponsableName(value)
                  const match = people.find(
                    (person) => person.name.toLowerCase() === value.trim().toLowerCase()
                  )
                  setCalendarReservationForm({
                    ...calendarReservationForm,
                    responsable_person_id: match ? String(match.id) : '',
                  })
                }}
                list="responsable-options"
                placeholder="Ingresa o selecciona el nombre del responsable"
              />
            </label>
            <datalist id="responsable-options">
              {people.map((person) => (
                <option key={`responsable-${person.id}`} value={person.name} />
              ))}
            </datalist>
            <label className="field">
              Estado
              <select
                className="input"
                value={calendarReservationForm.estado}
                onChange={(event) =>
                  setCalendarReservationForm({
                    ...calendarReservationForm,
                    estado: event.target.value,
                  })
                }
              >
                <option value="">Selecciona estado</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button className="primary" type="submit">
              Guardar evento y reserva
            </button>
            <button className="action-button" type="button" onClick={onClear}>
              Limpiar formulario
            </button>
            {(calendarEventForm.id || calendarReservationForm.id) && (
              <button className="action-button danger" type="button" onClick={onDelete}>
                Eliminar registro
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="module-panel calendar-combined-card">
        <div className="module-summary">
          <div>
            <h3>Tipos de cronograma</h3>
            <p>Administra los tipos disponibles para los bloques del evento.</p>
          </div>
        </div>
        <div className="form">
          <label className="field">
            Tipo
            <input
              className="input"
              value={timelineTypeForm}
              onChange={(event) => setTimelineTypeForm(event.target.value)}
              placeholder="Ej: oración, avisos, santa cena"
            />
          </label>
          <div className="row-actions">
            <button className="primary" type="button" onClick={handleSaveTimelineType}>
              {editingTimelineTypeIndex !== null ? 'Actualizar tipo' : 'Agregar tipo'}
            </button>
            {editingTimelineTypeIndex !== null && (
              <button
                className="action-button ghost"
                type="button"
                onClick={() => {
                  setEditingTimelineTypeIndex(null)
                  setTimelineTypeForm('')
                }}
              >
                Cancelar edición
              </button>
            )}
          </div>
          <div className="module-table">
            <div className="table-header">
              <span>Tipo</span>
              <span>Acciones</span>
            </div>
            {timelineTypeRows.map((row) => (
              <div className="table-row" key={`timeline-type-row-${row.index}`}>
                <span>{row.type}</span>
                <div className="row-actions">
                  <button
                    className="action-button ghost"
                    type="button"
                    onClick={() => handleStartEditTimelineType(row.index)}
                          disabled={isLockedType(row.type)}
                  >
                          {isLockedType(row.type) ? 'Predefinido' : 'Editar'}
                  </button>
                  <button
                    className="action-button danger"
                    type="button"
                    onClick={() => handleDeleteTimelineType(row.index)}
                          disabled={isLockedType(row.type)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
  )
}

export default CalendarPanel
