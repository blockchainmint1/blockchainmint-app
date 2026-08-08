@echo off
REM ---------------------------------------------------------------------
REM  Build CSC Mint into a single .exe and drop it on the user's desktop.
REM  RUN THIS ON A NORMAL (internet-connected) WINDOWS MACHINE.
REM  Then copy %USERPROFILE%\Desktop\CSCMint.exe to the offline laser PC.
REM ---------------------------------------------------------------------

setlocal
cd /d "%~dp0"

REM ---- make a local copy of the plugins so --add-data can never miss them ----
if not exist "%~dp0keygen-plugins" mkdir "%~dp0keygen-plugins"
copy /y "%~dp0..\keygen-plugins\*.py" "%~dp0keygen-plugins\" >nul
if not exist "%~dp0keygen-plugins\txc12.py" (
    echo ERROR: keygen-plugins\txc12.py not found. Copy the repo's keygen-plugins
    echo        folder next to this desktop folder and re-run.
    goto :fail
)


echo.
echo [1/3] Installing build dependencies...
python -m pip install --upgrade pip
python -m pip install pyinstaller bip_utils coincurve cffi opencv-contrib-python numpy pyzbar
if errorlevel 1 goto :fail

echo.
echo [2/3] Smoke-testing the crypto libs...
python -c "import bip_utils; print('bip_utils', bip_utils.__version__ if hasattr(bip_utils,'__version__') else 'ok')"
if errorlevel 1 goto :fail

echo.
echo [2b/3] Ensuring the pyzbar DLLs are present (downloads them if missing)...
python "%~dp0fetch_zbar_dlls.py"

REM NOTE: do NOT wrap these SET lines in quotes - cmd.exe chokes on the
REM nested quotes inside --add-binary and reports
REM   "...libiconv.dll" was unexpected at this time.
set ZBAR_ARGS=
if exist "%~dp0zbar_dlls\libzbar-64.dll" set ZBAR_ARGS=%ZBAR_ARGS% --add-binary "zbar_dlls\libzbar-64.dll;pyzbar"
if exist "%~dp0zbar_dlls\libiconv.dll" set ZBAR_ARGS=%ZBAR_ARGS% --add-binary "zbar_dlls\libiconv.dll;pyzbar"
if exist "%~dp0zbar_dlls\libiconv-2.dll" set ZBAR_ARGS=%ZBAR_ARGS% --add-binary "zbar_dlls\libiconv-2.dll;pyzbar"
if not defined ZBAR_ARGS echo   WARNING: libzbar-64.dll not found - ZBar engine will be missing.



echo.
echo [3/3] Building CSCMint.exe and dropping it on your desktop...
set "DESKTOP=%USERPROFILE%\Desktop"
pyinstaller --noconfirm --clean --onefile --windowed ^
  --name CSCMint ^
  --distpath "%DESKTOP%" ^
  --add-data "keygen-plugins;keygen-plugins" ^
  --collect-all bip_utils ^
  --collect-all coincurve --collect-binaries coincurve ^
  --hidden-import coincurve --hidden-import coincurve._cffi_backend ^
  --hidden-import _cffi_backend --hidden-import cffi ^
  --hidden-import crcmod --hidden-import ecdsa --hidden-import bitarray ^
  --collect-all cv2 --hidden-import cv2 --hidden-import numpy ^
  --collect-all pyzbar --hidden-import pyzbar --hidden-import pyzbar.pyzbar ^
  %ZBAR_ARGS% ^
  csc_mint.py

if errorlevel 1 goto :fail

echo.
echo ==============================================
echo  DONE.  Your app is on your Desktop at:
echo  %DESKTOP%\CSCMint.exe
if not exist "%DESKTOP%\CSCMint.exe" (
  echo  WARNING: expected file was not found. Check the build log above.
)
echo  Copy that ONE file to the offline PC.
echo ==============================================
goto :eof

:fail
echo.
echo BUILD FAILED - see the errors above.
exit /b 1
