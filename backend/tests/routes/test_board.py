def test_get_board_without_auth(client):
    resp = client.get("/api/board")
    assert resp.status_code == 401


def test_get_board_after_login(client, auth_headers):
    resp = client.get("/api/board", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["columns"]) == 5
    assert len(data["cards"]) == 8


def test_patch_board_move_card(client, auth_headers):
    # Get current board
    board = client.get("/api/board", headers=auth_headers).json()

    # Move card-1 from col-backlog to col-progress
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    progress = next(c for c in board["columns"] if c["id"] == "col-progress")
    backlog["cardIds"].remove("card-1")
    progress["cardIds"].insert(0, "card-1")

    resp = client.patch("/api/board", json=board, headers=auth_headers)
    assert resp.status_code == 200
    updated = resp.json()

    updated_progress = next(c for c in updated["columns"] if c["id"] == "col-progress")
    assert "card-1" in updated_progress["cardIds"]
    updated_backlog = next(c for c in updated["columns"] if c["id"] == "col-backlog")
    assert "card-1" not in updated_backlog["cardIds"]


def test_get_board_reflects_patch(client, auth_headers):
    board = client.get("/api/board", headers=auth_headers).json()

    # Move card-2 to col-done
    backlog = next(c for c in board["columns"] if c["id"] == "col-backlog")
    done = next(c for c in board["columns"] if c["id"] == "col-done")
    backlog["cardIds"].remove("card-2")
    done["cardIds"].append("card-2")

    client.patch("/api/board", json=board, headers=auth_headers)

    # Fetch fresh
    refreshed = client.get("/api/board", headers=auth_headers).json()
    done_col = next(c for c in refreshed["columns"] if c["id"] == "col-done")
    assert "card-2" in done_col["cardIds"]
    backlog_col = next(c for c in refreshed["columns"] if c["id"] == "col-backlog")
    assert "card-2" not in backlog_col["cardIds"]


def test_patch_board_add_column(client, auth_headers):
    board = client.get("/api/board", headers=auth_headers).json()
    board["columns"].append({"id": "col-new", "title": "New Column", "cardIds": []})

    resp = client.patch("/api/board", json=board, headers=auth_headers)
    assert resp.status_code == 200
    updated = resp.json()
    assert any(c["id"] == "col-new" for c in updated["columns"])


def test_patch_board_delete_card(client, auth_headers):
    board = client.get("/api/board", headers=auth_headers).json()

    # Remove card-8 from col-done
    done = next(c for c in board["columns"] if c["id"] == "col-done")
    done["cardIds"].remove("card-8")
    del board["cards"]["card-8"]

    resp = client.patch("/api/board", json=board, headers=auth_headers)
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
    resp = client.patch("/api/board", json=board)
    assert resp.status_code == 401
