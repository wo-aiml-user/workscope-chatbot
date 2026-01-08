
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
from logging.handlers import RotatingFileHandler
import os
from dotenv import load_dotenv
from src.graph import graph, END
from utils.helper import (
    upload_file_to_gemini,
    gemini_client,
    get_session,
    update_session,
    get_stage_content,
    async_time_logger,
    LLM
)

# Create logs directory if it doesn't exist
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# Configure logging with file handler
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(filename)s:%(lineno)d | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),  # Console output
        RotatingFileHandler(
            os.path.join(LOG_DIR, "app.log"),
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding="utf-8"
        )
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Work Scope Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

class SimplifiedSessionResponse(BaseModel):
    content: str
    current_stage: str
    follow_up_question: str | None = None

class UserInputRequest(BaseModel):
    user_input: str


class InitialInputRequest(BaseModel):
    initial_input: str
    developer_profile: str = ""   # e.g., "Senior Developer, 5 years experience"


class UpdateProfileRequest(BaseModel):
    developer_profile: str


@app.post("/sessions/{session_id}/developer-profile")
async def update_developer_profile(session_id: str, request: UpdateProfileRequest):
    session = get_session(session_id)
    config = {"configurable": {"thread_id": session["thread_id"]}}
    try:
        graph.update_state(config, {"developer_profile": request.developer_profile})
        return {"status": "success", "message": "Developer profile updated successfully."}
    except Exception as e:
        logger.error(f"Failed to update developer profile for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/sessions/{session_id}/upload", response_model=SimplifiedSessionResponse)
@async_time_logger
async def upload_file(
    session_id: str, 
    file: UploadFile = File(...),
    developer_profile: str = Form("")
):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    session = get_session(session_id)
    if session.get("workflow_active"):
        raise HTTPException(
            status_code=409,
            detail=f"Session with ID '{session_id}' already has an active workflow."
        )

    try:
        file_bytes = await file.read()
        # Upload file to Gemini and get the file object directly
        gemini_file_name = upload_file_to_gemini(file_bytes, file.filename)
        gemini_file = gemini_client.files.get(name=gemini_file_name)

        initial_state = {
            "gemini_file": gemini_file,  # Pass file directly for first overview call
            "file_content": "",  # No longer parsing to text
            "LLM": LLM,
            "developer_profile": developer_profile
        }
        config = {"configurable": {"thread_id": session["thread_id"]}}

        graph.invoke(initial_state, config=config)
        result_state = graph.get_state(config=config)

        current_stage = result_state.values.get("current_stage", "overview")
        response_data = get_stage_content(result_state.values, current_stage)

        session_updates = {
            "workflow_active": True,
            "current_state": result_state,
        }
        update_session(session_id, session_updates)

        return SimplifiedSessionResponse(
            content=response_data["content"],
            current_stage=current_stage,
            follow_up_question=response_data["follow_up_question"]
        )
    except Exception as e:
        logger.error(f"PDF processing failed for session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@app.post("/sessions/{session_id}/initial-input", response_model=SimplifiedSessionResponse)
@async_time_logger
async def process_initial_input(session_id: str, request: InitialInputRequest):
    session = get_session(session_id)
    if session.get("workflow_active"):
        raise HTTPException(
            status_code=409,
            detail=f"Session with ID '{session_id}' already has an active workflow."
        )

    try:
        file_content = request.initial_input.strip()
        if not file_content:
            raise HTTPException(status_code=400, detail="Input cannot be empty.")

        initial_state = {
            "file_content": file_content, 
            "LLM": LLM,
            "developer_profile": request.developer_profile
        }
        config = {"configurable": {"thread_id": session["thread_id"]}}

        graph.invoke(initial_state, config=config)
        result_state = graph.get_state(config=config)

        current_stage = result_state.values.get("current_stage", "overview")
        response_data = get_stage_content(result_state.values, current_stage)

        session_updates = {
            "workflow_active": True,
            "current_state": result_state,
        }
        update_session(session_id, session_updates)

        return SimplifiedSessionResponse(
            content=response_data["content"],
            current_stage=current_stage,
            follow_up_question=response_data["follow_up_question"],
        )
    except Exception as e:
        logger.error(f"Initial input processing failed for session {session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing initial input: {str(e)}")


@app.post("/sessions/{session_id}/input", response_model=SimplifiedSessionResponse)
@async_time_logger
async def process_user_input(session_id: str, request: UserInputRequest):
    session = get_session(session_id)
    if not session.get("workflow_active"):
        raise HTTPException(status_code=400, detail="No active workflow for this session")

    user_input = request.user_input.strip()
    if user_input.lower() == "reset":
        raise HTTPException(status_code=501, detail="Reset functionality not implemented.")

    config = {"configurable": {"thread_id": session["thread_id"]}}

    try:
        final_run_state = graph.invoke({"user_input": user_input, "LLM": LLM}, config=config)
        workflow_completed = END in final_run_state
        result_state = graph.get_state(config=config)

        current_stage = result_state.values.get("current_stage", "scope_of_work" if workflow_completed else "overview")
        response_data = get_stage_content(result_state.values, current_stage)

        session_updates = {
            "current_state": result_state,
            "workflow_completed": workflow_completed
        }
        update_session(session_id, session_updates)

        return SimplifiedSessionResponse(
            content=response_data["content"],
            current_stage=current_stage,
            follow_up_question=response_data["follow_up_question"],
        )
    except Exception as e:
        logger.exception(f"Error processing input for session {session_id}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)