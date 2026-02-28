from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin.chat import router as admin_chat_router
from app.api.public.chat import router as public_chat_router
from app.core.config import settings
from app.core.http_hardening import install_http_hardening

app = FastAPI(title=f"{settings.APP_NAME}-chat", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_http_hardening(app)

app.include_router(public_chat_router, prefix="/api/public/chat")
app.include_router(admin_chat_router, prefix="/api/admin/chat")


@app.get("/", include_in_schema=False)
def landing():
    return JSONResponse({"service": f"{settings.APP_NAME}-chat", "status": "ok"})


@app.get("/health")
def health():
    return {"status": "ok"}
