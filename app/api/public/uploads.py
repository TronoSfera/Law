from fastapi import APIRouter
router = APIRouter()

@router.post("/init")
def upload_init():
    return {"method": "PRESIGNED_PUT", "presigned_url": "https://s3.local/..."}

@router.post("/complete")
def upload_complete():
    return {"status": "ok"}
