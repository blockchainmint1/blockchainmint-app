@echo off
REM ---------------------------------------------------------------------
REM  Build CSC Mint into a single .exe you can carry to the air-gapped PC.
REM  RUN THIS ON A NORMAL (internet-connected) WINDOWS MACHINE.
REM  Then copy dist\CSCMint.exe to the offline laser PC on a USB stick.
REM ---------------------------------------------------------------------

setlocal
cd /d "%~dp0"

REM ---- make a local copy of the plugins so --add-data can never miss them ----
if not exist "%~dp0keygen-plugins" mkdir "%~dp0keygen-plugins"
copy /y "%~dp0..\keygen-plugins\*.py" "%~dp0keygen-plugins\" >nul
if not exist "%~dp0keygen-plugins\txc24.py" (
    echo ERROR: keygen-plugins\txc24.py not found. Copy the repo's keygen-plugins
    echo        folder next to this desktop folder and re-run.
    goto :fail
)


echo.
echo [1/3] Installing build dependencies...
python -m pip install --upgrade pip
python -m pip install pyinstaller bip_utils
if errorlevel 1 goto :fail

echo.
echo [2/3] Smoke-testing the crypto libs...
python -c "import bip_utils; print('bip_utils', bip_utils.__version__ if hasattr(bip_utils,'__version__') else 'ok')"
if errorlevel 1 goto :fail

echo.
echo [3/3] Building CSCMint.exe...
pyinstaller --noconfirm --clean --onefile --windowed ^
  --name CSCMint ^
  --add-data "keygen-plugins;keygen-plugins" ^
  --collect-all bip_utils ^
  csc_mint.py
if errorlevel 1 goto :fail

echo.
echo ==============================================
echo  DONE.  Your app is:  %~dp0dist\CSCMint.exe
echo  Copy that ONE file to the offline PC.
echo ==============================================
goto :eof

:fail
echo.
echo BUILD FAILED - see the errors above.
exit /b 1
