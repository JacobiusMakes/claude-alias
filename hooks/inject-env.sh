#!/bin/bash
# claude-alias: Inject project environment variables into Bash tool
TOOL_NAME="$CLAUDE_TOOL_NAME"
[ "$TOOL_NAME" != "Bash" ] && exit 0

# Search for env files in order of priority
ENV_FILES=(".claude-env" ".env.claude" ".env.local" ".env")
LOADED=""

for f in "${ENV_FILES[@]}"; do
  if [ -f "$PWD/$f" ]; then
    # Source the env file
    set -a
    source "$PWD/$f" 2>/dev/null
    set +a
    LOADED="$f"
    break
  fi
done

# Also check for project-specific aliases in ~/.claude-alias/
PROJECT_KEY=$(echo "$PWD" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/-\+/-/g')
ALIAS_FILE="$HOME/.claude-alias/$PROJECT_KEY.env"
if [ -f "$ALIAS_FILE" ]; then
  set -a
  source "$ALIAS_FILE" 2>/dev/null
  set +a
fi

exit 0
