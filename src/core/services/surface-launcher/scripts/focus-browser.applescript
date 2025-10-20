-- src/core/services/surface-launcher/scripts/focus-browser.applescript
set targetUrl to "{{TARGET_URL}}"
set browserName to "{{BROWSER_NAME}}"

tell application "System Events"
    set appRunning to (name of processes) contains browserName
end tell

if not appRunning then
    tell application browserName
        make new window
        set URL of active tab of window 1 to targetUrl
        activate
    end tell
    return
end if

tell application browserName
    repeat with currentWindow in windows
        set tabIndex to 1
        repeat with currentTab in tabs of currentWindow
            try
                set tabUrl to URL of currentTab as string
            on error
                set tabUrl to ""
            end try

            if tabUrl starts with targetUrl then
                set active tab index of currentWindow to tabIndex
                set index of currentWindow to 1
                activate
                return
            end if

            set tabIndex to tabIndex + 1
        end repeat
    end repeat

    if (count of windows) is 0 then
        make new window
    end if

    tell window 1
        make new tab with properties {URL:targetUrl}
        set active tab index to (count of tabs)
    end tell
    activate
end tell
