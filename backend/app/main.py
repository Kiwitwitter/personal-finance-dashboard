from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.database import engine
from app.mcp_server import mcp

settings = get_settings()

# FastMCP Streamable HTTP ASGI app handled directly at /mcp (and /mcp/)
mcp_asgi = mcp.http_app(
    path="/mcp",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_asgi.lifespan(app):
        yield
    await engine.dispose()


fastapi_app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fastapi_app.include_router(api_router)

# Serve compiled React SPA bundle when present (Docker production or local build)
static_dir: Path | None = settings.resolve_static_dir()
if static_dir is not None:
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        fastapi_app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @fastapi_app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path == "mcp" or full_path.startswith("mcp/") or full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = (static_dir / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(static_dir.resolve())):
            return FileResponse(str(candidate))
        return FileResponse(str(static_dir / "index.html"))


class RootASGIApp:
    """Routes /mcp (with or without trailing slash) directly to FastMCP Streamable HTTP without 307/405 interference."""

    def __init__(self, web_app: FastAPI, mcp_app) -> None:
        self.web_app = web_app
        self.mcp_app = mcp_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path: str = scope.get("path", "")
            if path == "/mcp" or path == "/mcp/" or path.startswith("/mcp/"):
                token = settings.mcp_bearer_token.strip()
                if token:
                    headers = {k.decode("latin1").lower(): v.decode("latin1") for k, v in scope.get("headers", [])}
                    if headers.get("authorization", "") != f"Bearer {token}":
                        resp = JSONResponse(status_code=401, content={"detail": "Unauthorized MCP token"})
                        await resp(scope, receive, send)
                        return
                rewritten = dict(scope)
                if path == "/mcp/":
                    rewritten["path"] = "/mcp"
                    rewritten["raw_path"] = b"/mcp"
                await self.mcp_app(rewritten, receive, send)
                return
        await self.web_app(scope, receive, send)


app = RootASGIApp(fastapi_app, mcp_asgi)
