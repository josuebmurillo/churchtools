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


def module_variant_for_role(role_name: str) -> str | None:
    normalized = (
        role_name.strip().lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    )
    if normalized in {"admin", "administracion"}:
        return "admin"
    if normalized in {"music", "musica", "musicos"}:
        return "music"
    if normalized in {"volunteers", "volunteer", "voluntario", "voluntarios"}:
        return "volunteers"
    return None


def permission_key(permission_name: str) -> str:
    return permission_name.strip().lower()

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
        json={"identifier": "admin@iglesia.com", "password": "Admin2026"},
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
    def test_roles_seeded_for_module_access(self, admin_token: str):
        resp = raw(8009, "/roles", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text
        module_variants = {module_variant_for_role(role["name"]) for role in resp.json()}
        assert {"admin", "music", "volunteers"}.issubset(module_variants)

    def test_permissions_seeded_for_modules(self, admin_token: str):
        resp = raw(8009, "/permissions", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text
        permission_names = {permission_key(permission["name"]) for permission in resp.json()}
        assert {"admin:ministerios", "music:ensayo", "volunteers:turnos"}.issubset(permission_names)

    def test_login_valid(self, admin_token: str):
        assert len(admin_token) > 20

    def test_login_returns_bearer_token_and_me_works(self):
        login_resp = httpx.post(
            f"{AUTH_URL}/auth/login",
            json={"identifier": "admin@iglesia.com", "password": "Admin2026"},
            timeout=10,
        )
        assert login_resp.status_code == 200, login_resp.text
        body = login_resp.json()
        assert body.get("token_type") == "bearer"
        assert isinstance(body.get("access_token"), str)
        assert len(body["access_token"]) > 20

        me_resp = raw(8009, "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
        assert me_resp.status_code == 200
        me = me_resp.json()
        assert me["email"] == "admin@iglesia.com"
        assert me["active"] is True
        assert "roles" in me
        assert "permissions" in me
        assert any(module_variant_for_role(role["name"]) == "admin" for role in me["roles"])
        assert "admin:usuarios" in {permission_key(permission["name"]) for permission in me["permissions"]}

    def test_login_wrong_password(self):
        resp = httpx.post(
            f"{AUTH_URL}/auth/login",
            json={"identifier": "admin@iglesia.com", "password": "WrongPwd!"},
            timeout=10,
        )
        assert resp.status_code == 401

    def test_login_validation_missing_required_fields(self):
        resp = httpx.post(
            f"{AUTH_URL}/auth/login",
            json={"password": "Admin2026"},
            timeout=10,
        )
        assert resp.status_code == 422

    def test_auth_me_requires_token(self):
        resp = raw(8009, "/auth/me")
        assert resp.status_code == 401

    def test_auth_me_invalid_token_rejected(self):
        resp = raw(8009, "/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"})
        assert resp.status_code == 401

    def test_login_inactive_user_forbidden(self):
        uid = uuid4().hex[:8]
        payload = {
            "username": f"inactive_{uid}",
            "email": f"inactive_{uid}@test.com",
            "password": "TestPass123!",
            "active": False,
        }
        register_resp = raw(8009, "/auth/register", method="POST", json=payload)
        assert register_resp.status_code == 200, register_resp.text

        login_resp = raw(
            8009,
            "/auth/login",
            method="POST",
            json={"identifier": payload["email"], "password": payload["password"]},
        )
        assert login_resp.status_code == 403

    def test_list_users_requires_auth(self):
        resp = raw(8009, "/users")
        assert resp.status_code == 401

    def test_security_users_via_gateway_requires_auth(self):
        resp = gw("/security/users")
        assert resp.status_code == 401

    def test_list_users_authenticated(self, admin_token: str):
        resp = raw(8009, "/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1

    def test_security_users_via_gateway_authenticated(self, admin_token: str):
        resp = gw("/security/users", token=admin_token)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_user_with_module_roles_and_update_them(self, admin_token: str):
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        roles_resp = raw(8009, "/roles", headers=admin_headers)
        assert roles_resp.status_code == 200, roles_resp.text
        roles = {module_variant_for_role(role["name"]): role["id"] for role in roles_resp.json() if module_variant_for_role(role["name"])}
        permissions_resp = raw(8009, "/permissions", headers=admin_headers)
        assert permissions_resp.status_code == 200, permissions_resp.text
        permissions = {permission_key(permission["name"]): permission["id"] for permission in permissions_resp.json()}

        uid = uuid4().hex[:8]
        create_payload = {
            "username": f"modules_{uid}",
            "email": f"modules_{uid}@test.com",
            "password": "TestPass123!",
            "active": True,
            "role_ids": [roles["music"], roles["volunteers"]],
            "permission_ids": [permissions["music:ensayo"], permissions["volunteers:turnos"]],
        }
        create_resp = raw(8009, "/users", method="POST", headers=admin_headers, json=create_payload)
        assert create_resp.status_code == 200, create_resp.text
        created_user = create_resp.json()
        created_role_names = {module_variant_for_role(role["name"]) for role in created_user["roles"]}
        assert created_role_names == {"music", "volunteers"}
        assert {permission_key(permission["name"]) for permission in created_user["permissions"]} == {"music:ensayo", "volunteers:turnos"}

        login_resp = raw(
            8009,
            "/auth/login",
            method="POST",
            json={"identifier": create_payload["email"], "password": create_payload["password"]},
        )
        assert login_resp.status_code == 200, login_resp.text
        user_token = login_resp.json()["access_token"]
        me_resp = raw(8009, "/auth/me", headers={"Authorization": f"Bearer {user_token}"})
        assert me_resp.status_code == 200, me_resp.text
        assert {module_variant_for_role(role["name"]) for role in me_resp.json()["roles"]} == {"music", "volunteers"}
        assert {permission_key(permission["name"]) for permission in me_resp.json()["permissions"]} == {"music:ensayo", "volunteers:turnos"}

        update_resp = raw(
            8009,
            f"/users/{created_user['id']}",
            method="PUT",
            headers=admin_headers,
            json={
                "username": create_payload["username"],
                "email": create_payload["email"],
                "active": True,
                "role_ids": [roles["music"]],
                "permission_ids": [permissions["music:general"], permissions["music:setlist"]],
            },
        )
        assert update_resp.status_code == 200, update_resp.text
        assert {module_variant_for_role(role["name"]) for role in update_resp.json()["roles"]} == {"music"}
        assert {permission_key(permission["name"]) for permission in update_resp.json()["permissions"]} == {"music:general", "music:setlist"}

        cleanup_resp = raw(8009, f"/users/{created_user['id']}", method="DELETE", headers=admin_headers)
        assert cleanup_resp.status_code in (200, 204)

    def test_non_admin_cannot_access_users_crud(self):
        uid = uuid4().hex[:8]
        email = f"rbac_{uid}@test.com"
        register_payload = {
            "username": f"rbac_{uid}",
            "email": email,
            "password": "TestPass123!",
            "active": True,
        }
        register_resp = raw(8009, "/auth/register", method="POST", json=register_payload)
        assert register_resp.status_code == 200, register_resp.text

        token_resp = raw(
            8009,
            "/auth/login",
            method="POST",
            json={"identifier": email, "password": register_payload["password"]},
        )
        assert token_resp.status_code == 200, token_resp.text
        token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        list_resp = raw(8009, "/users", headers=headers)
        assert list_resp.status_code == 403

        create_resp = raw(
            8009,
            "/users",
            method="POST",
            headers=headers,
            json={
                "username": f"blocked_{uid}",
                "email": f"blocked_{uid}@test.com",
                "password": "TestPass123!",
                "active": True,
            },
        )
        assert create_resp.status_code == 403

    def test_non_admin_cannot_get_update_delete_users(self, admin_token: str):
        uid = uuid4().hex[:8]
        email = f"rbac2_{uid}@test.com"
        register_payload = {
            "username": f"rbac2_{uid}",
            "email": email,
            "password": "TestPass123!",
            "active": True,
        }
        register_resp = raw(8009, "/auth/register", method="POST", json=register_payload)
        assert register_resp.status_code == 200, register_resp.text

        non_admin_login = raw(
            8009,
            "/auth/login",
            method="POST",
            json={"identifier": email, "password": register_payload["password"]},
        )
        assert non_admin_login.status_code == 200, non_admin_login.text
        non_admin_headers = {"Authorization": f"Bearer {non_admin_login.json()['access_token']}"}

        target_payload = {
            "username": f"target_{uid}",
            "email": f"target_{uid}@test.com",
            "password": "TargetPass123!",
            "active": True,
        }
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        target_create = raw(8009, "/users", method="POST", headers=admin_headers, json=target_payload)
        assert target_create.status_code == 200, target_create.text
        target_user = target_create.json()
        target_user_id = target_user["id"]

        get_resp = raw(8009, f"/users/{target_user_id}", headers=non_admin_headers)
        assert get_resp.status_code == 403

        update_resp = raw(
            8009,
            f"/users/{target_user_id}",
            method="PUT",
            headers=non_admin_headers,
            json={
                "username": target_payload["username"],
                "email": target_payload["email"],
                "active": False,
            },
        )
        assert update_resp.status_code == 403

        delete_resp = raw(8009, f"/users/{target_user_id}", method="DELETE", headers=non_admin_headers)
        assert delete_resp.status_code == 403

        cleanup_resp = raw(8009, f"/users/{target_user_id}", method="DELETE", headers=admin_headers)
        assert cleanup_resp.status_code in (200, 204)

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

    def test_vendors_via_gateway(self, admin_token: str):
        resp = gw("/vendors/vendors", token=admin_token)
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

    def test_delete_ministry_with_cascade(self, person_id: int):
        ministry = raw(8002, "/ministries", method="POST", json={"name": f"Min {uuid4().hex[:8]}"}).json()
        team = raw(
            8002,
            "/teams",
            method="POST",
            json={"name": f"Team {uuid4().hex[:8]}", "ministry_id": ministry["id"]},
        ).json()
        role = raw(
            8002,
            "/team-roles",
            method="POST",
            json={"name": f"Role {uuid4().hex[:8]}", "ministry_id": ministry["id"]},
        ).json()
        member = raw(
            8002,
            "/team-members",
            method="POST",
            json={"person_id": person_id, "team_id": team["id"], "role_id": role["id"]},
        )
        assert member.status_code == 200

        preview = raw(8002, f"/ministries/{ministry['id']}/delete-preview")
        assert preview.status_code == 200, preview.text
        preview_body = preview.json()
        assert preview_body["requires_cascade"] is True
        assert preview_body["teams"] == 1
        assert preview_body["team_roles"] == 1
        assert preview_body["team_members"] == 1

        blocked = raw(8002, f"/ministries/{ministry['id']}", method="DELETE")
        assert blocked.status_code == 409

        deleted = raw(8002, f"/ministries/{ministry['id']}?cascade=true", method="DELETE")
        assert deleted.status_code == 200, deleted.text
        body = deleted.json()
        assert body["deleted"] is True
        assert body["cascade"] is True
        assert body["summary"]["teams_deleted"] == 1
        assert body["summary"]["team_roles_deleted"] == 1
        assert body["summary"]["team_members_deleted"] == 1

        ministry_missing = raw(8002, f"/ministries/{ministry['id']}")
        assert ministry_missing.status_code == 404


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

    def test_reports_can_be_associated_with_event(self):
        event_resp = raw(
            8003,
            "/events",
            method="POST",
            json={"name": f"Report Event {uuid4().hex[:8]}", "date": "2027-02-01T10:00:00"},
        )
        assert event_resp.status_code == 200, event_resp.text
        event_id = event_resp.json()["id"]

        attendance_resp = raw(
            8010,
            "/reports/attendance/history",
            method="POST",
            json={
                "fecha": "2027-02-01",
                "event_id": event_id,
                "total_asistencia": 150,
                "total_visitantes": 18,
            },
        )
        assert attendance_resp.status_code == 200, attendance_resp.text
        assert attendance_resp.json()["event_id"] == event_id
        attendance_snapshot_id = attendance_resp.json()["id"]

        participation_resp = raw(
            8010,
            "/reports/participation/history",
            method="POST",
            json={
                "fecha": "2027-02-01",
                "event_id": event_id,
                "total_activos": 150,
                "total_voluntarios": 24,
            },
        )
        assert participation_resp.status_code == 200, participation_resp.text
        assert participation_resp.json()["event_id"] == event_id
        participation_snapshot_id = participation_resp.json()["id"]

        attendance_update = raw(
            8010,
            f"/reports/attendance/history/{attendance_snapshot_id}",
            method="PUT",
            json={
                "fecha": "2027-02-02",
                "event_id": event_id,
                "total_asistencia": 160,
                "total_visitantes": 20,
            },
        )
        assert attendance_update.status_code == 200, attendance_update.text
        assert attendance_update.json()["total_asistencia"] == 160

        participation_update = raw(
            8010,
            f"/reports/participation/history/{participation_snapshot_id}",
            method="PUT",
            json={
                "fecha": "2027-02-02",
                "event_id": event_id,
                "total_activos": 160,
                "total_voluntarios": 26,
            },
        )
        assert participation_update.status_code == 200, participation_update.text
        assert participation_update.json()["total_voluntarios"] == 26

        attendance_latest = raw(8010, "/reports/attendance")
        assert attendance_latest.status_code == 200
        assert attendance_latest.json()["event_id"] == event_id

        participation_latest = raw(8010, "/reports/participation")
        assert participation_latest.status_code == 200
        assert participation_latest.json()["event_id"] == event_id

        attendance_history = raw(8010, "/reports/attendance/history")
        assert attendance_history.status_code == 200
        assert any(item.get("event_id") == event_id for item in attendance_history.json())

        participation_history = raw(8010, "/reports/participation/history")
        assert participation_history.status_code == 200
        assert any(item.get("event_id") == event_id for item in participation_history.json())

        delete_attendance = raw(8010, f"/reports/attendance/history/{attendance_snapshot_id}", method="DELETE")
        assert delete_attendance.status_code == 200

        delete_participation = raw(8010, f"/reports/participation/history/{participation_snapshot_id}", method="DELETE")
        assert delete_participation.status_code == 200


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
    def test_gateway_routes_to_services(self, path: str, admin_token: str):
        resp = gw(path, token=admin_token)
        assert resp.status_code == 200, f"Gateway route {path} failed"
        assert isinstance(resp.json(), list)

    def test_gateway_blocks_missing_module_permission(self, admin_token: str):
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        roles_resp = raw(8009, "/roles", headers=admin_headers)
        assert roles_resp.status_code == 200, roles_resp.text
        roles = {module_variant_for_role(role["name"]): role["id"] for role in roles_resp.json() if module_variant_for_role(role["name"])}

        permissions_resp = raw(8009, "/permissions", headers=admin_headers)
        assert permissions_resp.status_code == 200, permissions_resp.text
        permissions = {permission_key(permission["name"]): permission["id"] for permission in permissions_resp.json()}

        uid = uuid4().hex[:8]
        user_payload = {
            "username": f"gwperm_{uid}",
            "email": f"gwperm_{uid}@test.com",
            "password": "TestPass123!",
            "active": True,
            "role_ids": [roles["volunteers"]],
            "permission_ids": [permissions["volunteers:eventos"]],
        }
        create_resp = raw(8009, "/users", method="POST", headers=admin_headers, json=user_payload)
        assert create_resp.status_code == 200, create_resp.text
        created_user_id = create_resp.json()["id"]

        try:
            login_resp = raw(
                8009,
                "/auth/login",
                method="POST",
                json={"identifier": user_payload["email"], "password": user_payload["password"]},
            )
            assert login_resp.status_code == 200, login_resp.text
            user_token = login_resp.json()["access_token"]

            allowed_resp = gw("/events/events", token=user_token)
            assert allowed_resp.status_code == 200

            blocked_resp = gw("/volunteers/shifts", token=user_token)
            assert blocked_resp.status_code == 403
        finally:
            cleanup_resp = raw(8009, f"/users/{created_user_id}", method="DELETE", headers=admin_headers)
            assert cleanup_resp.status_code in (200, 204)

    def test_gateway_404_for_unknown_service(self):
        resp = gw("/nonexistent-service/something")
        assert resp.status_code in (404, 502, 503)
