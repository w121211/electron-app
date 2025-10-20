# src/core/services/surface-launcher/scripts/focus-window.ps1
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$targetTitle = "{{WINDOW_TITLE}}"
$windows = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$targetTitle*" }
if ($windows.Length -gt 0) {
    $window = $windows[0]
    [NativeMethods]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null
    [NativeMethods]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
    exit 0
}

exit 1
