from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app import security
from app.config import settings
from app.routers import proteins

docs = settings.enable_docs
app = FastAPI(
    title="Periodic Table of Proteins API",
    description="Proteins arranged by function family (columns) and cell location (rows).",
    version="1.0.0",
    docs_url="/docs" if docs else None,
    redoc_url="/redoc" if docs else None,
    openapi_url="/openapi.json" if docs else None,
)
security.install(app)
if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET"],
                       allow_headers=["Content-Type"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.include_router(proteins.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
