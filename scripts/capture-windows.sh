#!/bin/bash

# This script captures screenshots of all open, non-background windows.
# It requires `jq` to be installed for parsing JSON.

# 1. Define the output directory and ensure it exists.
OUTPUT_DIR="tmp/window_captures"
mkdir -p "$OUTPUT_DIR"
echo "Saving screenshots to $OUTPUT_DIR"
echo "Clearing old screenshots..."
rm -f "$OUTPUT_DIR"/*.png

# 2. Define the AppleScript to be executed.
# Using a variable is more robust than a heredoc in some shells.
read -r -d '' APPLE_SCRIPT <<'EOF'
on substitute(source_text, search_string, replace_string)
    set saved_delimiters to AppleScript's text item delimiters
    set AppleScript's text item delimiters to search_string
    set text_items to text items of source_text
    set AppleScript's text item delimiters to replace_string
    set result_text to text_items as string
    set AppleScript's text item delimiters to saved_delimiters
    return result_text
end substitute

on escape_json(the_string)
    if the_string is missing value then return ""
    set temp to the_string
    set temp to my substitute(temp, "\\", "\\\\")
    set temp to my substitute(temp, "\"", "\\\"")
    set temp to my substitute(temp, return, "\\n")
    set temp to my substitute(temp, linefeed, "\\n")
    return temp
end escape_json

set window_list to []
tell application "System Events"
    set procs to (application processes where background only is false)
    repeat with p in procs
        try
            if (count of windows of p) > 0 then
                repeat with w in windows of p
                    set end of window_list to {id of w, name of p, name of w}
                end repeat
            end if
        on error errMsg
            -- Ignore processes that can't be scripted
        end try
    end repeat
end tell

set json_parts to []
repeat with win_info in window_list
    set {win_id, app_name, win_title} to win_info
    
    set json_part to "{\"windowId\":" & win_id & ",\"appName\":\"" & my escape_json(app_name) & "\",\"title\":\"" & my escape_json(win_title) & "\"}"
    set end of json_parts to json_part
end repeat

set AppleScript's text item delimiters to ","
set json_string to "{\"windows\":[" & (json_parts as text) & "]}"
return json_string
EOF

# Execute the AppleScript
WINDOW_DATA=$(osascript -e "$APPLE_SCRIPT")

# Check if osascript was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to get window list from AppleScript."
    exit 1
fi

# Check if JSON is valid and contains windows
# if ! echo "$WINDOW_DATA" | jq -e '.windows' > /dev/null; then
#     echo "Error: AppleScript returned invalid or empty JSON data."
#     echo "$WINDOW_DATA"
#     exit 1
# fi

# 3. Parse JSON and capture screenshots
# echo "$WINDOW_DATA" | jq -c '.windows[]' | while read -r window; do
#     WINDOW_ID=$(echo "$window" | jq '.windowId')
#     APP_NAME=$(echo "$window" | jq -r '.appName')
#     WINDOW_TITLE=$(echo "$window" | jq -r '.title')

#     # Sanitize title for filename
#     SANITIZED_TITLE=$(echo "$WINDOW_TITLE" | sed 's/[^a-zA-Z0-9._-]/_/g' | cut -c 1-100)
    
#     if [ -z "$SANITIZED_TITLE" ]; then
#         SANITIZED_TITLE="no_title"
#     fi

#     FILENAME="${APP_NAME}_${SANITIZED_TITLE}_${WINDOW_ID}.png"
#     FILEPATH="$OUTPUT_DIR/$FILENAME"

#     echo "Capturing window ID $WINDOW_ID ($APP_NAME: $WINDOW_TITLE)"
    
#     # Use screencapture to grab the specific window by its ID.
#     screencapture -l "$WINDOW_ID" "$FILEPATH"
    
#     if [ $? -ne 0 ]; then
#         echo "  -> Failed to capture window ID $WINDOW_ID. It might be a menu or other temporary element."
#     fi
# done

# echo "Done. Screenshots are in the $OUTPUT_DIR directory."