$ErrorActionPreference = "Stop"

cd "C:\Users\LOVE\MyProjects\commerce-automation"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$timestamp] commerce autopilot hourly start"

npm run autopilot:hourly

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$timestamp] commerce autopilot hourly done"
