@echo off
:: PC Tweak - Emergency Safe Mode / Recovery Revert Script
:: Run this script if Windows fails to boot or experiences instability after applying advanced tweaks.
:: Works in Normal Mode, Safe Mode, and Windows Recovery Environment (WinRE CMD).

echo =====================================================================
echo           PC TWEAK - EMERGENCY SYSTEM RECOVERY & RESTORE
echo =====================================================================
echo.
echo Restoring bootloader parameters and security policies to defaults...
echo.

:: 1. Restore Hypervisor to auto
bcdedit /set hypervisorlaunchtype auto >nul 2>&1
echo [OK] Hypervisor set to auto.

:: 2. Remove harmful/placebo bcdedit flags if set
bcdedit /deletevalue useplatformclock >nul 2>&1
bcdedit /deletevalue disabledynamictick >nul 2>&1
echo [OK] Cleaned useplatformclock and disabledynamictick.

:: 3. Restore DeviceGuard / VBS (Virtualization Based Security)
reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v "EnableVirtualizationBasedSecurity" /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard" /v "HypervisorEnforcedCodeIntegrity" /t REG_DWORD /d 1 /f /reg:64 >nul 2>&1
echo [OK] Restored VBS / Memory Integrity keys.

:: 4. Restore Global Timer Resolution Requests
reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" /v "GlobalTimerResolutionRequests" /f /reg:64 >nul 2>&1
echo [OK] Restored Timer Resolution.

:: 5. Reset Mouse & Keyboard Accessibility
reg add "HKCU\Control Panel\Mouse" /v "MouseSpeed" /t REG_SZ /d "1" /f >nul 2>&1
reg add "HKCU\Control Panel\Mouse" /v "MouseSensitivity" /t REG_SZ /d "10" /f >nul 2>&1
reg add "HKCU\Control Panel\Accessibility\StickyKeys" /v "Flags" /t REG_SZ /d "510" /f >nul 2>&1
reg add "HKCU\Control Panel\Accessibility\Keyboard Response" /v "Flags" /t REG_SZ /d "126" /f >nul 2>&1
echo [OK] Restored Mouse and Keyboard accessibility defaults.

echo.
echo =====================================================================
echo Emergency revert completed successfully.
echo Please reboot your computer now.
echo =====================================================================
pause
