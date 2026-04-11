#!/usr/bin/env bash
# PreToolUse hook: intercept Bash tool calls and block actions that must
# never auto-execute without Dan's explicit per-invocation approval:
#
#   - git commit (any form)
#   - git push (any form)
#   - psql targeting production Supabase (*.supabase.co / pooler.supabase.com)
#
# Reads the Claude Code hook payload from stdin, emits a JSON permission
# decision on stdout when blocking, exits 0 silently to allow.
#
# Local Supabase container commands (docker exec supabase_db_mtgink psql ...)
# are explicitly allowed — those target the local dev DB, not prod.
#
# See CLAUDE.md § "Authorization Required Every Time".

set -euo pipefail

# Pull the Bash command out of the JSON payload. Default to empty so the
# later checks don't crash on non-Bash events.
cmd=$(jq -r '.tool_input.command // ""')

emit_deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
}

# Allowlist: local Supabase Docker container (any psql subcommand).
if grep -qE 'docker[[:space:]]+exec[[:space:]]+(-i[[:space:]]+)?supabase_db_mtgink[[:space:]]+psql' <<< "$cmd"; then
  exit 0
fi

# Block any form of `git commit`. The left-anchor group tolerates the
# command being chained after ;, &, |, `, $(, or a pipe.
if grep -qE '(^|[[:space:];&|`]|\$\()git[[:space:]]+commit([[:space:]]|$)' <<< "$cmd"; then
  emit_deny "git commit requires explicit user approval every time — never auto-approved, no matter how obvious or trivial the change. Stop. Show the diff and ask Dan to confirm before running this command. See CLAUDE.md § Authorization Required Every Time."
  exit 0
fi

# Block any form of `git push`.
if grep -qE '(^|[[:space:];&|`]|\$\()git[[:space:]]+push([[:space:]]|$)' <<< "$cmd"; then
  emit_deny "git push requires explicit user approval every time — never auto-approved. Stop. Ask Dan to confirm before running this command. See CLAUDE.md § Authorization Required Every Time."
  exit 0
fi

# Block psql against production Supabase. Matches *.supabase.co and
# pooler.supabase.com — covers both the direct and pooled connection
# strings Supabase hands out. Local dev uses 127.0.0.1:54322, which
# does not match and is therefore allowed.
if grep -qE 'psql.*(supabase\.co|pooler\.supabase\.com)' <<< "$cmd"; then
  emit_deny "Prod Supabase DB writes require explicit user approval every time — never auto-approved. Stop. Show the exact SQL and ask Dan to confirm before running this command. Note: read-only SELECTs are still gated by this hook — mention that in your approval request. See CLAUDE.md § Authorization Required Every Time."
  exit 0
fi

# Everything else: allow silently.
exit 0
