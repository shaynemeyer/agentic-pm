BOARD_ID = "board-1"


def test_get_board_without_auth(client):
    resp = client.get(f"/api/boards/{BOARD_ID}")
    assert resp.status_code == 401


def test_get_board_after_login(client, auth_headers):
    resp = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["columns"]) == 5
    assert len(data["cards"]) == 8


def test_patch_board_move_card(client, auth_headers):
    # Get current board
    board = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()

    # Move card-1 from col-backlog to col-progress
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    progress = next(c for c in board["columns"] if c["id"] == "col-progress")
    backlog["cardIds"].remove("card-1")
    progress["cardIds"].insert(0, "card-1")

    resp = client.patch(f"/api/boards/{BOARD_ID}", json=board, headers=auth_headers)
    assert resp.status_code == 200
    updated = resp.json()

    updated_progress = next(c for c in updated["columns"] if c["id"] == "col-progress")
    assert "card-1" in updated_progress["cardIds"]
    updated_backlog = next(c for c in updated["columns"] if c["id"] == "col-backlog")
    assert "card-1" not in updated_backlog["cardIds"]


def test_get_board_reflects_patch(client, auth_headers):
    board = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()

    # Move card-2 to col-done
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    done = next(c for c in board["columns"] if c["id"] == "col-done")
    backlog["cardIds"].remove("card-2")
    done["cardIds"].append("card-2")

    client.patch(f"/api/boards/{BOARD_ID}", json=board, headers=auth_headers)

    # Fetch fresh
    refreshed = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()
    done_col = next(c for c in refreshed["columns"] if c["id"] == "col-done")
    assert "card-2" in done_col["cardIds"]
    backlog_col = next(c for c in refreshed["columns"] if c["id"] == "col-backlog")
    assert "card-2" not in backlog_col["cardIds"]


def test_patch_board_add_column(client, auth_headers):
    board = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()
    board["columns"].append({"id": "col-new", "title": "New Column", "cardIds": []})

    resp = client.patch(f"/api/boards/{BOARD_ID}", json=board, headers=auth_headers)
    assert resp.status_code == 200
    updated = resp.json()
    assert any(c["id"] == "col-new" for c in updated["columns"])


def test_patch_board_delete_card(client, auth_headers):
    board = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()

    # Remove card-8 from col-done
    done = next(c for c in board["columns"] if c["id"] == "col-done")
    done["cardIds"].remove("card-8")
    del board["cards"]["card-8"]

    resp = client.patch(f"/api/boards/{BOARD_ID}", json=board, headers=auth_headers)
    assert resp.status_code == 200
    updated = resp.json()
    assert "card-8" not in updated["cards"]
    done_col = next(c for c in updated["columns"] if c["id"] == "col-done")
    assert "card-8" not in done_col["cardIds"]


def test_patch_board_without_auth(client):
    board = {
        "columns": [],
        "cards": {},
    }
    resp = client.patch(f"/api/boards/{BOARD_ID}", json=board)
    assert resp.status_code == 401


def test_list_boards(client, auth_headers):
    resp = client.get("/api/boards", headers=auth_headers)
    assert resp.status_code == 200
    boards = resp.json()
    assert len(boards) >= 1
    assert any(b["id"] == BOARD_ID for b in boards)


def test_create_board(client, auth_headers):
    resp = client.post("/api/boards", json={"title": "Test Board"}, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test Board"
    assert "id" in data

    # New board should have 5 default columns
    board_data = client.get(f"/api/boards/{data['id']}", headers=auth_headers).json()
    assert len(board_data["columns"]) == 5
    assert board_data["columns"][0]["title"] == "Backlog"
    assert board_data["columns"][4]["title"] == "Done"


def test_delete_board_as_owner(client, auth_headers):
    # Create a new board first
    create_resp = client.post("/api/boards", json={"title": "To Delete"}, headers=auth_headers)
    new_id = create_resp.json()["id"]

    resp = client.delete(f"/api/boards/{new_id}", headers=auth_headers)
    assert resp.status_code == 204


def test_delete_board_as_non_owner(client):
    # Login as alice
    alice_resp = client.post("/api/auth/login", json={"username": "alice", "password": "password"})
    alice_headers = {"Authorization": f"Bearer {alice_resp.json()['token']}"}

    resp = client.delete(f"/api/boards/{BOARD_ID}", headers=alice_headers)
    assert resp.status_code == 403


def test_get_members(client, auth_headers):
    resp = client.get(f"/api/boards/{BOARD_ID}/members", headers=auth_headers)
    assert resp.status_code == 200
    members = resp.json()
    usernames = [m["username"] for m in members]
    assert "user" in usernames
    assert "alice" in usernames
    assert "bob" in usernames


def test_invite_member(client, auth_headers):
    # Create a new board
    board_resp = client.post("/api/boards", json={"title": "Invite Test"}, headers=auth_headers)
    board_id = board_resp.json()["id"]

    resp = client.post(
        f"/api/boards/{board_id}/members",
        json={"username": "alice"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["username"] == "alice"


def test_invite_nonexistent_user(client, auth_headers):
    resp = client.post(
        f"/api/boards/{BOARD_ID}/members",
        json={"username": "nobody"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


def test_non_owner_cannot_invite(client):
    alice_resp = client.post("/api/auth/login", json={"username": "alice", "password": "password"})
    alice_headers = {"Authorization": f"Bearer {alice_resp.json()['token']}"}

    resp = client.post(
        f"/api/boards/{BOARD_ID}/members",
        json={"username": "bob"},
        headers=alice_headers,
    )
    assert resp.status_code == 403
