import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(client):
    resp = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}
