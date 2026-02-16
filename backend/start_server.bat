@echo off
cd /d e:\algotrade-pro\backend
.venv\Scripts\python.exe -c "import os; os.chdir(r'e:\algotrade-pro\backend'); import uvicorn; uvicorn.run('app.main:app', host='0.0.0.0', port=8000, log_level='warning')"
