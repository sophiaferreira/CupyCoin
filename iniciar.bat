@echo off
chcp 65001 >nul
title CupyCoin
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Baixe em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
node server.js
pause
