#!/usr/bin/env python3
"""Analyze, reset, and seed realistic demo data for ChurchTools.

Scope:
- Includes all app domains except music/repertoires/multitracks/pdfs.
- Uses gateway endpoints so permissions are enforced consistently.

Examples:
  python3 scripts/demo_data_manager.py analyze
  python3 scripts/demo_data_manager.py reset --yes
  python3 scripts/demo_data_manager.py seed
  python3 scripts/demo_data_manager.py refresh-demo --yes
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import error, request

BASE_URL = "http://localhost:8000"
AUTH_URL = "http://localhost:8009"
DEFAULT_IDENTIFIER = "admin@iglesia.com"
DEFAULT_PASSWORD = "Admin2026"


@dataclass(frozen=True)
class Resource:
    name: str
    list_path: str
    delete_path_template: str
    id_key: str = "id"
    delete_with_cascade: bool = False


RESET_ORDER: list[Resource] = [
    Resource("participation_history", "/reports/reports/participation/history", "/reports/reports/participation/history/{id}"),
    Resource("attendance_history", "/reports/reports/attendance/history", "/reports/reports/attendance/history/{id}"),
    Resource("notifications", "/comms/notifications", "/comms/notifications/{id}"),
    Resource("announcements", "/comms/announcements", "/comms/announcements/{id}"),
    Resource("consejerias", "/consejeria/consejerias", "/consejeria/consejerias/{id}"),
    Resource("shift_assignments", "/volunteers/shift-assignments", "/volunteers/shift-assignments/{id}"),
    Resource("shifts", "/volunteers/shifts", "/volunteers/shifts/{id}"),
    Resource("volunteer_roles", "/volunteers/volunteer-roles", "/volunteers/volunteer-roles/{id}"),
    Resource("small_group_members", "/groups/small-group-members", "/groups/small-group-members/{id}"),
    Resource("small_groups", "/groups/small-groups", "/groups/small-groups/{id}"),
    Resource("event_assignments", "/events/event-assignments", "/events/event-assignments/{id}"),
    Resource("event_schedules", "/events/event-schedules", "/events/event-schedules/{id}"),
    Resource("reservations", "/calendar/reservations", "/calendar/reservations/{id}"),
    Resource("facilities", "/calendar/facilities", "/calendar/facilities/{id}"),
    Resource("team_members", "/ministries/team-members", "/ministries/team-members/{id}"),
    Resource("team_roles", "/ministries/team-roles", "/ministries/team-roles/{id}"),
    Resource("teams", "/ministries/teams", "/ministries/teams/{id}"),
    Resource("ministries", "/ministries/ministries", "/ministries/ministries/{id}", delete_with_cascade=True),
    Resource("events", "/events/events", "/events/events/{id}"),
    Resource("vendors", "/vendors/vendors", "/vendors/vendors/{id}"),
    Resource("visitor_followups", "/people/visitor-followups", "/people/visitor-followups/{id}"),
    Resource("attendance", "/people/attendance", "/people/attendance/{id}"),
    Resource("discipulado", "/people/discipulado", "/people/discipulado/{id}"),
    Resource("memberships", "/people/memberships", "/people/memberships/{person_id}", id_key="person_id"),
    Resource("visitors", "/people/visitors", "/people/visitors/{id}"),
    Resource("discipleship_courses", "/people/discipleship-courses", "/people/discipleship-courses/{id}"),
    Resource("people", "/people/people", "/people/people/{id}"),
]

ANALYZE_ORDER: list[Resource] = [
    Resource("users", "/security/users", ""),
    *RESET_ORDER,
]


class DemoDataManager:
    def __init__(
        self,
        base_url: str,
        auth_url: str,
        identifier: str,
        password: str,
        timeout: float = 30.0,
        seed_value: int = 20260504,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.auth_url = auth_url.rstrip("/")
        self.identifier = identifier
        self.password = password
        self.timeout = timeout
        self.random = random.Random(seed_value)
        self.token = self._login()

    def close(self) -> None:
        return

    def _raw_request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> tuple[int, bytes, str]:
        data = None
        req_headers = dict(headers or {})
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        req = request.Request(url=url, data=data, headers=req_headers, method=method)
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read()
                content_type = resp.headers.get("Content-Type", "")
                return resp.status, body, content_type
        except error.HTTPError as exc:
            body = exc.read() if exc.fp else b""
            content_type = exc.headers.get("Content-Type", "") if exc.headers else ""
            return exc.code, body, content_type

    def _login(self) -> str:
        status, body, _ = self._raw_request(
            "POST",
            f"{self.auth_url}/auth/login",
            payload={"identifier": self.identifier, "password": self.password},
        )
        if status != 200:
            raise RuntimeError(f"Login failed ({status}): {body.decode('utf-8', errors='ignore')}")
        parsed = json.loads(body.decode("utf-8"))
        return parsed["access_token"]

    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None, expected: set[int] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self.token}"}
        status, body, content_type = self._raw_request(
            method,
            f"{self.base_url}{path}",
            headers=headers,
            payload=payload,
        )
        if expected is None:
            expected = {200}
        if status not in expected:
            raise RuntimeError(f"{method} {path} failed ({status}): {body.decode('utf-8', errors='ignore')}")
        if content_type.startswith("application/json") and body:
            return json.loads(body.decode("utf-8"))
        return None

    def analyze(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for resource in ANALYZE_ORDER:
            rows = self._request("GET", resource.list_path, expected={200})
            counts[resource.name] = len(rows) if isinstance(rows, list) else 0
        return counts

    def reset_non_music_data(self) -> dict[str, int]:
        deleted: dict[str, int] = {}

        users = self._request("GET", "/security/users", expected={200})
        users_deleted = 0
        for user in users:
            email = str(user.get("email", "")).lower()
            username = str(user.get("username", "")).lower()
            user_id = user.get("id")
            if user_id is None:
                continue
            if email == "admin@iglesia.com" or username == "admin":
                continue
            self._request("DELETE", f"/security/users/{user_id}", expected={200, 204})
            users_deleted += 1
        deleted["users"] = users_deleted

        for resource in RESET_ORDER:
            rows = self._request("GET", resource.list_path, expected={200})
            if not isinstance(rows, list):
                deleted[resource.name] = 0
                continue

            count = 0
            for row in reversed(rows):
                row_id = row.get(resource.id_key)
                if row_id is None:
                    continue
                path = resource.delete_path_template.format(id=row_id, person_id=row_id)
                if resource.delete_with_cascade:
                    sep = "&" if "?" in path else "?"
                    path = f"{path}{sep}cascade=true"
                self._request("DELETE", path, expected={200, 204})
                count += 1
            deleted[resource.name] = count

        return deleted

    def seed_demo_data(self) -> dict[str, int]:
        stats: dict[str, int] = {}

        first_names_f = [
            "Sofia", "Valeria", "Camila", "Isabella", "Lucia", "Daniela", "Elena", "Paula", "Mariana", "Fernanda",
            "Andrea", "Carla", "Adriana", "Rocio", "Natalia", "Alicia", "Noelia", "Belen", "Marta", "Patricia",
        ]
        first_names_m = [
            "Daniel", "Mateo", "Santiago", "Sebastian", "Nicolas", "David", "Andres", "Javier", "Carlos", "Miguel",
            "Esteban", "Felipe", "Jose", "Pablo", "Ricardo", "Luis", "Jorge", "Adrian", "Victor", "Rafael",
        ]
        last_names = [
            "Gonzalez", "Rodriguez", "Fernandez", "Lopez", "Martinez", "Perez", "Sanchez", "Ramirez", "Torres", "Flores",
            "Vargas", "Mora", "Castro", "Rojas", "Alvarado", "Jimenez", "Campos", "Navarro", "Cordero", "Araya",
        ]
        marital = ["soltero", "casado", "union_libre", "viudo"]

        ministry_specs = [
            ("Adoracion", "Direccion musical y alabanza"),
            ("Jovenes", "Formacion y acompanamiento juvenil"),
            ("Ninos", "Escuela biblica y apoyo familiar"),
            ("Intercesion", "Oracion congregacional y cobertura"),
            ("Consolidacion", "Seguimiento de nuevos creyentes"),
            ("Produccion", "Audio, video y soporte tecnico"),
            ("Hospitalidad", "Recepcion y atencion de visitas"),
            ("Misericordia", "Accion social y ayuda comunitaria"),
        ]

        ministries: list[dict[str, Any]] = []
        for name, description in ministry_specs:
            ministry = self._request(
                "POST",
                "/ministries/ministries",
                payload={"name": name, "description": description},
                expected={200, 201},
            )
            ministries.append(ministry)
        stats["ministries"] = len(ministries)

        teams: list[dict[str, Any]] = []
        team_roles: list[dict[str, Any]] = []
        for ministry in ministries:
            for suffix in ["Base", "Operativo"]:
                team = self._request(
                    "POST",
                    "/ministries/teams",
                    payload={
                        "name": f"Equipo {ministry['name']} {suffix}",
                        "ministry_id": ministry["id"],
                        "description": f"Equipo {suffix.lower()} de {ministry['name']}",
                    },
                    expected={200, 201},
                )
                teams.append(team)
            for role_name, level in [("Lider", 1), ("Coordinador", 2), ("Servidor", 3)]:
                role = self._request(
                    "POST",
                    "/ministries/team-roles",
                    payload={
                        "name": role_name,
                        "ministry_id": ministry["id"],
                        "level": level,
                    },
                    expected={200, 201},
                )
                team_roles.append(role)
        stats["teams"] = len(teams)
        stats["team_roles"] = len(team_roles)

        people: list[dict[str, Any]] = []
        for index in range(96):
            is_female = index % 2 == 0
            first_name = self.random.choice(first_names_f if is_female else first_names_m)
            last_name = self.random.choice(last_names)
            second_last = self.random.choice(last_names)
            full_name = f"{first_name} {last_name} {second_last}"
            email_local = f"{first_name}.{last_name}.{index}".lower().replace(" ", "")
            person = self._request(
                "POST",
                "/people/people",
                payload={
                    "name": full_name,
                    "email": f"{email_local}@demo-iglesia.com",
                    "phone": f"+506 7{self.random.randint(100, 999)}-{self.random.randint(1000, 9999)}",
                    "birth_date": f"{self.random.randint(1962, 2006)}-{self.random.randint(1,12):02d}-{self.random.randint(1,28):02d}",
                    "status": "activo",
                    "gender": "femenino" if is_female else "masculino",
                    "marital_status": self.random.choice(marital),
                },
                expected={200, 201},
            )
            people.append(person)
        stats["people"] = len(people)

        members = self.random.sample(people, k=78)
        for member in members:
            self._request(
                "POST",
                "/people/memberships",
                payload={
                    "person_id": member["id"],
                    "fecha_ingreso": f"{self.random.randint(2016, 2025)}-{self.random.randint(1,12):02d}-{self.random.randint(1,28):02d}",
                    "estado": "activo",
                },
                expected={200, 201},
            )
        stats["memberships"] = len(members)

        courses = []
        for course_name, level in [
            ("Fundamentos de Fe", "basico"),
            ("Discipulado 1", "intermedio"),
            ("Liderazgo Servicial", "avanzado"),
        ]:
            course = self._request(
                "POST",
                "/people/discipleship-courses",
                payload={"name": course_name, "description": f"Curso {course_name}", "level": level},
                expected={200, 201},
            )
            courses.append(course)
        stats["discipleship_courses"] = len(courses)

        discipulado_records = 0
        for person in self.random.sample(people, k=42):
            course = self.random.choice(courses)
            self._request(
                "POST",
                "/people/discipulado",
                payload={
                    "person_id": person["id"],
                    "course_id": course["id"],
                    "completed_on": f"{self.random.randint(2023, 2026)}-{self.random.randint(1,12):02d}-{self.random.randint(1,28):02d}",
                    "status": self.random.choice(["en_progreso", "completado"]),
                    "notes": "Seguimiento regular en celula.",
                },
                expected={200, 201},
            )
            discipulado_records += 1
        stats["discipulado"] = discipulado_records

        visitors: list[dict[str, Any]] = []
        for i in range(18):
            visitor = self._request(
                "POST",
                "/people/visitors",
                payload={
                    "nombre": f"Visitante {i + 1}",
                    "telefono": f"+506 6{self.random.randint(100, 999)}-{self.random.randint(1000, 9999)}",
                    "email": f"visitante{i + 1}@correo-demo.com",
                    "fecha_primera_visita": f"2026-{self.random.randint(1,4):02d}-{self.random.randint(1,28):02d}",
                    "notas": "Contacto generado durante evento de bienvenida.",
                },
                expected={200, 201},
            )
            visitors.append(visitor)
        stats["visitors"] = len(visitors)

        followups = 0
        for visitor in visitors:
            for _ in range(2):
                responsible = self.random.choice(people)
                self._request(
                    "POST",
                    "/people/visitor-followups",
                    payload={
                        "visitor_id": visitor["id"],
                        "fecha": f"2026-{self.random.randint(1,5):02d}-{self.random.randint(1,28):02d}",
                        "estado": self.random.choice(["contactado", "pendiente"]),
                        "responsable_person_id": responsible["id"],
                        "notas": "Seguimiento pastoral programado.",
                    },
                    expected={200, 201},
                )
                followups += 1
        stats["visitor_followups"] = followups

        groups: list[dict[str, Any]] = []
        group_members = 0
        ministry_ids = [m["id"] for m in ministries]
        for i in range(12):
            leader = self.random.choice(people)
            group = self._request(
                "POST",
                "/groups/small-groups",
                payload={
                    "name": f"Grupo de Hogar {i + 1}",
                    "leader_person_id": leader["id"],
                    "ministry_id": self.random.choice(ministry_ids),
                    "meeting_schedule": self.random.choice([
                        "Martes 19:00", "Miercoles 19:30", "Jueves 20:00", "Sabado 18:00"
                    ]),
                },
                expected={200, 201},
            )
            groups.append(group)
            members_for_group = self.random.sample(people, k=10)
            for member in members_for_group:
                self._request(
                    "POST",
                    "/groups/small-group-members",
                    payload={
                        "group_id": group["id"],
                        "person_id": member["id"],
                        "fecha_ingreso": f"2026-{self.random.randint(1,5):02d}-{self.random.randint(1,28):02d}",
                        "estado": "activo",
                    },
                    expected={200, 201},
                )
                group_members += 1
        stats["small_groups"] = len(groups)
        stats["small_group_members"] = group_members

        team_members = 0
        roles_by_ministry: dict[int, list[dict[str, Any]]] = {}
        for role in team_roles:
            roles_by_ministry.setdefault(role["ministry_id"], []).append(role)

        for team in teams:
            assigned_people = self.random.sample(people, k=8)
            for person in assigned_people:
                role_options = roles_by_ministry.get(team.get("ministry_id"), [])
                role_id = self.random.choice(role_options)["id"] if role_options else None
                self._request(
                    "POST",
                    "/ministries/team-members",
                    payload={
                        "person_id": person["id"],
                        "team_id": team["id"],
                        "role_id": role_id,
                        "fecha_ingreso": f"2026-{self.random.randint(1,4):02d}-{self.random.randint(1,28):02d}",
                        "estado": "activo",
                    },
                    expected={200, 201},
                )
                team_members += 1
        stats["team_members"] = team_members

        events: list[dict[str, Any]] = []
        event_schedules = 0
        event_assignments = 0
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        for i in range(36):
            event_date = now + timedelta(days=2 * i)
            is_worship = i % 3 != 0
            ministry = self.random.choice(ministries)
            event = self._request(
                "POST",
                "/events/events",
                payload={
                    "name": (
                        f"Culto General {i + 1}" if is_worship else f"Actividad Ministerio {ministry['name']} {i + 1}"
                    ),
                    "date": event_date.strftime("%Y-%m-%dT%H:%M:00"),
                    "ministry_id": ministry["id"],
                    "schedule": "Servicio principal",
                    "is_worship": is_worship,
                },
                expected={200, 201},
            )
            events.append(event)

            start = event_date.replace(hour=18)
            end = start + timedelta(hours=2)
            self._request(
                "POST",
                "/events/event-schedules",
                payload={
                    "event_id": event["id"],
                    "inicio": start.strftime("%Y-%m-%dT%H:%M"),
                    "fin": end.strftime("%Y-%m-%dT%H:%M"),
                    "tipo": "servicio" if is_worship else "reunion",
                    "observacion": "Generado para entorno demo",
                    "encargado_person_id": self.random.choice(people)["id"],
                },
                expected={200, 201},
            )
            event_schedules += 1

            for _ in range(2):
                team = self.random.choice(teams)
                self._request(
                    "POST",
                    "/events/event-assignments",
                    payload={
                        "event_id": event["id"],
                        "team_id": team["id"],
                        "responsable_person_id": self.random.choice(people)["id"],
                    },
                    expected={200, 201},
                )
                event_assignments += 1

        stats["events"] = len(events)
        stats["event_schedules"] = event_schedules
        stats["event_assignments"] = event_assignments

        worship_events = [event for event in events if event.get("is_worship")]

        attendance_rows = 0
        for event in worship_events[:20]:
            attendants = self.random.sample(people, k=28)
            for person in attendants:
                self._request(
                    "POST",
                    "/people/attendance",
                    payload={
                        "event_id": event["id"],
                        "person_id": person["id"],
                        "estado": "asistio",
                    },
                    expected={200, 201},
                )
                attendance_rows += 1
        stats["attendance"] = attendance_rows

        volunteer_roles = []
        for name in ["Anfitrion", "Ujier", "Oracion", "Kids", "Consola", "Streaming"]:
            role = self._request(
                "POST",
                "/volunteers/volunteer-roles",
                payload={"name": name, "description": f"Rol de {name.lower()}"},
                expected={200, 201},
            )
            volunteer_roles.append(role)
        stats["volunteer_roles"] = len(volunteer_roles)

        shifts = []
        assignments = 0
        for event in worship_events[:18]:
            event_dt = datetime.strptime(event["date"], "%Y-%m-%dT%H:%M:%S") if event["date"].endswith(":00") else datetime.strptime(event["date"], "%Y-%m-%dT%H:%M:00")
            for role in self.random.sample(volunteer_roles, k=3):
                start = event_dt.replace(hour=17, minute=30)
                end = start + timedelta(hours=2)
                shift = self._request(
                    "POST",
                    "/volunteers/shifts",
                    payload={
                        "event_id": event["id"],
                        "role_id": role["id"],
                        "inicio": start.strftime("%Y-%m-%dT%H:%M"),
                        "fin": end.strftime("%Y-%m-%dT%H:%M"),
                    },
                    expected={200, 201},
                )
                shifts.append(shift)
                assigned_people = self.random.sample(people, k=2)
                for person in assigned_people:
                    self._request(
                        "POST",
                        "/volunteers/shift-assignments",
                        payload={
                            "shift_id": shift["id"],
                            "person_id": person["id"],
                            "estado": "confirmado",
                        },
                        expected={200, 201},
                    )
                    assignments += 1
        stats["shifts"] = len(shifts)
        stats["shift_assignments"] = assignments

        facilities = []
        for name, location, capacity in [
            ("Auditorio Principal", "Edificio A", 450),
            ("Salon Multiproposito", "Edificio B", 120),
            ("Aula 1", "Edificio C", 35),
            ("Aula 2", "Edificio C", 35),
            ("Sala de Reuniones", "Edificio D", 20),
            ("Cancha Techada", "Zona Norte", 300),
        ]:
            facility = self._request(
                "POST",
                "/calendar/facilities",
                payload={"name": name, "location": location, "capacity": capacity},
                expected={200, 201},
            )
            facilities.append(facility)
        stats["facilities"] = len(facilities)

        reservations = 0
        for event in events[:30]:
            event_dt = datetime.strptime(event["date"], "%Y-%m-%dT%H:%M:%S") if event["date"].endswith(":00") else datetime.strptime(event["date"], "%Y-%m-%dT%H:%M:00")
            start = event_dt.replace(hour=18, minute=0)
            end = start + timedelta(hours=2)
            facility = facilities[event["id"] % len(facilities)]
            self._request(
                "POST",
                "/calendar/reservations",
                payload={
                    "facility_id": facility["id"],
                    "event_id": event["id"],
                    "inicio": start.strftime("%Y-%m-%dT%H:%M"),
                    "fin": end.strftime("%Y-%m-%dT%H:%M"),
                    "responsable_person_id": self.random.choice(people)["id"],
                    "estado": self.random.choice(["confirmada", "pendiente"]),
                },
                expected={200, 201},
            )
            reservations += 1
        stats["reservations"] = reservations

        vendor_categories = [
            "Audio", "Iluminacion", "Catering", "Limpieza", "Seguridad", "Impresion", "Escenografia", "Transporte",
        ]
        vendors = 0
        for i in range(20):
            category = self.random.choice(vendor_categories)
            self._request(
                "POST",
                "/vendors/vendors",
                payload={
                    "name": f"Proveedor {category} {i + 1}",
                    "contact_name": f"Contacto {i + 1}",
                    "phone": f"+506 8{self.random.randint(100, 999)}-{self.random.randint(1000, 9999)}",
                    "email": f"proveedor{i + 1}@demo-iglesia.com",
                    "category": category,
                    "description": f"Proveedor de {category.lower()} para eventos y operaciones.",
                },
                expected={200, 201},
            )
            vendors += 1
        stats["vendors"] = vendors

        announcements = 0
        notifications = 0
        audiences = ["all", "members", "volunteers", "leaders"]

        for i in range(12):
            self._request(
                "POST",
                "/comms/announcements",
                payload={
                    "title": f"Comunicado semanal {i + 1}",
                    "content": "Recordatorio de actividades y puntos de oracion de la semana.",
                    "audience": self.random.choice(audiences),
                    "ministry_id": self.random.choice(ministries)["id"],
                    "published_at": (now + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S"),
                },
                expected={200, 201},
            )
            announcements += 1

        for i in range(18):
            self._request(
                "POST",
                "/comms/notifications",
                payload={
                    "title": f"Notificacion operativa {i + 1}",
                    "content": "Actualizacion importante para la coordinacion de equipos.",
                    "audience": self.random.choice(audiences),
                    "team_id": self.random.choice(teams)["id"],
                    "sent_at": (now + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%S"),
                },
                expected={200, 201},
            )
            notifications += 1

        stats["announcements"] = announcements
        stats["notifications"] = notifications

        consejerias = 0
        for i in range(22):
            solicitante = self.random.choice(people)
            consejero = self.random.choice(people)
            while consejero["id"] == solicitante["id"]:
                consejero = self.random.choice(people)
            self._request(
                "POST",
                "/consejeria/consejerias",
                payload={
                    "solicitante_person_id": solicitante["id"],
                    "consejero_person_id": consejero["id"],
                    "fecha": (now + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S"),
                    "motivo": self.random.choice([
                        "Acompanamiento espiritual", "Orientacion familiar", "Seguimiento personal", "Apoyo emocional"
                    ]),
                    "observaciones": "Caso generado para demostracion.",
                    "estado": self.random.choice(["abierta", "en_proceso", "cerrada"]),
                },
                expected={200, 201},
            )
            consejerias += 1
        stats["consejerias"] = consejerias

        attendance_snapshots = 0
        participation_snapshots = 0
        for event in worship_events[:10]:
            day = event["date"].split("T", 1)[0]
            total_visitantes = self.random.randint(20, 70)
            total_servidores = self.random.randint(35, 95)
            total_activos = total_visitantes + total_servidores
            total_voluntarios = self.random.randint(18, 45)

            self._request(
                "POST",
                "/reports/reports/attendance/history",
                payload={
                    "fecha": day,
                    "event_id": event["id"],
                    "total_visitantes": total_visitantes,
                    "total_servidores": total_servidores,
                },
                expected={200, 201},
            )
            attendance_snapshots += 1

            self._request(
                "POST",
                "/reports/reports/participation/history",
                payload={
                    "fecha": day,
                    "event_id": event["id"],
                    "total_activos": total_activos,
                    "total_voluntarios": total_voluntarios,
                },
                expected={200, 201},
            )
            participation_snapshots += 1

        stats["attendance_history"] = attendance_snapshots
        stats["participation_history"] = participation_snapshots

        return stats


def _print_counts(title: str, counts: dict[str, int]) -> None:
    print(f"\n{title}")
    print("-" * len(title))
    total = 0
    for key in sorted(counts.keys()):
        value = counts[key]
        total += value
        print(f"{key:24s} {value:5d}")
    print("-" * 32)
    print(f"{'total':24s} {total:5d}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze/reset/seed non-music demo data")
    parser.add_argument("command", choices=["analyze", "reset", "seed", "refresh-demo"])
    parser.add_argument("--base-url", default=BASE_URL, help="Gateway URL (default: http://localhost:8000)")
    parser.add_argument("--auth-url", default=AUTH_URL, help="Security service URL (default: http://localhost:8009)")
    parser.add_argument("--identifier", default=DEFAULT_IDENTIFIER, help="Login identifier")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Login password")
    parser.add_argument("--yes", action="store_true", help="Skip destructive operation confirmation")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manager = DemoDataManager(
        base_url=args.base_url,
        auth_url=args.auth_url,
        identifier=args.identifier,
        password=args.password,
    )
    try:
        if args.command == "analyze":
            counts = manager.analyze()
            _print_counts("Current Data Footprint (non-music + users)", counts)
            return

        if args.command == "reset":
            if not args.yes:
                raise RuntimeError("Reset is destructive. Run again with --yes to continue.")
            deleted = manager.reset_non_music_data()
            _print_counts("Deleted Rows By Resource", deleted)
            return

        if args.command == "seed":
            seeded = manager.seed_demo_data()
            _print_counts("Seeded Rows By Resource", seeded)
            return

        if args.command == "refresh-demo":
            if not args.yes:
                raise RuntimeError("refresh-demo is destructive. Run again with --yes to continue.")
            deleted = manager.reset_non_music_data()
            seeded = manager.seed_demo_data()
            current = manager.analyze()
            _print_counts("Deleted Rows By Resource", deleted)
            _print_counts("Seeded Rows By Resource", seeded)
            _print_counts("Current Data Footprint (post-refresh)", current)
            return

        raise RuntimeError("Unknown command")
    finally:
        manager.close()


if __name__ == "__main__":
    main()
