# Modelo de datos (borrador)

## Personas
- **person**: id, nombre, email?, teléfono?, fecha_nacimiento?, estado
- **membership**: person_id, fecha_ingreso, estado
- **discipleship_course**: id, nombre, descripción?, nivel?
- **person_discipleship_record**: id, person_id, course_id, completed_on?, status (en_progreso/completado/abandonado), notes?

### Endpoints (People Service)
- `GET /health`
- `GET /people`
- `POST /people`
- `GET /people/{person_id}`
- `PUT /people/{person_id}`
- `DELETE /people/{person_id}`

- `GET /memberships`
- `POST /memberships`
- `GET /memberships/{person_id}`
- `PUT /memberships/{person_id}`
- `DELETE /memberships/{person_id}`

- `GET /attendance`
- `POST /attendance`
- `GET /attendance/{attendance_id}`
- `PUT /attendance/{attendance_id}`
- `DELETE /attendance/{attendance_id}`

- `GET /visitors`
- `POST /visitors`
- `GET /visitors/{visitor_id}`
- `PUT /visitors/{visitor_id}`
- `DELETE /visitors/{visitor_id}`

- `GET /visitor-followups`
- `POST /visitor-followups`
- `GET /visitor-followups/{followup_id}`
- `PUT /visitor-followups/{followup_id}`
- `DELETE /visitor-followups/{followup_id}`

- `GET /discipleship-courses`
- `POST /discipleship-courses`
- `GET /discipleship-courses/{course_id}`
- `PUT /discipleship-courses/{course_id}`
- `DELETE /discipleship-courses/{course_id}`

- `GET /discipulado`
- `POST /discipulado`
- `GET /discipulado/{record_id}`
- `PUT /discipulado/{record_id}`
- `DELETE /discipulado/{record_id}`
- `GET /people/{person_id}/discipulado`

## Accesos y seguridad
- **user_account**: id, person_id, username, email, password_hash, activo
- **role**: id, nombre, descripción?
- **permission**: id, nombre, descripción?
- **user_role**: user_id, role_id
- **role_permission**: role_id, permission_id

### Endpoints (Security Service)
- `GET /health`
- `GET /users`
- `POST /users`
- `GET /users/{user_id}`
- `PUT /users/{user_id}`
- `DELETE /users/{user_id}`

- `GET /roles`
- `POST /roles`
- `GET /roles/{role_id}`
- `PUT /roles/{role_id}`
- `DELETE /roles/{role_id}`

- `GET /permissions`
- `POST /permissions`
- `GET /permissions/{permission_id}`
- `PUT /permissions/{permission_id}`
- `DELETE /permissions/{permission_id}`

- `POST /users/{user_id}/roles/{role_id}`
- `DELETE /users/{user_id}/roles/{role_id}`
- `POST /roles/{role_id}/permissions/{permission_id}`
- `DELETE /roles/{role_id}/permissions/{permission_id}`

## Ministerios y equipos
- **ministry**: id, nombre, descripción?, parent_id?
- **team**: id, nombre, ministry_id, descripción?
- **team_role**: id, nombre, nivel (jerarquía)
- **team_member**: person_id, team_id, role_id, fecha_ingreso, estado

### Endpoints (Ministries Service)
- `GET /health`
- `GET /ministries`
- `POST /ministries`
- `GET /ministries/{ministry_id}`
- `PUT /ministries/{ministry_id}`
- `DELETE /ministries/{ministry_id}`

- `GET /teams`
- `POST /teams`
- `GET /teams/{team_id}`
- `PUT /teams/{team_id}`
- `DELETE /teams/{team_id}`

- `GET /team-roles`
- `POST /team-roles`
- `GET /team-roles/{role_id}`
- `PUT /team-roles/{role_id}`
- `DELETE /team-roles/{role_id}`

- `GET /team-members`
- `POST /team-members`
- `GET /team-members/{member_id}`
- `PUT /team-members/{member_id}`
- `DELETE /team-members/{member_id}`

## Eventos y cronogramas
- **event**: id, nombre, fecha, ministry_id?, descripción?
- **event_schedule**: id, event_id, inicio, fin, tipo (alabanza, mensaje, etc.)
- **event_assignment**: id, event_id, team_id, responsable_person_id?

### Endpoints (Events Service)
- `GET /health`
- `GET /events`
- `POST /events`
- `GET /events/{event_id}`
- `PUT /events/{event_id}`
- `DELETE /events/{event_id}`

- `GET /event-schedules`
- `POST /event-schedules`
- `GET /event-schedules/{schedule_id}`
- `PUT /event-schedules/{schedule_id}`
- `DELETE /event-schedules/{schedule_id}`

- `GET /event-assignments`
- `POST /event-assignments`
- `GET /event-assignments/{assignment_id}`
- `PUT /event-assignments/{assignment_id}`
- `DELETE /event-assignments/{assignment_id}`

## Asistencia
- **attendance**: id, event_id, person_id?, visitor_id?, estado (presente/ausente)

### Endpoints (People Service - Asistencia)
- `GET /attendance`
- `POST /attendance`
- `GET /attendance/{attendance_id}`
- `PUT /attendance/{attendance_id}`
- `DELETE /attendance/{attendance_id}`

## Visitantes
- **visitor**: id, nombre, teléfono?, email?, fecha_primera_visita, notas?
- **visitor_followup**: id, visitor_id, fecha, estado, responsable_person_id?, notas?

### Endpoints (People Service - Visitantes)
- `GET /visitors`
- `POST /visitors`
- `GET /visitors/{visitor_id}`
- `PUT /visitors/{visitor_id}`
- `DELETE /visitors/{visitor_id}`

- `GET /visitor-followups`
- `POST /visitor-followups`
- `GET /visitor-followups/{followup_id}`
- `PUT /visitor-followups/{followup_id}`
- `DELETE /visitor-followups/{followup_id}`

## Música y repertorio
Reglas:
- Un evento/actividad **puede o no** tener repertorio.
- El repertorio **no existe** sin un evento/actividad que lo contenga.

Entidades:
- **song**: id, nombre, autor?, bpm?, tonalidad?, cifrado_pdf_url?
- **repertoire**: id, event_id (obligatorio, relación 1:1 con evento)
- **repertoire_song**: repertoire_id, song_id, orden, tonalidad_override?, bpm_override?

Relaciones clave:
- event 1 — 0..1 repertoire
- repertoire 1 — N repertoire_song
- song 1 — N repertoire_song

### Endpoints (Music Service)
- `GET /health`
- `GET /songs`
- `POST /songs`
- `GET /songs/{song_id}`
- `PUT /songs/{song_id}`
- `DELETE /songs/{song_id}`

- `GET /repertoires`
- `POST /repertoires`
- `GET /repertoires/{repertoire_id}`
- `PUT /repertoires/{repertoire_id}`
- `DELETE /repertoires/{repertoire_id}`

- `GET /repertoire-songs`
- `POST /repertoire-songs`
- `GET /repertoire-songs/{item_id}`
- `PUT /repertoire-songs/{item_id}`
- `DELETE /repertoire-songs/{item_id}`

## Comunicación interna
- **announcement**: id, título, contenido, audience (global/ministry/team), ministry_id?, team_id?, publicado_en
- **notification**: id, título, contenido, audience, ministry_id?, team_id?, enviado_en

### Endpoints (Comms Service)
- `GET /health`
- `GET /announcements`
- `POST /announcements`
- `GET /announcements/{announcement_id}`
- `PUT /announcements/{announcement_id}`
- `DELETE /announcements/{announcement_id}`

- `GET /notifications`
- `POST /notifications`
- `GET /notifications/{notification_id}`
- `PUT /notifications/{notification_id}`
- `DELETE /notifications/{notification_id}`

## Discipulados / grupos pequeños
- **small_group**: id, nombre, leader_person_id, ministry_id?, meeting_schedule?
- **small_group_member**: group_id, person_id, fecha_ingreso, estado

### Endpoints (Groups Service)
- `GET /health`
- `GET /small-groups`
- `POST /small-groups`
- `GET /small-groups/{group_id}`
- `PUT /small-groups/{group_id}`
- `DELETE /small-groups/{group_id}`

- `GET /small-group-members`
- `POST /small-group-members`
- `GET /small-group-members/{member_id}`
- `PUT /small-group-members/{member_id}`
- `DELETE /small-group-members/{member_id}`

## Voluntarios y turnos
- **volunteer_role**: id, nombre, descripción?
- **shift**: id, event_id, role_id, inicio, fin
- **shift_assignment**: shift_id, person_id, estado (confirmado/pendiente)

### Endpoints (Volunteers Service)
- `GET /health`
- `GET /volunteer-roles`
- `POST /volunteer-roles`
- `GET /volunteer-roles/{role_id}`
- `PUT /volunteer-roles/{role_id}`
- `DELETE /volunteer-roles/{role_id}`

- `GET /shifts`
- `POST /shifts`
- `GET /shifts/{shift_id}`
- `PUT /shifts/{shift_id}`
- `DELETE /shifts/{shift_id}`

- `GET /shift-assignments`
- `POST /shift-assignments`
- `GET /shift-assignments/{assignment_id}`
- `PUT /shift-assignments/{assignment_id}`
- `DELETE /shift-assignments/{assignment_id}`

## Calendario y reservas de espacios
- **facility**: id, nombre, ubicación?, capacidad?
- **reservation**: id, facility_id, event_id?, inicio, fin, responsable_person_id?, estado

### Endpoints (Calendar Service)
- `GET /health`
- `GET /facilities`
- `POST /facilities`
- `GET /facilities/{facility_id}`
- `PUT /facilities/{facility_id}`
- `DELETE /facilities/{facility_id}`

- `GET /reservations`
- `POST /reservations`
- `GET /reservations/{reservation_id}`
- `PUT /reservations/{reservation_id}`
- `DELETE /reservations/{reservation_id}`

## Reportes (no financieros)
- **attendance_snapshot**: id, fecha, total_asistencia, total_visitantes
- **participation_snapshot**: id, fecha, total_activos, total_voluntarios

### Endpoints (Reports Service)
- `GET /health`
- `GET /reports/attendance`
- `GET /reports/participation`

## Consejería
- **consejeria**: id, solicitante_person_id, consejero_person_id, fecha, motivo, observaciones?, estado?

Notas:
- Debe ser rastreable por solicitante y por consejero.
- El `consejero_person_id` debe corresponder a una persona del listado de servidores (validación funcional a nivel de app/reglas de negocio).

### Endpoints (Consejeria Service)
- `GET /health`
- `GET /consejerias`
- `POST /consejerias`
- `GET /consejerias/{consejeria_id}`
- `PUT /consejerias/{consejeria_id}`
- `DELETE /consejerias/{consejeria_id}`
- `GET /consejerias/solicitante/{person_id}`
- `GET /consejerias/consejero/{person_id}`
