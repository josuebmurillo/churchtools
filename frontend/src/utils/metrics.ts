import type { AttendanceSnapshot, ParticipationSnapshot } from '../types'

type AgeBuckets = {
  '0-12': number
  '13-17': number
  '18-25': number
  '26-35': number
  '36-50': number
  '51+': number
  'Sin dato': number
}

type GenderBuckets = {
  Masculino: AgeBuckets
  Femenino: AgeBuckets
}

type GenderCounts = {
  Masculino: number
  Femenino: number
}

export const buildGenderDoughnut = (genderCounts: GenderCounts) => ({
  labels: ['Masculino', 'Femenino'],
  datasets: [
    {
      data: [genderCounts.Masculino, genderCounts.Femenino],
      backgroundColor: ['#60a5fa', '#f472b6'],
      borderWidth: 0,
    },
  ],
})

export const buildAgePyramid = (ageBuckets: AgeBuckets, ageByGender: GenderBuckets) => {
  const labels = Object.keys(ageBuckets) as Array<keyof AgeBuckets>
  return {
    labels,
    datasets: [
      {
        label: 'Masculino',
        data: labels.map((label) => -(ageByGender.Masculino[label] ?? 0)),
        backgroundColor: 'rgba(96, 165, 250, 0.7)',
      },
      {
        label: 'Femenino',
        data: labels.map((label) => ageByGender.Femenino[label] ?? 0),
        backgroundColor: 'rgba(244, 114, 182, 0.7)',
      },
    ],
  }
}

export const buildMaritalDoughnut = (maritalList: Array<[string, number]>) => {
  const labels = maritalList.map(([label]) => label)
  const data = maritalList.map(([, value]) => value)
  const colors = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185']
  return {
    labels,
    datasets: [
      {
        data,
        backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        borderWidth: 0,
      },
    ],
  }
}

export const buildAttendanceChart = (history: AttendanceSnapshot[]) => ({
  labels: history.map((item) => item.fecha),
  datasets: [
    {
      label: 'Visitantes',
      data: history.map((item) => item.total_visitantes),
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96, 165, 250, 0.2)',
      tension: 0.3,
      fill: true,
    },
    {
      label: 'Servidores',
      data: history.map((item) => item.total_servidores),
      borderColor: '#f472b6',
      backgroundColor: 'rgba(244, 114, 182, 0.2)',
      tension: 0.3,
      fill: true,
    },
    {
      label: 'Total asistencia',
      data: history.map((item) => item.total_asistencia),
      borderColor: '#34d399',
      backgroundColor: 'rgba(52, 211, 153, 0.1)',
      tension: 0.3,
      fill: false,
    },
  ],
})

/** @deprecated use buildAttendanceChart */
export const buildParticipationChart = (history: ParticipationSnapshot[]) => ({
  labels: history.map((item) => item.fecha),
  datasets: [
    {
      label: 'Visitas',
      data: history.map((item) => item.total_activos),
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96, 165, 250, 0.2)',
      tension: 0.3,
      fill: true,
    },
    {
      label: 'Servidores',
      data: history.map((item) => item.total_voluntarios),
      borderColor: '#f472b6',
      backgroundColor: 'rgba(244, 114, 182, 0.2)',
      tension: 0.3,
      fill: true,
    },
  ],
})

export const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' as const },
  },
  scales: {
    x: {
      ticks: { color: '#6b7280' },
      grid: { display: false },
    },
    y: {
      ticks: { color: '#6b7280' },
      grid: { color: 'rgba(148, 163, 184, 0.3)' },
    },
  },
}
