import pandas as pd 
import os, io, re
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi import FastAPI, File, UploadFile, Request
from azure.storage.blob import ContainerClient
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from utils.blob_handler import load_all_prediction_data
from typing import Dict, List
from flask import Flask, send_from_directory
from flask import Flask, jsonify

# 🔧 Azure Storage Configuration
STORAGE_ACCOUNT = "aisalesforecasting"
DESTINATION_CONTAINER = "destination"
SOURCE_CONTAINER       = "source"

DESTINATION_SAS_TOKEN = "sp=racwdli&st=2025-06-06T12:34:24Z&se=2026-12-30T20:34:24Z&spr=https&sv=2024-11-04&sr=c&sig=cWQ1XU6RXOt98tTFh%2FdJv%2FYrhn5X5E5xZor51qyvYmo%3D"  # Replace with actual SAS token
SOURCE_SAS_TOKEN      = "sp=racwdli&st=2025-06-06T10:38:13Z&se=2026-12-30T18:38:13Z&spr=https&sv=2024-11-04&sr=c&sig=AHz787KbbasxzwA01FaQTCN6%2BYWX8rcEcDgM8WXmP4w%3D"

# 📦 Construct Blob URL
DEST_CONTAINER_URL = f"https://{STORAGE_ACCOUNT}.blob.core.windows.net/{DESTINATION_CONTAINER}?{DESTINATION_SAS_TOKEN}"
SOURCE_CONTAINER_URL = f"https://{STORAGE_ACCOUNT}.blob.core.windows.net/{SOURCE_CONTAINER}?{SOURCE_SAS_TOKEN}"

app = FastAPI()
@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI on Azure!"}


BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
templates  = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

# 📂 Mount static and templates folders
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# 🔄 Global prediction data cache
data_cache = {}

# 🏠 Route: Dashboard UI
@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/home", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})

# 📊 Route: Dashboard JSON API
@app.get("/api/dashboard-data", response_class=JSONResponse)
async def get_dashboard_data():
    global data_cache
    if not data_cache:
        try:
            data_cache = load_all_prediction_data()
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": str(e)})
    return data_cache

# 🧹 Optional: Clear cache endpoint for refresh
@app.get("/api/refresh")
async def refresh_cache():
    global data_cache
    data_cache = {}
    return {"status": "cache refreshed"}

@app.post("/forecast")
async def upload_file_to_blob(file: UploadFile = File(...)):
    contents = await file.read()
    client = ContainerClient.from_container_url(SOURCE_CONTAINER_URL)
    client.get_blob_client(file.filename).upload_blob(contents, overwrite=True)
    return {"message": f"Uploaded '{file.filename}' successfully!"}

@app.get("/download")
async def download_forecast_file():
    _ensure_excel_on_disk()
    with open(LOCAL_EXCEL, "rb") as f:
        content = f.read()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=forecast_output.xlsx",
            "Content-Length": str(len(content)),
        },
    )
    
# ── Helper functions ──────────────────────────────────────────────────────────
def _ensure_excel_on_disk() -> None:
    """Download the forecast_output.xlsx from blob once, cache locally."""
    if os.path.exists(LOCAL_EXCEL):
        return
    client = ContainerClient.from_container_url(DEST_CONTAINER_URL)
    blob   = client.get_blob_client("forecast_output.xlsx")
    if not blob.exists():
        raise FileNotFoundError("forecast_output.xlsx not found in destination container")
    with open(LOCAL_EXCEL, "wb") as f:
        f.write(blob.download_blob().readall())
        
# local cache for downloaded file
DOWNLOADS_DIR = os.path.join(BASE_DIR, "../downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
LOCAL_EXCEL = os.path.join(DOWNLOADS_DIR, "forecast_output.xlsx")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)

