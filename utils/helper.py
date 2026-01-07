
from langchain_community.document_loaders.blob_loaders import Blob
from typing import List, Dict, Any
import os
import tempfile
from dotenv import load_dotenv
from typing import List
from llama_index.core import Document as LlamaDocument
from llama_parse import LlamaParse
from threading import Lock
import uuid
import time
from functools import wraps
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
#from langchain_deepseek import ChatDeepSeek

logger = logging.getLogger(__name__)

load_dotenv()
ai_api_key = os.getenv("DEEPSEEK_API_KEY")


sessions: Dict[str, Dict[str, Any]] = {}
session_lock = Lock()

LLM = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    # api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.4
)
"""LLM = ChatDeepSeek(
        model="deepseek-chat",
        api_key=ai_api_key,
        temperature=0.6,
    )"""
def time_logger(func):
    """A decorator that logs the execution time of a synchronous function."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        func_name = func.__name__
        logger.info(f"ENTERING: {func_name}")
        
        result = func(*args, **kwargs)
        
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"EXITING: {func_name} | DURATION: {duration:.4f} seconds")
        return result
    return wrapper


def async_time_logger(func):
    """A decorator that logs the execution time of an asynchronous function."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.time()
        func_name = func.__name__
        logger.info(f"ENTERING ASYNC: {func_name}")

        result = await func(*args, **kwargs)
        
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"EXITING ASYNC: {func_name} | DURATION: {duration:.4f} seconds")
        return result
    return wrapper


def parse_file(file_bytes: bytes, filename: str) -> str:
    api_key = os.getenv("PARSE_KEY")
    if not api_key:
        raise EnvironmentError("PARSE_KEY not found")
    
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        parser = LlamaParse(api_key=api_key, result_type="text")
        documents: List[LlamaDocument] = parser.load_data([tmp_path])
        
        return "\n\n".join(doc.text for doc in documents)
    
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
        "initial_summary": "initial_summary",
        "overview": "overview",
        "features": "extracted_features",
        "tech_stack": "tech_stack",
        "scope_of_work": "scope_of_work",
        "final_review": "final_adjustment_response" 
    }
    
    content_key = stage_content_map.get(current_stage, "initial_summary")
    main_content = state_values.get(content_key, f"Error: No content generated for stage {current_stage}")
    follow_up = state_values.get("follow_up_questions", "")
    
    logger.info(f"Retrieved content for '{current_stage}' from key '{content_key}'.")
    logger.info(f"Retrieved follow-up questions for {current_stage}: '{follow_up}'")

    return {
        "content": main_content,
        "follow_up_question": follow_up if follow_up and follow_up.strip() else None
    }