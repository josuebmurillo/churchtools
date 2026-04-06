import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { getPlatform, isMobile } from '../utils/platform'
import { useQuery } from '@tanstack/react-query'
import { useStemStore } from '../store/stemStore'
import type { StemState } from '../store/stemStore'
import WaveSurfer from 'wavesurfer.js'
// import StemWaveform, { type SectionMarker as StemSectionMarker } from '../components/StemWaveform'
import Panel from '../components/Panel'
import MusicHeader from '../components/MusicHeader'
import MusicSidebar, { type MusicSection } from '../components/MusicSidebar'
import { useApiData } from '../hooks/useApiData'
import { buildUrl, fetchJson, postJson } from '../services/api'
import type { Event, EventSchedule, MultitrackAnalysisStatus, MultitrackGuideAudio, MultitrackSongStructure, MultitrackStructureEntry, MultitrackWaveform, Repertoire, RepertoireSong, Song } from '../types'
import { buildCalendarDays } from '../utils/calendar'

type MusicAppProps = {
  onLogout: () => void
}

type StemMixerConfig = {
  volume: number
  solo: boolean
  muted: boolean
}

type StemLoadStatus = 'pending' | 'ready' | 'error'
type PracticeMode = 'event' | 'library'
type SetlistEditorItem = {
  id: number
  songId: number
  order: number
  name: string
  key: string | number
  bpm: string | number
  pdf: string
  mediaUrl: string
  lyrics: string
}

type WorshipCalendarItem = {
  id: string
  eventId: number
  title: string
  timeLabel: string
}

type SectionMarker = {
  time: string
  section: string
  seconds: number
  label: string
}

const DRIFT_THRESHOLD_SECONDS = 0.015
const REBUFFER_FLOOR_SECONDS = 0.18
const REBUFFER_RESUME_SECONDS = 0.45
const REBUFFER_CONSECUTIVE_TICKS = 2
const MIN_READY_STEMS_TO_START = 2
const REBUFFER_GRACE_MS = 900
const INITIAL_PLAY_PARALLEL = 8
const LATE_JOIN_MIN_BUFFER_SECONDS = 0.12
const LATE_JOIN_FORCE_AFTER_MS = 1200
const STEM_END_TOLERANCE_SECONDS = 0.08
const WAVEFORM_BINS = 180
const GUIDE_FETCH_RETRIES = 12
const FETCH_RETRY_DELAY_MS = 5000
const STRUCTURE_PROGRESS_POLL_ATTEMPTS = 6
const MULTITRACK_DELETE_TIMEOUT_MS = 45_000
const GUIDE_SYNTHETIC_STEM_OFFSET = 100_000

type PlaybackTuning = {
  bufferTargetSeconds: number
  minReadyToStartBase: number
  rebufferFloorSeconds: number
  rebufferResumeSeconds: number
  rebufferConsecutiveTicks: number
  rebufferGraceMs: number
  initialPlayParallel: number
  lateJoinMinBufferSeconds: number
  lateJoinForceAfterMs: number
}

const EMPTY_WAVEFORM_BARS = Array.from({ length: WAVEFORM_BINS }, () => 0.1)

const MusicApp = ({ onLogout }: MusicAppProps) => {
  // Estados y setters para mixer y stems
  const [stemMixerConfig, setStemMixerConfig] = useState<Record<number, StemMixerConfig>>({});
  const [stemLoadStatusById, setStemLoadStatusById] = useState<Record<number, StemLoadStatus>>({});
  const [stemBufferedSecondsById, setStemBufferedSecondsById] = useState<Record<number, number>>({});
  const [mixerPosition, setMixerPosition] = useState(0);
  const [mixerPlaying, setMixerPlaying] = useState(false);
  const [mixerDuration, setMixerDuration] = useState(0);
  const [mixerRebuffering, setMixerRebuffering] = useState(false);
  const [waveformBySongId, setWaveformBySongId] = useState<Record<number, number[]>>({});
  const [waveformLoadingSongId, setWaveformLoadingSongId] = useState<number | null>(null);
  const events = useApiData<Event[]>(buildUrl('events', '/events'), [])
  const schedules = useApiData<EventSchedule[]>(buildUrl('events', '/event-schedules'), [])
  const songs = useApiData<Song[]>(buildUrl('music', '/songs'), [])
  // Usar react-query para obtener stems
  // Tipar correctamente la respuesta de react-query
  type MultitrackStem = {
    id: number | string;
    song_id?: number;
    stem_name?: string;
    url: string;
    media_url?: string;
    format: string;
    [key: string]: any;
  };

  const { data: multitrackStems = [] } = useQuery<MultitrackStem[]>({
    queryKey: ['multitrackStems'],
    queryFn: () => fetchJson(buildUrl('multitracks', '/stems')),
    staleTime: 1000 * 60,
  });

  // Guardar stems en zustand store
  const setStems = useStemStore((state: StemState) => state.setStems);
  useEffect(() => {
    if (Array.isArray(multitrackStems) && multitrackStems.length > 0) {
      setStems(
        multitrackStems.map((stem) => ({
          id: String(stem.id),
          url: stem.media_url || stem.url,
          volume: 1,
          muted: false,
          solo: false,
          loaded: false,
          format: typeof stem.format === 'string' ? stem.format : '',
        }))
      );
    }
  }, [multitrackStems, setStems]);

  // Ejemplo de integración con wavesurfer.js para multipista
  const stems = useStemStore((state: StemState) => state.stems);
  const wavesurferRefs = useRef<Record<string, WaveSurfer>>({});

  useEffect(() => {
    const platform = getPlatform();
    const isMobileDevice = isMobile();
    stems.forEach((stem: typeof stems[number]) => {
      if (!wavesurferRefs.current[stem.id] && stem.url) {
        const container = document.getElementById(`waveform-${stem.id}`);
        if (container) {
          // Ajustar opciones según plataforma
          let wsOptions: any = {
            container,
            waveColor: '#a0aec0',
            progressColor: '#3182ce',
            cursorColor: '#2d3748',
            height: isMobileDevice ? 40 : 60,
            url: stem.url,
          };
          // Usar solo la variable format
          const format = typeof stem.format === 'string' ? stem.format : '';
          if (platform === 'ios' && format === 'm4a') {
            wsOptions.url = stem.url.replace(/\.(mp3|wav)$/i, '.m4a');
          } else if (platform === 'android' && format === 'mp3') {
            wsOptions.url = stem.url.replace(/\.(m4a|wav)$/i, '.mp3');
          }
          // PC: sin cambios, pero podrías aumentar calidad si lo deseas
          wavesurferRefs.current[stem.id] = WaveSurfer.create(wsOptions);
        }
      }
    });
    return () => {
      Object.values(wavesurferRefs.current).forEach((ws) => ws.destroy());
      wavesurferRefs.current = {};
    };
  }, [stems]);
  const repertoires = useApiData<Repertoire[]>(buildUrl('music', '/repertoires'), [])
  const repertoireSongs = useApiData<RepertoireSong[]>(buildUrl('music', '/repertoire-songs'), [])

  const [songForm, setSongForm] = useState({
    id: '',
    name: '',
    author: '',
    bpm: '',
    key: '',
    pdf: '',
    youtube: '',
    lyrics: '',
  })
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [savingSong, setSavingSong] = useState(false)
  const [setlistForm, setSetlistForm] = useState({
    song_id: '',
    tonalidad_override: '',
    bpm_override: '',
  })
  const [songSearch, setSongSearch] = useState('')
  const [showSongEditor, setShowSongEditor] = useState(false)
  const [fullScreenPdfUrl, setFullScreenPdfUrl] = useState<string | null>(null)
  const [mediaThumbnailsBySongId, setMediaThumbnailsBySongId] = useState<Record<number, string>>({})
  const [multitrackZipFile, setMultitrackZipFile] = useState<File | null>(null)
  const [uploadingMultitrackZip, setUploadingMultitrackZip] = useState(false)
  const [uploadingSongId, setUploadingSongId] = useState<number | null>(null)
  const [uploadStartedAtMs, setUploadStartedAtMs] = useState<number | null>(null)
  const [uploadClockTick, setUploadClockTick] = useState(0)
  const [smoothedEtaSeconds, setSmoothedEtaSeconds] = useState<number | null>(null)
  const [deletingMultitracksSongId, setDeletingMultitracksSongId] = useState<number | null>(null)
  // El manejo de mixerPlaying, mixerPosition, etc. puede migrarse a zustand si se requiere estado global
    // Renderizar formas de onda de stems
    // ...en el JSX, ejemplo:
    // stems.map(stem => <div key={stem.id} id={`waveform-${stem.id}`} />)
  const [structureMarkersBySongId, setStructureMarkersBySongId] = useState<Record<number, SectionMarker[] | null>>({})
  const [guideAudioBySongId, setGuideAudioBySongId] = useState<Record<number, MultitrackGuideAudio | null>>({})
  const [analysisStatusBySongId, setAnalysisStatusBySongId] = useState<Record<number, MultitrackAnalysisStatus | null>>({})
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [focusedSongId, setFocusedSongId] = useState<number | null>(null)
  const [libraryPracticeSongId, setLibraryPracticeSongId] = useState<number | null>(null)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('event')
  const [rehearsalNotesByRepertoire, setRehearsalNotesByRepertoire] = useState<Record<string, string>>({})
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<MusicSection>('general')
  const [chartViewMode, setChartViewMode] = useState<'pdf' | 'lyrics'>('pdf')
  const [draggingSetlistItemId, setDraggingSetlistItemId] = useState<number | null>(null)
  const [dragOverSetlistItemId, setDragOverSetlistItemId] = useState<number | null>(null)
  const [isDragOverSetlistEnd, setIsDragOverSetlistEnd] = useState(false)
  const [setlistOrderOverrideIds, setSetlistOrderOverrideIds] = useState<number[] | null>(null)
  const [savingSetlistOrder, setSavingSetlistOrder] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const calendarClickTimeoutRef = useRef<number | null>(null)
  const setlistItemRefs = useRef<Record<number, HTMLElement | null>>({})
  const previousSetlistPositionsRef = useRef<Record<number, number>>({})
  const audioContextRef = useRef<AudioContext | null>(null)
  const stemAudioRefs = useRef<Record<number, HTMLAudioElement>>({})
  const stemMediaSourceRefs = useRef<Record<number, MediaElementAudioSourceNode>>({})
  const stemGainRefs = useRef<Record<number, GainNode>>({})
  const stemAnalyserRefs = useRef<Record<number, AnalyserNode>>({})
  // (eliminada variable stemAudioBufferRefs, ya no se usa)
  const activeBufferSourceRefs = useRef<Record<number, AudioBufferSourceNode>>({})
  const audioContextStartTimeRef = useRef<number | null>(null)
  const isUsingAudioBufferRef = useRef(false)
  const stemMeterDataRefs = useRef<Record<number, Uint8Array>>({})
  const stemMeterFillRefs = useRef<Record<number, HTMLSpanElement | null>>({})
  const meterAnimationFrameRef = useRef<number | null>(null)
  const rebufferLockRef = useRef(false)
  const lowBufferStreakRef = useRef(0)
  const rebufferPollTimeoutRef = useRef<number | null>(null)
  const playStartedAtRef = useRef(0)
  const pendingLateJoinCountRef = useRef(0)

  const playbackTuning = useMemo<PlaybackTuning>(() => {
    if (typeof window === 'undefined') {
      return {
        bufferTargetSeconds: 4,
        minReadyToStartBase: MIN_READY_STEMS_TO_START,
        rebufferFloorSeconds: REBUFFER_FLOOR_SECONDS,
        rebufferResumeSeconds: REBUFFER_RESUME_SECONDS,
        rebufferConsecutiveTicks: REBUFFER_CONSECUTIVE_TICKS,
        rebufferGraceMs: REBUFFER_GRACE_MS,
        initialPlayParallel: INITIAL_PLAY_PARALLEL,
        lateJoinMinBufferSeconds: LATE_JOIN_MIN_BUFFER_SECONDS,
        lateJoinForceAfterMs: LATE_JOIN_FORCE_AFTER_MS,
      }
    }

    const nav = window.navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean }
      deviceMemory?: number
    }

    const effectiveType = String(nav.connection?.effectiveType ?? '').toLowerCase()
    const saveData = Boolean(nav.connection?.saveData)
    const deviceMemory = Number.isFinite(nav.deviceMemory) ? Number(nav.deviceMemory) : undefined
    const cpuCores = Number.isFinite(nav.hardwareConcurrency) ? Number(nav.hardwareConcurrency) : undefined

    const slowConnection = effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g'
    const lowMemory = typeof deviceMemory === 'number' && deviceMemory <= 4
    const lowCpu = typeof cpuCores === 'number' && cpuCores <= 4
    const constrained = saveData || slowConnection || lowMemory || lowCpu

    if (!constrained) {
      return {
        bufferTargetSeconds: 4,
        minReadyToStartBase: MIN_READY_STEMS_TO_START,
        rebufferFloorSeconds: REBUFFER_FLOOR_SECONDS,
        rebufferResumeSeconds: REBUFFER_RESUME_SECONDS,
        rebufferConsecutiveTicks: REBUFFER_CONSECUTIVE_TICKS,
        rebufferGraceMs: REBUFFER_GRACE_MS,
        initialPlayParallel: INITIAL_PLAY_PARALLEL,
        lateJoinMinBufferSeconds: LATE_JOIN_MIN_BUFFER_SECONDS,
        lateJoinForceAfterMs: LATE_JOIN_FORCE_AFTER_MS,
      }
    }

    return {
      bufferTargetSeconds: 6,
      minReadyToStartBase: 3,
      rebufferFloorSeconds: 0.38,
      rebufferResumeSeconds: 1.2,
      rebufferConsecutiveTicks: 3,
      rebufferGraceMs: 2600,
      initialPlayParallel: 4,
      lateJoinMinBufferSeconds: 0.35,
      lateJoinForceAfterMs: 3600,
    }
  }, [])

  const autoBufferTargetSeconds = playbackTuning.bufferTargetSeconds

  const normalizeApiMediaUrl = (url: string | null | undefined) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/api/')) return url
    if (url.startsWith('/')) return `/api${url}`
    return url
  }

  type MediaProvider = 'youtube' | 'soundcloud' | 'spotify' | 'apple' | 'unknown'

  const getMediaProvider = (rawUrl: string | null | undefined): MediaProvider => {
    if (!rawUrl) return 'unknown'
    const value = rawUrl.trim()
    if (!value) return 'unknown'
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return 'youtube'

    try {
      const parsed = new URL(value)
      const host = parsed.hostname.replace('www.', '')
      if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube'
      if (host.endsWith('soundcloud.com') || host === 'snd.sc' || host === 'w.soundcloud.com') return 'soundcloud'
      if (host.endsWith('spotify.com')) return 'spotify'
      if (host.endsWith('music.apple.com') || host.endsWith('itunes.apple.com') || host.endsWith('embed.music.apple.com')) {
        return 'apple'
      }
    } catch {
      return 'unknown'
    }

    return 'unknown'
  }

  const parseStructureTimeToSeconds = (timeValue: string) => {
    const value = timeValue.trim()
    const match = value.match(/^(\d+):(\d{2}\.\d{3})$/)
    if (!match) return Number.NaN
    const minutes = Number(match[1])
    const seconds = Number(match[2])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return Number.NaN
    return (minutes * 60) + seconds
  }

  const getSectionMarkerLabel = (section: string) => {
    const raw = section.trim()
    if (!raw) return '?'

    const knownCodes: Record<string, string> = {
      i: 'I',
      v: 'V',
      c: 'C',
      p: 'P',
      pc: 'PC',
      rf: 'RF',
      it: 'It',
      in: 'In',
      o: 'O',
    }

    const normalized = raw.toLowerCase()
    if (knownCodes[normalized]) {
      return knownCodes[normalized]
    }

    if (/^v\d+$/i.test(raw)) {
      return `V${raw.slice(1)}`
    }

    const words = raw
      .split(/\s+/)
      .filter(Boolean)

    if (words.length === 0) return '?'
    if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
    return words.map((word) => word.slice(0, 1).toUpperCase()).join('')
  }

  const renderLyricsMarkdown = (rawMarkdown: string) => {
    const markdown = rawMarkdown.trim()
    if (!markdown) {
      return <p className="music-lyrics-empty">No hay letra disponible para esta canción.</p>
    }

    const blocks = markdown
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)

    return blocks.map((block, index) => {
      const heading1 = block.match(/^#\s+(.+)$/)
      if (heading1) {
        return <h1 key={`lyrics-h1-${index}`}>{heading1[1].trim()}</h1>
      }

      const heading2 = block.match(/^##\s+(.+)$/)
      if (heading2) {
        return <h2 key={`lyrics-h2-${index}`}>{heading2[1].trim()}</h2>
      }

      const lines = block.split('\n')
      return (
        <p key={`lyrics-p-${index}`}>
          {lines.map((line, lineIndex) => (
            <span key={`lyrics-line-${index}-${lineIndex}`}>
              {line}
              {lineIndex < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      )
    })
  }

  const extractYouTubeVideoId = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return ''
    const value = rawUrl.trim()
    if (!value) return ''
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value

    try {
      const parsed = new URL(value)
      const host = parsed.hostname.replace('www.', '')

      if (host === 'youtu.be') {
        return parsed.pathname.split('/').filter(Boolean)[0] ?? ''
      }

      if (host.endsWith('youtube.com')) {
        if (parsed.pathname === '/watch') return parsed.searchParams.get('v') ?? ''
        if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] ?? ''
        if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] ?? ''
        if (parsed.pathname.startsWith('/live/')) return parsed.pathname.split('/')[2] ?? ''
        if (parsed.pathname.startsWith('/v/')) return parsed.pathname.split('/')[2] ?? ''
      }
    } catch {
      return ''
    }

    return ''
  }

  const getMediaEmbedUrl = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return ''
    const value = rawUrl.trim()
    if (!value) return ''

    const provider = getMediaProvider(value)
    if (provider === 'youtube') {
      const videoId = extractYouTubeVideoId(value)
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0` : ''
    }

    try {
      const parsed = new URL(value)
      const host = parsed.hostname.replace('www.', '')

      if (provider === 'soundcloud') {
        return `https://w.soundcloud.com/player/?url=${encodeURIComponent(value)}&color=%237c5cff&auto_play=false&hide_related=false&show_comments=false&show_user=true&show_reposts=false&visual=true`
      }

      if (provider === 'spotify') {
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          const mediaType = parts[0]
          const mediaId = parts[1]
          if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(mediaType)) {
            return `https://open.spotify.com/embed/${mediaType}/${mediaId}?utm_source=generator`
          }
        }
      }

      if (provider === 'apple') {
        if (host.startsWith('embed.music.apple.com')) return value
        const cleanPath = parsed.pathname.startsWith('/embed/') ? parsed.pathname : `/embed${parsed.pathname}`
        return `https://embed.music.apple.com${cleanPath}${parsed.search}`
      }
    } catch {
      return ''
    }

    return ''
  }

  const normalizeMediaUrl = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return null
    const value = rawUrl.trim()
    if (!value) return null

    const provider = getMediaProvider(value)
    if (provider === 'youtube') {
      const videoId = extractYouTubeVideoId(value)
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
    }

    return provider === 'unknown' ? null : value
  }

  const getMediaPlaceholderLabel = (provider: MediaProvider, songName: string) => {
    if (provider === 'youtube') return 'YT'
    if (provider === 'soundcloud') return 'SC'
    if (provider === 'spotify') return 'SP'
    if (provider === 'apple') return 'AM'
    return songName.slice(0, 1).toUpperCase()
  }

  const getYouTubeThumbnailUrl = (rawUrl: string | null | undefined) => {
    const videoId = extractYouTubeVideoId(rawUrl)
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''
  }

  const normalizeAppleArtworkUrl = (rawArtworkUrl: string | null | undefined) => {
    if (!rawArtworkUrl) return ''
    const value = rawArtworkUrl.trim()
    if (!value) return ''
    return value
      .replace(/\/\d+x\d+bb(?=\.(jpg|jpeg|png))/i, '/1200x1200bb')
      .replace(/\{w\}x\{h\}bb(?=\.(jpg|jpeg|png))/i, '1200x1200bb')
  }

  const parseAppleMediaIds = (rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl)
      const trackId = parsed.searchParams.get('i') ?? ''
      const pathParts = parsed.pathname.split('/').filter(Boolean)
      const albumId = pathParts[pathParts.length - 1] ?? ''

      const sanitizeId = (candidate: string) => (candidate && /^\d+$/.test(candidate) ? candidate : '')

      return {
        trackId: sanitizeId(trackId),
        albumId: sanitizeId(albumId),
      }
    } catch {
      return {
        trackId: '',
        albumId: '',
      }
    }
  }

  const fetchAppleThumbnailFromLookup = async (rawUrl: string) => {
    const { trackId, albumId } = parseAppleMediaIds(rawUrl)
    const idsToTry = [trackId, albumId].filter((id, index, all) => Boolean(id) && all.indexOf(id) === index)

    for (const id of idsToTry) {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${id}`)
      if (!response.ok) continue

      const payload = (await response.json()) as {
        results?: Array<{ artworkUrl100?: string; artworkUrl60?: string }>
      }
      const artwork = payload.results?.find((item) => item.artworkUrl100 || item.artworkUrl60)
      const normalized = normalizeAppleArtworkUrl(artwork?.artworkUrl100 ?? artwork?.artworkUrl60 ?? '')
      if (normalized) return normalized
    }

    return ''
  }

  const resolveMediaThumbnail = async (rawUrl: string | null | undefined) => {
    if (!rawUrl) return ''
    const value = rawUrl.trim()
    if (!value) return ''

    const provider = getMediaProvider(value)
    if (provider === 'youtube') {
      return getYouTubeThumbnailUrl(value)
    }

    const fetchOEmbedThumbnail = async (endpoint: string) => {
      const response = await fetch(endpoint)
      if (!response.ok) return ''
      const payload = (await response.json()) as { thumbnail_url?: string }
      return payload.thumbnail_url ?? ''
    }

    try {
      if (provider === 'soundcloud') {
        return await fetchOEmbedThumbnail(
          `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(value)}`
        )
      }

      if (provider === 'spotify') {
        return await fetchOEmbedThumbnail(
          `https://open.spotify.com/oembed?url=${encodeURIComponent(value)}`
        )
      }

      if (provider === 'apple') {
        const oEmbedThumbnail = await fetchOEmbedThumbnail(
          `https://embed.music.apple.com/oembed?url=${encodeURIComponent(value)}`
        )
        if (oEmbedThumbnail) return oEmbedThumbnail

        return await fetchAppleThumbnailFromLookup(value)
      }
    } catch {
      return ''
    }

    return ''
  }

  useEffect(() => {
    try {
      const persisted = localStorage.getItem('music_rehearsal_notes_v1')
      if (!persisted) return
      const parsed = JSON.parse(persisted) as unknown
      if (parsed && typeof parsed === 'object') {
        setRehearsalNotesByRepertoire(parsed as Record<string, string>)
      }
    } catch {
      setRehearsalNotesByRepertoire({})
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadThumbnails = async () => {
      const results = await Promise.all(
        songs.data.map(async (song) => {
          const thumbnail = await resolveMediaThumbnail(song.youtube_url)
          return [song.id, thumbnail] as const
        })
      )

      if (cancelled) return

      const next: Record<number, string> = {}
      results.forEach(([songId, thumbnail]) => {
        if (thumbnail) {
          next[songId] = thumbnail
        }
      })
      setMediaThumbnailsBySongId(next)
    }

    void loadThumbnails()

    return () => {
      cancelled = true
    }
  }, [songs.data])

  const eventsById = useMemo(() => {
    const map = new Map<number, Event>()
    events.data.forEach((event) => map.set(event.id, event))
    return map
  }, [events.data])

  const worshipSchedules = useMemo(
    () =>
      schedules.data.filter((schedule) => {
        if (!schedule.tipo) return false
        const tipo = schedule.tipo.toLowerCase()
        return (
          tipo === 'worship' ||
          tipo.includes('alabanza') ||
          tipo.includes('adoracion') ||
          tipo.includes('adoración')
        )
      }),
    [schedules.data]
  )

  const repertoriesByEventId = useMemo(() => {
    const map = new Map<number, Repertoire>()
    repertoires.data.forEach((item) => {
      if (!map.has(item.event_id)) {
        map.set(item.event_id, item)
      }
    })
    return map
  }, [repertoires.data])

  const rehearsalCards = useMemo(
    () =>
      worshipSchedules
        .map((schedule) => {
          const event = eventsById.get(schedule.event_id)
          const repertoire = repertoriesByEventId.get(schedule.event_id)
          const songsCount = repertoire
            ? repertoireSongs.data.filter((item) => item.repertoire_id === repertoire.id).length
            : 0
          return {
            schedule,
            event,
            repertoire,
            songsCount,
            eventName: event?.name ?? `Evento #${schedule.event_id}`,
            date: event?.date ?? '',
            startTime: schedule.inicio?.split('T')[1]?.slice(0, 5) ?? '—',
            endTime: schedule.fin?.split('T')[1]?.slice(0, 5) ?? '—',
          }
        })
        .sort((a, b) => {
          const left = `${a.date}|${a.startTime}`
          const right = `${b.date}|${b.startTime}`
          return left.localeCompare(right)
        }),
    [worshipSchedules, eventsById, repertoriesByEventId, repertoireSongs.data]
  )

  const calendarMonthLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth]
  )

  const worshipCalendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth])

  const worshipCalendarItemsByDate = useMemo(() => {
    const map = new Map<string, WorshipCalendarItem[]>()
    const addItem = (dateKey: string, item: WorshipCalendarItem) => {
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)?.push(item)
    }

    rehearsalCards.forEach((item) => {
      const dateKey = item.date || item.schedule.inicio?.split('T')[0] || ''
      if (!dateKey) return
      addItem(dateKey, {
        id: `worship-calendar-${item.schedule.id}`,
        eventId: item.schedule.event_id,
        title: item.eventName,
        timeLabel: `${item.startTime} - ${item.endTime}`,
      })
    })

    map.forEach((items) => {
      items.sort((left, right) => left.timeLabel.localeCompare(right.timeLabel))
    })
    return map
  }, [rehearsalCards])

  useEffect(() => {
    if (rehearsalCards.length === 0) {
      setSelectedEventId(null)
      return
    }
    if (!selectedEventId || !rehearsalCards.some((item) => item.schedule.event_id === selectedEventId)) {
      setSelectedEventId(rehearsalCards[0].schedule.event_id)
    }
  }, [rehearsalCards, selectedEventId])

  const selectedRehearsal = useMemo(() => {
    if (!selectedEventId) return rehearsalCards[0] ?? null
    return rehearsalCards.find((item) => item.schedule.event_id === selectedEventId) ?? null
  }, [rehearsalCards, selectedEventId])

  const selectedRepertoire = selectedRehearsal?.repertoire ?? null

  const songsById = useMemo(() => {
    const map = new Map<number, Song>()
    songs.data.forEach((song) => map.set(song.id, song))
    return map
  }, [songs.data])

  const stemsBySongId = useMemo(() => {
    const map = new Map<number, any[]>()
    multitrackStems.forEach((stem: any) => {
      const songId = typeof stem.song_id === 'number' ? stem.song_id : Number(stem.song_id)
      if (!Number.isFinite(songId)) return
      const current = map.get(songId) ?? []
      current.push(stem)
      map.set(songId, current)
    })
    return map
  }, [multitrackStems])

  const setlistEditorItems = useMemo<SetlistEditorItem[]>(() => {
    if (!selectedRepertoire) return []
    const baseItems = repertoireSongs.data
      .filter((item) => item.repertoire_id === selectedRepertoire.id)
      .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
      .map((item) => {
        const song = songsById.get(item.song_id)
        return {
          id: item.id,
          songId: item.song_id,
          order: item.orden ?? 999,
          name: song?.name ?? `Canción #${item.song_id}`,
          key: item.tonalidad_override ?? song?.key ?? '—',
          bpm: item.bpm_override ?? song?.bpm ?? '—',
          pdf: normalizeApiMediaUrl(song?.chord_chart_pdf_url),
          mediaUrl: song?.youtube_url ?? '',
          lyrics: song?.lyrics_markdown ?? '',
        }
      })

    if (!setlistOrderOverrideIds || setlistOrderOverrideIds.length === 0) {
      return baseItems
    }

    const itemById = new Map(baseItems.map((item) => [item.id, item]))
    const ordered = setlistOrderOverrideIds.flatMap((id) => {
      const item = itemById.get(id)
      return item ? [item] : []
    })

    const remaining = baseItems.filter((item) => !setlistOrderOverrideIds.includes(item.id))
    return [...ordered, ...remaining]
  }, [selectedRepertoire, repertoireSongs.data, songsById, setlistOrderOverrideIds])

  const setlistSongs = useMemo(() => {
    return setlistEditorItems
  }, [setlistEditorItems])

  const setSetlistItemRef = (itemId: number, element: HTMLElement | null) => {
    setlistItemRefs.current[itemId] = element
  }

  useLayoutEffect(() => {
    const currentPositions: Record<number, number> = {}
    setlistEditorItems.forEach((item) => {
      const element = setlistItemRefs.current[item.id]
      if (!element) return
      currentPositions[item.id] = element.getBoundingClientRect().top
    })

    const previousPositions = previousSetlistPositionsRef.current
    setlistEditorItems.forEach((item) => {
      const element = setlistItemRefs.current[item.id]
      if (!element) return
      if (draggingSetlistItemId === item.id) return

      const previousTop = previousPositions[item.id]
      const currentTop = currentPositions[item.id]
      if (previousTop === undefined || currentTop === undefined) return

      const deltaY = previousTop - currentTop
      if (Math.abs(deltaY) < 1) return

      element.style.transition = 'none'
      element.style.transform = `translateY(${deltaY}px)`

      requestAnimationFrame(() => {
        element.style.transition = 'transform 220ms ease'
        element.style.transform = 'translateY(0)'
      })
    })

    previousSetlistPositionsRef.current = currentPositions
  }, [setlistEditorItems, draggingSetlistItemId])

  useEffect(() => {
    if (setlistSongs.length === 0) {
      setFocusedSongId(null)
      return
    }
    if (!focusedSongId || !setlistSongs.some((item) => item.songId === focusedSongId)) {
      setFocusedSongId(setlistSongs[0].songId)
    }
  }, [setlistSongs, focusedSongId])

  const focusedSongIndex = useMemo(
    () => setlistSongs.findIndex((item) => item.songId === focusedSongId),
    [setlistSongs, focusedSongId]
  )

  const currentSong = focusedSongIndex >= 0 ? setlistSongs[focusedSongIndex] : null
  const nextSong = focusedSongIndex >= 0 ? setlistSongs[focusedSongIndex + 1] ?? null : null
  const hasPreviousSong = focusedSongIndex > 0
  const hasNextSong = focusedSongIndex >= 0 && focusedSongIndex < setlistSongs.length - 1

  const libraryPracticeSong = useMemo(() => {
    if (!libraryPracticeSongId) return null
    const song = songsById.get(libraryPracticeSongId)
    if (!song) return null
    return {
      id: `library-${song.id}`,
      songId: song.id,
      order: 1,
      name: song.name,
      key: song.key ?? '—',
      bpm: song.bpm ?? '—',
      pdf: normalizeApiMediaUrl(song.chord_chart_pdf_url),
      mediaUrl: song.youtube_url ?? '',
      lyrics: song.lyrics_markdown ?? '',
    }
  }, [libraryPracticeSongId, songsById])

  const practiceSong = practiceMode === 'library' ? libraryPracticeSong : currentSong
  const currentSongMediaEmbed = getMediaEmbedUrl(practiceSong?.mediaUrl)
  const currentSongMediaLink = practiceSong?.mediaUrl?.trim() ?? ''
  const currentSongMediaProvider = getMediaProvider(practiceSong?.mediaUrl)
  const hasPracticePdf = Boolean(practiceSong?.pdf)
  const hasPracticeLyrics = Boolean(practiceSong?.lyrics?.trim())
  const shouldShowChartModeSwitch = hasPracticePdf && hasPracticeLyrics
  const showPracticeNavigation = practiceMode === 'event'

  useEffect(() => {
    if (chartViewMode === 'pdf' && !hasPracticePdf && hasPracticeLyrics) {
      setChartViewMode('lyrics')
      return
    }
    if (chartViewMode === 'lyrics' && !hasPracticeLyrics && hasPracticePdf) {
      setChartViewMode('pdf')
    }
  }, [chartViewMode, hasPracticePdf, hasPracticeLyrics])

  const currentSongStems = useMemo(() => {
    if (!practiceSong) return []
    const stems = stemsBySongId.get(practiceSong.songId) ?? []
    const sortedStems = [...stems].sort((a, b) => (a.stem_name ?? '').localeCompare(b.stem_name ?? ''))
    const guide = guideAudioBySongId[practiceSong.songId] ?? null
    if (!guide?.url) {
      return sortedStems
    }
    const guideFormat = guide.content_type?.includes('mpeg') ? 'mp3' : 'wav'
    const guideStem: MultitrackStem = {
      id: -(practiceSong.songId + GUIDE_SYNTHETIC_STEM_OFFSET),
      song_id: practiceSong.songId,
      stem_name: 'Guia',
      filename: guide.filename,
      format: guideFormat,
      content_type: guide.content_type,
      url: guide.url,
      created_at: new Date(0).toISOString(),
    }
    return [guideStem, ...sortedStems]
  }, [practiceSong, stemsBySongId, guideAudioBySongId])

  // Utilidad para filtrar stems activos (no error)
  function getActiveStems(): typeof currentSongStems {
    return currentSongStems.filter((stem: any) => stemLoadStatusById[Number(stem.id)] !== 'error');
  }

  const hasSoloEnabled = useMemo(
    () => Object.values(stemMixerConfig ?? {}).some((item: any) => !!item && !!item.solo),
    [stemMixerConfig]
  )

  const loadedCurrentStemsCount = useMemo(
    () => currentSongStems.filter((stem) => stemLoadStatusById?.[Number(stem.id)] !== 'error').length,
    [currentSongStems, stemLoadStatusById]
  )

  const erroredCurrentStemsCount = useMemo(
    () => currentSongStems.filter((stem) => stemLoadStatusById?.[Number(stem.id)] === 'error').length,
    [currentSongStems, stemLoadStatusById]
  )

  const bufferedReadyCount = useMemo(
    () => currentSongStems.filter((stem) => {
      const bufferedSeconds = stemBufferedSecondsById?.[Number(stem.id)] ?? 0
      return bufferedSeconds >= autoBufferTargetSeconds
    }).length,
    [currentSongStems, stemBufferedSecondsById, autoBufferTargetSeconds]
  )

  const minBufferedCurrentSeconds = useMemo(() => {
    if (currentSongStems.length === 0) return 0
    return currentSongStems.reduce((minimum, stem) => {
      const current = stemBufferedSecondsById?.[Number(stem.id)] ?? 0
      return Math.min(minimum, current)
    }, Number.POSITIVE_INFINITY)
  }, [currentSongStems, stemBufferedSecondsById])

  const allCurrentStemsReady = currentSongStems.length > 0 && bufferedReadyCount === currentSongStems.length
  const minimumReadyToStart = currentSongStems.length > 0
    ? Math.max(
      Math.min(MIN_READY_STEMS_TO_START, currentSongStems.length),
      Math.ceil(currentSongStems.length * 0.7)
    )
    : 0
  const canStartMixer = currentSongStems.length > 0 && bufferedReadyCount >= minimumReadyToStart
  const emptyWaveformBars = EMPTY_WAVEFORM_BARS

  const formatMixerTime = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return '00:00'
    const totalSeconds = Math.floor(value)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const getAudioContext = async (resumeForPlayback = false) => {
    if (!audioContextRef.current) {
      const BrowserAudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!BrowserAudioContext) {
        throw new Error('AudioContext no soportado en este navegador')
      }
      audioContextRef.current = new BrowserAudioContext()
    }

    const context = audioContextRef.current

    if (resumeForPlayback && context.state === 'suspended') {
      await context.resume()
    }
    return context
  }

  useEffect(() => {
    const songId = practiceSong?.songId
    if (!songId) return
    if (waveformBySongId[songId]) return
    if (currentSongStems.length === 0) return
    // Evitar fetch si la canción no tiene stems (nunca se subió ZIP)
    if (!((stemsBySongId.get(songId)?.length ?? 0) > 0)) return

    let cancelled = false

    const loadWaveform = async () => {
      setWaveformLoadingSongId(songId)
      try {
        const payload = await fetchJson<MultitrackWaveform>(
          buildUrl('multitracks', `/songs/${songId}/waveform?bins=${WAVEFORM_BINS}`)
        )

        const serverBins = Array.isArray(payload.bins) ? payload.bins : []
        const normalizedBins = serverBins.length > 0
          ? serverBins.slice(0, WAVEFORM_BINS).map((value) => {
              if (!Number.isFinite(value)) return 0.1
              return Math.max(0.06, Math.min(1, value))
            })
          : emptyWaveformBars

        while (normalizedBins.length < WAVEFORM_BINS) {
          normalizedBins.push(0.1)
        }

        if (cancelled) return
        setWaveformBySongId((previous) => ({ ...previous, [songId]: normalizedBins }))
      } catch {
        if (cancelled) return
        setWaveformBySongId((previous) => ({ ...previous, [songId]: emptyWaveformBars }))
      } finally {
        if (!cancelled) {
          setWaveformLoadingSongId((previous) => (previous === songId ? null : previous))
        }
      }
    }

    void loadWaveform()

    return () => {
      cancelled = true
    }
  }, [practiceSong?.songId, currentSongStems, waveformBySongId, emptyWaveformBars, stemsBySongId])

  useEffect(() => {
    const songId = practiceSong?.songId
    if (!songId) return
    // Evitar fetch si la canción no tiene stems (nunca se subió ZIP)
    if (!((stemsBySongId.get(songId)?.length ?? 0) > 0)) return

    let cancelled = false
    let retries = 0
    let retryTimeoutId: number | null = null

    const scheduleRetry = () => {
      if (cancelled) return
      if (retries >= STRUCTURE_PROGRESS_POLL_ATTEMPTS) {
        // No mostrar pop-up, solo dejar de intentar
        return
      }
      retryTimeoutId = window.setTimeout(() => {
        void loadStructureMarkers()
      }, FETCH_RETRY_DELAY_MS)
    }

    const loadStructureMarkers = async () => {
      retries += 1
      try {
        const response = await fetch(buildUrl('multitracks', `/songs/${songId}/structure`))
        if (response.status === 404) {
          if (!cancelled) {
            setStructureMarkersBySongId((previous) => ({ ...previous, [songId]: null }))
          }
          scheduleRetry()
          return
        }

        if (!response.ok) {
          throw new Error('No se pudo cargar estructura de la canción')
        }

        const payload = (await response.json()) as MultitrackSongStructure
        const markers = (payload.structure ?? [])
          .map((item: MultitrackStructureEntry) => {
            const seconds = parseStructureTimeToSeconds(item.time)
            if (!Number.isFinite(seconds)) return null
            return {
              time: item.time,
              section: item.section,
              seconds,
              label: getSectionMarkerLabel(item.section),
            }
          })
          .filter((item): item is SectionMarker => Boolean(item))

        if (cancelled) return
        setStructureMarkersBySongId((previous) => ({ ...previous, [songId]: markers }))
        scheduleRetry()
      } catch {
        if (cancelled) return
        setStructureMarkersBySongId((previous) => ({ ...previous, [songId]: null }))
        scheduleRetry()
      }
    }

    void loadStructureMarkers()

    return () => {
      cancelled = true
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId)
      }
    }
  }, [practiceSong?.songId, stemsBySongId])

  useEffect(() => {
    if (!uploadingSongId || !uploadingMultitrackZip) return

    let cancelled = false
    let timeoutId: number | null = null

    const pollStatus = async () => {
      try {
        const response = await fetch(buildUrl('multitracks', `/songs/${uploadingSongId}/analysis-status`))
        if (!response.ok) {
          throw new Error('No se pudo cargar estado de analisis')
        }

        const payload = (await response.json()) as MultitrackAnalysisStatus
        if (cancelled) return
        setAnalysisStatusBySongId((previous) => ({ ...previous, [uploadingSongId]: payload }))
      } catch {
        if (cancelled) return
      } finally {
        if (!cancelled && uploadingMultitrackZip) {
          timeoutId = window.setTimeout(() => {
            void pollStatus()
          }, 2500)
        }
      }
    }

    void pollStatus()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [uploadingSongId, uploadingMultitrackZip])

  useEffect(() => {
    if (!showSongEditor) return

    const editingSongId = Number(songForm.id)
    if (!Number.isFinite(editingSongId) || editingSongId <= 0) return
    if (Object.prototype.hasOwnProperty.call(analysisStatusBySongId, editingSongId)) return

    let cancelled = false

    const loadEditorStatus = async () => {
      try {
        const response = await fetch(buildUrl('multitracks', `/songs/${editingSongId}/analysis-status`))
        if (response.status === 404) {
          if (!cancelled) {
            setAnalysisStatusBySongId((previous) => ({ ...previous, [editingSongId]: null }))
          }
          return
        }
        if (!response.ok) {
          throw new Error('No se pudo cargar estado de analisis en editor')
        }

        const payload = (await response.json()) as MultitrackAnalysisStatus
        if (!cancelled) {
          setAnalysisStatusBySongId((previous) => ({ ...previous, [editingSongId]: payload }))
        }
      } catch {
        if (!cancelled) {
          setAnalysisStatusBySongId((previous) => ({ ...previous, [editingSongId]: null }))
        }
      }
    }

    void loadEditorStatus()

    return () => {
      cancelled = true
    }
  }, [showSongEditor, songForm.id, analysisStatusBySongId])

  useEffect(() => {
    if (!uploadingMultitrackZip) return

    setUploadClockTick(Date.now())
    const intervalId = window.setInterval(() => {
      setUploadClockTick(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [uploadingMultitrackZip])

  useEffect(() => {
    if (!uploadingMultitrackZip || !uploadStartedAtMs) {
      setSmoothedEtaSeconds(null)
      return
    }

    const currentEditorStatus = uploadingSongId ? (analysisStatusBySongId[uploadingSongId] ?? null) : null

    let progressValue: number | null = null
    if (!multitrackZipFile && !uploadingMultitrackZip && !currentEditorStatus) {
      progressValue = null
    } else if (currentEditorStatus?.status === 'done' || currentEditorStatus?.status === 'failed') {
      progressValue = 100
    } else if (currentEditorStatus?.status === 'running') {
      const dynamic = 40 + (currentEditorStatus.attempts * 20) + (currentEditorStatus.sections_found * 8)
      progressValue = Math.max(35, Math.min(95, dynamic))
    } else if (currentEditorStatus?.status === 'queued') {
      progressValue = 25
    } else if (uploadingMultitrackZip) {
      progressValue = 12
    } else {
      progressValue = 0
    }

    if (progressValue === null) {
      setSmoothedEtaSeconds(null)
      return
    }

    const progress = Math.max(1, Math.min(99, progressValue))
    const elapsedSeconds = Math.max(1, Math.floor((uploadClockTick - uploadStartedAtMs) / 1000))
    const estimatedTotalSeconds = Math.round((elapsedSeconds * 100) / progress)
    const nextRawEtaSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds)

    setSmoothedEtaSeconds((previous) => {
      if (previous === null) return nextRawEtaSeconds
      return Math.max(0, Math.round((previous * 0.72) + (nextRawEtaSeconds * 0.28)))
    })
  }, [uploadingMultitrackZip, uploadStartedAtMs, uploadClockTick, multitrackZipFile, analysisStatusBySongId, uploadingSongId])

  useEffect(() => {
    const songId = practiceSong?.songId
    if (!songId) return
    // Evitar fetch si la canción no tiene stems (nunca se subió ZIP)
    if (!((stemsBySongId.get(songId)?.length ?? 0) > 0)) return

    let cancelled = false
    let polls = 0
    let timeoutId: number | null = null

    const schedule = () => {
      if (cancelled) return
      if (polls >= STRUCTURE_PROGRESS_POLL_ATTEMPTS) return
      timeoutId = window.setTimeout(() => {
        void loadStatus()
      }, FETCH_RETRY_DELAY_MS)
    }

    const loadStatus = async () => {
      polls += 1
      try {
        const response = await fetch(buildUrl('multitracks', `/songs/${songId}/analysis-status`))
        if (response.status === 404) {
          if (!cancelled) {
            setAnalysisStatusBySongId((previous) => ({ ...previous, [songId]: null }))
          }
          schedule()
          return
        }
        if (!response.ok) {
          throw new Error('No se pudo cargar estado del analisis')
        }

        const payload = (await response.json()) as MultitrackAnalysisStatus
        if (cancelled) return
        setAnalysisStatusBySongId((previous) => ({ ...previous, [songId]: payload }))

        if (payload.status !== 'done' && payload.status !== 'failed' && payload.status !== 'not_applicable') {
          schedule()
        }
      } catch {
        if (!cancelled) {
          setAnalysisStatusBySongId((previous) => ({ ...previous, [songId]: null }))
        }
        schedule()
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [practiceSong?.songId, stemsBySongId])

  useEffect(() => {
    const songId = practiceSong?.songId
    if (!songId) return
    // Evitar fetch si la canción no tiene stems (nunca se subió ZIP)
    if (!((stemsBySongId.get(songId)?.length ?? 0) > 0)) return

    let cancelled = false
    let retries = 0
    let retryTimeoutId: number | null = null

    const scheduleRetry = () => {
      if (cancelled) return
      if (retries >= GUIDE_FETCH_RETRIES) return
      retryTimeoutId = window.setTimeout(() => {
        void loadGuideAudio()
      }, FETCH_RETRY_DELAY_MS)
    }

    const loadGuideAudio = async () => {
      retries += 1
      try {
        const response = await fetch(buildUrl('multitracks', `/songs/${songId}/guide`))
        if (response.status === 404) {
          if (!cancelled) {
            setGuideAudioBySongId((previous) => ({ ...previous, [songId]: null }))
          }
          scheduleRetry()
          return
        }
        if (!response.ok) {
          throw new Error('No se pudo cargar audio guía')
        }

        const payload = (await response.json()) as MultitrackGuideAudio
        if (cancelled) return
        setGuideAudioBySongId((previous) => ({ ...previous, [songId]: payload }))
      } catch {
        if (!cancelled) {
          setGuideAudioBySongId((previous) => ({ ...previous, [songId]: null }))
        }
        scheduleRetry()
      }
    }

    void loadGuideAudio()
    return () => {
      cancelled = true
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId)
      }
    }
  }, [practiceSong?.songId, stemsBySongId])

  const getBufferedAheadSeconds = (audio: HTMLAudioElement) => {
    try {
      const current = audio.currentTime
      let bufferedAhead = 0
      for (let index = 0; index < audio.buffered.length; index += 1) {
        const start = audio.buffered.start(index)
        const end = audio.buffered.end(index)
        if (current >= start && current <= end) {
          bufferedAhead = Math.max(bufferedAhead, end - current)
          break
        }
        if (start > current) {
          bufferedAhead = Math.max(bufferedAhead, end - start)
        }
      }
      return Number.isFinite(bufferedAhead) ? Math.max(0, bufferedAhead) : 0
    } catch {
      return 0
    }
  }

  const updateStemBufferState = (stemId: number, audio: HTMLAudioElement) => {
    const bufferedAhead = getBufferedAheadSeconds(audio)
    setStemBufferedSecondsById((previous) => ({ ...previous, [stemId]: bufferedAhead }))

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    if (duration > 0) {
      setMixerDuration((previous) => Math.max(previous, duration))
    }

    const requiredSeconds = duration > 0 ? Math.min(autoBufferTargetSeconds, duration) : autoBufferTargetSeconds
    if (bufferedAhead >= requiredSeconds) {
      setStemLoadStatusById((previous) => ({ ...previous, [stemId]: 'ready' }))
    } else {
      setStemLoadStatusById((previous) => ({ ...previous, [stemId]: 'pending' }))
    }
  }

  const ensureStemAudioChain = async (stem: MultitrackStem, resumeForPlayback = false) => {
    const context = await getAudioContext(resumeForPlayback)

    let audio = stemAudioRefs.current[Number(stem.id)]
    if (!audio) {
      audio = new Audio(normalizeApiMediaUrl(stem.url))
      audio.preload = 'auto'
      audio.crossOrigin = 'anonymous'
      stemAudioRefs.current[Number(stem.id)] = audio

      const handleProgress = () => updateStemBufferState(Number(stem.id), audio as HTMLAudioElement)
      audio.addEventListener('loadedmetadata', handleProgress)
      audio.addEventListener('canplay', handleProgress)
      audio.addEventListener('canplaythrough', handleProgress)
      audio.addEventListener('progress', handleProgress)
      audio.addEventListener('timeupdate', handleProgress)
      audio.addEventListener('waiting', handleProgress)
      audio.addEventListener('stalled', handleProgress)
      audio.addEventListener('suspend', handleProgress)
      audio.addEventListener('error', () => {
        setStemLoadStatusById((previous) => ({ ...previous, [stem.id]: 'error' }))
      })
    }

    let mediaNode = stemMediaSourceRefs.current[Number(stem.id)]
    let gainNode = stemGainRefs.current[Number(stem.id)]
    let analyserNode = stemAnalyserRefs.current[Number(stem.id)]

    if (!mediaNode || !gainNode || !analyserNode) {
      mediaNode = context.createMediaElementSource(audio)
      gainNode = context.createGain()
      analyserNode = context.createAnalyser()
      analyserNode.fftSize = 256
      analyserNode.smoothingTimeConstant = 0.65 // Valor aumentado para mayor suavidad

      mediaNode.connect(gainNode)
      gainNode.connect(analyserNode)
      analyserNode.connect(context.destination)

      stemMediaSourceRefs.current[Number(stem.id)] = mediaNode
      stemGainRefs.current[Number(stem.id)] = gainNode
      stemAnalyserRefs.current[Number(stem.id)] = analyserNode
      stemMeterDataRefs.current[Number(stem.id)] = new Uint8Array(analyserNode.fftSize)
    }

    return { audio, gainNode, analyserNode }
  }

  // (eliminada función loadStemAudioBuffer, ya no se usa)

  const stopCurrentSources = () => {
    Object.values(stemAudioRefs.current).forEach((audio) => {
      audio.pause()
    })
    // Stop any scheduled AudioBufferSourceNodes
    try {
      Object.values(activeBufferSourceRefs.current).forEach((src) => {
        try {
          src.stop()
        } catch {
          // ignore
        }
      })
    } finally {
      activeBufferSourceRefs.current = {}
      isUsingAudioBufferRef.current = false
      audioContextStartTimeRef.current = null
    }
  }

  const clearRebufferPoll = () => {
    if (rebufferPollTimeoutRef.current !== null) {
      window.clearTimeout(rebufferPollTimeoutRef.current)
      rebufferPollTimeoutRef.current = null
    }
  }

  const getStemDuration = (audio: HTMLAudioElement) => {
    return Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
  }

  const isStemEnded = (audio: HTMLAudioElement) => {
    const duration = getStemDuration(audio)
    if (duration <= 0) return false
    return audio.currentTime >= Math.max(0, duration - STEM_END_TOLERANCE_SECONDS)
  }

  const getReferenceAudio = () => {
    const audios = currentSongStems
      .map((stem) => stemAudioRefs.current[Number(stem.id)])
      .filter((audio): audio is HTMLAudioElement => Boolean(audio))

    const active = audios.find((audio) => !audio.paused && !isStemEnded(audio))
    if (active) return active

    const buffered = audios.find((audio) => audio.readyState >= 2 && !isStemEnded(audio))
    if (buffered) return buffered

    return audios[0]
  }

  const getStemSyncSnapshot = () => {
    const playing = currentSongStems
      .map((stem) => stemAudioRefs.current[Number(stem.id)])
      .filter((audio): audio is HTMLAudioElement => Boolean(audio) && !audio.paused && !isStemEnded(audio))

    if (playing.length === 0) {
      return { referenceTime: mixerPosition, maxDrift: 0, minBufferedAhead: 0, playing }
    }

    const referenceTime = playing[0].currentTime
    let maxDrift = 0
    let minBufferedAhead = Number.POSITIVE_INFINITY

    playing.forEach((audio) => {
      const drift = Math.abs(audio.currentTime - referenceTime)
      maxDrift = Math.max(maxDrift, drift)
      minBufferedAhead = Math.min(minBufferedAhead, getBufferedAheadSeconds(audio))
    })

    return {
      referenceTime,
      maxDrift,
      minBufferedAhead: Number.isFinite(minBufferedAhead) ? minBufferedAhead : 0,
      playing,
    }
  }

  const alignPlayingStems = (referenceTime: number) => {
    if (isUsingAudioBufferRef.current) return
    currentSongStems.forEach((stem) => {
      const audio = stemAudioRefs.current[Number(stem.id)]
      if (!audio) return
      const drift = Math.abs(audio.currentTime - referenceTime)
      if (drift > DRIFT_THRESHOLD_SECONDS) {
        audio.currentTime = referenceTime
      }
    })
  }

  // Ahora requiere que TODAS las pistas tengan buffer suficiente para reanudar
  const hasResumeBuffer = () => {
    if (currentSongStems.length === 0) return false;
    return currentSongStems.every((stem) => {
      const audio = stemAudioRefs.current[Number(stem.id)];
      if (!audio) return false;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const required = duration > 0 ? Math.min(playbackTuning.rebufferResumeSeconds, duration) : playbackTuning.rebufferResumeSeconds;
      return getBufferedAheadSeconds(audio) >= required;
    });
  }

  const triggerRebuffer = (resumePosition: number) => {
    if (isUsingAudioBufferRef.current) return
    if (rebufferLockRef.current) return
    rebufferLockRef.current = true
    lowBufferStreakRef.current = 0
    setMixerRebuffering(true)
    setActionStatus('Buffer bajo detectado. Rebufferizando pistas...')

    stopCurrentSources()
    getActiveStems().forEach((stem) => {
      const audio = stemAudioRefs.current[stem.id]
      if (!audio) return
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const nextPosition = duration > 0 ? Math.min(resumePosition, duration) : resumePosition
      audio.currentTime = Math.max(0, nextPosition)
    })

    getActiveStems().forEach((stem) => {
      const audio = stemAudioRefs.current[stem.id]
      if (!audio) return
      updateStemBufferState(Number(stem.id), audio)
    })

    setMixerPlaying(false)
    setMixerPosition(resumePosition)

    const deadline = Date.now() + 10000
    const poll = () => {
      if (Date.now() > deadline) {
        rebufferLockRef.current = false
        setMixerRebuffering(false)
        setActionStatus('No se pudo recuperar buffer suficiente. Espera unos segundos e intenta de nuevo.')
        return
      }

      if (hasResumeBuffer()) {
        rebufferLockRef.current = false
        setMixerRebuffering(false)
        playStartedAtRef.current = Date.now()
        void startPlaybackFromPosition(resumePosition, { bypassInitialBufferGate: true })
        return
      }

      rebufferPollTimeoutRef.current = window.setTimeout(poll, 250)
    }

    poll()
  }

  const stopMeterLoop = () => {
    if (meterAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(meterAnimationFrameRef.current)
      meterAnimationFrameRef.current = null
    }
  }

  // Ref para guardar el valor visual previo de cada vumetro
  const stemMeterVisualRef = useRef<Record<number, number>>({})

  // Interpolación lineal
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const updateMeters = () => {
    currentSongStems.forEach((stem) => {
      const analyser = stemAnalyserRefs.current[Number(stem.id)]
      const fill = stemMeterFillRefs.current[Number(stem.id)]
      if (!analyser) {
        if (fill && fill.style.height !== '4%') fill.style.height = '4%'
        stemMeterVisualRef.current[Number(stem.id)] = 0.04
        return
      }

      let data = stemMeterDataRefs.current[Number(stem.id)]
      if (!data || data.length !== analyser.fftSize) {
        data = new Uint8Array(analyser.fftSize)
        stemMeterDataRefs.current[Number(stem.id)] = data
      }
      analyser.getByteTimeDomainData(data as unknown as Uint8Array<ArrayBuffer>)

      let sumSquares = 0
      let peakAbs = 0
      for (let index = 0; index < data.length; index += 1) {
        const normalized = (data[index] - 128) / 128
        sumSquares += normalized * normalized
        peakAbs = Math.max(peakAbs, Math.abs(normalized))
      }

      const rms = Math.sqrt(sumSquares / data.length)
      const safeRms = Math.max(rms, 1e-6)
      const db = 20 * Math.log10(safeRms)
      const dbFloor = -42
      const normalizedDb = (db - dbFloor) / -dbFloor
      const combined = Math.max(normalizedDb, peakAbs)
      const meterLevel = Math.max(0, Math.min(1, Math.pow(combined, 0.82)))

      // Interpolación visual (lerp)
      const prev = stemMeterVisualRef.current[Number(stem.id)] ?? 0.04
      // t controla la suavidad: 0.32 = más responsivo, menos lag
      const t = 0.32
      let next = lerp(prev, meterLevel, t)
      // Limitar velocidad de descenso (decay)
      const maxDecayPerFrame = 0.035 // Más rápido el decay
      if (next < prev) {
        next = Math.max(next, prev - maxDecayPerFrame)
      }
      // Solo actualizar el DOM si el valor cambió perceptiblemente
      if (Math.abs(next - prev) > 0.005 && fill) {
        fill.style.height = `${Math.max(4, next * 100)}%`
      }
      stemMeterVisualRef.current[Number(stem.id)] = next
    })
    meterAnimationFrameRef.current = window.requestAnimationFrame(updateMeters)
  }

  const getCurrentPlaybackPosition = () => {
    if (isUsingAudioBufferRef.current && audioContextRef.current && audioContextStartTimeRef.current != null) {
      return (audioContextRef.current.currentTime - audioContextStartTimeRef.current) + mixerPosition
    }

    const referenceAudio = getReferenceAudio()
    if (!referenceAudio) return mixerPosition
    return referenceAudio.currentTime
  }

  useEffect(() => {
    return () => {
      stopMeterLoop()
      // Limpieza reforzada: detener todos los nodos previos antes de crear nuevos
      // Detener y limpiar SOLO los nodos activos por stem, y bloquear llamadas paralelas
      const win = window as Window & { __musicAppPlaybackLock?: boolean };
      win.__musicAppPlaybackLock = win.__musicAppPlaybackLock || false;
      if (win.__musicAppPlaybackLock) {
        if (window.console) window.console.warn('Playback already in progress, skipping duplicate start');
        return;
      }
      win.__musicAppPlaybackLock = true;
      Object.entries(activeBufferSourceRefs.current).forEach(([id, src]) => {
        try {
          src.stop();
          if (window) window.console && window.console.log && window.console.log('Stopped buffer source for stem', id);
        } catch (e) {
          if (window) window.console && window.console.warn && window.console.warn('Error stopping buffer source', id, e);
        }
      });
      activeBufferSourceRefs.current = {};
      isUsingAudioBufferRef.current = false;
      audioContextStartTimeRef.current = null;
      // Espera breve para liberar recursos
      setTimeout(() => {
        win.__musicAppPlaybackLock = false;
      }, 60);
      Object.values(stemAudioRefs.current).forEach((audio) => {
        try {
          audio.pause()
          audio.src = ''
        } catch {
          // ignore
        }
      })
      stemAudioRefs.current = {}
      stemMediaSourceRefs.current = {}
      stemGainRefs.current = {}
      stemAnalyserRefs.current = {}
      stemMeterDataRefs.current = {}
      stemMeterFillRefs.current = {}

      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      clearRebufferPoll()
      rebufferLockRef.current = false
    }
  }, [])

  useEffect(() => {
    const nextConfig: Record<number, StemMixerConfig> = {}
    currentSongStems.forEach((stem) => {
      const previous = stemMixerConfig[Number(stem.id)]
      nextConfig[Number(stem.id)] = previous ?? { volume: 1, solo: false, muted: false }
    })
    setStemMixerConfig(nextConfig)

    stopCurrentSources()
    Object.values(stemAudioRefs.current).forEach((audio) => {
      audio.pause()
      audio.src = ''
    })
    stemAudioRefs.current = {}
    stemMediaSourceRefs.current = {}
    stemGainRefs.current = {}
    stemAnalyserRefs.current = {}
    stemMeterDataRefs.current = {}
    stemMeterFillRefs.current = {}
    setStemBufferedSecondsById({})
    setMixerPlaying(false)
    setMixerRebuffering(false)
    clearRebufferPoll()
    rebufferLockRef.current = false
    lowBufferStreakRef.current = 0
    setMixerPosition(0)
    setMixerDuration(0)
    if (currentSongStems.length > 0) {
      const nextLoadStatus: Record<number, StemLoadStatus> = {}
      currentSongStems.forEach((stem) => {
        nextLoadStatus[Number(stem.id)] = 'pending'
      })
      setStemLoadStatusById(nextLoadStatus)
    } else {
      setStemLoadStatusById({})
    }
  }, [practiceSong?.songId])

  useEffect(() => {
    if (!mixerPlaying) {
      stopMeterLoop()
      pendingLateJoinCountRef.current = 0
      lowBufferStreakRef.current = 0
      return
    }

    stopMeterLoop()
    meterAnimationFrameRef.current = window.requestAnimationFrame(updateMeters)
    return () => stopMeterLoop()
  }, [mixerPlaying, currentSongStems])

  useEffect(() => {
    if (!mixerPlaying) return

    const intervalId = window.setInterval(() => {
      if (isUsingAudioBufferRef.current) return // No late join cuando se usa AudioBufferSourceNode
      const referenceTime = getCurrentPlaybackPosition()
      const elapsedSinceStart = Date.now() - playStartedAtRef.current
      let pendingCount = 0

      currentSongStems.forEach((stem) => {
        const audio = stemAudioRefs.current[Number(stem.id)]
        if (!audio || !audio.paused) return

        if (isStemEnded(audio)) {
          return
        }

        pendingCount += 1
        if (audio.readyState < 2) return

        const bufferedAhead = getBufferedAheadSeconds(audio)
        const startupThreshold = Math.min(autoBufferTargetSeconds, playbackTuning.lateJoinMinBufferSeconds)
        const canLateJoin = bufferedAhead >= startupThreshold || elapsedSinceStart >= playbackTuning.lateJoinForceAfterMs
        if (!canLateJoin) return

        const duration = getStemDuration(audio)
        const targetPosition = duration > 0 ? Math.min(referenceTime, Math.max(0, duration - STEM_END_TOLERANCE_SECONDS)) : referenceTime
        audio.currentTime = targetPosition
        void audio.play().catch(() => {
          // Reintento en el siguiente ciclo.
        })
      })

      if (!mixerRebuffering && pendingCount !== pendingLateJoinCountRef.current) {
        pendingLateJoinCountRef.current = pendingCount
        if (pendingCount > 0) {
          setActionStatus(`Incorporando ${pendingCount} pista(s) restantes...`)
        } else if (actionStatus?.startsWith('Incorporando ')) {
          setActionStatus(null)
        }
      }
    }, 700)

    return () => window.clearInterval(intervalId)
  }, [mixerPlaying, mixerRebuffering, currentSongStems, autoBufferTargetSeconds, actionStatus, playbackTuning])

  useEffect(() => {
    if (!mixerPlaying) return

    const interval = window.setInterval(() => {
      const { referenceTime, maxDrift, minBufferedAhead, playing } = getStemSyncSnapshot()

      if (maxDrift > DRIFT_THRESHOLD_SECONDS) {
        alignPlayingStems(referenceTime)
      }

      const lowBufferCount = playing.filter((audio) => getBufferedAheadSeconds(audio) < playbackTuning.rebufferFloorSeconds).length
      const lowBufferThreshold = Math.max(2, Math.ceil(playing.length * 0.35))
      const withinGraceWindow = Date.now() - playStartedAtRef.current < playbackTuning.rebufferGraceMs

      const hasSustainedLowBuffer = !withinGraceWindow && minBufferedAhead < playbackTuning.rebufferFloorSeconds && lowBufferCount >= lowBufferThreshold
      if (hasSustainedLowBuffer) {
        lowBufferStreakRef.current += 1
      } else {
        lowBufferStreakRef.current = 0
      }

      if (lowBufferStreakRef.current >= playbackTuning.rebufferConsecutiveTicks && !rebufferLockRef.current) {
        lowBufferStreakRef.current = 0
        triggerRebuffer(referenceTime)
        return
      }

      const position = referenceTime
      if (mixerDuration > 0 && position >= mixerDuration) {
        stopCurrentSources()
        setMixerPlaying(false)
        setMixerPosition(mixerDuration)
        Object.values(stemMeterFillRefs.current).forEach((fill) => {
          if (fill) fill.style.height = '4%'
        })
        return
      }
      setMixerPosition(position)
    }, 250)

    return () => window.clearInterval(interval)
  }, [mixerPlaying, mixerDuration, playbackTuning])

  useEffect(() => {
    currentSongStems.forEach((stem) => {
      const gainNode = stemGainRefs.current[Number(stem.id)]
      if (!gainNode) return
      const config = stemMixerConfig[Number(stem.id)] ?? { volume: 1, solo: false, muted: false }
      const effectiveMuted = config.muted || (hasSoloEnabled && !config.solo)
      gainNode.gain.value = effectiveMuted ? 0 : Math.max(0, Math.min(1, config.volume))
    })
  }, [stemMixerConfig, hasSoloEnabled, currentSongStems])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const preloadStems = async () => {
      if (currentSongStems.length === 0) return

      for (const stem of currentSongStems) {
        if (cancelled) return
        try {
          const { audio } = await ensureStemAudioChain(stem, false)
          updateStemBufferState(Number(stem.id), audio)
          if (audio.readyState === 0) {
            audio.load()
          }
        } catch {
          if (!cancelled) {
            setStemLoadStatusById((previous) => ({ ...previous, [stem.id]: 'error' }))
          }
        }
      }

      intervalId = window.setInterval(() => {
        currentSongStems.forEach((stem) => {
          const audio = stemAudioRefs.current[Number(stem.id)]
          if (!audio) return
          updateStemBufferState(Number(stem.id), audio)
        })
      }, 350)
    }

    void preloadStems()
    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [currentSongStems, autoBufferTargetSeconds])

  const startPlaybackFromPosition = async (
    startPosition: number,
    options?: { bypassInitialBufferGate?: boolean }
  ) => {
    if (currentSongStems.length === 0) {
      setActionStatus('Esta canción no tiene multipistas cargadas')
      return
    }

    const isSeekStart = startPosition > STEM_END_TOLERANCE_SECONDS
    if (!canStartMixer && !options?.bypassInitialBufferGate && !isSeekStart) {
      setActionStatus(`Aún no hay pistas suficientes listas (${bufferedReadyCount}/${minimumReadyToStart})`)
      return
    }

    setActionStatus(null)
    try {
      await getAudioContext(true)

      const boundedByDuration = mixerDuration > 0 ? Math.min(startPosition, mixerDuration) : startPosition
      const targetPosition = Math.max(0, boundedByDuration)

      // Esperar a que todas las pistas tengan buffer suficiente antes de reproducir
      const waitForAllBuffers = async () => {
        const maxWaitMs = 7000
        const pollInterval = 70
        let waited = 0
        while (waited < maxWaitMs) {
          const allBuffered = getActiveStems().every((stem) => {
            const audio = stemAudioRefs.current[Number(stem.id)]
            if (!audio) return false
            const duration = Number.isFinite(audio.duration) ? audio.duration : 0
            const requiredSeconds = duration > 0 ? Math.min(autoBufferTargetSeconds, duration) : autoBufferTargetSeconds
            return getBufferedAheadSeconds(audio) >= requiredSeconds
          })
          if (allBuffered) return true
          await new Promise((res) => setTimeout(res, pollInterval))
          waited += pollInterval
        }
        return false
      }

      // Esperar buffers antes de reproducir
      setActionStatus('Esperando buffer de todas las pistas...')
      const allReady = await waitForAllBuffers()
      if (!allReady) {
        setActionStatus('No se pudo cargar buffer suficiente en todas las pistas. Intenta de nuevo.')
        return
      }

      // Restaurar reproducción clásica con HTMLAudioElement
      const audiosToPlay: HTMLAudioElement[] = []
      for (const stem of currentSongStems) {
        const { audio, gainNode } = await ensureStemAudioChain(stem, true)
        const config = stemMixerConfig[Number(stem.id)] ?? { volume: 1, solo: false, muted: false }
        const effectiveMuted = config.muted || (hasSoloEnabled && !config.solo)
        gainNode.gain.value = effectiveMuted ? 0 : Math.max(0, Math.min(1, config.volume))
        audio.currentTime = targetPosition
        audiosToPlay.push(audio)
      }

      const firstBatch = audiosToPlay.slice(0, playbackTuning.initialPlayParallel)
      const remainingBatch = audiosToPlay.slice(playbackTuning.initialPlayParallel)

      const firstBatchResults = await Promise.allSettled(
        firstBatch.map(async (audio) => audio.play())
      )
      const startedInFirstBatch = firstBatchResults.filter((item) => item.status === 'fulfilled').length

      if (startedInFirstBatch === 0) {
        setActionStatus('No se pudo iniciar reproducción de ninguna pista')
        return
      }

      void Promise.allSettled(remainingBatch.map(async (audio) => audio.play()))

      setMixerPosition(targetPosition)
      setMixerPlaying(true)
      setMixerRebuffering(false)
      playStartedAtRef.current = Date.now()
      setActionStatus(null)
      if (options?.bypassInitialBufferGate) {
        setActionStatus('Reproducción reanudada tras rebuffer')
      }
    } catch {
      setActionStatus('No se pudo reproducir multipistas. Revisa formato/permiso de audio del navegador.')
    }
  }

  const handlePlayMixer = async () => {
    await startPlaybackFromPosition(mixerPosition)
  }

  const handlePauseMixer = () => {
    const position = getCurrentPlaybackPosition()
    stopCurrentSources()
    stopMeterLoop()
    clearRebufferPoll()
    rebufferLockRef.current = false
    setMixerRebuffering(false)
    playStartedAtRef.current = 0
    setMixerPosition(position)
    setMixerPlaying(false)
  }

  const handleStopMixer = () => {
    stopCurrentSources()
    Object.values(stemAudioRefs.current).forEach((audio) => {
      audio.currentTime = 0
    })
    stopMeterLoop()
    clearRebufferPoll()
    rebufferLockRef.current = false
    setMixerRebuffering(false)
    playStartedAtRef.current = 0
    Object.values(stemMeterFillRefs.current).forEach((fill) => {
      if (fill) fill.style.height = '4%'
    })
    setMixerPlaying(false)
    setMixerPosition(0)
  }

  const handleSeekMixer = (positionSeconds: number) => {
    const boundedByDuration = mixerDuration > 0
      ? Math.min(positionSeconds, mixerDuration)
      : positionSeconds
    const targetPosition = Math.max(0, boundedByDuration)

    if (mixerPlaying) {
      triggerRebuffer(targetPosition)
      return
    }

    Object.values(stemAudioRefs.current).forEach((audio) => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      const nextPosition = duration > 0 ? Math.min(targetPosition, duration) : targetPosition
      audio.currentTime = Math.max(0, nextPosition)
    })

    currentSongStems.forEach((stem) => {
      const audio = stemAudioRefs.current[Number(stem.id)]
      if (!audio) return
      updateStemBufferState(Number(stem.id), audio)
    })

    setMixerPosition(targetPosition)
  }

  const handleShiftMixer = (secondsDelta: number) => {
    handleSeekMixer(mixerPosition + secondsDelta)
  }

  const activeWaveform = useMemo(() => {
    if (!practiceSong) return emptyWaveformBars
    return waveformBySongId[practiceSong.songId] ?? emptyWaveformBars
  }, [practiceSong, waveformBySongId, emptyWaveformBars])

  const activeSectionMarkers = useMemo(() => {
    if (!practiceSong) return []
    const markers = structureMarkersBySongId[practiceSong.songId]
    return Array.isArray(markers) ? markers : []
  }, [practiceSong, structureMarkersBySongId])

  const activeAnalysisStatus = useMemo(() => {
    if (!practiceSong) return null
    return analysisStatusBySongId[practiceSong.songId] ?? null
  }, [practiceSong, analysisStatusBySongId])

  const editorAnalysisStatus = useMemo(() => {
    if (!uploadingSongId) return null
    return analysisStatusBySongId[uploadingSongId] ?? null
  }, [uploadingSongId, analysisStatusBySongId])

  const isEditorUploadInProgress = uploadingMultitrackZip
    || editorAnalysisStatus?.status === 'queued'
    || editorAnalysisStatus?.status === 'running'

  const editorUploadProgress = useMemo(() => {
    if (!isEditorUploadInProgress) return null

    if (editorAnalysisStatus?.status === 'running') {
      const dynamic = 40 + (editorAnalysisStatus.attempts * 20) + (editorAnalysisStatus.sections_found * 8)
      return Math.max(35, Math.min(95, dynamic))
    }
    if (editorAnalysisStatus?.status === 'queued') return 25
    if (uploadingMultitrackZip) return 12
    return 0
  }, [isEditorUploadInProgress, uploadingMultitrackZip, editorAnalysisStatus])

  const editorUploadProgressMessage = useMemo(() => {
    if (!multitrackZipFile && !uploadingMultitrackZip && !editorAnalysisStatus) return ''
    if (!editorAnalysisStatus) {
      return uploadingMultitrackZip
        ? 'Subiendo ZIP y preparando analisis...'
        : 'ZIP listo para procesar.'
    }

    if (editorAnalysisStatus.status === 'done') {
      return `Analisis completado (${editorAnalysisStatus.sections_found} secciones)`
    }
    if (editorAnalysisStatus.status === 'failed') {
      return editorAnalysisStatus.detail || 'El analisis no encontro secciones.'
    }
    if (editorAnalysisStatus.status === 'running') {
      return editorAnalysisStatus.detail || 'Analizando guia...'
    }
    if (editorAnalysisStatus.status === 'queued') {
      return 'En cola para analisis...'
    }

    return editorAnalysisStatus.detail || 'Procesando multipistas...'
  }, [multitrackZipFile, uploadingMultitrackZip, editorAnalysisStatus])

  const editorUploadStatusLabel = useMemo(() => {
    if (!editorAnalysisStatus?.status) return 'Procesando'
    const status = editorAnalysisStatus.status.toLowerCase()
    if (status === 'queued') return 'En cola'
    if (status === 'running') return 'Analizando'
    if (status === 'done') return 'Completado'
    if (status === 'failed') return 'Error'
    return status
  }, [editorAnalysisStatus])

  const editorUploadEtaMessage = useMemo(() => {
    if (!uploadingMultitrackZip) return ''
    if (smoothedEtaSeconds === null) return ''
    const minutes = Math.floor(smoothedEtaSeconds / 60)
    const seconds = smoothedEtaSeconds % 60
    return `ETA ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }, [uploadingMultitrackZip, smoothedEtaSeconds])

  const waveformBars = useMemo(
    () =>
      activeWaveform.map((amplitude, index) => (
        <span
          key={`waveform-${practiceSong?.songId ?? 'none'}-${index}`}
          className="music-waveform__bar"
          style={{ height: `${Math.max(8, amplitude * 100)}%` }}
        />
      )),
    [activeWaveform, practiceSong?.songId]
  )

  const mixerProgressPercent = mixerDuration > 0
    ? Math.max(0, Math.min(100, (mixerPosition / mixerDuration) * 100))
    : 0

  const handleWaveformSeek = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (currentSongStems.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
    const duration = mixerDuration > 0 ? mixerDuration : 0
    handleSeekMixer(duration * ratio)
  }

  const handleSectionMarkerSeek = (seconds: number) => {
    if (currentSongStems.length === 0) return
    handleSeekMixer(seconds)
  }

  const updateStemConfig = (stemId: number, patch: Partial<StemMixerConfig>) => {
    setStemMixerConfig((previous) => {
      const current = previous[stemId] ?? { volume: 1, solo: false, muted: false }
      return {
        ...previous,
        [stemId]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  const notesKey = selectedRepertoire ? String(selectedRepertoire.id) : ''
  const rehearsalNotes = notesKey ? rehearsalNotesByRepertoire[notesKey] ?? '' : ''
  const editingSongId = songForm.id ? Number(songForm.id) : null
  const editingSongStemsCount = editingSongId ? (stemsBySongId.get(editingSongId) ?? []).length : 0
  const isDeletingEditorMultitracks = Boolean(editingSongId && deletingMultitracksSongId === editingSongId)
  const editorDeleteProgress = isDeletingEditorMultitracks ? 72 : null
  const editorDeleteProgressMessage = isDeletingEditorMultitracks
    ? 'Eliminando stems, guia, mezcla y estructura...'
    : ''

  const updateRehearsalNotes = (value: string) => {
    if (!notesKey) return
    const nextNotes = {
      ...rehearsalNotesByRepertoire,
      [notesKey]: value,
    }
    setRehearsalNotesByRepertoire(nextNotes)
    localStorage.setItem('music_rehearsal_notes_v1', JSON.stringify(nextNotes))
  }

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const moveFocusedSong = (direction: -1 | 1) => {
    if (!showPracticeNavigation) return
    if (focusedSongIndex < 0) return
    const target = setlistSongs[focusedSongIndex + direction]
    if (!target) return
    setFocusedSongId(target.songId)
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (activeSection !== 'ensayo' || !showPracticeNavigation) return

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase() ?? ''
      const isTypingTarget =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable

      if (isTypingTarget) return

      if (event.key === 'ArrowLeft' && hasPreviousSong) {
        event.preventDefault()
        moveFocusedSong(-1)
      }

      if (event.key === 'ArrowRight' && hasNextSong) {
        event.preventDefault()
        moveFocusedSong(1)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [activeSection, hasPreviousSong, hasNextSong, moveFocusedSong, showPracticeNavigation])

  const filteredSongs = useMemo(() => {
    const query = songSearch.trim().toLowerCase()
    if (!query) return songs.data
    return songs.data.filter((song) => {
      const text = `${song.name} ${song.author ?? ''} ${song.key ?? ''}`.toLowerCase()
      return text.includes(query)
    })
  }, [songs.data, songSearch])

  const uploadMultitrackArchive = async (songId: number, file: File) => {
    setUploadingMultitrackZip(true)
    setUploadingSongId(songId)
    setUploadStartedAtMs(Date.now())
    setUploadClockTick(Date.now())
    setSmoothedEtaSeconds(null)
    setAnalysisStatusBySongId((previous) => ({
      ...previous,
      [songId]: {
        song_id: songId,
        status: 'queued',
        sections_found: 0,
        attempts: 0,
        updated_at: new Date().toISOString(),
        detail: 'Iniciando carga del ZIP',
      },
    }))
    const formData = new FormData()
    formData.append('song_id', String(songId))
    formData.append('archive', file)

    try {
      const response = await fetch(buildUrl('multitracks', '/upload'), {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'Error subiendo ZIP de multipistas')
      }
      const payload = (await response.json()) as { total_stems?: number }
      try {
        const statusResponse = await fetch(buildUrl('multitracks', `/songs/${songId}/analysis-status`))
        if (statusResponse.ok) {
          const statusPayload = (await statusResponse.json()) as MultitrackAnalysisStatus
          setAnalysisStatusBySongId((previous) => ({ ...previous, [songId]: statusPayload }))
        }
      } catch {
        // No-op: polling effect keeps trying while upload is active.
      }
      // multitrackStems.refresh() eliminado: react-query actualiza automáticamente o usa refetch si es necesario
      setStructureMarkersBySongId((previous) => {
        const next = { ...previous }
        delete next[songId]
        return next
      })
      setGuideAudioBySongId((previous) => {
        const next = { ...previous }
        delete next[songId]
        return next
      })
      setActionStatus(
        `Multipistas cargadas: ${payload.total_stems ?? 0} stem(s)`
      )
    } finally {
      setUploadingMultitrackZip(false)
      setUploadStartedAtMs(null)
      setUploadClockTick(0)
      setSmoothedEtaSeconds(null)
    }
  }

  const handleCreateSong = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)

    if (uploadingPdf) {
      setActionStatus('Espera a que termine la subida del PDF antes de guardar la canción.')
      return
    }

    const trimmedSongName = songForm.name.trim()
    if (!trimmedSongName) {
      setActionStatus('El título de la canción es obligatorio.')
      return
    }

    const rawMediaLink = songForm.youtube.trim()
    const normalizedMediaUrl = normalizeMediaUrl(rawMediaLink)
    if (rawMediaLink && !normalizedMediaUrl) {
      setActionStatus('El link no es válido. Usa YouTube, SoundCloud, Spotify o Apple Music.')
      return
    }

    setSavingSong(true)

    try {
      const payload = {
        name: trimmedSongName,
        author: songForm.author.trim() || null,
        bpm: songForm.bpm ? Number(songForm.bpm) : null,
        key: songForm.key.trim() || null,
        chord_chart_pdf_url: songForm.pdf.trim() || null,
        youtube_url: normalizedMediaUrl,
        lyrics_markdown: songForm.lyrics.trim() || null,
      }
      let savedSong: Song
      if (songForm.id) {
        savedSong = await fetchJson<Song>(buildUrl('music', `/songs/${songForm.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        savedSong = await fetchJson<Song>(buildUrl('music', '/songs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      let zipUploadErrorMessage: string | null = null
      if (multitrackZipFile) {
        try {
          await uploadMultitrackArchive(savedSong.id, multitrackZipFile)
        } catch (uploadError) {
          zipUploadErrorMessage =
            uploadError instanceof Error ? uploadError.message : 'No se pudo subir el ZIP de multipistas'
        }
      }

      songs.refresh()

      if (zipUploadErrorMessage) {
        setActionStatus(
          `Canción guardada, pero falló la carga del ZIP: ${zipUploadErrorMessage}`
        )
        setSongForm((previous) => ({ ...previous, id: String(savedSong.id) }))
      } else {
        setSongForm({ id: '', name: '', author: '', bpm: '', key: '', pdf: '', youtube: '', lyrics: '' })
        setMultitrackZipFile(null)
        setShowSongEditor(false)
        setActionStatus(songForm.id ? 'Canción actualizada' : 'Canción guardada')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error guardando canción'
      if (message.toLowerCase().includes('youtube_url') && message.toLowerCase().includes('column')) {
        setActionStatus('No se pudo guardar el link: falta aplicar la migración de music (youtube_url).')
      } else {
        setActionStatus(message)
      }
    } finally {
      setSavingSong(false)
    }
  }

  const handleStartEditSong = (song: Song) => {
    setSongForm({
      id: String(song.id),
      name: song.name,
      author: song.author ?? '',
      bpm: song.bpm ? String(song.bpm) : '',
      key: song.key ?? '',
      pdf: normalizeApiMediaUrl(song.chord_chart_pdf_url),
      youtube: song.youtube_url ?? '',
      lyrics: song.lyrics_markdown ?? '',
    })
    setUploadingSongId(song.id)
    setUploadStartedAtMs(null)
    setUploadClockTick(0)
    setSmoothedEtaSeconds(null)
    setShowSongEditor(true)
  }

  const handleCancelEditSong = () => {
    setSongForm({ id: '', name: '', author: '', bpm: '', key: '', pdf: '', youtube: '', lyrics: '' })
    setMultitrackZipFile(null)
    setUploadingSongId(null)
    setUploadStartedAtMs(null)
    setUploadClockTick(0)
    setSmoothedEtaSeconds(null)
    setShowSongEditor(false)
  }

  const handleOpenCreateSong = () => {
    setSongForm({ id: '', name: '', author: '', bpm: '', key: '', pdf: '', youtube: '', lyrics: '' })
    setMultitrackZipFile(null)
    setUploadingSongId(null)
    setUploadStartedAtMs(null)
    setUploadClockTick(0)
    setSmoothedEtaSeconds(null)
    setShowSongEditor(true)
  }

  const handleDeleteSong = async (songId: number) => {
    setActionStatus(null)
    try {
      await fetch(buildUrl('multitracks', `/songs/${songId}/stems`), {
        method: 'DELETE',
      })

      const response = await fetchJson<{ removed_from_repertoires?: number }>(
        buildUrl('music', `/songs/${songId}`),
        { method: 'DELETE' }
      )
      if (songForm.id === String(songId)) {
        handleCancelEditSong()
      }

      songs.refresh()
      repertoireSongs.refresh()
      // multitrackStems.refresh() eliminado: react-query actualiza automáticamente o usa refetch si es necesario
      const removed = response.removed_from_repertoires ?? 0
      if (removed > 0) {
        setActionStatus(`Canción eliminada y removida de ${removed} setlist(s)`) 
      } else {
        setActionStatus('Canción eliminada')
      }
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error eliminando canción')
    }
  }

  const handleDeleteSongMultitracks = async (songId: number) => {
    const songName = songs.data.find((item) => item.id === songId)?.name ?? `ID ${songId}`
    const accepted = window.confirm(`¿Borrar todas las multipistas de "${songName}"? Esta acción no se puede deshacer.`)
    if (!accepted) return

    setActionStatus(null)
    setDeletingMultitracksSongId(songId)
    try {
      const abortController = new AbortController()
      const timeoutId = window.setTimeout(() => abortController.abort(), MULTITRACK_DELETE_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(buildUrl('multitracks', `/songs/${songId}/stems`), {
          method: 'DELETE',
          signal: abortController.signal,
        })
      } finally {
        window.clearTimeout(timeoutId)
      }

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'Error eliminando multipistas')
      }

      if (practiceSong?.songId === songId) {
        stopCurrentSources()
        clearRebufferPoll()
        rebufferLockRef.current = false
        Object.values(stemAudioRefs.current).forEach((audio) => {
          audio.pause()
          audio.src = ''
        })
        stemAudioRefs.current = {}
        stemMediaSourceRefs.current = {}
        stemGainRefs.current = {}
        stemAnalyserRefs.current = {}
        setStemMixerConfig({})
        setStemLoadStatusById({})
        setStemBufferedSecondsById({})
        Object.values(stemMeterFillRefs.current).forEach((fill) => {
          if (fill) fill.style.height = '4%'
        })
        setMixerPlaying(false)
        setMixerRebuffering(false)
        setMixerPosition(0)
        setMixerDuration(0)
      }

      // multitrackStems.refresh() eliminado: react-query actualiza automáticamente o usa refetch si es necesario
      setAnalysisStatusBySongId((previous) => {
        const next = { ...previous }
        delete next[songId]
        return next
      })
      setActionStatus('Multipistas eliminadas de la canción')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setActionStatus('El borrado tardó demasiado. Intenta de nuevo en unos segundos.')
      } else {
        setActionStatus(err instanceof Error ? err.message : 'Error eliminando multipistas')
      }
    } finally {
      setDeletingMultitracksSongId(null)
    }
  }

  const handleUploadPdf = async (file: File) => {
    setUploadingPdf(true)
    setActionStatus(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, 30000)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(buildUrl('pdfs', '/pdfs'), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'Error subiendo PDF')
      }

      const payload = (await response.json()) as { url?: string }
      const uploadedUrl = normalizeApiMediaUrl(payload.url ?? '')
      setSongForm((previous) => ({ ...previous, pdf: uploadedUrl }))
      setActionStatus('PDF subido y vinculado a la canción')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setActionStatus('La subida del PDF tardó demasiado y fue cancelada. Intenta de nuevo.')
      } else {
        setActionStatus(err instanceof Error ? err.message : 'Error subiendo PDF')
      }
    } finally {
      clearTimeout(timeout)
      setUploadingPdf(false)
    }
  }

  const handleAddRepertoireSong = async (event: FormEvent) => {
    event.preventDefault()
    setActionStatus(null)
    if (!selectedRepertoire) {
      setActionStatus('Selecciona un ensayo con repertorio para agregar canciones')
      return
    }
    try {
      const payload = {
        repertoire_id: selectedRepertoire.id,
        song_id: Number(setlistForm.song_id),
        tonalidad_override: setlistForm.tonalidad_override || null,
        bpm_override: setlistForm.bpm_override ? Number(setlistForm.bpm_override) : null,
      }
      await postJson(buildUrl('music', '/repertoire-songs'), payload)
      setSetlistForm({ song_id: '', tonalidad_override: '', bpm_override: '' })
      repertoireSongs.refresh()
      setActionStatus('Canción agregada al setlist')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error agregando canción')
    }
  }

  const handleDeleteRepertoireSong = async (itemId: number) => {
    setActionStatus(null)
    try {
      await fetchJson(buildUrl('music', `/repertoire-songs/${itemId}`), { method: 'DELETE' })
      repertoireSongs.refresh()
      setActionStatus('Ítem eliminado del repertorio')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error eliminando ítem')
    }
  }

  const persistRepertoireOrder = async (orderedItemIds: number[], fallbackOrderIds: number[]) => {
    if (!selectedRepertoire) return
    setSetlistOrderOverrideIds(orderedItemIds)
    setSavingSetlistOrder(true)
    try {
      await fetchJson(buildUrl('music', `/repertoires/${selectedRepertoire.id}/repertoire-songs/reorder`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repertoire_id: selectedRepertoire.id,
          ordered_item_ids: orderedItemIds,
        }),
      })
      await repertoireSongs.refresh()
      setSetlistOrderOverrideIds(null)
      setActionStatus('Orden del setlist actualizado')
    } catch (err) {
      setSetlistOrderOverrideIds(fallbackOrderIds)
      setActionStatus(err instanceof Error ? err.message : 'Error reordenando setlist')
    } finally {
      setSavingSetlistOrder(false)
    }
  }

  const handleDragStartSetlistItem = (event: DragEvent<HTMLElement>, itemId: number) => {
    setDraggingSetlistItemId(itemId)
    setDragOverSetlistItemId(itemId)
    setIsDragOverSetlistEnd(false)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(itemId))
  }

  const handleDragOverSetlistItem = (event: DragEvent<HTMLElement>, itemId: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setIsDragOverSetlistEnd(false)
    if (dragOverSetlistItemId !== itemId) {
      setDragOverSetlistItemId(itemId)
    }
  }

  const getDraggedItemId = (event: DragEvent<HTMLElement>) => {
    const sourceRaw = event.dataTransfer.getData('text/plain')
    const sourceItemId = Number(sourceRaw)
    if (Number.isFinite(sourceItemId) && sourceItemId > 0) return sourceItemId
    return draggingSetlistItemId
  }

  const buildReorderedIds = (sourceItemId: number, targetIndex: number) => {
    const currentOrder = setlistEditorItems.map((item) => item.id)
    const sourceIndex = currentOrder.indexOf(sourceItemId)
    if (sourceIndex < 0 || sourceIndex === targetIndex) return null

    const nextOrder = [...currentOrder]
    const [moved] = nextOrder.splice(sourceIndex, 1)
    nextOrder.splice(targetIndex, 0, moved)
    return { currentOrder, nextOrder }
  }

  const handleDropSetlistItem = async (event: DragEvent<HTMLElement>, targetItemId: number) => {
    event.preventDefault()
    const draggedItemId = getDraggedItemId(event)

    setDragOverSetlistItemId(null)
    setDraggingSetlistItemId(null)
    setIsDragOverSetlistEnd(false)

    if (!draggedItemId || draggedItemId === targetItemId) return

    const targetIndex = setlistEditorItems.findIndex((item) => item.id === targetItemId)
    if (targetIndex < 0) return

    const reordered = buildReorderedIds(draggedItemId, targetIndex)
    if (!reordered) return

    await persistRepertoireOrder(reordered.nextOrder, reordered.currentOrder)
  }

  const handleDragOverSetlistEnd = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverSetlistItemId(null)
    setIsDragOverSetlistEnd(true)
  }

  const handleDropSetlistEnd = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const draggedItemId = getDraggedItemId(event)

    setDragOverSetlistItemId(null)
    setDraggingSetlistItemId(null)
    setIsDragOverSetlistEnd(false)

    if (!draggedItemId) return

    const targetIndex = Math.max(0, setlistEditorItems.length - 1)
    const reordered = buildReorderedIds(draggedItemId, targetIndex)
    if (!reordered) return

    await persistRepertoireOrder(reordered.nextOrder, reordered.currentOrder)
  }

  const handleDragEndSetlistItem = () => {
    setDraggingSetlistItemId(null)
    setDragOverSetlistItemId(null)
    setIsDragOverSetlistEnd(false)
  }

  const handleNormalizeCurrentSetlist = async () => {
    if (!selectedRepertoire) return
    setActionStatus(null)
    try {
      await fetchJson(buildUrl('music', '/repertoire-songs/normalize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repertoire_id: selectedRepertoire.id }),
      })
      await repertoireSongs.refresh()
      setActionStatus('Setlist normalizado en orden consecutivo')
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : 'Error normalizando setlist')
    }
  }

  const clearCalendarClickTimeout = () => {
    if (calendarClickTimeoutRef.current === null) return
    window.clearTimeout(calendarClickTimeoutRef.current)
    calendarClickTimeoutRef.current = null
  }

  const openCalendarEventSection = (eventId: number, section: MusicSection) => {
    setPracticeMode('event')
    setLibraryPracticeSongId(null)
    setSelectedEventId(eventId)
    setActiveSection(section)
  }

  const handleCalendarEventClick = (eventId: number) => {
    clearCalendarClickTimeout()
    calendarClickTimeoutRef.current = window.setTimeout(() => {
      openCalendarEventSection(eventId, 'ensayo')
      calendarClickTimeoutRef.current = null
    }, 220)
  }

  const handleCalendarEventDoubleClick = (eventId: number) => {
    clearCalendarClickTimeout()
    openCalendarEventSection(eventId, 'setlist')
  }

  useEffect(() => {
    setDraggingSetlistItemId(null)
    setDragOverSetlistItemId(null)
    setIsDragOverSetlistEnd(false)
    setSetlistOrderOverrideIds(null)
    setlistItemRefs.current = {}
    previousSetlistPositionsRef.current = {}
  }, [selectedRepertoire?.id])

  useEffect(() => () => {
    clearCalendarClickTimeout()
  }, [])

  useEffect(() => {
    if (!setlistOrderOverrideIds || !selectedRepertoire) return
    const currentIds = repertoireSongs.data
      .filter((item) => item.repertoire_id === selectedRepertoire.id)
      .map((item) => item.id)

    const expected = [...setlistOrderOverrideIds].sort((a, b) => a - b)
    const actual = [...currentIds].sort((a, b) => a - b)
    if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
      setSetlistOrderOverrideIds(null)
    }
  }, [setlistOrderOverrideIds, repertoireSongs.data, selectedRepertoire])

  const renderRehearsalPanel = () => {
    if (practiceMode === 'event' && !selectedRehearsal) {
      return (
        <Panel
          title="Ensayo"
          subtitle="Elige un culto o una canción para comenzar a ensayar."
          className="module-panel--full"
        >
          <div className="table-row loading">No hay evento seleccionado.</div>
        </Panel>
      )
    }

    if (practiceMode === 'event' && !selectedRepertoire) {
      return (
        <Panel
          title={selectedRehearsal ? `Ensayo · ${selectedRehearsal.eventName}` : 'Ensayo'}
          subtitle="Este culto todavía no tiene setlist disponible para ensayo."
          className="module-panel--full"
        >
          <div className="table-row loading">El evento aún no tiene repertorio creado.</div>
        </Panel>
      )
    }

    if (practiceMode === 'library' && !libraryPracticeSong) {
      return (
        <Panel
          title="Ensayo"
          subtitle="Selecciona una canción desde Biblioteca para abrir ensayo individual."
          className="module-panel--full"
        >
          <div className="table-row loading">Todavía no seleccionas una canción para ensayar.</div>
        </Panel>
      )
    }

    return (
      <Panel
        title={
          practiceMode === 'event'
            ? `Ensayo · ${selectedRehearsal?.eventName ?? 'Evento'}`
            : `Ensayo · ${libraryPracticeSong?.name ?? 'Canción'}`
        }
        subtitle={
          practiceMode === 'event'
            ? 'Ensaya el culto seleccionado con navegación de setlist y control de multipistas.'
            : 'Ensayo individual desde biblioteca (sin navegación de setlist).'
        }
        className="module-panel--full"
      >
        <div className="music-focus-panel">
          <div className="music-focus-header">
            <h4>Modo ensayo</h4>
            {showPracticeNavigation ? (
              <label className="field">
                Canción actual
                <select
                  className="input"
                  value={focusedSongId ? String(focusedSongId) : ''}
                  onChange={(event) => setFocusedSongId(Number(event.target.value))}
                  disabled={setlistSongs.length === 0}
                >
                  {setlistSongs.length === 0 ? (
                    <option value="">Sin canciones</option>
                  ) : (
                    setlistSongs.map((item) => (
                      <option key={`focus-song-${item.id}`} value={item.songId}>
                        {item.order !== 999 ? `${item.order}. ` : ''}{item.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
          </div>

          <div className="music-focus-cards">
            <article className="music-focus-card current">
              <span>Actual</span>
              <strong>{practiceSong?.name ?? '—'}</strong>
              <small>Tonalidad: {practiceSong?.key ?? '—'}</small>
              <small>BPM: {practiceSong?.bpm ?? '—'}</small>
              {practiceSong?.pdf ? (
                <button
                  className="action-button ghost music-link-button"
                  type="button"
                  onClick={() => openExternalLink(practiceSong.pdf)}
                >
                  Abrir chart
                </button>
              ) : null}
            </article>

            {showPracticeNavigation ? (
              <article className="music-focus-card next">
                <span>Siguiente</span>
                <strong>{nextSong?.name ?? 'Fin del setlist'}</strong>
                <small>Tonalidad: {nextSong?.key ?? '—'}</small>
                <small>BPM: {nextSong?.bpm ?? '—'}</small>
                {nextSong?.pdf ? (
                  <button
                    className="action-button ghost music-link-button"
                    type="button"
                    onClick={() => openExternalLink(nextSong.pdf)}
                  >
                    Abrir chart
                  </button>
                ) : null}
              </article>
            ) : null}
          </div>

          {(currentSongMediaEmbed || hasPracticePdf || hasPracticeLyrics) ? (
            <div className="music-media-grid">
              {currentSongMediaEmbed ? (
                <div className="music-youtube-player">
                  <iframe
                    src={currentSongMediaEmbed}
                    title="Media preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                  {currentSongMediaLink ? (
                    <button
                      className="action-button ghost music-link-button"
                      type="button"
                      onClick={() => openExternalLink(currentSongMediaLink)}
                    >
                      {currentSongMediaProvider === 'youtube'
                        ? 'Abrir en YouTube'
                        : currentSongMediaProvider === 'soundcloud'
                          ? 'Abrir en SoundCloud'
                          : currentSongMediaProvider === 'spotify'
                            ? 'Abrir en Spotify'
                            : currentSongMediaProvider === 'apple'
                              ? 'Abrir en Apple Music'
                              : 'Abrir enlace'}
                      </button>
                  ) : null}
                </div>
              ) : null}

              {(hasPracticePdf || hasPracticeLyrics) ? (
                <div className="music-pdf-viewer">
                  {shouldShowChartModeSwitch ? (
                    <div className="music-chart-toggle" role="tablist" aria-label="Vista de chart">
                      <button
                        className={`music-chart-toggle__button ${chartViewMode === 'pdf' ? 'is-active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={chartViewMode === 'pdf'}
                        onClick={() => setChartViewMode('pdf')}
                      >
                        PDF
                      </button>
                      <button
                        className={`music-chart-toggle__button ${chartViewMode === 'lyrics' ? 'is-active' : ''}`}
                        type="button"
                        role="tab"
                        aria-selected={chartViewMode === 'lyrics'}
                        onClick={() => setChartViewMode('lyrics')}
                      >
                        Letra
                      </button>
                    </div>
                  ) : null}

                  {chartViewMode === 'lyrics' && hasPracticeLyrics ? (
                    <div className="music-lyrics-viewer" aria-label="Letra de la canción">
                      {renderLyricsMarkdown(practiceSong?.lyrics ?? '')}
                    </div>
                  ) : hasPracticePdf ? (
                    <iframe src={practiceSong?.pdf ?? ''} title="PDF chart" />
                  ) : (
                    <div className="music-lyrics-viewer" aria-label="Letra de la canción">
                      {renderLyricsMarkdown(practiceSong?.lyrics ?? '')}
                    </div>
                  )}

                  <div className="music-pdf-viewer-actions">
                    {hasPracticePdf ? (
                      <>
                        <button
                          className="action-button ghost"
                          type="button"
                          onClick={() => setFullScreenPdfUrl(practiceSong?.pdf ?? '')}
                        >
                          Pantalla completa
                        </button>
                        <button
                          className="action-button ghost music-link-button"
                          type="button"
                          onClick={() => openExternalLink(practiceSong?.pdf ?? '')}
                        >
                          Abrir PDF en pestaña nueva
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showPracticeNavigation ? (
            <label className="field">
              Notas rápidas de ensayo
              <textarea
                className="input"
                rows={4}
                value={rehearsalNotes}
                onChange={(event) => updateRehearsalNotes(event.target.value)}
                placeholder="Entradas, cortes, dinámicas, cues..."
              />
            </label>
          ) : null}

          {showPracticeNavigation ? (
            <div className="music-live-nav">
              <button
                className="music-live-nav-button"
                type="button"
                onClick={() => moveFocusedSong(-1)}
                disabled={!hasPreviousSong}
              >
                ◀ Anterior
              </button>
              <button
                className="music-live-nav-button"
                type="button"
                onClick={() => moveFocusedSong(1)}
                disabled={!hasNextSong}
              >
                Siguiente ▶
              </button>
            </div>
          ) : null}

          <div className="music-stems-mixer">
            <div className="music-stems-mixer__header">
              <h5>Multipista</h5>
              <small>
                {practiceSong
                  ? `Song ID ${practiceSong.songId} · ${currentSongStems.length} stem(s)`
                  : 'Selecciona una canción'}
              </small>
            </div>

            {currentSongStems.length > 0 ? (
              <div className="music-stems-mixer__progress">
                <small>
                  Carga: {loadedCurrentStemsCount}/{currentSongStems.length} detectadas ·
                  Buffer mínimo: {formatMixerTime(minBufferedCurrentSeconds)} / {formatMixerTime(autoBufferTargetSeconds)}
                  {erroredCurrentStemsCount > 0 ? ` · ${erroredCurrentStemsCount} con error` : ''}
                </small>
                <small>Prebuffer automático activo ({formatMixerTime(autoBufferTargetSeconds)} objetivo).</small>
                <div className="music-stems-load-list">
                  {currentSongStems.map((stem) => {
                    const status = stemLoadStatusById[stem.id] ?? 'pending'
                    if (status === 'ready') return null
                    return (
                      <span
                        key={`stem-load-${stem.id}`}
                        className={`music-stem-load-chip music-stem-load-chip--${status}`}
                      >
                        {status === 'error' ? '!' : '…'} {stem.stem_name}
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {currentSongStems.length === 0 ? (
              <small className="muted">No hay multipistas para esta canción. Carga un ZIP en la biblioteca.</small>
            ) : (
              <div className="music-stems-mixer__list">
                {currentSongStems.map((stem) => {
                  const config = stemMixerConfig[Number(stem.id)] ?? { volume: 1, solo: false, muted: false }
                  return (
                    <div key={`mixer-stem-${stem.id}`} className="music-stem-row">
                      <div className="music-stem-row__meta">
                        <strong>{stem.stem_name}</strong>
                        <small>{stem.format ? stem.format.toUpperCase() : ''}</small>
                      </div>
                      <div className="music-stem-row__waveform">
                        {/* Aquí puedes agregar una visualización simple o dejarlo vacío */}
                      </div>
                      <div className="music-stem-row__vu-fader">
                        <div className="music-stem-row__vu-lane">
                          <div className="music-stem-row__vu">
                            <span
                              className="music-stem-row__vu-fill"
                              ref={(element) => {
                                stemMeterFillRefs.current[stem.id] = element
                              }}
                              style={{ height: '4%' }}
                            />
                          </div>
                        </div>
                        <div className="music-stem-row__fader-lane">
                          <span
                            className="music-stem-row__fader-line"
                            aria-hidden="true"
                            style={{ ['--fader-fill' as string]: `${Math.round(config.volume * 100)}%` }}
                          />
                          <input
                            className="music-stem-row__fader"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={config.volume}
                            style={{ ['--fader-fill' as string]: `${Math.round(config.volume * 100)}%` }}
                            onChange={(event) =>
                              updateStemConfig(stem.id, { volume: Number(event.target.value) })
                            }
                          />
                        </div>
                      </div>
                      <div className="music-stem-row__lr" aria-hidden="true">
                        <span>L</span>
                        <span>R</span>
                      </div>
                      <span className="music-stem-row__volume">{Math.round(config.volume * 100)}%</span>
                      <div className="music-stem-row__actions">
                        <button
                          className={`action-button ghost music-stem-toggle music-stem-toggle--mute ${config.muted ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => updateStemConfig(stem.id, { muted: !config.muted })}
                        >
                          M
                        </button>
                        <button
                          className={`action-button ghost music-stem-toggle music-stem-toggle--solo ${config.solo ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => updateStemConfig(stem.id, { solo: !config.solo })}
                        >
                          S
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="music-stems-mixer__player">
              {activeSectionMarkers.length > 0 ? (
                <div className="music-structure-markers" aria-label="Partes de la canción">
                  {activeSectionMarkers.map((marker, index) => (
                    <button
                      key={`${practiceSong?.songId ?? 'song'}-section-${index}-${marker.time}`}
                      className="music-structure-marker"
                      type="button"
                      onClick={() => handleSectionMarkerSeek(marker.seconds)}
                      disabled={currentSongStems.length === 0}
                      title={`${marker.section} · ${marker.time}`}
                      aria-label={`Ir a ${marker.section} en ${marker.time}`}
                    >
                      {marker.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeAnalysisStatus && activeSectionMarkers.length === 0 ? (
                <small>
                  Analisis guia: {activeAnalysisStatus.status}
                  {activeAnalysisStatus.sections_found > 0 ? ` (${activeAnalysisStatus.sections_found} secciones)` : ''}
                </small>
              ) : null}
              <div className="music-stems-mixer__timeline">
                <button
                  className={`music-waveform ${waveformLoadingSongId === practiceSong?.songId ? 'is-loading' : ''}`}
                  type="button"
                  onClick={handleWaveformSeek}
                  disabled={currentSongStems.length === 0}
                  aria-label="Mover reproducción en la forma de onda"
                  title="Haz clic en la forma de onda para mover la reproducción"
                >
                  <span className="music-waveform__bars" aria-hidden="true">
                    {waveformBars}
                  </span>
                  <span
                    className="music-waveform__playhead"
                    aria-hidden="true"
                    style={{ left: `${mixerProgressPercent}%` }}
                  />
                </button>
                <small>
                  {formatMixerTime(mixerPosition)} / {formatMixerTime(mixerDuration)}
                </small>
              </div>

              <div className="music-stems-mixer__actions music-stems-mixer__actions--transport">
                <button
                  className="action-button ghost music-stems-mixer__transport-btn"
                  type="button"
                  onClick={() => handleShiftMixer(-10)}
                  disabled={currentSongStems.length === 0}
                  aria-label="Retroceder 10 segundos"
                  title="Retroceder 10 segundos"
                >
                  <svg className="music-stems-mixer__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11 7.5L5 12l6 4.5V7.5z" />
                    <path d="M18 7.5L12 12l6 4.5V7.5z" />
                  </svg>
                  <span>-10s</span>
                </button>
                {!mixerPlaying ? (
                  <button
                    className="primary music-stems-mixer__transport-btn music-stems-mixer__transport-btn--main"
                    type="button"
                    onClick={() => void handlePlayMixer()}
                    disabled={!canStartMixer || mixerRebuffering}
                    aria-label={
                      allCurrentStemsReady
                        ? 'Reproducir'
                        : `Buffering ${bufferedReadyCount}/${minimumReadyToStart}`
                    }
                    title={
                      allCurrentStemsReady
                        ? 'Reproducir'
                        : `Buffering ${bufferedReadyCount}/${minimumReadyToStart}`
                    }
                  >
                    <svg className="music-stems-mixer__icon-svg music-stems-mixer__icon-svg--fill" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 7.5v9l8-4.5-8-4.5z" />
                    </svg>
                    <span>Reproducir</span>
                  </button>
                ) : (
                  <button
                    className="primary music-stems-mixer__transport-btn music-stems-mixer__transport-btn--main"
                    type="button"
                    onClick={handlePauseMixer}
                    aria-label="Pausar"
                    title="Pausar"
                  >
                    <svg className="music-stems-mixer__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 7h2.5v10H9z" />
                      <path d="M12.5 7H15v10h-2.5z" />
                    </svg>
                    <span>Pausar</span>
                  </button>
                )}
                <button
                  className="action-button ghost music-stems-mixer__transport-btn"
                  type="button"
                  onClick={() => handleShiftMixer(10)}
                  disabled={currentSongStems.length === 0}
                  aria-label="Adelantar 10 segundos"
                  title="Adelantar 10 segundos"
                >
                  <svg className="music-stems-mixer__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 7.5L12 12l-6 4.5V7.5z" />
                    <path d="M13 7.5l6 4.5-6 4.5V7.5z" />
                  </svg>
                  <span>+10s</span>
                </button>
                <button
                  className="action-button ghost music-stems-mixer__transport-btn"
                  type="button"
                  onClick={handleStopMixer}
                  disabled={currentSongStems.length === 0}
                  aria-label="Detener"
                  title="Detener"
                >
                  <svg className="music-stems-mixer__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                  </svg>
                  <span>Detener</span>
                </button>
              </div>

              {mixerRebuffering ? <small className="muted">Rebufferizando...</small> : null}
            </div>
          </div>
          {showPracticeNavigation ? <small className="muted">Atajos: usa ← y → para cambiar canción en vivo.</small> : null}
        </div>
      </Panel>
    )
  }

  return (
    <div className="app">
      <MusicSidebar activeSection={activeSection} setActiveSection={setActiveSection} onLogout={onLogout} />
      <main className="main">
        <MusicHeader />

        {actionStatus && <div className="notice">{actionStatus}</div>}

        {activeSection === 'general' && (
          <section className="section-grid">
            <Panel
              title="Próximos cultos y eventos de Alabanza y Adoración"
              subtitle="Selecciona la acción: ensayar o editar setlist del culto."
              className="module-panel--full"
            >
              {schedules.loading || events.loading ? (
                <div className="table-row loading">Cargando ensayos...</div>
              ) : rehearsalCards.length === 0 ? (
                <div className="table-row loading">No hay ensayos programados.</div>
              ) : (
                <div className="music-rehearsal-grid">
                  {rehearsalCards.map((item) => {
                    const isActive = selectedRehearsal?.schedule.id === item.schedule.id
                    return (
                      <article
                        key={`rehearsal-card-${item.schedule.id}`}
                        className={`music-rehearsal-card ${isActive ? 'active' : ''}`}
                      >
                        <strong>{item.eventName}</strong>
                        <span>Fecha: {item.date || 'Sin fecha'}</span>
                        <span>Horario: {item.startTime} - {item.endTime}</span>
                        <span>Setlist: {item.songsCount} canciones</span>
                        <div className="music-library-actions">
                          <button
                            className="action-button ghost music-card-action"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPracticeMode('event')
                              setLibraryPracticeSongId(null)
                              setSelectedEventId(item.schedule.event_id)
                              setActiveSection('ensayo')
                            }}
                          >
                            Ensayar
                          </button>
                          <button
                            className="action-button music-card-action music-card-action--primary"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPracticeMode('event')
                              setLibraryPracticeSongId(null)
                              setSelectedEventId(item.schedule.event_id)
                              setActiveSection('setlist')
                            }}
                          >
                            Editar setlist
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </Panel>

            <Panel
              title="Calendario de Alabanza y Adoración"
              subtitle="Solo se muestran eventos cuyo cronograma tiene tipo Alabanza y Adoración."
              className="module-panel--full"
            >
              <div className="calendar-main">
                <div className="calendar-header">
                  <h3>{calendarMonthLabel}</h3>
                  <div className="form-actions">
                    <button
                      className="action-button ghost"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1)
                        )
                      }
                    >
                      ◀ Mes anterior
                    </button>
                    <button
                      className="action-button ghost"
                      type="button"
                      onClick={() =>
                        setCalendarMonth(
                          (previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1)
                        )
                      }
                    >
                      Mes siguiente ▶
                    </button>
                  </div>
                </div>

                <div className="calendar-grid">
                  {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((label) => (
                    <div key={`music-calendar-header-${label}`} className="calendar-grid__header">
                      {label}
                    </div>
                  ))}

                  {worshipCalendarDays.map((day, index) => {
                    if (!day) {
                      return <div key={`music-calendar-empty-${index}`} className="calendar-day calendar-day--empty" />
                    }

                    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
                    const items = worshipCalendarItemsByDate.get(dateKey) ?? []
                    return (
                      <div key={`music-calendar-day-${dateKey}`} className="calendar-day">
                        <div className="calendar-day__header">{day.getDate()}</div>
                        <div className="calendar-day__events">
                          {items.length === 0 ? (
                            <span className="muted">Sin eventos</span>
                          ) : (
                            items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="calendar-event calendar-event--event"
                                onClick={() => handleCalendarEventClick(item.eventId)}
                                onDoubleClick={() => handleCalendarEventDoubleClick(item.eventId)}
                                title={`${item.title} · ${item.timeLabel}`}
                              >
                                <strong>{item.title}</strong>
                                <small>{item.timeLabel}</small>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Panel>
          </section>
        )}

        {activeSection === 'ensayo' && (
          <section className="section-grid">
            {renderRehearsalPanel()}
          </section>
        )}

        {activeSection === 'setlist' && (
          <section className="section-grid">
            <Panel
              title={selectedRehearsal ? `Setlist · ${selectedRehearsal.eventName}` : 'Setlist'}
              subtitle="Gestiona el setlist con CRUD, eligiendo aquí mismo el culto/evento."
              className="module-panel--full"
            >
              <label className="field">
                Culto / Evento a editar
                <select
                  className="input"
                  value={selectedRehearsal ? String(selectedRehearsal.schedule.event_id) : ''}
                  onChange={(event) => {
                    setPracticeMode('event')
                    setLibraryPracticeSongId(null)
                    setSelectedEventId(Number(event.target.value))
                  }}
                  disabled={rehearsalCards.length === 0}
                >
                  {rehearsalCards.length === 0 ? (
                    <option value="">Sin eventos disponibles</option>
                  ) : (
                    rehearsalCards.map((item) => (
                      <option key={`setlist-event-${item.schedule.id}`} value={item.schedule.event_id}>
                        {item.eventName} · {item.date || 'Sin fecha'} · {item.startTime}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {!selectedRehearsal ? (
                <div className="table-row loading">Selecciona un culto/evento para editar su setlist.</div>
              ) : !selectedRepertoire ? (
                <div className="table-row loading">Este culto aún no tiene repertorio creado.</div>
              ) : (
                <div className="music-setlist-layout">
                  <div className="music-setlist-add">
                    <h4>Agregar canción al setlist</h4>
                    <form className="form" onSubmit={handleAddRepertoireSong}>
                      <label className="field">
                        Canción
                        <select
                          className="input"
                          value={setlistForm.song_id}
                          onChange={(event) =>
                            setSetlistForm({ ...setlistForm, song_id: event.target.value })
                          }
                          required
                        >
                          <option value="">Selecciona canción</option>
                          {songs.data.map((song) => (
                            <option key={`setlist-song-${song.id}`} value={song.id}>
                              {song.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Tonalidad (opcional)
                        <input
                          className="input"
                          value={setlistForm.tonalidad_override}
                          onChange={(event) =>
                            setSetlistForm({ ...setlistForm, tonalidad_override: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        BPM (opcional)
                        <input
                          className="input"
                          value={setlistForm.bpm_override}
                          onChange={(event) =>
                            setSetlistForm({ ...setlistForm, bpm_override: event.target.value })
                          }
                        />
                      </label>
                      <button className="primary" type="submit" disabled={!setlistForm.song_id}>
                        Agregar canción
                      </button>
                    </form>
                  </div>

                  <div className="music-setlist-table">
                    <div className="music-setlist-table-header">
                      <p>Arrastra canciones para reordenar el setlist.</p>
                      <button
                        className="action-button ghost"
                        type="button"
                        onClick={handleNormalizeCurrentSetlist}
                        disabled={!selectedRepertoire || setlistEditorItems.length === 0 || savingSetlistOrder}
                      >
                        Normalizar orden
                      </button>
                    </div>

                    {repertoireSongs.loading ? (
                      <div className="table-row loading">Cargando setlist...</div>
                    ) : setlistEditorItems.length === 0 ? (
                      <div className="table-row loading">Este setlist todavía no tiene canciones</div>
                    ) : (
                      <div className="music-setlist-dnd" role="list" aria-label="Canciones del setlist">
                        {setlistEditorItems.map((item, index) => {
                          const isDragging = draggingSetlistItemId === item.id
                          const isDropTarget =
                            dragOverSetlistItemId === item.id &&
                            draggingSetlistItemId !== null &&
                            draggingSetlistItemId !== item.id
                          return (
                            <article
                              key={`setlist-item-${item.id}`}
                              role="listitem"
                              ref={(element) => setSetlistItemRef(item.id, element)}
                              className={`music-setlist-item ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
                              onDragOver={(event) => handleDragOverSetlistItem(event, item.id)}
                              onDrop={(event) => {
                                void handleDropSetlistItem(event, item.id)
                              }}
                            >
                              <div className="music-setlist-item-order">{index + 1}</div>
                              <span
                                className="music-setlist-drag-handle"
                                aria-hidden="true"
                                title="Arrastra para reordenar"
                                draggable={!savingSetlistOrder}
                                onDragStart={(event) => handleDragStartSetlistItem(event, item.id)}
                                onDragEnd={handleDragEndSetlistItem}
                              >
                                ⋮⋮
                              </span>
                              <div className="music-setlist-item-main">
                                <strong>{item.name}</strong>
                                <span>Tonalidad: {item.key} · BPM: {item.bpm}</span>
                              </div>
                              <div className="music-setlist-item-actions">
                                {item.pdf ? (
                                  <button
                                    className="action-button ghost music-link-button"
                                    type="button"
                                    onClick={() => openExternalLink(item.pdf)}
                                  >
                                    Abrir PDF
                                  </button>
                                ) : (
                                  <span className="muted">Sin PDF</span>
                                )}
                                <button
                                  className="action-button danger"
                                  type="button"
                                  onClick={() => handleDeleteRepertoireSong(item.id)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </article>
                          )
                        })}
                        <div
                          className={`music-setlist-drop-end ${isDragOverSetlistEnd ? 'is-active' : ''}`}
                          onDragOver={handleDragOverSetlistEnd}
                          onDrop={(event) => {
                            void handleDropSetlistEnd(event)
                          }}
                        >
                          Soltar aquí para mover al final
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </section>
        )}

        {activeSection === 'canciones' && (
          <section className="section-grid">
            <Panel
              title="Biblioteca de canciones"
              subtitle="Explora canciones y abre ensayo individual con un clic."
              className="module-panel--full"
              actions={
                <button className="primary" type="button" onClick={handleOpenCreateSong}>
                  Crear canción
                </button>
              }
            >
              <label className="field">
                Buscar canción
                <input
                  className="input"
                  value={songSearch}
                  onChange={(event) => setSongSearch(event.target.value)}
                  placeholder="Título, autor o tonalidad"
                />
              </label>
              {songs.loading ? (
                <div className="table-row loading">Cargando canciones...</div>
              ) : filteredSongs.length === 0 ? (
                <div className="table-row loading">{songs.error ?? 'Sin canciones'}</div>
              ) : (
                <div className="music-library-grid">
                  {filteredSongs.map((song) => {
                    const thumbnail = mediaThumbnailsBySongId[song.id] ?? ''
                    const mediaProvider = getMediaProvider(song.youtube_url)
                    const stems = stemsBySongId.get(song.id) ?? []
                    const isActivePractice = libraryPracticeSongId === song.id
                    return (
                      <article
                        key={`music-library-song-${song.id}`}
                        className={`music-library-card ${isActivePractice ? 'active' : ''}`}
                        onClick={() => {
                          setLibraryPracticeSongId(song.id)
                          setPracticeMode('library')
                          setActiveSection('ensayo')
                        }}
                      >
                        <div className="music-library-thumb-wrap">
                          {thumbnail ? (
                            <img src={thumbnail} alt={song.name} className="music-library-thumb" />
                          ) : (
                            <div
                              className={`music-library-thumb music-library-thumb--placeholder music-library-thumb--placeholder--${mediaProvider}`}
                            >
                              <strong>{getMediaPlaceholderLabel(mediaProvider, song.name)}</strong>
                            </div>
                          )}
                        </div>

                        <div className="music-library-meta">
                          <div className="music-library-title-row">
                            <h4>{song.name}</h4>
                            <span className={`music-provider-badge music-provider-badge--${mediaProvider}`}>
                              {mediaProvider === 'youtube'
                                ? 'YouTube'
                                : mediaProvider === 'soundcloud'
                                  ? 'SoundCloud'
                                  : mediaProvider === 'spotify'
                                    ? 'Spotify'
                                    : mediaProvider === 'apple'
                                      ? 'Apple Music'
                                      : 'Sin enlace'}
                            </span>
                          </div>
                          <p>{song.author ?? 'Autor no definido'}</p>
                          <small>Tonalidad: {song.key ?? '—'} · BPM: {song.bpm ?? '—'}</small>
                          <small>
                            Multipista: {stems.length > 0 ? `${stems.length} stem(s)` : 'No'}
                          </small>
                        </div>

                        {stems.length > 0 ? (
                          <div className="music-library-stems">
                            {stems.slice(0, 4).map((stem) => (
                              <span key={`stem-chip-${song.id}-${stem.id}`}>{stem.stem_name}</span>
                            ))}
                            {stems.length > 4 ? <span>+{stems.length - 4} más</span> : null}
                          </div>
                        ) : null}

                        <div className="music-library-actions">
                          <button
                            className="action-button ghost"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleStartEditSong(song)
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="action-button danger"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleDeleteSong(song.id)
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </Panel>

            {showSongEditor ? (
              <div className="modal-backdrop" onClick={handleCancelEditSong}>
                <div className="modal" onClick={(event) => event.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{songForm.id ? 'Editar canción' : 'Crear canción'}</h3>
                    <button className="action-button ghost" type="button" onClick={handleCancelEditSong}>
                      Cerrar
                    </button>
                  </div>

                  <form className="form" onSubmit={handleCreateSong}>
                    <label className="field">
                      Título
                      <input
                        className="input"
                        value={songForm.name}
                        onChange={(event) => setSongForm({ ...songForm, name: event.target.value })}
                        required
                      />
                    </label>
                    <label className="field">
                      Autor
                      <input
                        className="input"
                        value={songForm.author}
                        onChange={(event) => setSongForm({ ...songForm, author: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      BPM
                      <input
                        className="input"
                        value={songForm.bpm}
                        onChange={(event) => setSongForm({ ...songForm, bpm: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      Tonalidad
                      <input
                        className="input"
                        value={songForm.key}
                        onChange={(event) => setSongForm({ ...songForm, key: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      PDF del chart
                      <input
                        className="input"
                        value={songForm.pdf}
                        onChange={(event) => setSongForm({ ...songForm, pdf: event.target.value })}
                        placeholder="https://... o sube un PDF"
                      />
                    </label>
                    <label className="field">
                      Subir PDF
                      <input
                        className="input"
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          void handleUploadPdf(file)
                          event.currentTarget.value = ''
                        }}
                        disabled={uploadingPdf}
                      />
                      {uploadingPdf ? <small className="muted">Subiendo PDF...</small> : null}
                    </label>
                    <label className="field">
                      Link multimedia
                      <input
                        className="input"
                        value={songForm.youtube}
                        onChange={(event) => setSongForm({ ...songForm, youtube: event.target.value })}
                        placeholder="YouTube, SoundCloud, Spotify o Apple Music"
                      />
                    </label>
                    <label className="field">
                      Letra (Markdown)
                      <textarea
                        className="input"
                        rows={8}
                        value={songForm.lyrics}
                        onChange={(event) => setSongForm({ ...songForm, lyrics: event.target.value })}
                        placeholder={'# Verso 1\nTexto de la estrofa...\n\n# Coro\nTexto del coro...\n\n# Puente\nTexto del puente...'}
                      />
                    </label>
                    <label className="field">
                      Archivo ZIP multipista (opcional)
                      <input
                        className="input"
                        type="file"
                        accept=".zip,application/zip"
                        onChange={(event) => setMultitrackZipFile(event.target.files?.[0] ?? null)}
                        disabled={uploadingMultitrackZip}
                      />
                      {multitrackZipFile ? <small className="muted">Seleccionado: {multitrackZipFile.name}</small> : null}
                      {uploadingMultitrackZip ? <small className="muted">Procesando ZIP de multipistas...</small> : null}
                      {isEditorUploadInProgress && editorUploadProgress !== null ? (
                        <div className="upload-progress" role="status" aria-live="polite">
                          <div className="upload-progress__track" aria-hidden="true">
                            <span
                              className={`upload-progress__fill ${editorAnalysisStatus?.status === 'failed' ? 'is-error' : ''}`}
                              style={{ width: `${editorUploadProgress}%` }}
                            />
                          </div>
                          <div className="upload-progress__meta">
                            <small className="upload-progress__detail">{editorUploadProgressMessage}</small>
                            <small className="upload-progress__summary">
                              <span
                                className={`upload-progress__status ${editorAnalysisStatus?.status === 'failed' ? 'is-error' : ''}`}
                              >
                                {editorUploadStatusLabel}
                              </span>
                              <span>{Math.round(editorUploadProgress)}%</span>
                              {editorUploadEtaMessage ? <span className="muted">{editorUploadEtaMessage}</span> : null}
                            </small>
                          </div>
                        </div>
                      ) : null}
                    </label>

                    <div className="row-actions">
                      <button className="primary" type="submit" disabled={savingSong || uploadingMultitrackZip || uploadingPdf}>
                        {savingSong
                          ? 'Guardando...'
                          : uploadingPdf
                            ? 'Subiendo PDF...'
                            : songForm.id
                              ? 'Actualizar canción'
                              : 'Guardar canción'}
                      </button>
                      {editingSongId ? (
                        <button
                          className="action-button danger"
                          type="button"
                          onClick={() => void handleDeleteSongMultitracks(editingSongId)}
                          disabled={editingSongStemsCount === 0 || deletingMultitracksSongId === editingSongId}
                        >
                          {deletingMultitracksSongId === editingSongId ? 'Borrando...' : 'Borrar multipistas'}
                        </button>
                      ) : null}
                      <button className="action-button ghost" type="button" onClick={handleCancelEditSong}>
                        Cancelar
                      </button>
                    </div>
                    {actionStatus ? <small className="muted">{actionStatus}</small> : null}
                    {editorDeleteProgress !== null ? (
                      <div className="upload-progress is-delete" role="status" aria-live="polite">
                        <div className="upload-progress__track" aria-hidden="true">
                          <span
                            className="upload-progress__fill is-delete"
                            style={{ width: `${editorDeleteProgress}%` }}
                          />
                        </div>
                        <div className="upload-progress__meta">
                          <small className="upload-progress__detail">{editorDeleteProgressMessage}</small>
                          <small className="upload-progress__summary">
                            <span className="upload-progress__status">Borrando</span>
                            <span>{Math.round(editorDeleteProgress)}%</span>
                          </small>
                        </div>
                      </div>
                    ) : null}
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {fullScreenPdfUrl ? (
          <div className="modal-backdrop" onClick={() => setFullScreenPdfUrl(null)}>
            <div className="modal modal--pdf-full" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>Lectura de PDF</h3>
                <button className="action-button ghost" type="button" onClick={() => setFullScreenPdfUrl(null)}>
                  Cerrar
                </button>
              </div>
              <iframe src={fullScreenPdfUrl} title="PDF en pantalla completa" className="music-pdf-full-iframe" />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default MusicApp
