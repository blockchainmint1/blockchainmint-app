@echo off
REM ---------------------------------------------------------------------------
REM  Portable build of CSCMint.exe — NO Python install required.
REM  Downloads an embedded Python zip, builds the exe, then cleans up.
REM  RUN THIS ON ANY WINDOWS PC.  Takes ~2-3 minutes on first run.
REM ---------------------------------------------------------------------------

setlocal EnableDelayedExpansion
set "PY_VERSION=3.11.9"
set "PY_ZIP=python-%PY_VERSION%-embed-amd64.zip"
set "BUILD_DIR=%TEMP%\cscmint-build-%RANDOM%"
set "PY_DIR=%BUILD_DIR%\python"
set "DIST_DIR=%~dp0dist"

mkdir "%BUILD_DIR%" 2>nul

echo.
echo [0/4] CSCMint portable Windows builder
echo       Work dir: %BUILD_DIR%

REM ---- download embedded python --------------------------------------------
echo.
echo [1/4] Downloading portable Python %PY_VERSION% ...
powershell -Command "& {Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/%PY_VERSION%/%PY_ZIP%' -OutFile '%BUILD_DIR%\%PY_ZIP%' -UseBasicParsing}"
if errorlevel 1 (
    echo FAILED to download Python. Check internet connection.
    goto :fail
)

REM ---- extract -------------------------------------------------------------
echo.
echo [2/4] Extracting portable Python ...
powershell -Command "& {Expand-Archive -Path '%BUILD_DIR%\%PY_ZIP%' -DestinationPath '%PY_DIR%' -Force}"
if errorlevel 1 goto :fail

REM ---- enable pip inside the embedded distribution ---------------------------
echo.
echo [3/4] Enabling pip ...
REM remove the ._pth file that blocks site-packages
for %%f in ("%PY_DIR%\*._pth") do del "%%f" 2>nul
powershell -Command "& {Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '%BUILD_DIR%\get-pip.py' -UseBasicParsing}"
"%PY_DIR%\python.exe" "%BUILD_DIR%\get-pip.py" --no-warn-script-location
if errorlevel 1 goto :fail

REM ---- install dependencies ------------------------------------------------
echo.
echo [4/4] Installing pyinstaller and bip_utils ...
"%PY_DIR%\python.exe" -m pip install --no-warn-script-location pyinstaller bip_utils coincurve cffi opencv-contrib-python numpy pyzbar
if errorlevel 1 goto :fail

REM ---- build the exe -------------------------------------------------------
echo.
echo [BUILD] Building CSCMint.exe ...
cd /d "%~dp0"

REM ---- make a local copy of the plugins so --add-data can never miss them ----
if not exist "%~dp0keygen-plugins" mkdir "%~dp0keygen-plugins"
copy /y "%~dp0..\keygen-plugins\*.py" "%~dp0keygen-plugins\" >nul
if not exist "%~dp0keygen-plugins\txc12.py" (
    echo ERROR: keygen-plugins\txc12.py not found. Copy the repo's keygen-plugins
    echo        folder next to this desktop folder and re-run.
    goto :fail
)

"%PY_DIR%\python.exe" -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name CSCMint ^
  --add-data "keygen-plugins;keygen-plugins" ^
  --collect-all bip_utils ^
  --collect-all coincurve --collect-binaries coincurve ^
  --hidden-import coincurve --hidden-import coincurve._cffi_backend ^
  --hidden-import _cffi_backend --hidden-import cffi ^
  --collect-all cv2 --hidden-import cv2 --hidden-import numpy ^
  --collect-all pyzbar --hidden-import pyzbar --hidden-import pyzbar.pyzbar ^
  --distpath "%DIST_DIR%" ^
  --workpath "%BUILD_DIR%\pyi-work" ^
  csc_mint.py
if errorlevel 1 goto :fail

REM ---- cleanup -------------------------------------------------------------
echo.
echo [CLEANUP] Removing temporary Python build ...
rmdir /s /q "%BUILD_DIR%"

echo.
echo ==============================================
echo  DONE.  Your exe is:
echo  %DIST_DIR%\CSCMint.exe
echo.
echo  Copy that ONE file to the offline PC.
echo ==============================================
goto :eof

:fail
echo.
echo BUILD FAILED. Temporary files left at:
echo %BUILD_DIR%
echo You can delete that folder manually.
exit /b 1
