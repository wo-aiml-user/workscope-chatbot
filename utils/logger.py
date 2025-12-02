
import logging
import sys

def setup_logging():
    """
    Configures the root logger to output to both a file and the console.
    This setup is designed to be called once at application startup.
    """
    log_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    root_logger = logging.getLogger()
    if root_logger.hasHandlers():
        root_logger.handlers.clear()
    root_logger.setLevel(logging.INFO)
    file_handler = logging.FileHandler("workscope.log", mode='a') 
    file_handler.setFormatter(log_formatter)
    root_logger.addHandler(file_handler)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(log_formatter)
    root_logger.addHandler(stream_handler)

    logging.info("Logging configured to write to console and workscope.log")