import os
import uvicorn
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

# Configuration settings
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))
LOG_LEVEL = os.getenv("LOG_LEVEL", "info").lower()

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",  # Path to the FastAPI app
        host=HOST,
        port=PORT,
        reload=True,
        log_level=LOG_LEVEL,
        factory=False,
        # Optional: Configure access log
        access_log=True,
        # Optional: Configure timeout settings
        # Optional: Configure HTTP protocol version
        http="auto",  # "auto", "h11", or "httptools"
        # Optional: Configure WebSocket
        ws="auto",  # "auto", "none", or "websockets"
        # Optional: Configure lifespan
        lifespan="on",  # "on", "off", or "auto"
    )
