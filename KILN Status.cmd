@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\kiln-services.ps1" -Action Status
set "KILN_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %KILN_RESULT%
