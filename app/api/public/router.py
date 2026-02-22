from fastapi import APIRouter
from app.api.public import requests, otp, quotes, uploads

router = APIRouter()
router.include_router(requests.router, prefix="/requests", tags=["Public"])
router.include_router(otp.router, prefix="/otp", tags=["Public"])
router.include_router(quotes.router, prefix="/quotes", tags=["Public"])
router.include_router(uploads.router, prefix="/uploads", tags=["PublicFiles"])
