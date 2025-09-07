import os
import shutil
import tempfile
import re
from typing import List, Optional

from fastapi import FastAPI, Form, HTTPException, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from yt_dlp import YoutubeDL

# --- FastAPI App Initialization ---
app = FastAPI(title="Video Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, cámbialo a tu dominio específico
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class VideoFormat(BaseModel):
    format_id: str
    quality: str
    ext: str
    filesize: Optional[int] = None

class VideoInfoResponse(BaseModel):
    title: str
    formats: List[VideoFormat]

# --- Helper Function to Sanitize Filename ---
def sanitize_filename(name: str) -> str:
    """Remueve caracteres inválidos para nombres de archivo."""
    return re.sub(r'[\\/*?:"<>|]', "", name)

# --- API Endpoints ---
@app.post("/info", response_model=VideoInfoResponse)
async def get_video_info(url: str = Form(...)):
    """
    Obtiene la información y formatos de video disponibles de una URL.
    Usa un User-Agent para evitar bloqueos.
    """
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
        },
    }

    try:
        # Ejecuta la tarea bloqueante en un hilo separado
        with YoutubeDL(ydl_opts) as ydl:
            info = await run_in_threadpool(ydl.extract_info, url, download=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error de yt-dlp al obtener info: {str(e)}")

    video_formats = []
    for f in info.get("formats", []):
        # Asegurarnos de que sea un formato de video con video y audio
        if f.get("vcodec") != "none" and f.get("acodec") != "none":
            quality_label = f.get("format_note") or f.get("height")
            if isinstance(quality_label, int):
                quality_label = f"{quality_label}p"
            
            video_formats.append(
                VideoFormat(
                    format_id=f["format_id"],
                    quality=str(quality_label),
                    ext=f["ext"],
                    filesize=f.get("filesize"),
                )
            )
    
    if not video_formats:
        raise HTTPException(status_code=404, detail="No se encontraron formatos de video compatibles (video+audio).")

    sanitized_title = sanitize_filename(info.get("title", "video_sin_titulo"))
    return VideoInfoResponse(title=sanitized_title, formats=video_formats)


@app.post("/download")
async def download_video(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    format_id: str = Form(...),
):
    """
    Descarga un video en el formato especificado.
    """
    temp_dir = tempfile.mkdtemp()
    
    ydl_opts = {
        "quiet": True,
        "format": format_id,
        "outtmpl": os.path.join(temp_dir, "%(title)s.%(ext)s"),
        "no_warnings": True,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
        },
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            # Ejecuta la descarga en un hilo separado
            info = await run_in_threadpool(ydl.extract_info, url, download=True)
            original_filename = ydl.prepare_filename(info)
            sanitized_basename = sanitize_filename(os.path.basename(original_filename))

    except Exception as e:
        shutil.rmtree(temp_dir)
        raise HTTPException(status_code=500, detail=f"Error de yt-dlp al descargar: {str(e)}")

    # Tarea de limpieza para eliminar el directorio temporal después de enviar el archivo
    background_tasks.add_task(shutil.rmtree, temp_dir)

    return FileResponse(
        path=original_filename,
        media_type="application/octet-stream",
        filename=sanitized_basename,
    )