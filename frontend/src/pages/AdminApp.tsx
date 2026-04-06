import { useMemo, useState, type FormEvent } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import AdminHeader from '../components/AdminHeader'
import AdminSidebar, { type AdminSection } from '../components/AdminSidebar'
import AdminUsersPanel from '../components/AdminUsersPanel'
import VendorsPanel from '../components/VendorsPanel'
import CalendarPanel from '../components/CalendarPanel'
import ConsejeriaPanel from '../components/ConsejeriaPanel'
import DashboardSummary from '../components/DashboardSummary'
import MapPanel from '../components/MapPanel'
import MinistriesPanel from '../components/MinistriesPanel'
import MetricsPanel from '../components/MetricsPanel'
import Panel from '../components/Panel'
import TrackingPanel from '../components/TrackingPanel'
import VolunteersPanel from '../components/VolunteersPanel'
import { useApiData } from '../hooks/useApiData'
import { buildUrl, fetchJson, getAllowedSections, getAuthUser, postJson } from '../services/api'
import { buildCalendarDays, buildCalendarItemsByDate } from '../utils/calendar'
import {
  buildAgePyramid,
  buildGenderDoughnut,
  buildMaritalDoughnut,
  buildParticipationChart,
  defaultChartOptions,
} from '../utils/metrics'
import type {
  Consejeria,
  DiscipleshipCourse,
  Event,
  EventSchedule,
  Facility,
  Ministry,
  ParticipationReport,
  ParticipationSnapshot,
  Person,
  PersonDiscipleshipRecord,
  Reservation,
  RepertoireSong,
  Song,
  Team,
  TeamMember,
  TeamRole,
} from '../types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

type AdminAppProps = {
  onLogout: () => void
}

const MILLISECONDS_PER_YEAR = 31557600000

const calculateAge = (birthDate: string | null | undefined, referenceNowMs: number) => {
  if (!birthDate) return null
  const birthMs = new Date(birthDate).getTime()
  if (Number.isNaN(birthMs)) return null
  return Math.floor((referenceNowMs - birthMs) / MILLISECONDS_PER_YEAR)
}

const normalizeTimelineType = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const isWorshipTimelineType = (value: string | null | undefined) => {
  const normalized = normalizeTimelineType(value)
  return normalized === 'alabanza y adoracion' || normalized === 'worship'
}

type MinistryDeletePreview = {
  ministry_id: number
  ministry_name: string
  teams: number
  team_roles: number
  team_members: number
  members_with_role_links: number
  child_ministries: number
  requires_cascade: boolean
}

type MinistryDeleteResult = {
  deleted: boolean
  id: number
  cascade: boolean
  summary?: {
    teams_deleted: number
    team_roles_deleted: number
    team_members_deleted: number
    members_unassigned: number
    child_ministries_detached: number
  }
}

const formatApiError = (err: unknown, fallback: string) => {
  if (!(err instanceof Error)) return fallback
  try {
    const payload = JSON.parse(err.message)
    if (typeof payload?.detail === 'string') return payload.detail
    if (typeof payload?.detail?.message === 'string') return payload.detail.message
  } catch {
    // ignore parse errors and fall back to raw message
  }
  return err.message || fallback
}

const AdminApp = ({ onLogout }: AdminAppProps) => {
  const [ageReferenceNowMs] = useState(() => Date.now())
  const ministries = useApiData<Ministry[]>(buildUrl('ministries', '/ministries'), [])
  const teams = useApiData<Team[]>(buildUrl('ministries', '/teams'), [])
  const teamMembers = useApiData<TeamMember[]>(buildUrl('ministries', '/team-members'), [])
  const teamRoles = useApiData<TeamRole[]>(buildUrl('ministries', '/team-roles'), [])
  const people = useApiData<Person[]>(buildUrl('people', '/people'), [])
  const eventSchedules = useApiData<EventSchedule[]>(buildUrl('events', '/event-schedules'), [])
  const musicRepertoires = useApiData<{ id: number; event_id: number }[]>(buildUrl('music', '/repertoires'), [])
  const musicRepertoireSongs = useApiData<RepertoireSong[]>(buildUrl('music', '/repertoire-songs'), [])
  const musicSongs = useApiData<Song[]>(buildUrl('music', '/songs'), [])
  const consejerias = useApiData<Consejeria[]>(buildUrl('consejeria', '/consejerias'), [])
  const discipleshipCourses = useApiData<DiscipleshipCourse[]>(buildUrl('people', '/discipleship-courses'), [])
  const discipleshipRecords = useApiData<PersonDiscipleshipRecord[]>(buildUrl('people', '/discipulado'), [])
  const events = useApiData<Event[]>(buildUrl('events', '/events'), [])
  const facilities = useApiData<Facility[]>(buildUrl('calendar', '/facilities'), [])
  const reservations = useApiData<Reservation[]>(buildUrl('calendar', '/reservations'), [])
  const participation = useApiData<ParticipationReport>(buildUrl('reports', '/reports/participation'), {
    total_activos: 0,
    total_voluntarios: 0,
  })
  const participationHistory = useApiData<ParticipationSnapshot[]>(
    buildUrl('reports', '/reports/participation/history'),
    []
  )

  const [ministryForm, setMinistryForm] = useState({ name: '', description: '', parent_id: '' })
  const [teamForm, setTeamForm] = useState({ name: '', ministry_id: '', description: '' })
  const [ministryRoleForm, setMinistryRoleForm] = useState({ name: '', level: '', ministry_id: '' })
  const [editingVolunteerRoleId, setEditingVolunteerRoleId] = useState<number | null>(null)
  const [ministryRoleFilterId, setMinistryRoleFilterId] = useState('')
  const [volunteerMinistryRoleFilterId, setVolunteerMinistryRoleFilterId] = useState('')
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [calendarEventForm, setCalendarEventForm] = useState({
    id: '',
    name: '',
    date: '',
    ministry_id: '',
    schedule: '',
    timeline_blocks: '',
  })
  const [calendarReservationForm, setCalendarReservationForm] = useState({
    id: '',
    facility_id: '',
    event_id: '',
    inicio: '',
    fin: '',
    responsable_person_id: '',
    estado: '',
  })
  const [reservationStartTime, setReservationStartTime] = useState('')
  const [reservationEndTime, setReservationEndTime] = useState('')
  const [responsableName, setResponsableName] = useState('')
  const [editingMinistryId, setEditingMinistryId] = useState<number | null>(null)
  const [editingMinistryName, setEditingMinistryName] = useState('')
  const [editingMinistryParentId, setEditingMinistryParentId] = useState('')
  const [teamFilterMinistryId, setTeamFilterMinistryId] = useState('')
  const [activeMapMinistryId, setActiveMapMinistryId] = useState<number | null>(null)
  const [trackingSearch, setTrackingSearch] = useState('')
  const [consejeriaSearch, setConsejeriaSearch] = useState('')
  const [consejeriaForm, setConsejeriaForm] = useState({
    id: '',
    solicitante_person_id: '',
    consejero_person_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    motivo: '',
    observaciones: '',
    estado: 'abierta',
  })
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentForm, setAssignmentForm] = useState({
    person_id: '',
    ministry_id: '',
    team_id: '',
    role_id: '',
  })
  const currentUser = getAuthUser()
  const allowedSections = getAllowedSections('admin', currentUser?.permissions ?? []) as AdminSection[]
  const [activeSection, setActiveSection] = useState<AdminSection>(allowedSections[0] ?? 'resumen')
  const handleSectionChange = (section: AdminSection) => {
    if (allowedSections.includes(section)) {
      setActiveSection(section)
    }
  }

  const ministriesById = useMemo(() => {
    const map = new Map<number, Ministry>()
    ministries.data.forEach((ministry) => map.set(ministry.id, ministry))
    return map
  }, [ministries.data])

  const ministriesByParent = useMemo(() => {
    const map = new Map<number | null, Ministry[]>()
    ministries.data.forEach((ministry) => {
      const parentId = ministry.parent_id ?? null
      if (!map.has(parentId)) {
        map.set(parentId, [])
      }
      map.get(parentId)?.push(ministry)
    })
    return map
  }, [ministries.data])

  const teamsById = useMemo(() => {
    const map = new Map<number, Team>()
    teams.data.forEach((team) => map.set(team.id, team))
    return map
  }, [teams.data])

  const rolesById = useMemo(() => {
    const map = new Map<number, TeamRole>()
    teamRoles.data.forEach((role) => map.set(role.id, role))
    return map
  }, [teamRoles.data])

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>()
    people.data.forEach((person) => map.set(person.id, person))
    return map
  }, [people.data])

  const eventsById = useMemo(() => {
    const map = new Map<number, Event>()
    events.data.forEach((event) => map.set(event.id, event))
    return map
  }, [events.data])

  const musicSongsById = useMemo(() => {
    const map = new Map<number, Song>()
    musicSongs.data.forEach((song) => map.set(song.id, song))
    return map
  }, [musicSongs.data])

  const worshipObservationByEventId = useMemo(() => {
    const map = new Map<number, string>()

    musicRepertoires.data.forEach((repertoire) => {
      const names = musicRepertoireSongs.data
        .filter((item) => item.repertoire_id === repertoire.id)
        .sort((left, right) => (left.orden ?? 999) - (right.orden ?? 999))
        .map((item) => musicSongsById.get(item.song_id)?.name)
        .filter(Boolean) as string[]

      map.set(repertoire.event_id, names.join(' | '))
    })

    return map
  }, [musicRepertoires.data, musicRepertoireSongs.data, musicSongsById])

  const filteredAssignmentPeople = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase()
    if (!query) return people.data
    return people.data.filter((person) => person.name.toLowerCase().includes(query))
  }, [people.data, assignmentSearch])

  const facilitiesById = useMemo(() => {
    const map = new Map<number, Facility>()
    facilities.data.forEach((facility) => map.set(facility.id, facility))
    return map
  }, [facilities.data])

  const membersByTeam = useMemo(() => {
    const map = new Map<number, TeamMember[]>()
    teamMembers.data.forEach((member) => {
      if (!map.has(member.team_id)) {
        map.set(member.team_id, [])
      }
      map.get(member.team_id)?.push(member)
    })
    return map
  }, [teamMembers.data])

  const membershipsByPerson = useMemo(() => {
    const map = new Map<number, TeamMember[]>()
    teamMembers.data.forEach((member) => {
      if (!map.has(member.person_id)) {
        map.set(member.person_id, [])
      }
      map.get(member.person_id)?.push(member)
    })
    return map
  }, [teamMembers.data])

  const courseNamesById = useMemo(() => {
    const map = new Map<number, string>()
    discipleshipCourses.data.forEach((course) => map.set(course.id, course.name))
    return map
  }, [discipleshipCourses.data])

  const discipleshipByPerson = useMemo(() => {
    const map = new Map<number, PersonDiscipleshipRecord[]>()
    discipleshipRecords.data.forEach((record) => {
      if (!map.has(record.person_id)) {
        map.set(record.person_id, [])
      }
      map.get(record.person_id)?.push(record)
    })
    return map
  }, [discipleshipRecords.data])

  const volunteersByMinistry = useMemo(() => {
    const map = new Map<number, number>()
    teamMembers.data.forEach((member) => {
      const team = teamsById.get(member.team_id)
      const ministryId = team?.ministry_id
      if (!ministryId) return
      map.set(ministryId, (map.get(ministryId) ?? 0) + 1)
    })
    return map
  }, [teamMembers.data, teamsById])

  const volunteersByMinistryChart = useMemo(() => {
    const labels = ministries.data.map((ministry) => ministry.name)
    const data = ministries.data.map((ministry) => volunteersByMinistry.get(ministry.id) ?? 0)
    return {
      labels,
      datasets: [
        {
          label: 'Miembros por ministerio',
          data,
          backgroundColor: 'rgba(124, 92, 255, 0.6)',
          borderColor: 'rgba(124, 92, 255, 1)',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    }
  }, [ministries.data, volunteersByMinistry])

  const teamsByMinistry = useMemo(() => {
    const map = new Map<number, Team[]>()
    teams.data.forEach((team) => {
      const ministryId = team.ministry_id
      if (!ministryId) return
      if (!map.has(ministryId)) {
        map.set(ministryId, [])
      }
      map.get(ministryId)?.push(team)
    })
    return map
  }, [teams.data])

  const rolesByMinistry = useMemo(() => {
    const map = new Map<number, TeamRole[]>()
    teamRoles.data.forEach((role) => {
      const ministryId = role.ministry_id
      if (!ministryId) return
      if (!map.has(ministryId)) {
        map.set(ministryId, [])
      }
      map.get(ministryId)?.push(role)
    })
    return map
  }, [teamRoles.data])

  const peopleTrackingRows = useMemo(() => {
    return people.data.map((person) => {
      const age = calculateAge(person.birth_date, ageReferenceNowMs)
      const memberships = membershipsByPerson.get(person.id) ?? []
      const teamsLabel = memberships
        .map((member) => teamsById.get(member.team_id)?.name)
        .filter(Boolean)
        .join(', ')
      const rolesLabel = memberships
        .map((member) => (member.role_id ? rolesById.get(member.role_id)?.name : null))
        .filter(Boolean)
        .join(', ')
      const ministriesLabel = memberships
        .map((member) => {
          const team = teamsById.get(member.team_id)
          return team?.ministry_id ? ministriesById.get(team.ministry_id)?.name : null
        })
        .filter(Boolean)
        .join(', ')
      const discipleshipLabel = (discipleshipByPerson.get(person.id) ?? [])
        .map((record) => courseNamesById.get(record.course_id))
        .filter(Boolean)
        .join(', ')
      return {
        name: person.name,
        status: person.status ?? '—',
        gender: person.gender ?? '—',
        age: age && age > 0 ? age : '—',
        marital_status: person.marital_status ?? '—',
        phone: person.phone ?? '—',
        email: person.email ?? '—',
        ministry: ministriesLabel || 'Sin ministerio asignado',
        team: teamsLabel || 'Sin equipo asignado',
        role: rolesLabel || 'Sin rol asignado',
        courses: discipleshipLabel || 'Sin cursos asignados',
      }
    })
  }, [
    people.data,
    membershipsByPerson,
    teamsById,
    rolesById,
    ministriesById,
    discipleshipByPerson,
    courseNamesById,
    ageReferenceNowMs,
  ])

  const filteredTrackingRows = useMemo(() => {
    if (!trackingSearch.trim()) {
      return peopleTrackingRows
    }
    const query = trackingSearch.trim().toLowerCase()
    return peopleTrackingRows.filter((row) =>
      Object.values(row).some((value) => String(value).toLowerCase().includes(query))
    )
  }, [peopleTrackingRows, trackingSearch])

  const demographicSummary = useMemo(() => {
    const genderCounts = { Masculino: 0, Femenino: 0, Otros: 0 }
    const maritalCounts = new Map<string, number>()
    const ageBuckets = {
      '0-12': 0,
      '13-17': 0,
      '18-25': 0,
      '26-35': 0,
      '36-50': 0,
      '51+': 0,
      'Sin dato': 0,
    }
    const ageByGender = {
      Masculino: { ...ageBuckets },
      Femenino: { ...ageBuckets },
    }

    people.data.forEach((person) => {
      const gender = person.gender ?? 'Otros'
      if (gender === 'Masculino') {
        genderCounts.Masculino += 1
      } else if (gender === 'Femenino') {
        genderCounts.Femenino += 1
      } else {
        genderCounts.Otros += 1
      }

      const marital = person.marital_status ?? 'No especificado'
      maritalCounts.set(marital, (maritalCounts.get(marital) ?? 0) + 1)

      if (!person.birth_date) {
        ageBuckets['Sin dato'] += 1
        if (gender === 'Masculino' || gender === 'Femenino') {
          ageByGender[gender]['Sin dato'] += 1
        }
      } else {
        const age = calculateAge(person.birth_date, ageReferenceNowMs)
        if (age === null) {
          ageBuckets['Sin dato'] += 1
          if (gender === 'Masculino' || gender === 'Femenino') {
            ageByGender[gender]['Sin dato'] += 1
          }
          return
        }
        if (age <= 12) ageBuckets['0-12'] += 1
        else if (age <= 17) ageBuckets['13-17'] += 1
        else if (age <= 25) ageBuckets['18-25'] += 1
        else if (age <= 35) ageBuckets['26-35'] += 1
        else if (age <= 50) ageBuckets['36-50'] += 1
        else ageBuckets['51+'] += 1
        if (gender === 'Masculino' || gender === 'Femenino') {
          if (age <= 12) ageByGender[gender]['0-12'] += 1
          else if (age <= 17) ageByGender[gender]['13-17'] += 1
          else if (age <= 25) ageByGender[gender]['18-25'] += 1
          else if (age <= 35) ageByGender[gender]['26-35'] += 1
          else if (age <= 50) ageByGender[gender]['36-50'] += 1
          else ageByGender[gender]['51+'] += 1
        }
      }
    })

    const maritalList = Array.from(maritalCounts.entries()).sort((a, b) => b[1] - a[1])

    return {
      total: people.data.length,
      genderCounts,
      ageBuckets,
      ageByGender,
      maritalList,
    }
  }, [people.data, ageReferenceNowMs])

  const serversCount = useMemo(() => {
    return new Set(teamMembers.data.map((member) => member.person_id)).size
  }, [teamMembers.data])

  const serverPeople = useMemo(() => {
    const serverIds = new Set(teamMembers.data.map((member) => member.person_id))
    return people.data.filter((person) => serverIds.has(person.id))
  }, [people.data, teamMembers.data])

  const genderDoughnut = useMemo(
    () => buildGenderDoughnut(demographicSummary.genderCounts),
    [demographicSummary.genderCounts]
  )

  const agePyramid = useMemo(
    () => buildAgePyramid(demographicSummary.ageBuckets, demographicSummary.ageByGender),
    [demographicSummary.ageBuckets, demographicSummary.ageByGender]
  )

  const maritalDoughnut = useMemo(
    () => buildMaritalDoughnut(demographicSummary.maritalList),
    [demographicSummary.maritalList]
  )

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  const calendarMonthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
      calendarMonth
    )
  }, [calendarMonth])

  const calendarItemsByDate = useMemo(
    () =>
      buildCalendarItemsByDate(
        events.data,
        reservations.data,
        facilitiesById,
        eventsById,
        ministriesById
      ),
    [events.data, reservations.data, facilitiesById, eventsById, ministriesById]
  )

  const timelineByEventId = useMemo(() => {
    const map = new Map<number, string>()
    eventSchedules.data.forEach((item) => {
      const defaultObservation = item.observacion ?? ''
      const observation = isWorshipTimelineType(item.tipo)
        ? (worshipObservationByEventId.get(item.event_id) ?? '')
        : defaultObservation
      const line = `${(item.inicio ?? '').split('T')[1]?.slice(0, 5) ?? '--:--'}-${
        (item.fin ?? '').split('T')[1]?.slice(0, 5) ?? '--:--'
      } | ${item.tipo ?? ''} | ${observation} | ${item.encargado_person_id ?? ''}`
      if (!map.has(item.event_id)) {
        map.set(item.event_id, line)
      } else {
        map.set(item.event_id, `${map.get(item.event_id)}\n${line}`)
      }
    })
    return map
  }, [eventSchedules.data, worshipObservationByEventId])

  const reservationByEventId = useMemo(() => {
    const map = new Map<number, Reservation>()
    reservations.data.forEach((reservation) => {
      if (reservation.event_id && !map.has(reservation.event_id)) {
        map.set(reservation.event_id, reservation)
      }
    })
    return map
  }, [reservations.data])

  const upcomingEvents = useMemo(() => {
    const todayKey = new Date().toISOString().split('T')[0]
    return events.data
      .filter((event) => event.date && event.date >= todayKey)
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .slice(0, 5)
  }, [events.data])

  const pendingReservations = useMemo(
    () =>
      reservations.data.filter(
        (reservation) => (reservation.estado ?? '').toLowerCase() === 'pendiente'
      ),
    [reservations.data]
  )

  const eventsWithoutReservation = useMemo(() => {
    const reservedEventIds = new Set(
      reservations.data.map((reservation) => reservation.event_id).filter(Boolean) as number[]
    )
    return events.data.filter((event) => !reservedEventIds.has(event.id)).slice(0, 5)
  }, [events.data, reservations.data])

  const participationChart = useMemo(
    () => buildParticipationChart(participationHistory.data),
    [participationHistory.data]
  )

  const chartOptions = defaultChartOptions

  const handleCreateMinistry = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      await postJson(buildUrl('ministries', '/ministries'), {
        name: ministryForm.name,
        description: ministryForm.description || null,
        parent_id: ministryForm.parent_id ? Number(ministryForm.parent_id) : null,
      })
      setMinistryForm({ name: '', description: '', parent_id: '' })
      ministries.refresh()
      setActionStatus('Ministerio creado')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error creando ministerio')
    }
  }

  const handleCreateConsejeria = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      const payload = {
        solicitante_person_id: Number(consejeriaForm.solicitante_person_id),
        consejero_person_id: Number(consejeriaForm.consejero_person_id),
        fecha: consejeriaForm.fecha,
        motivo: consejeriaForm.motivo,
        observaciones: consejeriaForm.observaciones || null,
        estado: consejeriaForm.estado || null,
      }
      if (consejeriaForm.id) {
        await fetchJson(buildUrl('consejeria', `/consejerias/${consejeriaForm.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await postJson(buildUrl('consejeria', '/consejerias'), payload)
      }
      setConsejeriaForm({
        id: '',
        solicitante_person_id: '',
        consejero_person_id: '',
        fecha: new Date().toISOString().slice(0, 10),
        motivo: '',
        observaciones: '',
        estado: 'abierta',
      })
      consejerias.refresh()
      setActionStatus(consejeriaForm.id ? 'Consejería actualizada' : 'Consejería creada')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error guardando consejería')
    }
  }

  const handleStartEditConsejeria = (id: number) => {
    const item = consejerias.data.find((row) => row.id === id)
    if (!item) return
    setConsejeriaForm({
      id: String(item.id),
      solicitante_person_id: String(item.solicitante_person_id),
      consejero_person_id: String(item.consejero_person_id),
      fecha: item.fecha,
      motivo: item.motivo,
      observaciones: item.observaciones ?? '',
      estado: item.estado ?? 'abierta',
    })
  }

  const handleCancelConsejeriaEdit = () => {
    setConsejeriaForm({
      id: '',
      solicitante_person_id: '',
      consejero_person_id: '',
      fecha: new Date().toISOString().slice(0, 10),
      motivo: '',
      observaciones: '',
      estado: 'abierta',
    })
  }

  const handleCloseConsejeria = async (id: number) => {
    const item = consejerias.data.find((row) => row.id === id)
    if (!item) return
    setActionStatus(null)
    try {
      await fetchJson(buildUrl('consejeria', `/consejerias/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitante_person_id: item.solicitante_person_id,
          consejero_person_id: item.consejero_person_id,
          fecha: item.fecha,
          motivo: item.motivo,
          observaciones: item.observaciones ?? null,
          estado: 'cerrada',
        }),
      })
      consejerias.refresh()
      setActionStatus('Consejería cerrada')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error cerrando consejería')
    }
  }

  const handleStartEditMinistry = (ministry: Ministry) => {
    setEditingMinistryId(ministry.id)
    setEditingMinistryName(ministry.name)
    setEditingMinistryParentId(ministry.parent_id ? String(ministry.parent_id) : '')
  }

  const handleCancelEditMinistry = () => {
    setEditingMinistryId(null)
    setEditingMinistryName('')
    setEditingMinistryParentId('')
  }

  const handleSaveMinistryName = async (ministry: Ministry) => {
    setActionStatus(null)
    try {
      await fetchJson(buildUrl('ministries', `/ministries/${ministry.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingMinistryName,
          description: ministry.description ?? null,
          parent_id: editingMinistryParentId ? Number(editingMinistryParentId) : null,
        }),
      })
      setEditingMinistryId(null)
      setEditingMinistryName('')
      setEditingMinistryParentId('')
      ministries.refresh()
      setActionStatus('Ministerio actualizado')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error actualizando ministerio')
    }
  }

  const handleDeleteMinistry = async (ministry: Ministry) => {
    setActionStatus(null)
    try {
      const preview = await fetchJson<MinistryDeletePreview>(
        buildUrl('ministries', `/ministries/${ministry.id}/delete-preview`)
      )

      const message = preview.requires_cascade
        ? [
            `El ministerio "${ministry.name}" tiene datos relacionados.`,
            '',
            `Se eliminará:`,
            `- Equipos: ${preview.teams}`,
            `- Roles: ${preview.team_roles}`,
            `- Asignaciones en equipos: ${preview.team_members}`,
            `- Desasignaciones de rol: ${preview.members_with_role_links}`,
            `- Ministerios hijos que quedarán sin padre: ${preview.child_ministries}`,
            '',
            '¿Deseas continuar con el borrado en cascada?',
          ].join('\n')
        : `¿Deseas eliminar el ministerio "${ministry.name}"?`

      if (!window.confirm(message)) {
        return
      }

      const deletePath = preview.requires_cascade
        ? `/ministries/${ministry.id}?cascade=true`
        : `/ministries/${ministry.id}`

      const result = await fetchJson<MinistryDeleteResult>(buildUrl('ministries', deletePath), {
        method: 'DELETE',
      })

      if (editingMinistryId === ministry.id) {
        setEditingMinistryId(null)
        setEditingMinistryName('')
        setEditingMinistryParentId('')
      }
      ministries.refresh()
      teams.refresh()
      teamRoles.refresh()
      teamMembers.refresh()

      if (result.cascade && result.summary) {
        setActionStatus(
          `Ministerio eliminado en cascada. Equipos: ${result.summary.teams_deleted}, roles: ${result.summary.team_roles_deleted}, asignaciones: ${result.summary.team_members_deleted}`
        )
      } else {
        setActionStatus('Ministerio eliminado')
      }
    } catch (err) {
      setActionStatus(formatApiError(err, 'Error eliminando ministerio'))
    }
  }

  const handleCalendarCombinedClear = () => {
    setCalendarEventForm({
      id: '',
      name: '',
      date: '',
      ministry_id: '',
      schedule: '',
      timeline_blocks: '',
    })
    setCalendarReservationForm({
      id: '',
      facility_id: '',
      event_id: '',
      inicio: '',
      fin: '',
      responsable_person_id: '',
      estado: '',
    })
    setReservationStartTime('')
    setReservationEndTime('')
    setResponsableName('')
  }

  const handleCalendarCombinedSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      if (!calendarEventForm.name) {
        setActionStatus('Completa el nombre del evento')
        return
      }
      if (!calendarReservationForm.facility_id) {
        setActionStatus('Selecciona un espacio para la reserva')
        return
      }

      const eventPayload = {
        name: calendarEventForm.name,
        date: calendarEventForm.date || null,
        ministry_id: calendarEventForm.ministry_id ? Number(calendarEventForm.ministry_id) : null,
        schedule: calendarEventForm.schedule || null,
      }

      let eventId = calendarEventForm.id ? Number(calendarEventForm.id) : null

      if (eventId) {
        await fetchJson(buildUrl('events', `/events/${eventId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventPayload),
        })
      } else {
        const created = await postJson(buildUrl('events', '/events'), eventPayload)
        eventId = (created as Event).id
      }

      if (!eventId) {
        setActionStatus('No se pudo determinar el evento para la reserva')
        return
      }

      const timelineLines = calendarEventForm.timeline_blocks
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      if (timelineLines.length && !calendarEventForm.date) {
        setActionStatus('Define la fecha del evento para guardar el cronograma')
        return
      }

      const parsedTimeline = timelineLines.map((line) => {
        const [timePart, rawType, rawObservation = '', rawEncargadoId = ''] = line
          .split('|')
          .map((item) => item.trim())
        const observation = rawObservation
        const [startTime, endTime] = (timePart ?? '').split('-').map((item) => item.trim())
        if (!startTime || !endTime) {
          throw new Error(`Formato inválido en cronograma: ${line}`)
        }
        return {
          inicio: `${calendarEventForm.date}T${startTime}`,
          fin: `${calendarEventForm.date}T${endTime}`,
          tipo: rawType || 'general',
          observacion: observation,
          encargado_person_id: rawEncargadoId ? Number(rawEncargadoId) : null,
        }
      })

      const hasWorshipBlock = parsedTimeline.some((block) => isWorshipTimelineType(block.tipo))
      let ensuredRepertoireId: number | null = null
      if (hasWorshipBlock) {
        const existingRepertoire = musicRepertoires.data.find((item) => item.event_id === eventId)
        if (!existingRepertoire) {
          const created = await postJson(buildUrl('music', '/repertoires'), { event_id: eventId })
          ensuredRepertoireId = (created as { id: number }).id
        } else {
          ensuredRepertoireId = existingRepertoire.id
        }
      }

      const worshipObservation = (() => {
        if (!ensuredRepertoireId) return ''
        const names = musicRepertoireSongs.data
          .filter((item) => item.repertoire_id === ensuredRepertoireId)
          .sort((left, right) => (left.orden ?? 999) - (right.orden ?? 999))
          .map((item) => musicSongsById.get(item.song_id)?.name)
          .filter(Boolean) as string[]
        return names.join(' | ')
      })()

      const timelineToSave = parsedTimeline.map((block) =>
        isWorshipTimelineType(block.tipo)
          ? { ...block, observacion: worshipObservation }
          : block
      )

      const existingSchedules = eventSchedules.data.filter((item) => item.event_id === eventId)
      for (const existingSchedule of existingSchedules) {
        await fetchJson(buildUrl('events', `/event-schedules/${existingSchedule.id}`), {
          method: 'DELETE',
        })
      }
      for (const block of timelineToSave) {
        await postJson(buildUrl('events', '/event-schedules'), {
          event_id: eventId,
          inicio: block.inicio,
          fin: block.fin,
          tipo: block.tipo,
          observacion: block.observacion || null,
          encargado_person_id: block.encargado_person_id,
        })
      }

      const reservationDate =
        calendarEventForm.date ||
        calendarReservationForm.inicio?.split('T')[0] ||
        calendarReservationForm.fin?.split('T')[0] ||
        ''
      if (!reservationDate) {
        setActionStatus('Selecciona la fecha del evento para la reserva')
        return
      }
      const inicio = reservationStartTime ? `${reservationDate}T${reservationStartTime}` : null
      const fin = reservationEndTime ? `${reservationDate}T${reservationEndTime}` : null

      const reservationPayload = {
        facility_id: Number(calendarReservationForm.facility_id),
        event_id: eventId,
        inicio,
        fin,
        responsable_person_id: calendarReservationForm.responsable_person_id
          ? Number(calendarReservationForm.responsable_person_id)
          : null,
        estado: calendarReservationForm.estado || null,
      }

      if (calendarReservationForm.id) {
        await fetchJson(buildUrl('calendar', `/reservations/${calendarReservationForm.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reservationPayload),
        })
        setActionStatus('Evento y reserva actualizados')
      } else {
        await postJson(buildUrl('calendar', '/reservations'), reservationPayload)
        setActionStatus('Evento y reserva creados')
      }

      handleCalendarCombinedClear()
      events.refresh()
      reservations.refresh()
      eventSchedules.refresh()
      musicRepertoires.refresh()
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error guardando evento y reserva')
    }
  }

  const handleCalendarCombinedDelete = async () => {
    if (!calendarReservationForm.id && !calendarEventForm.id) return
    setActionStatus(null)
    try {
      if (calendarReservationForm.id) {
        await fetchJson(buildUrl('calendar', `/reservations/${calendarReservationForm.id}`), {
          method: 'DELETE',
        })
      }
      if (calendarEventForm.id) {
        await fetchJson(buildUrl('events', `/events/${calendarEventForm.id}`), {
          method: 'DELETE',
        })
      }
      handleCalendarCombinedClear()
      events.refresh()
      reservations.refresh()
      setActionStatus('Evento y reserva eliminados')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error eliminando evento y reserva')
    }
  }

  const handleCalendarDayClick = (date: string) => {
    setCalendarEventForm((prev) => ({ ...prev, date, timeline_blocks: prev.timeline_blocks ?? '' }))
    setCalendarReservationForm((prev) => ({ ...prev, inicio: `${date}T09:00`, fin: `${date}T11:00` }))
    setReservationStartTime('09:00')
    setReservationEndTime('11:00')
  }

  const handleCreateTeam = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      await postJson(buildUrl('ministries', '/teams'), {
        name: teamForm.name,
        ministry_id: teamForm.ministry_id ? Number(teamForm.ministry_id) : null,
        description: teamForm.description || null,
      })
      setTeamForm({ name: '', ministry_id: '', description: '' })
      teams.refresh()
      setActionStatus('Equipo creado')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error creando equipo')
    }
  }

  const handleCreateMinistryRole = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      const payload = {
        name: ministryRoleForm.name,
        level: ministryRoleForm.level ? Number(ministryRoleForm.level) : null,
        ministry_id: Number(ministryRoleForm.ministry_id),
      }
      if (editingVolunteerRoleId) {
        await fetchJson(buildUrl('ministries', `/team-roles/${editingVolunteerRoleId}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        await postJson(buildUrl('ministries', '/team-roles'), payload)
      }
      setMinistryRoleForm({ name: '', level: '', ministry_id: '' })
      setEditingVolunteerRoleId(null)
      teamRoles.refresh()
      setActionStatus(editingVolunteerRoleId ? 'Rol del ministerio actualizado' : 'Rol del ministerio creado')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error guardando rol')
    }
  }

  const handleStartEditVolunteerRole = (role: TeamRole) => {
    setEditingVolunteerRoleId(role.id)
    setMinistryRoleForm({
      name: role.name,
      level: role.level ? String(role.level) : '',
      ministry_id: role.ministry_id ? String(role.ministry_id) : '',
    })
  }

  const handleCancelEditVolunteerRole = () => {
    setEditingVolunteerRoleId(null)
    setMinistryRoleForm({ name: '', level: '', ministry_id: '' })
  }

  const handleDeleteVolunteerRole = async (roleId: number) => {
    setActionStatus(null)
    try {
      await fetchJson(buildUrl('ministries', `/team-roles/${roleId}`), { method: 'DELETE' })
      if (editingVolunteerRoleId === roleId) {
        setEditingVolunteerRoleId(null)
        setMinistryRoleForm({ name: '', level: '', ministry_id: '' })
      }
      teamRoles.refresh()
      setActionStatus('Rol eliminado')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error eliminando rol')
    }
  }

  const handleAssignMember = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    try {
      await postJson(buildUrl('ministries', '/team-members'), {
        person_id: Number(assignmentForm.person_id),
        team_id: Number(assignmentForm.team_id),
        role_id: assignmentForm.role_id ? Number(assignmentForm.role_id) : null,
        fecha_ingreso: new Date().toISOString().slice(0, 10),
        estado: 'activo',
      })
      setAssignmentForm({ person_id: '', ministry_id: '', team_id: '', role_id: '' })
      teamMembers.refresh()
      setActionStatus('Miembro asignado al equipo')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error asignando miembro')
    }
  }

  return (
    <div className="app">
      <AdminSidebar activeSection={activeSection} visibleSections={allowedSections} setActiveSection={handleSectionChange} onLogout={onLogout} />

      <main className="main">
          <AdminHeader />

        {allowedSections.length === 0 && (
          <Panel title="Sin acceso" subtitle="Tu usuario no tiene módulos asignados en Administración.">
            Solicita a un administrador que te asigne permisos para esta vista.
          </Panel>
        )}

        {allowedSections.includes('resumen') && activeSection === 'resumen' && (
          <DashboardSummary
            ministriesCount={ministries.data.length}
            peopleCount={people.data.length}
            participationTotal={participation.data.total_activos}
            upcomingEvents={upcomingEvents}
            pendingReservations={pendingReservations}
            facilitiesCount={facilities.data.length}
            reservationByEventId={reservationByEventId}
            facilitiesById={facilitiesById}
            ministriesById={ministriesById}
            eventsWithoutReservation={eventsWithoutReservation}
            onNavigate={(section) => handleSectionChange(section)}
          />
        )}
        {allowedSections.includes('usuarios') && activeSection === 'usuarios' && <AdminUsersPanel />}

        {actionStatus && <div className="notice">{actionStatus}</div>}

        {allowedSections.includes('ministerios') && activeSection === 'ministerios' && (
          <MinistriesPanel
            ministries={ministries.data}
            ministriesLoading={ministries.loading}
            ministriesError={ministries.error}
            teams={teams.data}
            teamsLoading={teams.loading}
            teamsError={teams.error}
            teamRoles={teamRoles.data}
            ministriesById={ministriesById}
            editingMinistryId={editingMinistryId}
            editingMinistryName={editingMinistryName}
            editingMinistryParentId={editingMinistryParentId}
            setEditingMinistryName={setEditingMinistryName}
            setEditingMinistryParentId={setEditingMinistryParentId}
            handleStartEditMinistry={handleStartEditMinistry}
            handleSaveMinistryName={handleSaveMinistryName}
            handleCancelEditMinistry={handleCancelEditMinistry}
            handleDeleteMinistry={handleDeleteMinistry}
            ministryForm={ministryForm}
            setMinistryForm={setMinistryForm}
            teamForm={teamForm}
            setTeamForm={setTeamForm}
            ministryRoleForm={ministryRoleForm}
            setMinistryRoleForm={setMinistryRoleForm}
            ministryRoleFilterId={ministryRoleFilterId}
            setMinistryRoleFilterId={setMinistryRoleFilterId}
            teamFilterMinistryId={teamFilterMinistryId}
            setTeamFilterMinistryId={setTeamFilterMinistryId}
            handleCreateMinistry={handleCreateMinistry}
            handleCreateTeam={handleCreateTeam}
            handleCreateMinistryRole={handleCreateMinistryRole}
          />
        )}

        {allowedSections.includes('voluntarios') && activeSection === 'voluntarios' && (
          <VolunteersPanel
            teamMembersCount={teamMembers.data.length}
            volunteersByMinistrySize={volunteersByMinistry.size}
            rolesAverage={
              ministries.data.length
                ? Math.round((teamRoles.data.length / ministries.data.length) * 10) / 10
                : 0
            }
            volunteersByMinistryChart={volunteersByMinistryChart}
            assignmentSearch={assignmentSearch}
            setAssignmentSearch={setAssignmentSearch}
            assignmentForm={assignmentForm}
            setAssignmentForm={setAssignmentForm}
            filteredAssignmentPeople={filteredAssignmentPeople}
            teamsByMinistry={teamsByMinistry}
            rolesByMinistry={rolesByMinistry}
            handleAssignMember={handleAssignMember}
            ministries={ministries.data}
            ministryRoleForm={ministryRoleForm}
            setMinistryRoleForm={setMinistryRoleForm}
            handleCreateMinistryRole={handleCreateMinistryRole}
            editingVolunteerRoleId={editingVolunteerRoleId}
            handleStartEditVolunteerRole={handleStartEditVolunteerRole}
            handleCancelEditVolunteerRole={handleCancelEditVolunteerRole}
            handleDeleteVolunteerRole={handleDeleteVolunteerRole}
            volunteerMinistryRoleFilterId={volunteerMinistryRoleFilterId}
            setVolunteerMinistryRoleFilterId={setVolunteerMinistryRoleFilterId}
            teamRoles={teamRoles.data}
            teamRolesLoading={teamRoles.loading}
            teamRolesError={teamRoles.error}
            ministriesById={ministriesById}
          />
        )}

        {allowedSections.includes('seguimiento') && activeSection === 'seguimiento' && (
          <TrackingPanel
            demographicTotal={demographicSummary.total}
            serversCount={serversCount}
            genderDoughnut={genderDoughnut}
            agePyramid={agePyramid}
            maritalDoughnut={maritalDoughnut}
            maritalHasData={demographicSummary.maritalList.length > 0}
            trackingSearch={trackingSearch}
            setTrackingSearch={setTrackingSearch}
            filteredTrackingRows={filteredTrackingRows as Record<string, unknown>[]}
            peopleLoading={people.loading}
            teamMembersLoading={teamMembers.loading}
            peopleError={people.error}
          />
        )}

        {allowedSections.includes('consejerias') && activeSection === 'consejerias' && (
          <ConsejeriaPanel
            consejerias={consejerias.data}
            consejeriasLoading={consejerias.loading}
            consejeriasError={consejerias.error}
            people={people.data}
            serverPeople={serverPeople}
            peopleById={peopleById}
            consejeriaForm={consejeriaForm}
            setConsejeriaForm={setConsejeriaForm}
            consejeriaSearch={consejeriaSearch}
            setConsejeriaSearch={setConsejeriaSearch}
            handleCreateConsejeria={handleCreateConsejeria}
            handleStartEditConsejeria={handleStartEditConsejeria}
            handleCloseConsejeria={handleCloseConsejeria}
            handleCancelConsejeriaEdit={handleCancelConsejeriaEdit}
          />
        )}

        {allowedSections.includes('calendario') && activeSection === 'calendario' && (
          <CalendarPanel
            calendarMonthLabel={calendarMonthLabel}
            calendarDays={calendarDays}
            calendarItemsByDate={calendarItemsByDate}
            onPrevMonth={() =>
              setCalendarMonth(
                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
              )
            }
            onNextMonth={() =>
              setCalendarMonth(
                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
              )
            }
            onDayClick={handleCalendarDayClick}
            eventsById={eventsById}
            reservations={reservations.data}
            peopleById={peopleById}
            timelineByEventId={timelineByEventId}
            calendarEventForm={calendarEventForm}
            setCalendarEventForm={setCalendarEventForm}
            calendarReservationForm={calendarReservationForm}
            setCalendarReservationForm={setCalendarReservationForm}
            reservationStartTime={reservationStartTime}
            setReservationStartTime={setReservationStartTime}
            reservationEndTime={reservationEndTime}
            setReservationEndTime={setReservationEndTime}
            responsableName={responsableName}
            setResponsableName={setResponsableName}
            ministries={ministries.data}
            facilities={facilities.data}
            people={people.data}
            serverPeople={serverPeople}
            onSubmit={handleCalendarCombinedSubmit}
            onClear={handleCalendarCombinedClear}
            onDelete={handleCalendarCombinedDelete}
          />
        )}

        {allowedSections.includes('metricas') && activeSection === 'metricas' && (
          <MetricsPanel
            teamMembersCount={teamMembers.data.length}
            volunteersByMinistrySize={volunteersByMinistry.size}
            rolesAverage={
              ministries.data.length
                ? Math.round((teamRoles.data.length / ministries.data.length) * 10) / 10
                : 0
            }
            volunteersByMinistryChart={volunteersByMinistryChart}
            demographicTotal={demographicSummary.total}
            serversCount={serversCount}
            genderDoughnut={genderDoughnut}
            agePyramid={agePyramid}
            maritalDoughnut={maritalDoughnut}
            maritalHasData={demographicSummary.maritalList.length > 0}
            participationHistory={participationHistory}
            participationChart={participationChart}
            chartOptions={chartOptions}
            participationTotals={participation.data}
          />
        )}

        {allowedSections.includes('mapa') && activeSection === 'mapa' && (
          <MapPanel
            ministries={ministries.data}
            ministriesByParent={ministriesByParent}
            teams={teams.data}
            membersByTeam={membersByTeam}
            rolesById={rolesById}
            peopleById={peopleById}
            activeMapMinistryId={activeMapMinistryId}
            setActiveMapMinistryId={setActiveMapMinistryId}
          />
        )}

        {allowedSections.includes('proveedores') && activeSection === 'proveedores' && <VendorsPanel />}
      </main>
    </div>
  )
}

export default AdminApp
