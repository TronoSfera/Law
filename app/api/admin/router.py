from fastapi import APIRouter
from app.api.admin import auth, requests, quotes, meta, config, uploads, metrics, crud, notifications, invoices, chat

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["AdminAuth"])
router.include_router(requests.router, prefix="/requests", tags=["AdminRequests"])
router.include_router(quotes.router, prefix="/quotes", tags=["AdminQuotes"])
router.include_router(meta.router, prefix="/meta", tags=["AdminMeta"])
router.include_router(config.router, prefix="/config", tags=["AdminConfig"])
router.include_router(uploads.router, prefix="/uploads", tags=["AdminFiles"])
router.include_router(metrics.router, prefix="/metrics", tags=["AdminMetrics"])
router.include_router(notifications.router, prefix="/notifications", tags=["AdminNotifications"])
router.include_router(invoices.router, prefix="/invoices", tags=["AdminInvoices"])
router.include_router(chat.router, prefix="/chat", tags=["AdminChat"])
router.include_router(crud.router, prefix="/crud", tags=["AdminCrud"])
