"""
Comprehensive integration tests for all ChurchTools microservices.
Run with: pytest tests/test_all_services.py -v
Requires all containers running: docker compose up -d
"""

import os
from uuid import uuid4

import httpx
import pytest

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
AUTH_URL = os.getenv("AUTH_URL", "http://localhost:8009")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def raw(port: int, path: str, method: str = "GET", **kwargs) -> httpx.Response:
    """Call a service directly (bypassing gateway, no auth needed for public endpoints)."""
    return httpx.request(method, f"http://localhost:{port}{path}", timeout=10, **kwargs)


def gw(path: str, method: str = "GET", token: str | None = None, **kwargs) -> httpx.Response:
    """Call the gateway."""
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.request(method, f"{BASE_URL}{path}", timeout=10, headers=headers, **kwargs)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def admin_token() -> str:
    """Obtain a valid JWT for the admin user."""
    resp = httpx.post(
        f"{AUTH_URL}/auth/login",
        json={"username": "admin@iglesia.com", "email": "admin@iglesia.com", "password": "Admin2026"},
        timeout=10,
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def person_id() -> int:
    """Create a person once and return its id for cross-service tests."""
    payload = {"name": "Test Person " + uuid4().hex[:8], "email": f"tp_{uuid4().hex[:8]}@test.com"}
    resp = httpx.post(f"{BASE_URL}/people/people", json=payload, timeout=10)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


# ===========================================================================
# 1. Health checks – all 15 services
# ===========================================================================


class TestHealthChecks:
    @pytest.mark.parametrize(
        "port,service",
        [
            (8000, "gateway"),
            (8001, "people"),
            (8002, "ministries"),
            (8003, "events"),
            (8004, "music"),
            (8005, "comms"),
            (8006, "groups"),
            (8007, "volunteers"),
            (8008, "calendar"),
            (8009, "security"),
            (8010, "reports"),
            (8011, "pdfs"),
            (8012, "consejeria"),
            (8013, "multitracks"),
            (8014, "vendors"),
        ],
    )
    def test_health(self, port: int, service: str):
        resp = raw(port, "/health")
        assert resp.status_code == 200, f"{service} health failed"
        body = resp.json()
        assert body.get("status") == "ok"
        assert body.get("service") == service


# ===========================================================================
# 2. Security / Auth service (port 8009)
# ===========================================================================


class TestSecurity:
    def test_login_valid(self, admin_token: str):
        assert len(admin_token) > 20

    def test_login_wrong_password(self):
        resp = httpx.post(
            f"{AUTH_URL}/auth/login",
            json={"username": "admin@iglesia.com", "email": "admin@iglesia.com", "password": "WrongPwd!"},
            timeout=10,
        )
        assert resp.status_code == 401

    def test_list_users_requires_auth(self):
        resp = raw(8009, "/users")
        assert resp.status_code == 401

    def test_list_users_authenticated(self, admin_token: str):
        resp = raw(8009, "/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1

    def test_create_and_delete_user(self, admin_token: str):
        uid = uuid4().hex[:8]
        payload = {
            "username": f"testuser_{uid}",
            "email": f"testuser_{uid}@test.com",
            "password": "TestPass123!",
            "active": True,
        }
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Create
        resp = raw(8009, "/users", method="POST", json=payload, headers=headers)
        assert resp.status_code == 200, resp.text
        user = resp.json()
        assert user["username"] == payload["username"]
        user_id = user["id"]

        # Read back
        resp2 = raw(8009, f"/users/{user_id}", headers=headers)
        assert resp2.status_code == 200

        # Update (deactivate)
        resp3 = raw(
            8009,
            f"/users/{user_id}",
            method="PUT",
            json={"username": payload["username"], "email": payload["email"], "active": False},
            headers=headers,
        )
        assert resp3.status_code == 200
        assert resp3.json()["active"] is False

        # Delete
        resp4 = raw(8009, f"/users/{user_id}", method="DELETE", headers=headers)
        assert resp4.status_code in (200, 204)

    def test_duplicate_user_rejected(self, admin_token: str):
        uid = uuid4().hex[:8]
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {"username": f"dupuser_{uid}", "email": f"dupuser_{uid}@test.com", "password": "Pass123!"}
        raw(8009, "/users", method="POST", json=payload, headers=headers)
        resp = raw(8009, "/users", method="POST", json=payload, headers=headers)
        assert resp.status_code == 400


# ===========================================================================
# 3. People service (port 8001)
# ===========================================================================


class TestPeople:
    def test_list_people(self):
        resp = raw(8001, "/people")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_get_delete_person(self):
        uid = uuid4().hex[:8]
        payload = {"name": f"Person {uid}", "email": f"p{uid}@test.com"}
        resp = raw(8001, "/people", method="POST", json=payload)
        assert resp.status_code == 200, resp.text
        pid = resp.json()["id"]

        get_resp = raw(8001, f"/people/{pid}")
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == payload["name"]

        del_resp = raw(8001, f"/people/{pid}", method="DELETE")
        assert del_resp.status_code in (200, 204)

    def test_duplicate_email_rejected(self):
        uid = uuid4().hex[:8]
        payload = {"name": f"Person {uid}", "email": f"dup{uid}@test.com"}
        raw(8001, "/people", method="POST", json=payload)
        resp = raw(8001, "/people", method="POST", json=payload)
        assert resp.status_code == 400


# ===========================================================================
# 4. Vendors service (port 8014)  — new module
# ===========================================================================


class TestVendors:
    def test_list_vendors(self):
        resp = raw(8014, "/vendors")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_read_update_delete_vendor(self):
        uid = uuid4().hex[:8]
        payload = {
            "name": f"Vendor {uid}",
            "contact_name": "Contact Person",
            "phone": "+506 8888-9999",
            "email": f"vendor_{uid}@test.com",
            "category": "Tecnología / AV",
            "description": "Test vendor for automated testing",
        }
        # Create
        resp = raw(8014, "/vendors", method="POST", json=payload)
        assert resp.status_code in (200, 201), resp.text
        vendor = resp.json()
        assert vendor["name"] == payload["name"]
        assert vendor["category"] == payload["category"]
        vid = vendor["id"]

        # Read
        get_resp = raw(8014, f"/vendors/{vid}")
        assert get_resp.status_code == 200
        assert get_resp.json()["email"] == payload["email"]

        # Update
        updated_payload = {**payload, "name": f"Updated Vendor {uid}", "phone": "+506 7777-0000"}
        put_resp = raw(8014, f"/vendors/{vid}", method="PUT", json=updated_payload)
        assert put_resp.status_code == 200
        assert put_resp.json()["name"] == updated_payload["name"]

        # Delete
        del_resp = raw(8014, f"/vendors/{vid}", method="DELETE")
        assert del_resp.status_code in (200, 204)

        # Confirm deleted
        gone = raw(8014, f"/vendors/{vid}")
        assert gone.status_code == 404

    def test_vendor_not_found(self):
        resp = raw(8014, "/vendors/999999")
        assert resp.status_code == 404

    def test_vendor_missing_name_rejected(self):
        # name is the only required field
        resp = raw(8014, "/vendors", method="POST", json={"category": "Otro"})
        assert resp.status_code == 422

    def test_vendors_via_gateway(self):
        resp = gw("/vendors/vendors")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===========================================================================
# 5. Ministries service (port 8002)
# ===========================================================================


class TestMinistries:
    def test_list_ministries(self):
        resp = raw(8002, "/ministries")
        assert resp.status_code == 200

    def test_ministry_crud(self):
        uid = uuid4().hex[:8]
        payload = {"name": f"Ministry {uid}"}
        resp = raw(8002, "/ministries", method="POST", json=payload)
        assert resp.status_code == 200
        mid = resp.json()["id"]

        get_resp = raw(8002, f"/ministries/{mid}")
        assert get_resp.status_code == 200

        del_resp = raw(8002, f"/ministries/{mid}", method="DELETE")
        assert del_resp.status_code in (200, 204)

    def test_team_role_requires_ministry_id(self):
        resp = raw(8002, "/team-roles", method="POST", json={"name": "Role Without Ministry"})
        assert resp.status_code == 422

    def test_duplicate_team_role_same_ministry_rejected(self):
        ministry = raw(8002, "/ministries", method="POST", json={"name": f"Min {uuid4().hex[:8]}"}).json()
        role_name = f"Role {uuid4().hex[:8]}"
        raw(8002, "/team-roles", method="POST", json={"name": role_name, "ministry_id": ministry["id"]})
        dup = raw(8002, "/team-roles", method="POST", json={"name": role_name, "ministry_id": ministry["id"]})
        assert dup.status_code == 400

    def test_team_member_duplicate_rejected(self, person_id: int):
        ministry = raw(8002, "/ministries", method="POST", json={"name": f"Min {uuid4().hex[:8]}"}).json()
        team = raw(
            8002, "/teams", method="POST", json={"name": f"Team {uuid4().hex[:8]}", "ministry_id": ministry["id"]}
        ).json()
        member = raw(8002, "/team-members", method="POST", json={"person_id": person_id, "team_id": team["id"]})
        assert member.status_code == 200
        dup = raw(8002, "/team-members", method="POST", json={"person_id": person_id, "team_id": team["id"]})
        assert dup.status_code == 400


# ===========================================================================
# 6. Events service (port 8003)
# ===========================================================================


class TestEvents:
    def test_list_events(self):
        resp = raw(8003, "/events")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_event(self):
        uid = uuid4().hex[:8]
        payload = {"name": f"Event {uid}", "date": "2027-01-15T10:00:00"}
        resp = raw(8003, "/events", method="POST", json=payload)
        assert resp.status_code == 200, resp.text
        assert "id" in resp.json()


# ===========================================================================
# 7. Music service (port 8004)
# ===========================================================================


class TestMusic:
    def test_list_songs(self):
        resp = raw(8004, "/songs")
        assert resp.status_code == 200

    def test_duplicate_song_rejected(self):
        name = f"Song {uuid4().hex[:8]}"
        raw(8004, "/songs", method="POST", json={"name": name})
        dup = raw(8004, "/songs", method="POST", json={"name": name})
        assert dup.status_code == 400

    def test_repertoire_song_duplicate_rejected(self):
        name = f"Song {uuid4().hex[:8]}"
        song = raw(8004, "/songs", method="POST", json={"name": name}).json()
        repertoire = raw(8004, "/repertoires", method="POST", json={"event_id": 1}).json()
        item = raw(
            8004,
            "/repertoire-songs",
            method="POST",
            json={"repertoire_id": repertoire["id"], "song_id": song["id"]},
        )
        assert item.status_code == 200
        dup = raw(
            8004,
            "/repertoire-songs",
            method="POST",
            json={"repertoire_id": repertoire["id"], "song_id": song["id"]},
        )
        assert dup.status_code == 400


# ===========================================================================
# 8. Groups service (port 8006)
# ===========================================================================


class TestGroups:
    def test_list_groups(self):
        resp = raw(8006, "/small-groups")
        assert resp.status_code == 200

    def test_duplicate_member_rejected(self, person_id: int):
        group = raw(
            8006,
            "/small-groups",
            method="POST",
            json={"name": f"Group {uuid4().hex[:8]}", "leader_person_id": person_id},
        ).json()
        member = raw(8006, "/small-group-members", method="POST", json={"group_id": group["id"], "person_id": person_id})
        assert member.status_code == 200
        dup = raw(8006, "/small-group-members", method="POST", json={"group_id": group["id"], "person_id": person_id})
        assert dup.status_code == 400


# ===========================================================================
# 9. Volunteers service (port 8007)
# ===========================================================================


class TestVolunteers:
    def test_list_roles(self):
        resp = raw(8007, "/volunteer-roles")
        assert resp.status_code == 200

    def test_shift_start_after_end_rejected(self):
        role = raw(8007, "/volunteer-roles", method="POST", json={"name": f"Role {uuid4().hex[:8]}"}).json()
        resp = raw(
            8007,
            "/shifts",
            method="POST",
            json={"event_id": 1, "role_id": role["id"], "inicio": "2025-06-01T10:00", "fin": "2025-06-01T09:00"},
        )
        assert resp.status_code == 400

    def test_duplicate_assignment_rejected(self, person_id: int):
        role = raw(8007, "/volunteer-roles", method="POST", json={"name": f"Role {uuid4().hex[:8]}"}).json()
        shift = raw(
            8007,
            "/shifts",
            method="POST",
            json={"event_id": 1, "role_id": role["id"], "inicio": "2025-07-01T09:00", "fin": "2025-07-01T10:00"},
        ).json()
        a1 = raw(
            8007,
            "/shift-assignments",
            method="POST",
            json={"shift_id": shift["id"], "person_id": person_id, "estado": "confirmado"},
        )
        assert a1.status_code == 200
        a2 = raw(
            8007,
            "/shift-assignments",
            method="POST",
            json={"shift_id": shift["id"], "person_id": person_id, "estado": "confirmado"},
        )
        assert a2.status_code == 400


# ===========================================================================
# 10. Calendar service (port 8008)
# ===========================================================================


class TestCalendar:
    def test_list_facilities(self):
        resp = raw(8008, "/facilities")
        assert resp.status_code == 200

    def test_reservation_overlap_rejected(self):
        facility = raw(8008, "/facilities", method="POST", json={"name": f"Hall {uuid4().hex[:8]}"}).json()
        r1 = raw(
            8008,
            "/reservations",
            method="POST",
            json={"facility_id": facility["id"], "inicio": "2025-11-01T09:00", "fin": "2025-11-01T10:00"},
        )
        assert r1.status_code == 200
        overlap = raw(
            8008,
            "/reservations",
            method="POST",
            json={"facility_id": facility["id"], "inicio": "2025-11-01T09:30", "fin": "2025-11-01T10:30"},
        )
        assert overlap.status_code == 400


# ===========================================================================
# 11. Comms service (port 8005)
# ===========================================================================


class TestComms:
    def test_broadcast_to_empty_audience_rejected(self):
        resp = raw(8005, "/notifications", method="POST", json={"title": "Test", "content": "Body", "audience": "all"})
        assert resp.status_code == 400


# ===========================================================================
# 12. Consejeria service (port 8012)
# ===========================================================================


class TestConsejeria:
    def test_list_consejerias(self):
        resp = raw(8012, "/consejerias")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_consejeria(self, person_id: int):
        # Create a second person to act as consejero (must differ from solicitante)
        uid = uuid4().hex[:8]
        consejero = httpx.post(
            f"{BASE_URL}/people/people",
            json={"name": f"Consejero {uid}", "email": f"consejero_{uid}@test.com"},
            timeout=10,
        ).json()
        payload = {
            "solicitante_person_id": person_id,
            "consejero_person_id": consejero["id"],
            "fecha": "2027-03-01T10:00:00",
            "motivo": "Test session",
        }
        resp = raw(8012, "/consejerias", method="POST", json=payload)
        assert resp.status_code in (200, 201), resp.text


# ===========================================================================
# 13. Reports service (port 8010)
# ===========================================================================


class TestReports:
    def test_attendance_report(self):
        resp = raw(8010, "/reports/attendance")
        assert resp.status_code == 200

    def test_participation_report(self):
        resp = raw(8010, "/reports/participation")
        assert resp.status_code == 200


# ===========================================================================
# 14. PDFs service (port 8011)
# ===========================================================================


class TestPdfs:
    def test_list_pdfs(self):
        resp = raw(8011, "/pdfs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ===========================================================================
# 15. Multitracks service (port 8013)
# ===========================================================================


class TestMultitracks:
    def test_list_stems(self):
        resp = raw(8013, "/stems")
        assert resp.status_code == 200


# ===========================================================================
# 16. Gateway routing
# ===========================================================================


class TestGateway:
    @pytest.mark.parametrize(
        "path",
        [
            "/people/people",
            "/ministries/ministries",
            "/events/events",
            "/music/songs",
            "/groups/small-groups",
            "/volunteers/volunteer-roles",
            "/calendar/facilities",
            "/vendors/vendors",
        ],
    )
    def test_gateway_routes_to_services(self, path: str):
        resp = gw(path)
        assert resp.status_code == 200, f"Gateway route {path} failed"
        assert isinstance(resp.json(), list)

    def test_gateway_404_for_unknown_service(self):
        resp = gw("/nonexistent-service/something")
        assert resp.status_code in (404, 502, 503)
