@echo off
chcp 65001 >nul
title Kyreon AI — Inicializador da Plataforma
echo ========================================================
echo        🚀 INICIANDO PLATAFORMA KYREON AI 🚀
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Verificando ambiente Python do Backend...
if exist "backend\.venv\Scripts\python.exe" (
    set "PYTHON_EXE=backend\.venv\Scripts\python.exe"
    echo   ✓ Ambiente virtual encontrado (.venv).
) else (
    set "PYTHON_EXE=python"
    echo   ! Ambiente virtual não encontrado, usando python global.
)

echo [2/3] Iniciando Backend FastAPI na porta 8000...
start "Kyreon Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && "%PYTHON_EXE%" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [3/3] Iniciando Frontend React + Vite na porta 5173...
start "Kyreon Frontend (Vite)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Aguardando inicialização dos serviços (3 segundos)...
timeout /t 3 >nul

echo Abrindo painel no navegador...
start http://localhost:5173

echo.
echo ========================================================
echo  ✓ Kyreon AI iniciado com sucesso!
echo.
echo  • Frontend: http://localhost:5173
echo  • Backend API: http://localhost:8000/api
echo  • Documentação Swagger: http://localhost:8000/docs
echo ========================================================
echo Pressione qualquer tecla para fechar este assistente (as janelas do backend e frontend continuarão ativas).
pause >nul
