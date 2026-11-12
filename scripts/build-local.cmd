@echo off
setlocal enabledelayedexpansion
rem ---------------------------------------------------------------
rem build-local.cmd — full local Gradle build of Spliter.
rem
rem The workspace path contains a space ("zcode DATA") which breaks
rem CMake/ninja on RN's C++ modules. This script creates a junction
rem (E:\Dev\Spliter -> this folder) with a spaceless path and builds
rem from there. Requires: JDK 17 at E:\Dev\jdk\jdk-17.0.20+8.
rem
rem Usage:  scripts\build-local.cmd [assembleDebug^|assembleRelease^|bundleRelease]
rem ---------------------------------------------------------------

set "TASK=%~1"
if "%TASK%"=="" set "TASK=assembleRelease"

set "PROJ=%~dp0.."
for %%I in ("%PROJ%") do set "PROJ=%%~fI"
set "LINK=E:\Dev\Spliter"

if not exist "%LINK%" (
  echo Creating junction %LINK% -^> "%PROJ%"
  mklink /J "%LINK%" "%PROJ%" || exit /b 1
)

if not exist "%LINK%\android" (
  echo Running expo prebuild...
  pushd "%LINK%"
  call npx expo prebuild -p android --no-install
  popd
  if errorlevel 1 exit /b 1
)

set "JAVA_HOME=E:\Dev\jdk\jdk-17.0.20+8"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo Building %TASK% from %LINK%\android ...
pushd "%LINK%\android"
call gradlew.bat %TASK% --console=plain
set "RC=%ERRORLEVEL%"
popd

if "%RC%"=="0" (
  echo.
  echo Done. APK/AAB outputs are under %LINK%\android\app\build\outputs\
) else (
  echo Build FAILED with code %RC% 1>&2
)
exit /b %RC%
