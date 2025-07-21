from azure.storage.blob import ContainerClient

import os, io, re
from typing import Dict, List
import pandas as pd 
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from azure.storage.blob import ContainerClient
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

# 📁 Local Download Directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
LOCAL_EXCEL = os.path.join(DOWNLOADS_DIR, "forecast_output.xlsx")

# ── FastAPI / Jinja / Static ───────────────────────────────────────────────────
app = FastAPI()
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
templates  = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "../static")), name="static")

# local cache for downloaded file
DOWNLOADS_DIR = os.path.join(BASE_DIR, "../downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)
LOCAL_EXCEL = os.path.join(DOWNLOADS_DIR, "forecast_output.xlsx")

# 🧠 Cached Data
_global_data = {}

def download_excel_if_needed():
    """Downloads the Excel file from Azure Blob Storage if not already present."""
    if os.path.exists(LOCAL_EXCEL):
        return
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    client = ContainerClient.from_container_url(DEST_CONTAINER_URL)
    blob = client.get_blob_client("forecast_output.xlsx")
    if not blob.exists():
        raise FileNotFoundError("forecast_output.xlsx not found in Azure Blob Storage.")
    with open(LOCAL_EXCEL, "wb") as f:
        f.write(blob.download_blob().readall())

def load_all_prediction_data():
    """Load and structure data from Excel."""
    global _global_data
    download_excel_if_needed()

    sheet_map = {
        "Final Predictions":    "year_data",
        "Quarterly Predictions":"quarter_data",
        "Monthly Predictions":  "monthly_data"
    }

    xl = pd.ExcelFile(LOCAL_EXCEL)
    result = {}

    for sheet_name, key in sheet_map.items():
        if sheet_name not in xl.sheet_names:
            raise ValueError(f"Sheet '{sheet_name}' not found in workbook.")

        df = xl.parse(sheet_name)
        df.columns = df.columns.str.strip().str.lower()

        if key == "year_data":
            result[key] = df[["employee responsible", "sales unit", "predicted item value"]].rename(
                columns={
                    "employee responsible": "employee",
                    "sales unit": "region",
                    "predicted item value": "predicted_value"
                }).to_dict(orient="records")

        elif key == "quarter_data":
            result[key] = df[["employee responsible", "sales unit", "fiscal quarter", "quarterly predicted sales"]].rename(
                columns={
                    "employee responsible": "employee",
                    "sales unit": "region",
                    "fiscal quarter": "quarter",
                    "quarterly predicted sales": "predicted_value"
                }).to_dict(orient="records")

        elif key == "monthly_data":
            result[key] = df[["employee responsible", "sales unit", "fiscal month", "monthly predicted sales"]].rename(
                columns={
                    "employee responsible": "employee",
                    "sales unit": "region",
                    "fiscal month": "month",
                    "monthly predicted sales": "predicted_value"
                }).to_dict(orient="records")

    _global_data = result
    return result
