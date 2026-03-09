import type { Event, Facility, Ministry, Reservation } from '../types'

export type CalendarItem = {
  id: string
  type: 'event' | 'reservation' | 'combined'
  eventId?: number
  reservationId?: number
  title: string
  lines: string[]
}

export const buildCalendarDays = (calendarMonth: Date): Array<Date | null> => {
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  const startWeekday = start.getDay()
  const totalDays = end.getDate()
  const weeks = Math.ceil((startWeekday + totalDays) / 7)
  const days: Array<Date | null> = []

  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const dayNumber = week * 7 + day - startWeekday + 1
      if (dayNumber < 1 || dayNumber > totalDays) {
        days.push(null)
      } else {
        days.push(new Date(year, month, dayNumber))
      }
    }
  }

  return days
}

const formatTime = (value?: string | null) => {
  if (!value) return ''
  const timePart = value.includes('T') ? value.split('T')[1] : value
  return timePart.slice(0, 5)
}

const formatTimeRange = (inicio?: string | null, fin?: string | null) => {
  const start = formatTime(inicio)
  const end = formatTime(fin)
  if (start && end) return `${start} - ${end}`
  return start || end || ''
}

export const buildCalendarItemsByDate = (
  events: Event[],
  reservations: Reservation[],
  facilitiesById: Map<number, Facility>,
  eventsById: Map<number, Event>,
  ministriesById: Map<number, Ministry>
) => {
  const map = new Map<string, CalendarItem[]>()

  const addItem = (date: string, item: CalendarItem) => {
    if (!map.has(date)) {
      map.set(date, [])
    }
    map.get(date)?.push(item)
  }

  const eventIdsWithReservation = new Set<number>()

  reservations.forEach((reservation) => {
    if (!reservation.inicio) return
    const dateKey = reservation.inicio.split('T')[0]
    const event = reservation.event_id ? eventsById.get(reservation.event_id) : undefined
    if (reservation.event_id) {
      eventIdsWithReservation.add(reservation.event_id)
    }
    const ministryName = event?.ministry_id
      ? ministriesById.get(event.ministry_id)?.name ?? 'Sin ministerio'
      : 'Sin ministerio'
    const facilityName = facilitiesById.get(reservation.facility_id)?.name ?? 'Sin lugar'
    const timeLabel = formatTimeRange(reservation.inicio, reservation.fin)
    const title = event?.name ?? facilityName
    const lines = [`Ministerio: ${ministryName}`, `Lugar: ${facilityName}`]
    if (reservation.estado) lines.push(`Estado: ${reservation.estado}`)
    if (timeLabel) lines.push(`Horario: ${timeLabel}`)

    addItem(dateKey, {
      id: reservation.event_id ? `combined-${reservation.id}` : `reservation-${reservation.id}`,
      type: reservation.event_id ? 'combined' : 'reservation',
      eventId: reservation.event_id ?? undefined,
      reservationId: reservation.id,
      title,
      lines,
    })
  })

  events.forEach((event) => {
    if (!event.date) return
    if (eventIdsWithReservation.has(event.id)) return
    const ministryName = event.ministry_id
      ? ministriesById.get(event.ministry_id)?.name ?? 'Sin ministerio'
      : 'Sin ministerio'
    const timeLabel = event.schedule ?? ''
    const lines = [`Ministerio: ${ministryName}`, 'Lugar: Sin lugar']
    if (timeLabel) lines.push(`Horario: ${timeLabel}`)
    addItem(event.date, {
      id: `event-${event.id}`,
      type: 'event',
      eventId: event.id,
      title: event.name,
      lines,
    })
  })

  return map
}
