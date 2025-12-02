

import logging
import json
from langchain.prompts import ChatPromptTemplate
from langgraph.graph import END
from utils.prompts import (
    summary_prompt,
    overview_prompt,
    feature_suggestion_prompt,
    tech_stack_prompt,
    work_scope_prompt,
    router_prompt,
    final_adjustment_prompt,  
)
from utils.helper import time_logger
import re

logger = logging.getLogger(__name__)


@time_logger
def load_initial_state_node(state):
    logger.info("Loading initial state.")
    return state


@time_logger
def generate_initial_summary_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt = ChatPromptTemplate.from_template(summary_prompt.template)
        chain = prompt | state.LLM
        output = chain.invoke({"parsed_data": state.file_content, "user_feedback": user_feedback})

        raw = output.content.strip()
        logger.info(f"Raw LLM output for initial summary: {raw}")
        
        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed initial summary result: {result}")
            follow_up = result.get("follow_up_question", "") 
            logger.info(f"Follow-up question for initial summary: {follow_up}")
            return {
                "initial_summary": result.get("summary", "Error: No summary found in response."),
                "follow_up_questions": str(follow_up).strip(),  
                "current_stage": "initial_summary",
                "user_feedback": ""
            }
        except json.JSONDecodeError:
            logger.warning(f"Initial summary output not JSON:\n{raw}")
            return {
                "initial_summary": raw.strip(),
                "follow_up_questions": "",
                "current_stage": "initial_summary",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Initial summary generation error: {e}", exc_info=True)
        return {
            "initial_summary": f"Error: {str(e)}",
            "current_stage": "initial_summary",
            "follow_up_questions": ""
        }
    
@time_logger
def router_node(state):
    user_input = getattr(state, 'user_input', "").strip()
    current_stage = getattr(state, 'current_stage', 'initial_summary')
    
    state_updates = {"user_input": "", "user_feedback": "", "routing_decision": None}

    if not user_input:
        return {**state_updates, "routing_decision": "PAUSE", "current_stage": current_stage}

    try:
        prompt = ChatPromptTemplate.from_template(router_prompt.template)
        chain = prompt | state.LLM
        
        output = chain.invoke({
            "user_input": user_input,
            "current_stage": current_stage
        })

        raw_output = output.content.strip()
        logger.info(f"Router raw output:\n{raw_output}")

        action = ""
        for line in raw_output.splitlines():
            if line.upper().startswith("ACTION:"):
                action = line.split(":", 1)[1].strip().upper()
                break 

        if action not in {"APPROVE", "EDIT"}:
            logger.warning(f"Router failed to produce valid action. Defaulting to EDIT. Output: {raw_output}")
            action = "EDIT"
        final_feedback = user_input if action == "EDIT" else ""
        logger.info(f"Router decision: {action}, Feedback: '{final_feedback}'")

        return {
            **state_updates,
            "routing_decision": action,
            "user_feedback": final_feedback,
            "current_stage": current_stage
        }

    except Exception as e:
        logger.error(f"Router error: {e}", exc_info=True)
        return {
            **state_updates,
            "routing_decision": "EDIT",
            "user_feedback": user_input,
            "current_stage": current_stage
        }


@time_logger
def generate_overview_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt = ChatPromptTemplate.from_template(overview_prompt.template)
        chain = prompt | state.LLM
        output = chain.invoke({
            "parsed_data": state.file_content,
            "approved_summary": state.initial_summary,
            "user_feedback": user_feedback
        })

        raw = output.content.strip()
        logger.info(f"Raw LLM output for overview: {raw}")
        
        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed overview result: {result}")
            follow_up = result.get("follow_up_question", "")  
            logger.info(f"Follow-up question for overview: {follow_up}")
            return {
                "overview": result.get("overview", "Error: No overview found in response."),
                "follow_up_questions": str(follow_up).strip(),  
                "current_stage": "overview",
                "user_feedback": ""
            }
        except json.JSONDecodeError:
            logger.warning(f"Overview output not JSON:\n{raw}")
            return {
                "overview": raw.strip(),
                "follow_up_questions": "",
                "current_stage": "overview",
                "user_feedback": ""
            }

    except Exception as e:
        logger.error(f"Overview generation error: {e}", exc_info=True)
        return {
            "overview": f"Error: {str(e)}",
            "current_stage": "overview",
            "follow_up_questions": ""
        }


@time_logger
def feature_extraction_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt = ChatPromptTemplate.from_template(feature_suggestion_prompt.template)
        chain = prompt | state.LLM
        output = chain.invoke({
            "parsed_data": state.file_content,
            "approved_summary": state.overview,
            "user_feedback": user_feedback
        })

        raw = output.content.strip()
        logger.info(f"Raw LLM output for features: {raw}")
        
        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed feature result: {result}")
            
            features = result.get("features", [])
            follow_up = result.get("follow_up_question", "")  
            
            logger.info(f"Follow-up questions for features: {follow_up}")

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

        except json.JSONDecodeError:
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

@time_logger
def generate_tech_stack_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt = ChatPromptTemplate.from_template(tech_stack_prompt.template)
        chain = prompt | state.LLM

        output = chain.invoke({
            "parsed_data": state.file_content,
            "approved_summary": state.overview,
            "approved_features": state.extracted_features,
            "user_feedback": user_feedback
        })

        raw = output.content.strip()
        logger.info(f"Raw LLM output for tech stack: {raw}")

        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed tech stack result: {result}")

            tech_stack_dict = result.get("tech_stack", {})
            follow_up_questions = result.get("follow_up_question", "")  
            
            logger.info(f"Follow-up questions for tech stack: {follow_up_questions}")

            return {
                "tech_stack": json.dumps(tech_stack_dict, indent=2),
                "follow_up_questions": str(follow_up_questions).strip(),
                "current_stage": "tech_stack",
                "user_feedback": ""
            }

        except json.JSONDecodeError:
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
    

@time_logger
def generate_scope_of_work_node(state):
    user_feedback = getattr(state, 'user_feedback', "")
    try:
        prompt = ChatPromptTemplate.from_template(work_scope_prompt.template)
        chain = prompt | state.LLM
        
        try:
            tech_stack_for_prompt = json.loads(state.tech_stack)
        except (json.JSONDecodeError, TypeError):
            tech_stack_for_prompt = state.tech_stack

        output = chain.invoke({
            "parsed_data": state.file_content,
            "approved_summary": state.overview,
            "approved_features": state.extracted_features,
            "approved_tech_stack": tech_stack_for_prompt,
            "user_feedback": user_feedback
        })

        raw = output.content.strip()
        logger.info(f"Raw LLM output for scope of work: {raw}")

        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed scope of work result: {result}")
            follow_up = result.get("follow_up_question", "")
            
            return {
                "scope_of_work": json.dumps(result, indent=2),
                "follow_up_questions": str(follow_up).strip(),
                "current_stage": "scope_of_work",
                "user_feedback": ""
            }

        except json.JSONDecodeError:
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

@time_logger
def handle_final_adjustments_node(state):
    """
    Handles final, small adjustments to the scope of work without regenerating the whole document.
    """
    user_feedback = getattr(state, 'user_feedback', "")
    scope_of_work = getattr(state, 'scope_of_work', "")

    logger.info("Handling final adjustments based on user feedback.")

    if not user_feedback:
        return {
            "final_adjustment_response": "No feedback provided for adjustment.",
            "current_stage": "final_review",
            "follow_up_questions": "Is there anything else you'd like to change?"
        }

    try:
        prompt = ChatPromptTemplate.from_template(final_adjustment_prompt.template)
        chain = prompt | state.LLM
        
        output = chain.invoke({
            "scope_of_work": scope_of_work,
            "user_feedback": user_feedback
        })

        raw = output.content.strip()
        logger.info(f"Raw LLM output for final adjustment: {raw}")

        if raw.startswith("```json") or raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())

        try:
            result = json.loads(raw)
            logger.info(f"Parsed final adjustment result: {result}")
            follow_up = result.pop("follow_up_question", "Does that look correct? Any other adjustments?")
            
            adjustment_response = json.dumps(result, indent=2)
            
            logger.info(f"Storing main content for final adjustment: {adjustment_response}")
            logger.info(f"Storing new follow-up question: {follow_up}")

            return {
                "final_adjustment_response": adjustment_response,
                "current_stage": "final_review",
                "user_feedback": "",
                "follow_up_questions": str(follow_up).strip() 
            }

        except json.JSONDecodeError:
            logger.warning(f"Final adjustment output not JSON, treating as raw text:\n{raw}")
            return {
                "final_adjustment_response": raw,
                "current_stage": "final_review",
                "user_feedback": "",
                "follow_up_questions": "Does that look correct? Any other adjustments?"
            }

    except Exception as e:
        logger.error(f"Final adjustment generation error: {e}", exc_info=True)
        return {
            "final_adjustment_response": f"Error making adjustment: {str(e)}",
            "current_stage": "final_review",
            "follow_up_questions": "Sorry, I ran into an error. Could you rephrase your request?"
        }
    
@time_logger
def regenerate_current(state):
    current_stage = getattr(state, 'current_stage', 'initial_summary')
    stage_map = {
        "initial_summary": generate_initial_summary_node,
        "overview": generate_overview_node,
        "features": feature_extraction_node,
        "tech_stack": generate_tech_stack_node,
        "scope_of_work": generate_scope_of_work_node
    }
    handler = stage_map.get(current_stage)
    logger.info(f"Regenerating stage '{current_stage}' with feedback.")
    return handler(state) if handler else state


@time_logger
def pause_node(state):
    current_stage = getattr(state, 'current_stage', 'initial_summary')
    logger.info(f"Paused at stage {current_stage}")
    return state


@time_logger
def should_continue_from_router(state):
    decision = getattr(state, 'routing_decision', None)
    stage = getattr(state, 'current_stage', 'initial_summary')
    
    if decision == "EDIT":
        if stage == "scope_of_work" or stage == "final_review":
            return "handle_final_adjustments"
        return "regenerate_current"
        
    elif decision == "APPROVE":
        if stage == "final_review":
            return END

        stage_transitions = {
            "initial_summary": "generate_overview",
            "overview": "feature_extraction",
            "features": "generate_tech_stack",
            "tech_stack": "generate_scope_of_work",
            "scope_of_work": END
        }
        return stage_transitions.get(stage, "pause_node")
    
    return "pause_node"