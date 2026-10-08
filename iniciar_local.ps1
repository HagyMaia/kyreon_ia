# Kyreon AI — Inicializador em PowerShell
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       🚀 INICIANDO PLATAFORMA KYREON AI 🚀" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot

$pythonExe = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
    Write-Host "[!] Ambiente virtual .venv não encontrado, usando python global." -ForegroundColor Yellow
} else {
    Write-Host "[✓] Ambiente virtual detectado (.venv)." -ForegroundColor Green
}

Write-Host "[1/2] Iniciando Backend FastAPI (Porta 8000)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; & '$pythonExe' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host "[2/2] Iniciando Frontend React + Vite (Porta 5173)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"

Start-Sleep -Seconds 3
Write-Host "Abrindo painel web em http://localhost:5173..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " ✓ Serviços iniciados em janelas separadas!" -ForegroundColor Green
Write-Host " • Frontend: http://localhost:5173" -ForegroundColor Gray
Write-Host " • Backend: http://localhost:8000/api" -ForegroundColor Gray
Write-Host " • Swagger Docs: http://localhost:8000/docs" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
