#!/bin/bash
# Attentive-specific helpers for dmux hooks.
# Source this from hook files via: source "$DMUX_ROOT/.dmux-hooks/lib/attentive.sh"

# Detects which Attentive repo dmux is running in.
# Returns "java" for the Java/Gradle monorepo, "frontend" for the Nx/Yarn frontend repo.
detect_repo_type() {
  if [ -f "$DMUX_ROOT/settings.gradle.kts" ]; then
    echo "java"
  elif [ -f "$DMUX_ROOT/nx.json" ]; then
    echo "frontend"
  else
    echo "unknown"
  fi
}

# Returns space-separated list of changed Gradle module tasks, e.g. ":foo :bar"
# Only meaningful in the java repo.
get_changed_gradle_modules() {
  git diff --name-only master...HEAD | \
    grep -oP '^[^/]+' | sort -u | \
    xargs -I{} sh -c '[ -f "{}/build.gradle.kts" ] && echo ":{}"' | tr '\n' ' '
}

# Extracts JIRA key from branch name, e.g. "jny-1234-fix-auth" -> "JNY-1234"
extract_jira_key() {
  echo "$DMUX_BRANCH" | grep -oiP '^[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]'
}
