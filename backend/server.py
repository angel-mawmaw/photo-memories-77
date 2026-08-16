from fastapi import FastAPI, APIRouter, HTTPException, Response, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import base64
import secrets
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone
import requests
import qrcode

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ------------ Object Storage ------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "photobooth")
_storage_key = None


def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code in (403, 404):
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code in (403, 404):
        # try once with fresh key
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "image/jpeg")


# ------------ App ------------
app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ------------ Models ------------
class SessionCreate(BaseModel):
    layout: str = "strip4"


class PhotoPayload(BaseModel):
    data_url: str  # base64 image data URL
    photo_type: Literal["capture", "final"] = "capture"


class FinalizeRequest(BaseModel):
    layout: str
    event_name: Optional[str] = ""
    section_name: Optional[str] = ""
    caption: Optional[str] = ""
    photos: List[PhotoPayload]  # individual captures + final
    base_url: str  # e.g. https://xxx.preview.emergentagent.com


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def decode_data_url(data_url: str):
    """Parse 'data:image/png;base64,xxx' -> (bytes, content_type)"""
    if "," not in data_url:
        raise ValueError("Invalid data URL")
    header, b64 = data_url.split(",", 1)
    ctype = "image/png"
    if header.startswith("data:") and ";" in header:
        ctype = header[5:].split(";")[0] or "image/png"
    return base64.b64decode(b64), ctype


# ------------ Startup ------------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    # Unique index on gallery token
    try:
        await db.galleries.create_index("secure_token", unique=True)
        await db.galleries.create_index("session_id", unique=True)
        await db.sessions.create_index("id", unique=True)
    except Exception as e:
        logger.warning(f"Index create warning: {e}")


# ------------ Routes ------------
@api_router.get("/")
async def root():
    return {"message": "Photobooth API", "status": "ok"}


@api_router.post("/sessions")
async def create_session(payload: SessionCreate):
    session_id = str(uuid.uuid4())
    doc = {
        "id": session_id,
        "status": "active",
        "layout": payload.layout,
        "delivery_type": None,
        "gallery_id": None,
        "created_at": now_iso(),
        "finalized_at": None,
    }
    await db.sessions.insert_one(doc)
    return {"session_id": session_id}


@api_router.post("/sessions/{session_id}/finalize")
async def finalize_session(session_id: str, payload: FinalizeRequest):
    """Idempotent finalize. If session already has a gallery, returns it."""
    # Ensure session exists (create if missing so client can be resilient)
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        await db.sessions.insert_one({
            "id": session_id,
            "status": "active",
            "layout": payload.layout,
            "delivery_type": "soft",
            "gallery_id": None,
            "created_at": now_iso(),
            "finalized_at": None,
        })

    # Idempotency: if already finalized, return existing gallery
    existing = await db.galleries.find_one({"session_id": session_id}, {"_id": 0})
    if existing:
        return _build_gallery_response(existing, payload.base_url)

    # Create gallery with secure token
    token = secrets.token_hex(20)  # 40-char secure token
    gallery_id = str(uuid.uuid4())

    # Upload all photos
    photo_docs = []
    for idx, p in enumerate(payload.photos):
        try:
            data, ctype = decode_data_url(p.data_url)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid photo #{idx}")
        ext = "png" if "png" in ctype else "jpg"
        path = f"{APP_NAME}/galleries/{token}/{p.photo_type}-{idx}-{uuid.uuid4().hex[:8]}.{ext}"
        try:
            result = put_object(path, data, ctype)
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to save photo")
        photo_docs.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "storage_path": result["path"],
            "content_type": ctype,
            "photo_type": p.photo_type,
            "order": idx,
            "size": result.get("size", 0),
            "created_at": now_iso(),
        })

    final_photo = next((p for p in photo_docs if p["photo_type"] == "final"), None)

    gallery_doc = {
        "id": gallery_id,
        "session_id": session_id,
        "secure_token": token,
        "event_name": (payload.event_name or "").strip() or "School Event",
        "section_name": (payload.section_name or "").strip(),
        "caption": (payload.caption or "").strip(),
        "layout": payload.layout,
        "final_storage_path": final_photo["storage_path"] if final_photo else None,
        "created_at": now_iso(),
    }

    try:
        await db.galleries.insert_one(gallery_doc)
    except Exception:
        # Race: another request finalized first
        existing = await db.galleries.find_one({"session_id": session_id}, {"_id": 0})
        if existing:
            return _build_gallery_response(existing, payload.base_url)
        raise

    if photo_docs:
        await db.photos.insert_many(photo_docs)

    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "finalized",
            "delivery_type": "soft",
            "gallery_id": gallery_id,
            "finalized_at": now_iso(),
        }},
    )

    return _build_gallery_response(gallery_doc, payload.base_url)


def _build_gallery_response(gallery: dict, base_url: str) -> dict:
    token = gallery["secure_token"]
    base = (base_url or "").rstrip("/")
    gallery_url = f"{base}/gallery/{token}"
    # Generate QR code
    qr = qrcode.QRCode(box_size=10, border=2)
    qr.add_data(gallery_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#73112f", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return {
        "token": token,
        "gallery_url": gallery_url,
        "qr_data_url": f"data:image/png;base64,{qr_b64}",
        "event_name": gallery.get("event_name"),
        "section_name": gallery.get("section_name"),
    }


@api_router.get("/gallery/{token}")
async def get_gallery(token: str):
    gallery = await db.galleries.find_one({"secure_token": token}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    photos = await db.photos.find({"gallery_id": gallery["id"]}, {"_id": 0}).to_list(200)
    photos.sort(key=lambda p: (0 if p["photo_type"] == "final" else 1, p["order"]))
    return {
        "token": token,
        "event_name": gallery.get("event_name"),
        "section_name": gallery.get("section_name"),
        "caption": gallery.get("caption"),
        "layout": gallery.get("layout"),
        "created_at": gallery.get("created_at"),
        "photos": [
            {
                "id": p["id"],
                "type": p["photo_type"],
                "order": p["order"],
                "url": f"/api/gallery/{token}/photo/{p['id']}",
            }
            for p in photos
        ],
    }


@api_router.get("/gallery/{token}/photo/{photo_id}")
async def get_gallery_photo(token: str, photo_id: str):
    gallery = await db.galleries.find_one({"secure_token": token}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    photo = await db.photos.find_one({"id": photo_id, "gallery_id": gallery["id"]}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        data, ctype = get_object(photo["storage_path"])
    except Exception as e:
        logger.error(f"Fetch photo failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to load photo")
    return Response(content=data, media_type=photo.get("content_type") or ctype, headers={
        "Cache-Control": "public, max-age=3600",
    })


@api_router.get("/gallery/{token}/qr")
async def get_gallery_qr(token: str, request: Request):
    gallery = await db.galleries.find_one({"secure_token": token}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    # Use referer or origin to build URL
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if origin:
        # trim to origin only
        from urllib.parse import urlparse
        p = urlparse(origin)
        base = f"{p.scheme}://{p.netloc}"
    else:
        base = str(request.base_url).rstrip("/")
    return _build_gallery_response(gallery, base)


# ------------ Include & CORS ------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


