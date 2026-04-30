#!/bin/bash

################################################################################
# Roo Agent Modes Symlink Installer
#
# This script creates symlinks from ~/.roo/rules-*/ to the agent/rules-*/
# directories in the project, enabling VS Code to access agent configuration
# globally. It also creates a symlink for roo-code-settings.json.
#
# Usage:
#   bash scripts/install-modes.sh
#   or via Make:
#   make install-modes
#
# Platform Support:
#   - macOS: Uses ~/Library/Application Support/Code/User/globalStorage
#   - Linux: Uses ~/.config/Code/User/globalStorage
#
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROO_HOME="${HOME}/.roo"
AGENT_DIR="${PROJECT_ROOT}/agent"
SETTINGS_SOURCE="${AGENT_DIR}/roo-code-settings.json"

# Counters for summary
CREATED=0
UPDATED=0
SKIPPED=0
ERRORS=0

################################################################################
# Helper Functions
################################################################################

log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# Detect the VS Code global storage path based on OS
detect_vscode_storage() {
  local os_type
  os_type=$(uname -s)
  
  case "$os_type" in
    Darwin)
      # macOS
      echo "${HOME}/Library/Application Support/Code/User/globalStorage"
      ;;
    Linux)
      # Linux
      echo "${HOME}/.config/Code/User/globalStorage"
      ;;
    *)
      log_error "Unsupported OS: $os_type"
      return 1
      ;;
  esac
}

# Create ~/.roo directory if it doesn't exist
ensure_roo_home() {
  if [[ ! -d "$ROO_HOME" ]]; then
    log_info "Creating ~/.roo directory..."
    mkdir -p "$ROO_HOME"
    log_success "Created ~/.roo"
  fi
}

# Create a symlink with proper error handling
create_symlink() {
  local target="$1"
  local link_name="$2"
  local link_path="${ROO_HOME}/${link_name}"
  
  # Check if target exists
  if [[ ! -e "$target" ]]; then
    log_error "Target does not exist: $target"
    ((ERRORS++))
    return 1
  fi
  
  # Handle existing symlink
  if [[ -L "$link_path" ]]; then
    local existing_target
    existing_target=$(readlink "$link_path")
    
    if [[ "$existing_target" == "$target" ]]; then
      log_success "Symlink already correct: $link_name → $target"
      ((SKIPPED++))
      return 0
    else
      log_warning "Updating symlink: $link_name (was → $existing_target)"
      rm "$link_path"
      ln -s "$target" "$link_path"
      log_success "Updated symlink: $link_name → $target"
      ((UPDATED++))
      return 0
    fi
  fi
  
  # Handle existing real directory
  if [[ -d "$link_path" ]]; then
    log_warning "Real directory exists at $link_path (skipping)"
    ((SKIPPED++))
    return 0
  fi
  
  # Handle existing file
  if [[ -f "$link_path" ]]; then
    log_error "File exists at $link_path (cannot create symlink)"
    ((ERRORS++))
    return 1
  fi
  
  # Create the symlink
  ln -s "$target" "$link_path"
  log_success "Created symlink: $link_name → $target"
  ((CREATED++))
  return 0
}

# Create settings symlink with directory structure
create_settings_symlink() {
  local settings_dir="${ROO_HOME}/rules-code/settings"
  local settings_link="${settings_dir}/roo-code-settings.json"
  
  # Check if settings source exists
  if [[ ! -f "$SETTINGS_SOURCE" ]]; then
    log_error "Settings source does not exist: $SETTINGS_SOURCE"
    ((ERRORS++))
    return 1
  fi
  
  # Create settings directory if it doesn't exist
  if [[ ! -d "$settings_dir" ]]; then
    log_info "Creating settings directory: $settings_dir"
    mkdir -p "$settings_dir"
  fi
  
  # Handle existing symlink
  if [[ -L "$settings_link" ]]; then
    local existing_target
    existing_target=$(readlink "$settings_link")
    
    if [[ "$existing_target" == "$SETTINGS_SOURCE" ]]; then
      log_success "Settings symlink already correct: roo-code-settings.json → $SETTINGS_SOURCE"
      ((SKIPPED++))
      return 0
    else
      log_warning "Updating settings symlink (was → $existing_target)"
      rm "$settings_link"
      ln -s "$SETTINGS_SOURCE" "$settings_link"
      log_success "Updated settings symlink: roo-code-settings.json → $SETTINGS_SOURCE"
      ((UPDATED++))
      return 0
    fi
  fi
  
  # Handle existing file
  if [[ -f "$settings_link" ]]; then
    log_error "File exists at $settings_link (cannot create symlink)"
    ((ERRORS++))
    return 1
  fi
  
  # Create the symlink
  ln -s "$SETTINGS_SOURCE" "$settings_link"
  log_success "Created settings symlink: roo-code-settings.json → $SETTINGS_SOURCE"
  ((CREATED++))
  return 0
}

# Validate all symlinks after creation
validate_symlinks() {
  local valid=0
  local invalid=0
  
  echo ""
  log_info "Validating symlinks..."
  echo ""
  
  # Validate rules-* symlinks
  for symlink in "$ROO_HOME"/rules-*; do
    if [[ -L "$symlink" ]]; then
      local target
      target=$(readlink "$symlink")
      if [[ -d "$target" ]]; then
        log_success "$(basename "$symlink") → $target"
        ((valid++))
      else
        log_error "$(basename "$symlink") → $target (invalid)"
        ((invalid++))
      fi
    fi
  done
  
  # Validate settings symlink
  local settings_link="${ROO_HOME}/rules-code/settings/roo-code-settings.json"
  if [[ -L "$settings_link" ]]; then
    local target
    target=$(readlink "$settings_link")
    if [[ -f "$target" ]]; then
      log_success "roo-code-settings.json → $target"
      ((valid++))
    else
      log_error "roo-code-settings.json → $target (invalid)"
      ((invalid++))
    fi
  fi
  
  echo ""
  echo "Validation Summary: $valid valid, $invalid invalid"
  
  if [[ $invalid -gt 0 ]]; then
    return 1
  fi
  return 0
}

################################################################################
# Main Execution
################################################################################

main() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}  Roo Agent Modes Symlink Installer                      ${BLUE}║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Ensure ~/.roo exists
  ensure_roo_home
  echo ""
  
  # Create symlinks for all rules-* directories
  log_info "Creating symlinks for agent modes..."
  echo ""
  
  if [[ ! -d "$AGENT_DIR" ]]; then
    log_error "Agent directory not found: $AGENT_DIR"
    exit 1
  fi
  
  # Find all rules-* directories in agent/
  local rules_count=0
  for rules_dir in "$AGENT_DIR"/rules-*/; do
    if [[ -d "$rules_dir" ]]; then
      local rules_name
      rules_name=$(basename "$rules_dir")
      create_symlink "$rules_dir" "$rules_name"
      ((rules_count++))
    fi
  done
  
  if [[ $rules_count -eq 0 ]]; then
    log_warning "No rules-* directories found in $AGENT_DIR"
  fi
  
  echo ""
  
  # Create settings symlink
  log_info "Creating settings symlink..."
  echo ""
  create_settings_symlink
  echo ""
  
  # Validate all symlinks
  if validate_symlinks; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  Setup Complete!                                         ${GREEN}║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Summary:"
    echo "  Created:  $CREATED"
    echo "  Updated:  $UPDATED"
    echo "  Skipped:  $SKIPPED"
    echo "  Errors:   $ERRORS"
    echo ""
    echo "Next steps:"
    echo "  1. Restart VS Code to reload global storage"
    echo "  2. Verify agent modes are available"
    echo "  3. Run 'make validate-symlinks' to verify setup"
    echo ""
    return 0
  else
    echo ""
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║${NC}  Setup Complete with Errors                              ${RED}║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Summary:"
    echo "  Created:  $CREATED"
    echo "  Updated:  $UPDATED"
    echo "  Skipped:  $SKIPPED"
    echo "  Errors:   $ERRORS"
    echo ""
    return 1
  fi
}

# Run main function
main "$@"
