#!/bin/bash
# claude-alias: Inject project environment variables into Bash tool.
# Parses env files as plain KEY=VAL — no shell expansion, no command
# substitution. An env file is never source'd, so $(...) / `...` / ${VAR}
# inside one is a literal string, not code.

TOOL_NAME="$CLAUDE_TOOL_NAME"
[ "$TOOL_NAME" != "Bash" ] && exit 0

parse_and_export() {
  local file="$1"
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    line="${line#export }"
    case "$line" in
      [A-Za-z_]*=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in *[!A-Za-z0-9_]*) continue ;; esac
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    export "$key=$val"
  done < "$file"
}

ENV_FILES=(".claude-env" ".env.claude" ".env.local" ".env")
for f in "${ENV_FILES[@]}"; do
  if [ -f "$PWD/$f" ]; then
    parse_and_export "$PWD/$f"
    break
  fi
done

PROJECT_KEY=$(echo "$PWD" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/-\+/-/g')
ALIAS_FILE="$HOME/.claude-alias/$PROJECT_KEY.env"
if [ -f "$ALIAS_FILE" ]; then
  parse_and_export "$ALIAS_FILE"
fi

exit 0
