import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routes.auth import router as auth_router
from app.routes.board import router as board_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(auth_router, prefix="/api")
app.include_router(board_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


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
