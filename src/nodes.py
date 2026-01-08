
import logging
import json
from langgraph.graph import END
from utils.prompts import (
    overview_prompt,
    feature_suggestion_prompt,
    tech_stack_prompt,
    work_scope_prompt,
    modify_scope_prompt,
)
from utils.helper import gemini_client
from google.genai import types
import re

logger = logging.getLogger(__name__)

def load_initial_state_node(state):
    logger.info("Loading initial state.")
    return state


def router_node(state):
    """
    Routes to next stage, storing user input as preferences.
    All user feedback is accumulated and applied in the final scope of work.
    """
    user_input = getattr(state, 'user_input', "").strip()
    current_stage = getattr(state, 'current_stage', 'overview')
    existing_preferences = getattr(state, 'user_preferences', "")
    
    state_updates = {"user_input": "", "user_feedback": "", "routing_decision": None}

    if not user_input:
        # No input, just proceed to next stage
        return {**state_updates, "routing_decision": "PROCEED", "current_stage": current_stage}

    # Store user input as a preference for this stage
    stage_prefix = f"[{current_stage.upper()}]"
    new_preference = f"{stage_prefix} {user_input}"
    if existing_preferences:
        updated_preferences = f"{existing_preferences}\n{new_preference}"
    else:
        updated_preferences = new_preference
    
    logger.info(f"Router: Stored preference for {current_stage}: {user_input}")
    logger.info(f"Router: All preferences so far:\n{updated_preferences}")
    
    return {
        **state_updates,
        "routing_decision": "PROCEED",
        "user_feedback": user_input,
        "user_preferences": updated_preferences,
        "current_stage": current_stage
    }


def _call_gemini(prompt_text: str, gemini_file=None, temperature: float = 0.4) -> str:
    """Helper function to call Gemini API with optional file."""
    contents = []
    
    if gemini_file is not None:
        contents.append(gemini_file)
    
    contents.append(prompt_text)
    
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=temperature
        )
    )
    return response.text.strip()


def _parse_json_response(raw: str) -> dict | None:
    """Parse JSON from LLM response, handling markdown code blocks."""
    if raw.startswith("```json") or raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def generate_overview_node(state):
    """
    Generate overview using Gemini with the uploaded file directly.
    On first call, sends file + prompt. File is provided via gemini_file in state.
    """
    user_feedback = getattr(state, 'user_feedback', "")
    gemini_file = getattr(state, 'gemini_file', None)  # Direct file object passed from main.py
    file_content = getattr(state, 'file_content', "")
    
    try:
        # Build the prompt text
        prompt_text = overview_prompt.template.format(
            parsed_data=file_content if file_content else "[See attached document]",
            user_feedback=user_feedback
        )
        
        # Call Gemini with file (on first call) or without
        raw = _call_gemini(prompt_text, gemini_file=gemini_file)
        logger.info(f"Raw LLM output for overview: {raw}")
        
        result = _parse_json_response(raw)
        if result:
            logger.info(f"Parsed overview result: {result}")
            follow_up = result.get("follow_up_question", "")  
            return {
                "overview": result.get("overview", "Error: No overview found in response."),
                "follow_up_questions": str(follow_up).strip(),  
                "current_stage": "overview",
                "user_feedback": "",
                "gemini_file": None
            }
        else:
            logger.warning(f"Overview output not JSON:\n{raw}")
            return {
                "overview": raw,
                "follow_up_questions": "",
                "current_stage": "overview",
                "user_feedback": "",
                "gemini_file": None
            }

    except Exception as e:
        logger.error(f"Overview generation error: {e}", exc_info=True)
        return {
            "overview": f"Error: {str(e)}",
            "current_stage": "overview",
            "follow_up_questions": "",
            "gemini_file": None
        }


def feature_extraction_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt_text = feature_suggestion_prompt.template.format(
            parsed_data=state.file_content if state.file_content else "[See attached document]",
            approved_overview=state.overview,
            user_feedback=user_feedback
        )

        raw = _call_gemini(prompt_text)
        logger.info(f"Raw LLM output for features: {raw}")
        
        result = _parse_json_response(raw)
        if result:
            logger.info(f"Parsed feature result: {result}")
            
            features = result.get("features", [])
            follow_up = result.get("follow_up_question", "")  

            if isinstance(features, list):
                features_str = "\n".join(f"- {f.strip()}" for f in features)
            else:
                features_str = str(features).strip()

            return {
                "extracted_features": features_str,
                "follow_up_questions": str(follow_up).strip(),  
                "current_stage": "features",
                "user_feedback": ""
            }
        else:
            logger.warning(f"Feature extraction output not JSON:\n{raw}")
            return {
                "extracted_features": raw,
                "follow_up_questions": "", 
                "current_stage": "features",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Feature extraction error: {e}", exc_info=True)
        return {
            "extracted_features": f"Error: {str(e)}",
            "follow_up_questions": "",  
            "current_stage": "features",
            "user_feedback": ""
        }


def generate_tech_stack_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt_text = tech_stack_prompt.template.format(
            parsed_data=state.file_content if state.file_content else "[See attached document]",
            approved_overview=state.overview,
            approved_features=state.extracted_features,
            user_feedback=user_feedback
        )

        raw = _call_gemini(prompt_text)
        logger.info(f"Raw LLM output for tech stack: {raw}")

        result = _parse_json_response(raw)
        if result:
            logger.info(f"Parsed tech stack result: {result}")

            tech_stack_dict = result.get("tech_stack", {})
            follow_up_questions = result.get("follow_up_question", "")  

            return {
                "tech_stack": json.dumps(tech_stack_dict, indent=2),
                "follow_up_questions": str(follow_up_questions).strip(),
                "current_stage": "tech_stack",
                "user_feedback": ""
            }
        else:
            logger.warning("Tech stack output not JSON:\n%s", raw)
            return {
                "tech_stack": raw,
                "follow_up_questions": "",  
                "current_stage": "tech_stack",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Tech stack generation error: {e}", exc_info=True)
        return {
            "tech_stack": f"Error: {str(e)}",
            "follow_up_questions": "", 
            "current_stage": "tech_stack",
            "user_feedback": ""
        }
    

def generate_scope_of_work_node(state):
    """
    Generates the final scope of work, incorporating:
    - All approved content (overview, features, tech_stack)
    - All accumulated user_preferences from previous stages
    - developer_profile for estimation hours
    """
    user_feedback = getattr(state, 'user_feedback', "")
    developer_profile = getattr(state, 'developer_profile', "")
    user_preferences = getattr(state, 'user_preferences', "")
    
    try:
        try:
            tech_stack_for_prompt = json.loads(state.tech_stack)
        except (json.JSONDecodeError, TypeError):
            tech_stack_for_prompt = state.tech_stack

        prompt_text = work_scope_prompt.template.format(
            parsed_data=state.file_content if state.file_content else "[See attached document]",
            approved_overview=state.overview,
            approved_features=state.extracted_features,
            approved_tech_stack=tech_stack_for_prompt,
            user_feedback=user_feedback,
            developer_profile=developer_profile,
            user_preferences=user_preferences
        )

        raw = _call_gemini(prompt_text)
        logger.info(f"Raw LLM output for scope of work: {raw}")

        result = _parse_json_response(raw)
        if result:
            logger.info(f"Parsed scope of work result: {result}")
            follow_up = result.get("follow_up_question", "")
            
            return {
                "scope_of_work": json.dumps(result, indent=2),
                "full_scope": json.dumps(result, indent=2),
                "follow_up_questions": str(follow_up).strip(),
                "current_stage": "scope_of_work",
                "user_feedback": ""
            }
        else:
            logger.warning(f"Scope of work output not JSON:\n{raw}")
            return {
                "scope_of_work": raw,
                "follow_up_questions": "",
                "current_stage": "scope_of_work",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Scope of work generation error: {e}", exc_info=True)
        return {
            "scope_of_work": f"Error: {str(e)}",
            "follow_up_questions": "",
            "current_stage": "scope_of_work",
            "user_feedback": ""
        }


def modify_scope_node(state):
    """
    Modifies a specific section of the scope of work based on user feedback.
    """
    user_feedback = getattr(state, 'user_feedback', "")
    existing_scope = getattr(state, 'full_scope', "")
    developer_profile = getattr(state, 'developer_profile', "")
    
    if not user_feedback or not existing_scope:
        existing_scope = getattr(state, 'scope_of_work', "")
        
    if not user_feedback or not existing_scope:
        logger.warning("modify_scope_node called without feedback or existing scope")
        return {"current_stage": "scope_of_work"}
    
    try:
        prompt_text = modify_scope_prompt.template.format(
            existing_scope=existing_scope,
            user_modification_request=user_feedback,
            developer_profile=developer_profile
        )

        raw = _call_gemini(prompt_text)
        logger.info(f"Raw LLM output for scope modification: {raw}")

        result = _parse_json_response(raw)
        if result and "updated_full_scope" in result and "ui_update" in result:
            logger.info(f"Parsed modified scope result with partial UI update")
            
            full_scope = result.get("updated_full_scope")
            ui_update = result.get("ui_update")
            follow_up = ui_update.get("follow_up_questions") or ui_update.get("follow_up_question")
            
            return {
                "scope_of_work": json.dumps(ui_update, indent=2),
                "full_scope": json.dumps(full_scope, indent=2),
                "follow_up_questions": str(follow_up).strip(),
                "current_stage": "scope_of_work",
                "user_feedback": ""
            }
        else:
            logger.warning(f"Modified scope output not in expected dual format:\n{raw}")
            if result:
                return {
                    "scope_of_work": json.dumps(result, indent=2),
                    "full_scope": json.dumps(result, indent=2),
                    "current_stage": "scope_of_work",
                    "user_feedback": ""
                }
            return {
                "scope_of_work": raw,
                "follow_up_questions": "I've made the changes. Let me know if you need anything else!",
                "current_stage": "scope_of_work",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Scope modification error: {e}", exc_info=True)
        return {
            "follow_up_questions": f"Sorry, I encountered an error while modifying the scope: {str(e)}",
            "current_stage": "scope_of_work",
            "user_feedback": ""
        }


def should_continue_from_router(state):
    """
    Routes to the next stage in the pipeline.
    After scope_of_work is generated, routes to modify_scope for any user feedback.
    """
    decision = getattr(state, 'routing_decision', None)
    stage = getattr(state, 'current_stage', 'overview')
    user_feedback = getattr(state, 'user_feedback', "")
    
    stage_transitions = {
        "overview": "feature_extraction",
        "features": "generate_tech_stack",
        "tech_stack": "generate_scope_of_work",
        "scope_of_work": "modify_scope"
    }
    
    if decision == "PROCEED":
        next_node = stage_transitions.get(stage, END)
        if stage == "scope_of_work" and not user_feedback:
            return END
        return next_node
    
    return END