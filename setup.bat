@echo off
rem Rockfish setup for Windows. Double-click this file.
rem It runs setup.ps1 in this folder, using PowerShell, which ships with Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
echo.
pause
