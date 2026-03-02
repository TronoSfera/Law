from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings, validate_production_security_or_raise
from app.core.http_hardening import install_http_hardening
from app.api.public.router import router as public_router
from app.api.admin.router import router as admin_router

app = FastAPI(title=settings.APP_NAME, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.cors_allow_methods_list,
    allow_headers=settings.cors_allow_headers_list,
)
install_http_hardening(app)

app.include_router(public_router, prefix="/api/public")
app.include_router(admin_router, prefix="/api/admin")


@app.on_event("startup")
def _validate_security_config_on_startup() -> None:
    validate_production_security_or_raise("backend")

@app.get("/", include_in_schema=False)
def landing():
    return JSONResponse({"service": settings.APP_NAME, "status": "ok"})

@app.get("/health")
def health():
    return {"status": "ok"}
