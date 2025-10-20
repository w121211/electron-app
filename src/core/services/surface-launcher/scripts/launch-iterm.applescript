set targetName to "{{SESSION_NAME}}"
set launchCommand to "cd '{{CWD}}' && {{FULL_COMMAND}}"

tell application "iTerm"
    set matchFound to false

    repeat with currentWindow in windows
        repeat with currentTab in tabs of currentWindow
            repeat with currentSession in sessions of currentTab
                if name of currentSession is targetName then
                    tell currentSession to select
                    set current window to currentWindow
                    set matchFound to true
                    exit repeat
                end if
            end repeat
            if matchFound then exit repeat
        end repeat
        if matchFound then exit repeat
    end repeat

    if matchFound then
        activate
        return
    end if

    set newWindow to (create window with default profile)
    tell newWindow
        tell current session
            set name to targetName
            write text launchCommand & character id 13
        end tell
    end tell
    activate
end tell
