BOARD_ID = "board-1"


def _board_payload(client, auth_headers):
    return client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers).json()


def test_chat_without_auth(client, auth_headers):
    board = _board_payload(client, auth_headers)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "board": board, "board_id": BOARD_ID},
    )
    assert resp.status_code == 401


def test_chat_no_board_update(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routes.chat.call_ai",
        lambda board, messages: {"message": "Done", "board_update": None},
    )
    board = _board_payload(client, auth_headers)
    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "board": board, "board_id": BOARD_ID},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Done"
    assert data["board_update"] is None


def test_chat_with_board_update(client, auth_headers, monkeypatch):
    board = _board_payload(client, auth_headers)

    # Build an updated board: move card-1 from backlog to progress
    updated = {
        "columns": [
            {**col, "cardIds": [c for c in col["cardIds"] if c != "card-1"]}
            if col["id"] == "col-backlog"
            else {**col, "cardIds": ["card-1"] + col["cardIds"]}
            if col["id"] == "col-progress"
            else col
            for col in board["columns"]
        ],
        "cards": board["cards"],
    }

    monkeypatch.setattr(
        "app.routes.chat.call_ai",
        lambda b, m: {"message": "Moved card-1", "board_update": updated},
    )

    resp = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "move card-1"}], "board": board, "board_id": BOARD_ID},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message"] == "Moved card-1"
    assert data["board_update"] is not None

    # Verify persistence
    refreshed = _board_payload(client, auth_headers)
    progress = next(c for c in refreshed["columns"] if c["id"] == "col-progress")
    assert "card-1" in progress["cardIds"]
    backlog = next(c for c in refreshed["columns"] if c["id"] == "col-backlog")
    assert "card-1" not in backlog["cardIds"]


def test_chat_malformed_messages(client, auth_headers):
    resp = client.post(
        "/api/chat",
        json={"messages": "not-a-list", "board": {}, "board_id": BOARD_ID},
        headers=auth_headers,
    )
    assert resp.status_code == 422
