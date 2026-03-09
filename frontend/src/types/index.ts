export type Column = {
  key: string
  label?: string
}

export type Ministry = { id: number; name: string; description?: string | null; parent_id?: number | null }
export type Event = { id: number; name: string; date?: string | null; ministry_id?: number | null; schedule?: string | null }
export type EventSchedule = { id: number; event_id: number; inicio?: string | null; fin?: string | null; tipo?: string | null; observacion?: string | null; encargado_person_id?: number | null }
export type ParticipationReport = { total_activos: number; total_voluntarios: number }
export type ParticipationSnapshot = { fecha: string; total_activos: number; total_voluntarios: number }
export type Team = { id: number; name: string; ministry_id?: number | null; description?: string | null }
export type Facility = { id: number; name: string; location?: string | null; capacity?: number | null }
export type Reservation = {
  id: number
  facility_id: number
  event_id?: number | null
  inicio?: string | null
  fin?: string | null
  responsable_person_id?: number | null
  estado?: string | null
}
export type TeamMember = {
  id: number
  person_id: number
  team_id: number
  role_id?: number | null
  fecha_ingreso?: string | null
  estado?: string | null
}
export type TeamRole = { id: number; name: string; level?: number | null; ministry_id?: number | null }
export type Person = {
  id: number
  name: string
  email?: string | null
  phone?: string | null
  status?: string | null
  birth_date?: string | null
  gender?: string | null
  marital_status?: string | null
}

export type DiscipleshipCourse = {
  id: number
  name: string
  description?: string | null
  level?: string | null
}

export type PersonDiscipleshipRecord = {
  id: number
  person_id: number
  course_id: number
  completed_on?: string | null
  status?: string | null
  notes?: string | null
}

export type Consejeria = {
  id: number
  solicitante_person_id: number
  consejero_person_id: number
  fecha: string
  motivo: string
  observaciones?: string | null
  estado?: string | null
}

export type Song = {
  id: number
  name: string
  author?: string | null
  bpm?: number | null
  key?: string | null
  chord_chart_pdf_url?: string | null
  youtube_url?: string | null
  lyrics_markdown?: string | null
}
export type Repertoire = { id: number; event_id: number }
export type RepertoireSong = {
  id: number
  repertoire_id: number
  song_id: number
  orden?: number | null
  tonalidad_override?: string | null
  bpm_override?: number | null
}

export type MultitrackStem = {
  id: number
  song_id: number
  stem_name: string
  filename: string
  format: string
  content_type?: string | null
  url: string
  created_at: string
}

export type MultitrackWaveform = {
  song_id: number
  bins: number[]
  bins_count: number
  created_at: string
  updated_at: string
}

export type MultitrackStructureEntry = {
  time: string
  section: string
}

export type MultitrackSongStructure = {
  song: string
  structure: MultitrackStructureEntry[]
}

export type MultitrackGuideAudio = {
  song_id: number
  filename: string
  content_type: string
  url: string
}

export type MultitrackAnalysisStatus = {
  song_id: number
  status: 'queued' | 'running' | 'done' | 'failed' | 'not_applicable' | string
  sections_found: number
  attempts: number
  updated_at: string
  detail?: string | null
}

export type MultitrackMixAudio = {
  song_id: number
  filename: string
  content_type: string
  url: string
}

export type Shift = { id: number; event_id: number; role_id: number; inicio?: string | null; fin?: string | null }
export type ShiftAssignment = { id: number; shift_id: number; person_id: number; estado?: string | null }
