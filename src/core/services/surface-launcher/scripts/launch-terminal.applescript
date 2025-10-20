set targetTitle to "{{SESSION_TITLE}}"
set launchCommand to "cd '{{CWD}}' && {{FULL_COMMAND}}"

tell application "Terminal"
    set existingWindow to missing value

    repeat with currentWindow in windows
        try
            if custom title of currentWindow is targetTitle then
                set existingWindow to currentWindow
                exit repeat
            end if
        end try
    end repeat

    if existingWindow is not missing value then
        set front window to existingWindow
        activate
        return
    end if

    set newTab to do script launchCommand
    delay 0.2
    try
        set custom title of front window to targetTitle
    end try
    activate
end tell
