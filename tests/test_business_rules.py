import os
from uuid import uuid4

import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


def post_json(path: str, payload: dict) -> httpx.Response:
    return httpx.post(f"{BASE_URL}{path}", json=payload, timeout=10.0)


def test_ministries_rules():
    person = post_json(
        "/people/people",
        {"name": "Person " + uuid4().hex, "email": f"p{uuid4().hex}@test.com"},
    ).json()
    ministry = post_json("/ministries/ministries", {"name": "Min " + uuid4().hex}).json()
    team = post_json(
        "/ministries/teams",
        {"name": "Team " + uuid4().hex, "ministry_id": ministry["id"]},
    ).json()
    role_name = "Leader " + uuid4().hex
    role = post_json("/ministries/team-roles", {"name": role_name}).json()
    dup_role = post_json("/ministries/team-roles", {"name": role_name})
    assert dup_role.status_code == 400

    member = post_json(
        "/ministries/team-members",
        {"person_id": person["id"], "team_id": team["id"], "role_id": role["id"]},
    )
    assert member.status_code == 200
    dup_member = post_json(
        "/ministries/team-members",
        {"person_id": person["id"], "team_id": team["id"], "role_id": role["id"]},
    )
    assert dup_member.status_code == 400


def test_music_rules():
    song_name = "Song " + uuid4().hex
    song = post_json("/music/songs", {"name": song_name}).json()
    dup_song = post_json("/music/songs", {"name": song_name})
    assert dup_song.status_code == 400

    repertoire = post_json("/music/repertoires", {"event_id": 1}).json()
    item = post_json(
        "/music/repertoire-songs",
        {"repertoire_id": repertoire["id"], "song_id": song["id"]},
    )
    assert item.status_code == 200
    dup_item = post_json(
        "/music/repertoire-songs",
        {"repertoire_id": repertoire["id"], "song_id": song["id"]},
    )
    assert dup_item.status_code == 400


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
    person = post_json(
        "/people/people",
        {"name": "Person " + uuid4().hex, "email": f"v{uuid4().hex}@test.com"},
    ).json()
    role = post_json("/volunteers/volunteer-roles", {"name": "Role " + uuid4().hex}).json()
    invalid_shift = post_json(
        "/volunteers/shifts",
        {
            "event_id": 1,
            "role_id": role["id"],
            "inicio": "2024-01-01T10:00",
            "fin": "2024-01-01T09:00",
        },
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
    ).json()
    assignment = post_json(
        "/volunteers/shift-assignments",
        {"shift_id": shift["id"], "person_id": person["id"], "estado": "confirmado"},
    )
    assert assignment.status_code == 200
    dup_assignment = post_json(
        "/volunteers/shift-assignments",
        {"shift_id": shift["id"], "person_id": person["id"], "estado": "confirmado"},
    )
    assert dup_assignment.status_code == 400


def test_calendar_rules():
    facility = post_json("/calendar/facilities", {"name": "Hall " + uuid4().hex}).json()
    reservation = post_json(
        "/calendar/reservations",
        {"facility_id": facility["id"], "inicio": "2024-01-01T09:00", "fin": "2024-01-01T10:00"},
    )
    assert reservation.status_code == 200
    overlap = post_json(
        "/calendar/reservations",
        {"facility_id": facility["id"], "inicio": "2024-01-01T09:30", "fin": "2024-01-01T10:30"},
    )
    assert overlap.status_code == 400
