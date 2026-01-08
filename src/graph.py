
from pydantic import BaseModel
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph, END
from src.nodes import (
    load_initial_state_node,
    generate_overview_node,
    feature_extraction_node,
    generate_tech_stack_node,
    generate_scope_of_work_node,
    modify_scope_node,
    router_node,
    should_continue_from_router
)

class State(BaseModel):
    file_content: str = ""
    gemini_file: object = None  # Gemini file object for direct file access on first call
    overview: str = ""
    extracted_features: str = ""
    tech_stack: str = ""
    scope_of_work: str = ""
    current_stage: str = "overview"
    user_input: str = ""
    user_feedback: str = ""
    routing_decision: str | None = None
    follow_up_questions: str = "" 
    LLM: object = None 
    developer_profile: str = ""      # Single field: "Senior Developer, 5 years experience"
    user_preferences: str = ""       # Accumulated user feedback/changes from all stages
    full_scope: str = ""            # Internal state tracking the COMPLETE scope at all times


memory = MemorySaver()
workflow = StateGraph(State)

# Add nodes
workflow.add_node("load_initial_state", load_initial_state_node)
workflow.add_node("generate_overview", generate_overview_node)
workflow.add_node("feature_extraction", feature_extraction_node)
workflow.add_node("generate_tech_stack", generate_tech_stack_node)
workflow.add_node("generate_scope_of_work", generate_scope_of_work_node)
workflow.add_node("modify_scope", modify_scope_node)
workflow.add_node("router", router_node)

workflow.set_entry_point("load_initial_state")

# Entry: if user_input exists go to router, else generate overview
workflow.add_conditional_edges(
    "load_initial_state",
    lambda state: "router" if getattr(state, "user_input", None) else "generate_overview",
    {
        "generate_overview": "generate_overview",
        "router": "router"
    }
)

# All generation nodes end (wait for next API call)
workflow.add_edge("generate_overview", END)
workflow.add_edge("feature_extraction", END)
workflow.add_edge("generate_tech_stack", END)
workflow.add_edge("generate_scope_of_work", END)
workflow.add_edge("modify_scope", END)  # Modification also ends and waits for next input

# Router decides next step
workflow.add_conditional_edges(
    "router",
    should_continue_from_router,
    {
        "generate_overview": "generate_overview",
        "feature_extraction": "feature_extraction",
        "generate_tech_stack": "generate_tech_stack",
        "generate_scope_of_work": "generate_scope_of_work",
        "modify_scope": "modify_scope",
        END: END
    }
)

graph = workflow.compile(checkpointer=memory)