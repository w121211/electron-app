# src/core/services/surface-launcher/scripts/focus-window.sh
target_title="{{WINDOW_TITLE}}"
lower_target="$(printf "%s" "$target_title" | tr '[:upper:]' '[:lower:]')"

if command -v wmctrl >/dev/null 2>&1; then
  win_id=$(wmctrl -lx | awk -v tgt="$lower_target" '{
    lower_line = tolower($0);
    if (index(lower_line, tgt) > 0) {
      print $1;
      exit;
    }
  }')
  if [ -n "$win_id" ]; then
    wmctrl -ia "$win_id" && exit 0
  fi
fi

if command -v xdotool >/dev/null 2>&1; then
  win_id=$(xdotool search --name "$target_title" | head -n 1)
  if [ -n "$win_id" ]; then
    xdotool windowactivate "$win_id" && exit 0
  fi
fi

exit 1
