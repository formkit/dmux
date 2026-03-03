#!/bin/bash
# Attentive-specific helpers for dmux hooks.
# Source this from hook files via: source "$DMUX_ROOT/.dmux-hooks/lib/attentive.sh"

# Returns space-separated list of changed Gradle module tasks, e.g. ":foo :bar"
get_changed_gradle_modules() {
  git diff --name-only master...HEAD | \
    grep -oP '^[^/]+' | sort -u | \
    xargs -I{} sh -c '[ -f "{}/build.gradle.kts" ] && echo ":{}"' | tr '\n' ' '
}

# Extracts JIRA key from branch name, e.g. "jny-1234-fix-auth" -> "JNY-1234"
extract_jira_key() {
  echo "$DMUX_BRANCH" | grep -oiP '^[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]'
}
