
from typing import List, Dict, Any
import os
import tempfile
from dotenv import load_dotenv
from threading import Lock
import uuid
import time
from functools import wraps
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from google import genai

logger = logging.getLogger(__name__)


def async_time_logger(func):
    """Async decorator for logging function execution time."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.time()
        result = await func(*args, **kwargs)
        elapsed = time.time() - start_time
        logger.info(f"{func.__name__} executed in {elapsed:.3f}s")
        return result
    return wrapper

load_dotenv()

# Initialize Gemini client for file uploads
gemini_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

sessions: Dict[str, Dict[str, Any]] = {}
session_lock = Lock()

LLM = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.4
)


def upload_file_to_gemini(file_bytes: bytes, filename: str) -> str:
    """
    Upload a file to Gemini's File API and return the file URI.
    The file can then be used directly in prompts.
    """
    tmp_path = None
    try:
        # Save to temp file for upload
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        # Upload to Gemini
        uploaded_file = gemini_client.files.upload(file=tmp_path)
        logger.info(f"File uploaded to Gemini: {uploaded_file.name}")
        
        return uploaded_file.name  # Return the file reference name
    
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)



def get_session(session_id: str) -> Dict[str, Any]:
    """Get or create a session"""
    with session_lock:
        if session_id not in sessions:
            sessions[session_id] = {
                "thread_id": str(uuid.uuid4()),
                "workflow_active": False,
                "workflow_completed": False,
                "current_state": None
            }
        return sessions[session_id]


def update_session(session_id: str, updates: Dict[str, Any]):
    """Update session data"""
    with session_lock:
        if session_id in sessions:
            sessions[session_id].update(updates)


def get_stage_content(state_values: Dict[str, Any], current_stage: str) -> Dict[str, Any]:
    """Extract content and follow-up questions separately."""
    stage_content_map = {
        "overview": "overview",
        "features": "extracted_features",
        "tech_stack": "tech_stack",
        "scope_of_work": "scope_of_work"
    }
    
    content_key = stage_content_map.get(current_stage, "overview")
    main_content = state_values.get(content_key, f"Error: No content generated for stage {current_stage}")
    follow_up = state_values.get("follow_up_questions", "")
    
    logger.info(f"Retrieved content for '{current_stage}' from key '{content_key}'.")
    logger.info(f"Retrieved follow-up questions for {current_stage}: '{follow_up}'")

    return {
        "content": main_content,
        "follow_up_question": follow_up if follow_up and follow_up.strip() else None
    }