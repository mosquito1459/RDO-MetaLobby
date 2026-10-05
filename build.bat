@echo off
setlocal EnableExtensions

REM Always run from the repo root, no matter where this script is invoked from.
cd /d "%~dp0"
title RDO-MetaLobby: Build Installer

echo ============================================================
echo   RDO-MetaLobby: Build Installer Menu
echo ============================================================
echo.
echo   [1] Remote Build via GitHub Actions (Recommended)
echo       - Compiles on GitHub Cloud (saves PC CPU and RAM)
echo       - Syncs and overwrites src-tauri\target\release\ directly
echo       - Opens folder when finished
echo.
echo   [2] Local Build on this PC
echo       - Runs locally: npm run tauri build
echo.
set "CHOICE=1"
set /p CHOICE="Select build mode [1 or 2, default is 1]: "

if "%CHOICE%"=="2" goto run_local
goto run_remote

:run_local
echo.
echo ============================================================
echo   Running Local Build...
echo ============================================================
call npm run tauri build
set "CODE=%ERRORLEVEL%"
goto finish

:run_remote
echo.
echo ============================================================
echo   Starting Remote Build via GitHub Actions...
echo ============================================================
node scripts\remote-build.mjs
set "CODE=%ERRORLEVEL%"
goto finish

:finish
echo.
if "%CODE%"=="0" (
    echo ============================================================
    echo   [SUCCESS] Build process complete!
    echo ============================================================
) else (
    echo ============================================================
    echo   [ERROR] Build process exited with error code: %CODE%
    echo ============================================================
)

echo.
echo Press any key to close this window...
pause >nul
endlocal & exit /b %CODE%
