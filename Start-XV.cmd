@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\XV-0.3.0-Windows-x64.exe" (
  start "" "release\XV-0.3.0-Windows-x64.exe"
) else (
  echo 找不到 EXE。請先執行 npm ci 及 npm run dist:win。
  pause
)
