
This service ingests a PDF or raw text, runs an agentic workflow to summarize, extract features, propose a tech stack, and generate a scope of work.

## Overview
- FastAPI service exposing endpoints to start and drive the workflow.
- LangGraph + LangChain orchestrating stages.
- Google Gemini model via `langchain_google_genai`.
- PDF parsing via LlamaParse.

## Getting Started
1. Ensure you have the required tools installed:
   - Python 3.10+
   - pip
   - (Optional) virtualenv
2. Clone or open this repository/folder.
3. Create and activate a virtual environment (recommended):
   - Windows (PowerShell):
     ```powershell
     python -m venv .venv
     .venv\Scripts\Activate.ps1
     ```
   - macOS/Linux (bash):
     ```bash
     python -m venv .venv
     source .venv/bin/activate
     ```
4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Build
- Optional: compile Python files to bytecode using npm (requires Node.js). Activate your Python venv first.
  ```bash
  npm run build
  ```

## How to Run
- Development (auto-reload):
  ```bash
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
  ```
- Using npm script (requires Node.js; activate your Python venv first):
  ```bash
  npm run dev
  ```
- Simple run:
  ```bash
  python main.py
  ```

The server will start on http://localhost:8000. Health check: GET `/health`.

### Example API Usage
- Start a session by uploading a PDF (replace SESSION_ID and path to your file):
  ```bash
  curl -X POST "http://localhost:8000/sessions/SESSION_ID/upload" \
       -H "accept: application/json" \
       -F "file=@/path/to/file.pdf"
  ```
- Start with raw text instead of a PDF:
  ```bash
  curl -X POST "http://localhost:8000/sessions/SESSION_ID/initial-input" \
       -H "Content-Type: application/json" \
       -d '{"initial_input": "Paste or write your initial brief here"}'
  ```
- Provide follow-up input to continue or adjust the workflow:
  ```bash
  curl -X POST "http://localhost:8000/sessions/SESSION_ID/input" \
       -H "Content-Type: application/json" \
       -d '{"user_input": "Please refine the tech stack to focus on serverless."}'
  ```

## Project Structure
```
testing/
├─ README.md            # You are here
├─ main.py              # FastAPI app and endpoints
├─ requirements.txt     # Python deps (FastAPI, LangChain, LangGraph, Gemini, LlamaParse, etc.)
├─ render.yaml          # (Optional) Deploy config
├─ src/
│  ├─ graph.py          # LangGraph wiring of the workflow
│  └─ nodes.py          # Workflow node implementations
├─ utils/
│  ├─ helper.py         # LLM setup, parsing helpers, sessions
│  ├─ logger.py         # Logging configuration
│  └─ prompts.py        # Prompt templates
├─ work-scope-forge/    # (Auxiliary assets/code; optional)
└─ .gitignore
```


## Environment Variables
Create a `.env` file at the project root with the following keys:

```env
# Google Gemini via langchain_google_genai
GOOGLE_API_KEY=your_google_gemini_api_key

# LlamaParse for PDF parsing
PARSE_KEY=your_llama_parse_api_key
```