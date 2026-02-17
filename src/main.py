
from fastapi import FastAPI, Form, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import uvicorn
import logging
import os
from dotenv import load_dotenv
from logging.handlers import RotatingFileHandler
from src.client import (
    generate_chat_response, 
    upload_file_to_gemini
)
import json
# Setup Logging
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(filename)s:%(lineno)d | %(message)s",
    handlers=[
        logging.StreamHandler(),
        RotatingFileHandler(os.path.join(LOG_DIR, "app.log"), maxBytes=10*1024*1024, backupCount=5)
    ]
)
logger = logging.getLogger(__name__)

# Load Env
load_dotenv()

# Setup App
app = FastAPI(title="Work Scope Generator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
async def chat_endpoint(
    session_id: str = Form(...),
    user_input: str = Form(""),
    developer_profile: str = Form(""),
    history: str = Form("[]"),
    file: Optional[UploadFile] = File(None)
):
    """
    Unified chat endpoint.
    Handles text, optional file upload, and profile updates.
    Now Stateless: Accepts history from the frontend.
    """
    try:
        # 1. Parse History
        try:
            chat_history = json.loads(history)
            if not isinstance(chat_history, list):
                chat_history = []
        except json.JSONDecodeError:
            chat_history = []

        # 2. Handle File Upload
        file_uri = None
        if file:
            if not file.filename.lower().endswith('.pdf'):
                raise HTTPException(status_code=400, detail="Only PDF files are supported.")
            
            content = await file.read()
            file_uri = upload_file_to_gemini(content)
            logger.info(f"Session {session_id}: File uploaded {file_uri}")

        # 3. Generate Response
        # If user uploads a file but no text, we assume they want an analysis.
        message = user_input.strip()
        if not message and not file_uri:
            raise HTTPException(status_code=400, detail="No input provided (text or file).")

        response_data = generate_chat_response(
            session_id=session_id, 
            user_message=message, 
            history=chat_history, 
            developer_profile=developer_profile, 
            file_uri=file_uri
        )
        
        return response_data

    except Exception as e:
        logger.error(f"Chat Error Session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
