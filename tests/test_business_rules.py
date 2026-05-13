import os
from uuid import uuid4

import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
AUTH_URL = os.getenv("AUTH_URL", "http://localhost:8009")
_ADMIN_TOKEN: str | None = None


def admin_token() -> str:
    global _ADMIN_TOKEN
    if _ADMIN_TOKEN:
        return _ADMIN_TOKEN
    resp = httpx.post(
        f"{AUTH_URL}/auth/login",
        json={"identifier": "admin@iglesia.com", "password": "Admin2026"},
        timeout=10.0,
    )
    assert resp.status_code == 200, resp.text
    _ADMIN_TOKEN = resp.json()["access_token"]
    return _ADMIN_TOKEN


def post_json(path: str, payload: dict, token: str | None = None) -> httpx.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.post(f"{BASE_URL}{path}", json=payload, timeout=10.0, headers=headers)


def delete_path(path: str, token: str | None = None) -> httpx.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.delete(f"{BASE_URL}{path}", timeout=10.0, headers=headers)


def get_json(path: str, token: str | None = None) -> httpx.Response:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.get(f"{BASE_URL}{path}", timeout=10.0, headers=headers)


def test_ministries_rules():
    token = admin_token()
    person = post_json(
        "/people/people",
        {"name": "Person " + uuid4().hex, "email": f"p{uuid4().hex}@test.com"},
    ).json()
    ministry = post_json("/ministries/ministries", {"name": "Min " + uuid4().hex}, token=token).json()
    team = post_json(
        "/ministries/teams",
        {"name": "Team " + uuid4().hex, "ministry_id": ministry["id"]},
        token=token,
    ).json()
    role_name = "Leader " + uuid4().hex
    role = post_json(
        "/ministries/team-roles",
        {"name": role_name, "ministry_id": ministry["id"]},
        token=token,
    ).json()
    dup_role = post_json(
        "/ministries/team-roles",
        {"name": role_name, "ministry_id": ministry["id"]},
        token=token,
    )
    assert dup_role.status_code == 400

    member = post_json(
        "/ministries/team-members",
        {"person_id": person["id"], "team_id": team["id"], "role_id": role["id"]},
        token=token,
    )
    assert member.status_code == 200
    dup_member = post_json(
        "/ministries/team-members",
        {"person_id": person["id"], "team_id": team["id"], "role_id": role["id"]},
        token=token,
    )
    assert dup_member.status_code == 400


def test_music_rules():
    token = admin_token()
    song_name = "Song " + uuid4().hex
    song = post_json("/music/songs", {"name": song_name}, token=token).json()
    dup_song = post_json("/music/songs", {"name": song_name}, token=token)
    assert dup_song.status_code == 400

    repertoire = post_json("/music/repertoires", {"event_id": 1}, token=token).json()
    item = post_json(
        "/music/repertoire-songs",
        {"repertoire_id": repertoire["id"], "song_id": song["id"]},
        token=token,
    )
    assert item.status_code == 200
    dup_item = post_json(
        "/music/repertoire-songs",
        {"repertoire_id": repertoire["id"], "song_id": song["id"]},
        token=token,
    )
    assert dup_item.status_code == 400


def test_worship_schedule_creates_and_deletes_setlist():
    token = admin_token()
    event = post_json(
        "/events/events",
        {
            "name": "Culto Test " + uuid4().hex[:8],
            "date": "2026-06-15T19:00:00",
            "ministry_id": None,
            "schedule": None,
            "is_worship": True,
        },
        token=token,
    )
    assert event.status_code == 200, event.text
    event_id = event.json()["id"]

    try:
        schedule = post_json(
            "/events/event-schedules",
            {
                "event_id": event_id,
                "inicio": "2026-06-15T19:00:00",
                "fin": "2026-06-15T19:30:00",
                "tipo": "Alabanza y adoracion",
                "observacion": None,
                "encargado_person_id": None,
            },
            token=token,
        )
        assert schedule.status_code == 200, schedule.text
        schedule_id = schedule.json()["id"]

        repertoires = get_json("/music/repertoires", token=token)
        assert repertoires.status_code == 200, repertoires.text
        event_repertoires = [item for item in repertoires.json() if item["event_id"] == event_id]
        assert len(event_repertoires) == 1

        deleted_schedule = delete_path(f"/events/event-schedules/{schedule_id}", token=token)
        assert deleted_schedule.status_code == 200, deleted_schedule.text

        repertoires_after_delete = get_json("/music/repertoires", token=token)
        assert repertoires_after_delete.status_code == 200, repertoires_after_delete.text
        assert [item for item in repertoires_after_delete.json() if item["event_id"] == event_id] == []
    finally:
        delete_path(f"/events/events/{event_id}", token=token)


def test_deleting_event_removes_setlist():
    token = admin_token()
    event = post_json(
        "/events/events",
        {
            "name": "Culto Delete Test " + uuid4().hex[:8],
            "date": "2026-06-16T19:00:00",
            "ministry_id": None,
            "schedule": None,
            "is_worship": True,
        },
        token=token,
    )
    assert event.status_code == 200, event.text
    event_id = event.json()["id"]

    schedule = post_json(
        "/events/event-schedules",
        {
            "event_id": event_id,
            "inicio": "2026-06-16T19:00:00",
            "fin": "2026-06-16T19:30:00",
            "tipo": "Alabanza y adoracion",
            "observacion": None,
            "encargado_person_id": None,
        },
        token=token,
    )
    assert schedule.status_code == 200, schedule.text

    repertoires = get_json("/music/repertoires", token=token)
    assert repertoires.status_code == 200, repertoires.text
    assert len([item for item in repertoires.json() if item["event_id"] == event_id]) == 1

    deleted_event = delete_path(f"/events/events/{event_id}", token=token)
    assert deleted_event.status_code == 200, deleted_event.text

    repertoires_after_delete = get_json("/music/repertoires", token=token)
    assert repertoires_after_delete.status_code == 200, repertoires_after_delete.text
    assert [item for item in repertoires_after_delete.json() if item["event_id"] == event_id] == []


def test_comms_rules():
    response = post_json(
        "/comms/notifications",
        {"title": "Hi", "content": "Body", "audience": "all"},
    )
    assert response.status_code == 400


def test_groups_rules():
    person = post_json(
        "/people/people",
        {"name": "Person " + uuid4().hex, "email": f"g{uuid4().hex}@test.com"},
    ).json()
    group = post_json(
        "/groups/small-groups",
        {"name": "Group " + uuid4().hex, "leader_person_id": person["id"]},
    ).json()
    member = post_json(
        "/groups/small-group-members",
        {"group_id": group["id"], "person_id": person["id"]},
    )
    assert member.status_code == 200
    dup_member = post_json(
        "/groups/small-group-members",
        {"group_id": group["id"], "person_id": person["id"]},
    )
    assert dup_member.status_code == 400


def test_volunteers_rules():
    token = admin_token()
    person = post_json(
        "/people/people",
        {"name": "Person " + uuid4().hex, "email": f"v{uuid4().hex}@test.com"},
    ).json()
    role = post_json("/volunteers/volunteer-roles", {"name": "Role " + uuid4().hex}, token=token).json()
    invalid_shift = post_json(
        "/volunteers/shifts",
        {
            "event_id": 1,
            "role_id": role["id"],
            "inicio": "2024-01-01T10:00",
            "fin": "2024-01-01T09:00",
        },
        token=token,
    )
    assert invalid_shift.status_code == 400

    shift = post_json(
        "/volunteers/shifts",
        {
            "event_id": 1,
            "role_id": role["id"],
            "inicio": "2024-01-01T09:00",
            "fin": "2024-01-01T10:00",
        },
        token=token,
    ).json()
    assignment = post_json(
        "/volunteers/shift-assignments",
        {"shift_id": shift["id"], "person_id": person["id"], "estado": "confirmado"},
        token=token,
    )
    assert assignment.status_code == 200
    dup_assignment = post_json(
        "/volunteers/shift-assignments",
        {"shift_id": shift["id"], "person_id": person["id"], "estado": "confirmado"},
        token=token,
    )
    assert dup_assignment.status_code == 400


def test_calendar_rules():
    token = admin_token()
    facility = post_json("/calendar/facilities", {"name": "Hall " + uuid4().hex}, token=token).json()
    reservation = post_json(
        "/calendar/reservations",
        {"facility_id": facility["id"], "inicio": "2024-01-01T09:00", "fin": "2024-01-01T10:00"},
        token=token,
    )
    assert reservation.status_code == 200
    overlap = post_json(
        "/calendar/reservations",
        {"facility_id": facility["id"], "inicio": "2024-01-01T09:30", "fin": "2024-01-01T10:30"},
        token=token,
    )
    assert overlap.status_code == 400
