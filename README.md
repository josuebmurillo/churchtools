
# API y Microservicios (Iglesia)

Esqueleto inicial con FastAPI y microservicios por dominio para una futura app de gestión de iglesia (sin finanzas).

---

## Frontend (React + Vite)

El frontend está en la carpeta `frontend/` y utiliza React, TypeScript y Vite.

### Instalación y uso

```bash
cd frontend
npm install
npm run dev           # Modo desarrollo
npm run build         # Compilar para producción
npm run lint          # Linting de código
```

### Variantes de entorno
- `npm run dev:admin`        → Variante Admin
- `npm run dev:music`        → Variante Music
- `npm run dev:volunteers`   → Variante Volunteers

### Estructura relevante
- `src/components/`   → Componentes reutilizables
- `src/pages/`        → Vistas principales
- `src/hooks/`        → Hooks personalizados
- `src/services/`     → Servicios API
- `src/types/`        → Tipos TypeScript
- `src/utils/`        → Utilidades

---

## Servicio Multitracks

Servicio para gestión y análisis de stems de audio (multitracks) para canciones.

### Endpoints principales
- `GET /health`                  → Estado del servicio
- `GET /stems`                   → Listar stems
- `GET /songs/{song_id}/stems`   → Stems de una canción
- `GET /songs/{song_id}/waveform`→ Waveform de la canción
- `GET /songs/{song_id}/structure`→ Estructura detectada
- `GET /songs/{song_id}/guide`   → Audio guía
- `GET /songs/{song_id}/mix`     → Mixdown
- `POST /upload`                 → Subir ZIP de stems
- `DELETE /songs/{song_id}/stems`→ Eliminar stems y archivos asociados

### Flujo de procesamiento
1. Subir ZIP con stems y guía.
2. El servicio extrae, convierte y almacena los archivos.
3. Genera waveform, mixdown y análisis de estructura automáticamente.

### Dependencias clave
- FastAPI, SQLAlchemy, Uvicorn
- ffmpeg (procesamiento de audio)
- whisper (transcripción/segmentación)

---

## Archivos de configuración y scripts

- `vite.config.ts`, `tsconfig*.json` → Configuración de build y TypeScript para frontend
- `requirements.txt`, `requirements-dev.txt` → Dependencias de backend y pruebas
- Scripts de pruebas:
	- Backend: `pytest` (ver sección Pruebas)
	- Frontend: `npm run lint` (linting)

---

## Servicios
- Gateway
- People (personas)
- Ministries (ministerios)
- Events (eventos)
- Music (música y repertorio)
- Comms (anuncios y notificaciones)
- Groups (discipulados / grupos pequeños)
- Volunteers (voluntarios y turnos)
- Calendar (reservas de espacios)
- Security (usuarios y roles)
- Reports (reportes no financieros)
- PDFs (gestión de archivos)
- Consejeria (solicitudes y seguimiento de consejería)

## Requisitos
- Docker y Docker Compose (recomendado)
- O Python 3.11 si deseas ejecutar localmente

## Ejecutar con Docker
1. (Opcional) Copia `.env.example` a `.env`.
2. Ejecuta Docker Compose.

## Base de datos
Todos los servicios usan PostgreSQL (contenedor `app-db`).
Se incluye Alembic por servicio para manejar migraciones.

## Ejecutar localmente (por servicio)
1. Entra a la carpeta del servicio.
2. Instala dependencias: `pip install -r requirements.txt`
3. Ejecuta: `uvicorn app.main:app --reload --port 8000`

## Migraciones (Alembic)
Dentro de cada servicio:
1. Generar migración inicial: `alembic revision --autogenerate -m "init"`
2. Aplicar migraciones: `alembic upgrade head`

Comando único (desde la raíz) para generar y aplicar en todos los servicios:
`for svc in people ministries events music comms groups volunteers calendar security reports pdfs consejeria; do dir="./services/$svc"; docker compose run --rm -v "$dir:/app" -w /app $svc alembic revision --autogenerate -m "init"; docker compose run --rm -v "$dir:/app" -w /app $svc alembic upgrade head; done`

## Pruebas
1. Crea el entorno virtual: `python3 -m venv .venv`
2. Activa el entorno: `source .venv/bin/activate`
3. Instala dependencias de pruebas: `pip install -r requirements-dev.txt`
4. Ejecuta: `pytest -q`

## Endpoints base
Cada servicio expone:
- `GET /health`
- CRUD básico según su dominio (`/people`, `/ministries`, `/events`, `/songs`)

## Gateway
El gateway enruta por prefijo:
- `/people` -> People
- `/ministries` -> Ministries
- `/events` -> Events
- `/music` -> Music
- `/comms` -> Comms
- `/groups` -> Groups
- `/volunteers` -> Volunteers
- `/calendar` -> Calendar
- `/security` -> Security
- `/reports` -> Reports
- `/pdfs` -> PDFs
- `/consejeria` -> Consejeria

> Nota: En desarrollo, las tablas todavía pueden crearse al iniciar el servicio, pero se recomienda usar Alembic para mantener el esquema versionado.

## Pendientes UX (por revisar)
- Revisar y unificar terminología en toda la UI (ej. culto/evento, persona/miembro, guardar/crear) para consistencia total.
