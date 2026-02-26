BOARD_ID = "board-1"


def test_valid_login(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["username"] == "user"
    assert "user_id" in data


def test_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "wrong"})
    assert resp.status_code == 401


def test_wrong_username(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "password"})
    assert resp.status_code == 401


def test_no_auth_header(client):
    resp = client.get(f"/api/boards/{BOARD_ID}")
    assert resp.status_code == 401


def test_invalid_token(client):
    resp = client.get(f"/api/boards/{BOARD_ID}", headers={"Authorization": "Bearer invalid-token"})
    assert resp.status_code == 401


def test_malformed_auth_header(client):
    resp = client.get(f"/api/boards/{BOARD_ID}", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401


def test_valid_token_accesses_protected_route(client, auth_headers):
    resp = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers)
    assert resp.status_code == 200


def test_logout(client, auth_headers):
    resp = client.post("/api/auth/logout", headers=auth_headers)
    assert resp.status_code == 204

    # Token is now invalid
    resp = client.get(f"/api/boards/{BOARD_ID}", headers=auth_headers)
    assert resp.status_code == 401


def test_logout_requires_auth(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 401
