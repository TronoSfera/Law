from fastapi import APIRouter, Depends
from app.core.deps import require_role

router = APIRouter()

@router.post("/init")
def upload_init(admin=Depends(require_role("ADMIN","LAWYER"))):
    return {"method": "PRESIGNED_PUT", "presigned_url": "https://s3.local/..."}

@router.post("/complete")
def upload_complete(admin=Depends(require_role("ADMIN","LAWYER"))):
    return {"status": "ok"}
