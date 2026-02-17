import os
import tempfile
import logging
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from google import genai
from google.genai import types
from src.prompts import work_scope_prompt
import re
load_dotenv()

# Initialize Logger
logger = logging.getLogger(__name__)

# Initialize Gemini client
gemini_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

def generate_chat_response(session_id: str, user_message: str, history: List[Dict[str, Any]], developer_profile: str = "", file_uri: Optional[str] = None) -> Dict[str, Any]:
    """
    Core function to generate response using Gemini.
    - Uses provided history (stateless).
    - Sends full history + system prompt to Gemini.
    - Returns model response.
    """
    
    # 1. Prepare User Content
    user_parts = []
    if file_uri:
        try:
            # Retrieve file to get mime_type (and verify existence)
            file_obj = gemini_client.files.get(name=file_uri)
            
            # Create a Part from the URI
            file_part = types.Part.from_uri(  
                file_uri=file_obj.uri,
                mime_type=file_obj.mime_type
            )
            
            user_parts.append(file_part)
            user_parts.append(types.Part.from_text(text="\n\n[System Note: User uploaded a file. Analyze it.]"))
        except Exception as e:
             logger.error(f"Failed to retrieve file from Gemini: {e}")
             raise e

    if user_message:
        user_parts.append(types.Part.from_text(text=user_message))

    if not user_parts:
        return {"content": "Empty request.", "current_stage": "general_chat", "follow_up_question": None}

    # 2. Append to History
    
    # Construct API Contents
    api_contents = []
    
    # Add persistent history from request
    for turn in history:
        role = turn.get("role")
        if role == "assistant":
            role = "model"
            
        parts = []
        if "parts" in turn:
            parts = turn["parts"]
        elif "content" in turn:
            parts = [types.Part.from_text(text=turn["content"])]
            
        api_contents.append(types.Content(
            role=role,
            parts=parts
        ))
    
    # Add current turn
    current_content = types.Content(
        role="user",
        parts=user_parts
    )
    api_contents.append(current_content)

    # 3. Prepare System Instruction
    system_instruction = work_scope_prompt
    if developer_profile:
        system_instruction += f"\n\n<developer_profile>\n{developer_profile}\n</developer_profile>"

    # --- DEBUG LOGGING START ---
    logger.info("=== CHAT DEBUG LOG ===")
    logger.info(f"Session ID: {session_id}")
    logger.info(f"History Length: {len(history)}")
    logger.info(f"History: {history}")
    logger.info(f"User Message: {user_message}")
    if file_uri:
        logger.info(f"File URI: {file_uri}")
    # logger.info(f"System Instruction (Snippet): {system_instruction}") 
    # --- DEBUG LOGGING END ---

    # 4. Call Gemini
    config = types.GenerateContentConfig(
        temperature=0.4,
        system_instruction=system_instruction,
    )

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=api_contents,
            config=config
        )
        
        response_text = response.text
        logger.info(f"Model Response: {response_text}") 
        logger.info("======================")
        
        # 5. Parse response into a consistent, schema-tolerant envelope.
        parsed_response = _parse_model_response(response_text)
        
        # NOTE: We do NOT append to history here, as we are stateless.
        # The frontend will append the response to its history.

        return parsed_response

    except Exception as e:
        logger.error(f"Gemini Generation Error: {e}", exc_info=True)
        raise e


def upload_file_to_gemini(file_bytes: bytes) -> str:
    """
    Uploads a file to Gemini and returns the URI.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        try:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        except Exception as e:
            logger.error(f"Failed to write temp file: {e}")
            raise e

    try:
        uploaded_file = gemini_client.files.upload(file=tmp_path)
        logger.info(f"File uploaded to Gemini: {uploaded_file.name}")
        return uploaded_file.name
    except Exception as e:
        logger.error(f"Gemini upload failed: {e}")
        raise e
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)



def _clean_json_response(text: str) -> str:
    """Removes markdown fencing from JSON response using regex."""
    text = text.strip()
    pattern = r"```(?:json)?\s*(.*?)\s*```"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text


def _parse_model_response(response_text: str) -> Dict[str, Any]:
    """Returns a stable envelope while preserving structured content."""
    parsed_response: Dict[str, Any] = {
        "content": response_text,
        "current_stage": "general_chat",
        "follow_up_question": None
    }

    cleaned_text = _clean_json_response(response_text)
    if not cleaned_text.startswith(("{", "[")):
        return parsed_response

    try:
        data = json.loads(cleaned_text)
    except Exception as e:
        logger.warning(f"Failed to parse JSON response: {e}")
        return parsed_response

    if isinstance(data, dict):
        follow_up = data.get("follow_up_question")
        current_stage = data.get("current_stage") or "work_scope"
        if "content" in data:
            return {
                "content": data.get("content"),
                "current_stage": current_stage,
                "follow_up_question": follow_up
            }
        return {
            "content": data,
            "current_stage": current_stage,
            "follow_up_question": follow_up
        }

    if isinstance(data, list):
        return {
            "content": data,
            "current_stage": "work_scope",
            "follow_up_question": None
        }

    return parsed_response


