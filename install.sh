#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh [--both | --codex | --claude] [--replace]

Link both bundled skills into Codex and Claude Code (default: both).
  --codex    Install into ${CODEX_HOME:-$HOME/.codex}/skills only.
  --claude   Install into $HOME/.claude/skills only.
  --both     Install into both agents' skill directories.
  --replace  Back up conflicting installations before linking.
  --help     Show this help.

Keep this repository checkout: installed skills link to it. No dependencies
are downloaded, and shell configuration and API keys are left untouched.
EOF
}

mode=both
replace=false
for arg in "$@"; do
  case "$arg" in
    --codex) mode=codex ;;
    --claude) mode=claude ;;
    --both) mode=both ;;
    --replace) replace=true ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; usage >&2; exit 1 ;;
  esac
done

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
names=(ui-walkthrough-video elevenlabs-narration)
roots=()
agents=()
if [[ "$mode" == both || "$mode" == codex ]]; then
  roots+=("${CODEX_HOME:-$HOME/.codex}/skills")
  agents+=(codex)
fi
if [[ "$mode" == both || "$mode" == claude ]]; then
  roots+=("$HOME/.claude/skills")
  agents+=(claude)
fi

# Check every target first so a conflict cannot leave a half-installed bundle.
for root in "${roots[@]}"; do
  for name in "${names[@]}"; do
    source="$repo_dir/skills/$name"
    target="$root/$name"
    [[ -f "$source/SKILL.md" ]] || { printf 'Missing skill: %s\n' "$source" >&2; exit 1; }
    if [[ -e "$target" || -L "$target" ]]; then
      if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
        continue
      fi
      # Backing up a checkout that contains this installer would break its links.
      if [[ -d "$target" ]]; then
        target_dir=$(cd -- "$target" && pwd -P)
        case "$repo_dir/" in
          "$target_dir/"*) printf 'Move this repository outside %s before installing.\n' "$target" >&2; exit 1 ;;
        esac
      fi
      if [[ "$replace" != true ]]; then
        printf 'Existing installation: %s\nRerun with --replace to preserve it in a backup.\n' "$target" >&2
        exit 1
      fi
    fi
  done
done

backup_dir=
for ((i=0; i<${#roots[@]}; i++)); do
  root=${roots[$i]}
  mkdir -p -- "$root"
  for name in "${names[@]}"; do
    source="$repo_dir/skills/$name"
    target="$root/$name"
    if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
      printf 'Already installed: %s\n' "$target"
      continue
    fi
    backup=
    if [[ -e "$target" || -L "$target" ]]; then
      if [[ -z "$backup_dir" ]]; then
        backup_root="${XDG_STATE_HOME:-$HOME/.local/state}/ui-walkthrough-video/backups"
        mkdir -p -- "$backup_root"
        backup_dir=$(mktemp -d "$backup_root/install-XXXXXXXX")
      fi
      backup="$backup_dir/${agents[$i]}-$name"
      mv -- "$target" "$backup"
      printf 'Backed up: %s -> %s\n' "$target" "$backup"
    fi
    if ! ln -s -- "$source" "$target"; then
      [[ -z "$backup" ]] || mv -- "$backup" "$target"
      printf 'Could not install: %s\n' "$target" >&2
      exit 1
    fi
    printf 'Installed: %s -> %s\n' "$target" "$source"
  done
done
printf 'Both skills are available for your next request. Keep the checkout at %s.\n' "$repo_dir"
