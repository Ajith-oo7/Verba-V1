docker compose up -d
Set-Location "$PSScriptRoot\..\apps\web"
if (-not (Test-Path "node_modules")) { npm install }
npx prisma generate
npx prisma db push
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev"
Set-Location "$PSScriptRoot\..\agent"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\Activate.ps1
pip install -e .
python agent.py dev
