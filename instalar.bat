@echo off
rem Instala (o actualiza) el Kino Receptor en una TV LG con Developer Mode. Necesita Node.js.
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js: https://nodejs.org & pause & exit /b 1)
where ares-install >nul 2>nul || call npm i -g @webos-tools/cli

set /p IP=IP de la TV (Ajustes ^> Red): 
call ares-setup-device --add lg -i "host=%IP%" -i "port=9922" -i "username=prisoner" 2>nul || call ares-setup-device --modify lg -i "host=%IP%" -i "port=9922" -i "username=prisoner"
echo Escribe la clave (passphrase) que muestra la app Developer Mode en la TV:
call ares-novacom --device lg --getkey
call ares-install --device lg kino-receptor-lg.ipk
echo Listo. En Kino, envia algo a la TV y acepta el aviso con el control remoto.
pause
