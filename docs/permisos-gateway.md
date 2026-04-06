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
