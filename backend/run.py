"""
Module: run.py
Purpose: Application entry point — starts the uvicorn server.
"""

import os
import uvicorn


def main() -> None:
    """Start the AlgoTrade Pro API server."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    uvicorn.run(
        app="app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[os.path.join(base_dir, "app")],
        log_level="info",
    )


if __name__ == "__main__":
    main()
