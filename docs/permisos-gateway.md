# Matriz de permisos del Gateway

Este documento describe los permisos por módulo que el gateway exige antes de reenviar una petición al microservicio destino.

## Validación de acceso

El gateway valida permisos por request usando el header `Authorization: Bearer <token>`.

Flujo:
1. Determina el permiso requerido según servicio y ruta.
2. Consulta `GET /security/auth/me` para obtener los permisos del usuario autenticado.
3. Si el permiso está presente, reenvía la petición al servicio destino.

Respuestas esperadas:
- `401 Unauthorized`: falta token o token inválido.
- `403 Forbidden`: token válido, pero sin permiso para esa ruta.
- `2xx`: acceso autorizado y petición reenviada.

## Diagrama (Mermaid)

```mermaid
flowchart TD
		A[Request llega al Gateway] --> B{Ruta requiere permiso?}
		B -- No --> Z[Forward directo al microservicio]
		B -- Si --> C{Header Authorization presente?}
		C -- No --> E[401 Unauthorized]
		C -- Si --> D[GET /security/auth/me]
		D --> F{Token valido?}
		F -- No --> E
		F -- Si --> G{Usuario tiene permiso requerido?}
		G -- No --> H[403 Forbidden]
		G -- Si --> Z

		subgraph Mapeo Permisos
			P1[admin:ministerios] --> R1[/ministries/*]
			P2[admin:calendario] --> R2[/calendar/*]
			P3[admin:consejerias] --> R3[/consejeria/*]
			P4[admin:metricas] --> R4[/reports/*]
			P5[admin:proveedores] --> R5[/vendors/*]
			P6[volunteers:eventos] --> R6[/events/* y /volunteers/volunteer-roles*]
			P7[volunteers:turnos] --> R7[/volunteers/shifts*]
			P8[volunteers:asignaciones] --> R8[/volunteers/shift-assignments*]
			P9[music:canciones] --> R9[/music/songs*]
			P10[music:setlist] --> R10[/music/repertoires* y /music/repertoire-songs*]
		end
```

## Matriz permiso -> rutas protegidas

| Permiso requerido | Rutas protegidas |
|---|---|
| `admin:ministerios` | `/ministries/*` |
| `admin:calendario` | `/calendar/*` |
| `admin:consejerias` | `/consejeria/*` |
| `admin:metricas` | `/reports/*` |
| `admin:proveedores` | `/vendors/*` |
| `volunteers:eventos` | `/events/*`, `/volunteers/volunteer-roles*` |
| `volunteers:turnos` | `/volunteers/shifts*` |
| `volunteers:asignaciones` | `/volunteers/shift-assignments*` |
| `music:canciones` | `/music/songs*` |
| `music:setlist` | `/music/repertoires*`, `/music/repertoire-songs*` |

## Notas de mantenimiento

- Si agregas nuevas rutas o módulos, actualiza el mapeo en `gateway/app/main.py`.
- Mantén este documento sincronizado con la constante `PROTECTED_SERVICE_PERMISSIONS`.
- Cubre cambios de permisos con pruebas en `tests/test_all_services.py`.
