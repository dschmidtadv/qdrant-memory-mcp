#!/bin/bash

################################################################################
# setup-auto-start.sh
# 
# Automated setup script for new developers to bridge agent/rules-*/ folders
# into VS Code global storage via symlinks.
#
# This script:
# - Detects VS Code global storage path
# - Creates symlinks from agent/rules-*/ to ~/.roo/rules-*/
# - Validates symlink creation
# - Provides clear feedback
#
# Usage: ./scripts/setup-auto-start.sh
################################################################################

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROO_HOME="${HOME}/.roo"
AGENT_DIR="${PROJECT_ROOT}/agent"

# Track results
SYMLINKS_CREATED=0
SYMLINKS_FAILED=0
SYMLINKS_SKIPPED=0

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

log_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}${1}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

################################################################################
# Detect VS Code Global Storage Path
################################################################################

detect_vscode_storage() {
    log_section "Detecting VS Code Global Storage"
    
    local vscode_storage=""
    
    # Check for VS Code global storage on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        vscode_storage="${HOME}/Library/Application Support/Code/User/globalStorage"
    # Check for VS Code global storage on Linux
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        vscode_storage="${HOME}/.config/Code/User/globalStorage"
    else
        log_error "Unsupported operating system: $OSTYPE"
        return 1
    fi
    
    if [[ -d "$vscode_storage" ]]; then
        log_success "Found VS Code global storage: $vscode_storage"
        echo "$vscode_storage"
        return 0
    else
        log_warning "VS Code global storage not found at: $vscode_storage"
        log_info "This is normal if VS Code hasn't been run yet."
        echo "$vscode_storage"
        return 0
    fi
}

################################################################################
# Create ~/.roo Directory Structure
################################################################################

setup_roo_directory() {
    log_section "Setting Up ~/.roo Directory Structure"
    
    if [[ ! -d "$ROO_HOME" ]]; then
        log_info "Creating $ROO_HOME directory..."
        mkdir -p "$ROO_HOME"
        log_success "Created $ROO_HOME"
    else
        log_success "Directory already exists: $ROO_HOME"
    fi
}

################################################################################
# Create Symlinks for Rules Folders
################################################################################

create_symlinks() {
    log_section "Creating Symlinks for Rules Folders"
    
    # Find all rules-* directories in agent/
    local rules_dirs=$(find "$AGENT_DIR" -maxdepth 1 -type d -name "rules-*" 2>/dev/null || true)
    
    if [[ -z "$rules_dirs" ]]; then
        log_warning "No rules-* directories found in $AGENT_DIR"
        return 0
    fi
    
    for source_dir in $rules_dirs; do
        local dir_name=$(basename "$source_dir")
        local target_dir="${ROO_HOME}/${dir_name}"
        
        log_info "Processing: $dir_name"
        
        # Check if target already exists
        if [[ -L "$target_dir" ]]; then
            # It's a symlink
            local current_target=$(readlink "$target_dir")
            if [[ "$current_target" == "$source_dir" ]]; then
                log_success "Symlink already correct: $dir_name → $source_dir"
                ((SYMLINKS_SKIPPED++))
            else
                log_warning "Symlink points to different location: $current_target"
                log_info "Removing old symlink and creating new one..."
                rm "$target_dir"
                ln -s "$source_dir" "$target_dir"
                log_success "Updated symlink: $dir_name → $source_dir"
                ((SYMLINKS_CREATED++))
            fi
        elif [[ -d "$target_dir" ]]; then
            # It's a real directory
            log_warning "Directory already exists (not a symlink): $target_dir"
            log_info "Skipping to avoid data loss. Please manually review."
            ((SYMLINKS_SKIPPED++))
        else
            # Create new symlink
            ln -s "$source_dir" "$target_dir"
            log_success "Created symlink: $dir_name → $source_dir"
            ((SYMLINKS_CREATED++))
        fi
    done
################################################################################
# Validate Symlinks
################################################################################

validate_symlinks() {
    log_section "Validating Symlinks"
    
    local all_valid=true
    
    # Find all rules-* directories in ~/.roo/
    local symlinks=$(find "$ROO_HOME" -maxdepth 1 -type l -name "rules-*" 2>/dev/null || true)
    
    if [[ -z "$symlinks" ]]; then
        log_warning "No symlinks found in $ROO_HOME"
        return 0
    fi
    
    for symlink in $symlinks; do
        local link_name=$(basename "$symlink")
        local target=$(readlink "$symlink")
        
        if [[ -d "$target" ]]; then
            log_success "Valid symlink: $link_name → $target"
        else
            log_error "Invalid symlink: $link_name → $target (target does not exist)"
            all_valid=false
        fi
    done
    
    if [[ "$all_valid" == true ]]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Display Summary
################################################################################

display_summary() {
    log_section "Setup Summary"
    
    echo ""
    echo "Symlinks Created:  $SYMLINKS_CREATED"
    echo "Symlinks Skipped:  $SYMLINKS_SKIPPED"
    echo "Symlinks Failed:   $SYMLINKS_FAILED"
    echo ""
    
    if [[ $SYMLINKS_FAILED -eq 0 ]]; then
        log_success "Setup completed successfully!"
        echo ""
        log_info "Next steps:"
        echo "  1. Restart VS Code to reload global storage"
        echo "  2. Verify agent modes are available in VS Code"
        echo "  3. Run 'make install-modes' to validate all symlinks"
        return 0
    else
        log_error "Setup completed with errors. Please review above."
        return 1
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    log_section "Roo Agent Setup - Symlink Bridge"
    log_info "Project Root: $PROJECT_ROOT"
    log_info "Roo Home: $ROO_HOME"
    echo ""
    
    # Execute setup steps
    detect_vscode_storage || true
    setup_roo_directory
    create_symlinks
    validate_symlinks || SYMLINKS_FAILED=$((SYMLINKS_FAILED + 1))
    display_summary
}

# Run main function
main "$@"
