-- src/core/services/surface-launcher/scripts/focus-chrome.applescript
tell application "{{BROWSER_NAME}}"
    activate
    
    set targetURL to "{{TARGET_URL}}"
    set foundTab to false
    
    -- Search for existing tab with matching URL (prefix match, not exact)
    repeat with w in windows
        set tabIndex to 0
        repeat with t in tabs of w
            set tabIndex to tabIndex + 1
            if URL of t starts with targetURL then
                set active tab index of w to tabIndex
                set index of w to 1  -- Bring window to front
                set foundTab to true
                exit repeat
            end if
        end repeat
        if foundTab then exit repeat
    end repeat
    
    -- Open new tab only if URL not found
    if not foundTab then
        open location targetURL
    end if
end tell
