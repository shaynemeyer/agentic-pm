import os
from fastapi import Depends, FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.auth.permissions import require_auth
from app.routes.auth import router as auth_router

app = FastAPI()

app.include_router(auth_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/me")
async def me(_: str = Depends(require_auth)):
    return {"username": "user"}


FRONTEND_OUT = os.path.join(os.path.dirname(__file__), "../../frontend/out")

if os.path.isdir(FRONTEND_OUT):
    app.mount("/", StaticFiles(directory=FRONTEND_OUT, html=True), name="static")
else:
    @app.get("/", response_class=HTMLResponse)
    async def hello_world():
        return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>agentic-pm</title>
</head>
<body>
  <h1>Hello World</h1>
  <p id="status">Checking API...</p>
  <script>
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        document.getElementById('status').textContent =
          'API health: ' + JSON.stringify(data);
      })
      .catch(err => {
        document.getElementById('status').textContent = 'API error: ' + err;
      });
  </script>
</body>
</html>"""
