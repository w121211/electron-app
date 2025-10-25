-- src/core/services/surface-launcher/scripts/focus-safari.applescript
tell application "{{BROWSER_NAME}}"
    activate
    
    set targetURL to "{{TARGET_URL}}"
    set foundTab to false
    
    -- Search for existing tab with matching URL (prefix match, not exact)
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t starts with targetURL then
                set current tab of w to t
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