
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

## Testing

### Suite de Tests Automatizados
Cobertura completa: **81 tests** verificando todos los 15 servicios + gateway + auth + RBAC/permisos + validaciones de negocio.

#### Instalación rápida
```bash
# Con pipx (recomendado - sin venv)
pipx install pytest httpx

# O dentro de un venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

#### Ejecutar tests
```bash
# Todos los tests
pytest tests/ -v

# O usar el script rápido
./run-tests.sh                # Todos
./run-tests.sh TestVendors    # Solo vendors
./run-tests.sh test_health    # Solo health checks
```

#### Cobertura
| Módulo | Tests | Scope |
|---|---|---|
| Health Checks | 15 | Todos los servicios activos |
| Security/Auth | 12 | Login, JWT, CRUD usuarios, RBAC admin y permisos por módulo |
| People | 3 | CRUD personas, email único |
| Vendors | 5 | CRUD completo, validación, gateway |
| Ministries | 5 | CRUD ministerios, roles, miembros |
| Events | 2 | Listado + creación |
| Music | 3 | Canciones + repertorios |
| Groups | 2 | Miembros únicos |
| Volunteers | 3 | Turnos válidos, asignaciones únicas |
| Calendar | 2 | Reservas sin solapamiento |
| Comms | 1 | Validación audiencia |
| Consejeria | 2 | Listado + creación |
| Reports | 2 | Reportes de asistencia/participación |
| Gateway | 10 | Rutas a servicios, permisos por módulo + 404 |
| **Total** | **81** | **✅ 100% passing** |

#### Archivos de tests
- `tests/test_business_rules.py` - Reglas de negocio por dominio
- `tests/test_all_services.py` - Suite completa de integración (health, CRUD, validaciones)

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
- `/vendors` -> Vendors

### Permisos de gateway
El gateway aplica control de acceso por permisos de módulo.

Consulta la matriz completa en `docs/permisos-gateway.md`.

> Nota: En desarrollo, las tablas todavía pueden crearse al iniciar el servicio, pero se recomienda usar Alembic para mantener el esquema versionado.

## Pendientes UX (por revisar)
- Revisar y unificar terminología en toda la UI (ej. culto/evento, persona/miembro, guardar/crear) para consistencia total.
