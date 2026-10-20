#!/bin/bash

################################################################################
# Markdown Migration to Qdrant Vector DB
# Issue #22: Index .ai-memory/ and OneDrive Roo_Memory files to Qdrant
#
# Features:
# - Reads markdown files from repository .ai-memory/
# - Reads markdown files from OneDrive Roo_Memory
# - Pushes files to Qdrant vector DB for indexing
# - Archive flag system to prevent re-indexing unchanged files
# - Dry-run mode for safe testing
# - Change detection based on file hash
# - Comprehensive logging
#
# Usage: ./scripts/migrate-docs.sh [--dry-run] [--repo-path /path/to/repo] [--force]
################################################################################

set -e

# Configuration
APPS_DIR="${APPS_DIR:-$HOME/apps}"
MEMORY_DIR="${MEMORY_DIR:-$HOME/Documents/Roo_Memory}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
QDRANT_COLLECTION="${QDRANT_COLLECTION:-agent-memory}"
DRY_RUN=false
SPECIFIC_REPO=""
FORCE_MIGRATION=false
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="migration-${TIMESTAMP}.log"
ARCHIVE_FILE=".migration-archive"
POINT_ID_COUNTER=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1" | tee -a "$LOG_FILE"
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_info "Running in DRY-RUN mode (no changes will be made)"
                shift
                ;;
            --repo-path)
                SPECIFIC_REPO="$2"
                shift 2
                ;;
            --force)
                FORCE_MIGRATION=true
                log_info "Force migration enabled (will re-index all files)"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Calculate file hash
calculate_hash() {
    local file=$1
    if command -v md5sum &> /dev/null; then
        md5sum "$file" | awk '{print $1}'
    elif command -v md5 &> /dev/null; then
        md5 -q "$file"
    else
        # Fallback: use file size and modification time
        stat -f "%z-%m" "$file" 2>/dev/null || stat -c "%s-%Y" "$file" 2>/dev/null
    fi
}

# Check if file was already indexed
is_file_indexed() {
    local repo_path=$1
    local file_path=$2
    local archive_path="$repo_path/$ARCHIVE_FILE"
    
    if [ ! -f "$archive_path" ]; then
        return 1  # Not indexed
    fi
    
    local file_hash=$(calculate_hash "$file_path")
    local file_name=$(basename "$file_path")
    local archived_hash=$(grep "^$file_name:" "$archive_path" 2>/dev/null | cut -d: -f2)
    
    if [ -z "$archived_hash" ]; then
        return 1  # Not in archive
    fi
    
    if [ "$file_hash" = "$archived_hash" ]; then
        return 0  # File indexed and unchanged
    else
        return 1  # File changed since indexing
    fi
}

# Record indexed file in archive
record_indexed_file() {
    local repo_path=$1
    local file_path=$2
    local archive_path="$repo_path/$ARCHIVE_FILE"
    
    if [ "$DRY_RUN" = true ]; then
        return
    fi
    
    local file_hash=$(calculate_hash "$file_path")
    local file_name=$(basename "$file_path")
    
    # Remove old entry if exists
    if [ -f "$archive_path" ]; then
        grep -v "^$file_name:" "$archive_path" > "$archive_path.tmp" 2>/dev/null || true
        mv "$archive_path.tmp" "$archive_path"
    fi
    
    # Add new entry
    echo "$file_name:$file_hash" >> "$archive_path"
}

# Generate embedding via Ollama
generate_embedding() {
    local text=$1
    local truncated=$(echo "$text" | head -c 4096)  # Limit to 4KB to avoid token limits
    
    local response=$(curl -s -X POST "$OLLAMA_URL/api/embeddings" \
        -H "Content-Type: application/json" \
        -d "{\"model\": \"nomic-embed-text\", \"prompt\": $(echo "$truncated" | jq -Rs .)}" 2>&1)
    
    # Extract embedding array from response
    echo "$response" | jq '.embedding' 2>/dev/null
}

# Push file to Qdrant
push_to_qdrant() {
    local file_path=$1
    local file_name=$(basename "$file_path")
    local repo_name=$2
    
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would push to Qdrant: $file_name (repo: $repo_name)"
        return 0
    fi
    
    # Read file content
    local file_content=$(cat "$file_path")
    
    # Generate real embedding via Ollama
    local vector=$(generate_embedding "$file_content")
    if [ -z "$vector" ] || [ "$vector" = "null" ]; then
        log_warning "Failed to generate embedding for: $file_name"
        return 1
    fi
    
    # Create JSON payload for Qdrant
    local json_content=$(echo "$file_content" | jq -Rs .)
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Generate deterministic point ID using timestamp + counter
    # This ensures unique, valid unsigned 64-bit integers
    ((POINT_ID_COUNTER++))
    local point_id=$(($(date +%s%N) + POINT_ID_COUNTER))
    
    # Create point payload matching memorize_context schema for MCP server compatibility
    # Required fields: project, timestamp, source, tags, chunk_index, content
    local payload=$(cat <<EOF
{
    "project": "$repo_name",
    "timestamp": $(date +%s),
    "source": "migration_script",
    "tags": ["migrated", "$repo_name"],
    "chunk_index": 0,
    "content": $json_content
}
EOF
)
    
    # Push to Qdrant REST API with correct format
    local response=$(curl -s -X PUT "$QDRANT_URL/collections/$QDRANT_COLLECTION/points?wait=true" \
        -H "Content-Type: application/json" \
        -d "{\"points\": [{\"id\": $point_id, \"vector\": $vector, \"payload\": $payload}]}" 2>&1)
    
    # Check if push was successful
    if echo "$response" | grep -q '"status":"ok"'; then
        log_info "Pushed to Qdrant: $file_name"
        return 0
    else
        log_warning "Failed to push to Qdrant: $file_name - $response"
        return 1
    fi
}

# Index repository-level files
index_repository_files() {
    local repo_path=$1
    local repo_name=$(basename "$repo_path")
    local ai_memory_path="$repo_path/.ai-memory"
    
    if [ ! -d "$ai_memory_path" ]; then
        return
    fi
    
    local indexed_count=0
    local skipped_count=0
    
    # Index all markdown files in .ai-memory/
    while IFS= read -r -d '' file; do
        if [ "$FORCE_MIGRATION" = false ] && is_file_indexed "$repo_path" "$file"; then
            log_skip "Already indexed (unchanged): $(basename "$file")"
            ((skipped_count++))
            continue
        fi
        
        if push_to_qdrant "$file" "$repo_name"; then
            record_indexed_file "$repo_path" "$file"
            ((indexed_count++))
        fi
    done < <(find "$ai_memory_path" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
    
    if [ $indexed_count -gt 0 ]; then
        log_success "Indexed $indexed_count repository files to Qdrant"
    fi
    if [ $skipped_count -gt 0 ]; then
        log_info "Skipped $skipped_count unchanged repository files"
    fi
}

# Index OneDrive Roo_Memory files
index_roo_memory_files() {
    local repo_name=$1
    local memory_repo_path="$MEMORY_DIR/$repo_name"
    local repo_path="$APPS_DIR/$repo_name"
    
    if [ ! -d "$memory_repo_path" ]; then
        log_warning "No Roo_Memory directory found for: $repo_name"
        return
    fi
    
    log_info "Indexing Roo_Memory files for: $repo_name"
    
    local indexed_count=0
    local skipped_count=0
    while IFS= read -r -d '' file; do
        if [ "$FORCE_MIGRATION" = false ] && is_file_indexed "$repo_path" "$file"; then
            log_skip "Already indexed (unchanged): $(basename "$file")"
            ((skipped_count++))
            continue
        fi
        
        if push_to_qdrant "$file" "$repo_name"; then
            record_indexed_file "$repo_path" "$file"
            ((indexed_count++))
        fi
    done < <(find "$memory_repo_path" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
    
    if [ $indexed_count -gt 0 ]; then
        log_success "Indexed $indexed_count Roo_Memory files to Qdrant"
    fi
    if [ $skipped_count -gt 0 ]; then
        log_info "Skipped $skipped_count unchanged Roo_Memory files"
    fi
}

# Process a single repository
process_repository() {
    local repo_path=$1
    local repo_name=$(basename "$repo_path")
    
    log_info "Processing repository: $repo_name"
    
    if [ ! -d "$repo_path/.ai-memory" ] && [ ! -d "$MEMORY_DIR/$repo_name" ]; then
        log_warning "No .ai-memory or Roo_Memory directory found for: $repo_name"
        return
    fi
    
    # Index repository-level files
    index_repository_files "$repo_path"
    
    # Index OneDrive Roo_Memory files
    index_roo_memory_files "$repo_name"
    
    log_success "Completed indexing for: $repo_name"
}

# Ensure Qdrant collection exists
ensure_collection_exists() {
    local collection_name=$1
    
    # Check if collection exists
    local response=$(curl -s "$QDRANT_URL/collections/$collection_name" 2>&1)
    
    if echo "$response" | grep -q '"status":"ok"'; then
        log_info "Collection '$collection_name' already exists"
        return 0
    fi
    
    # Collection doesn't exist, create it
    log_info "Creating Qdrant collection: $collection_name"
    local create_response=$(curl -s -X PUT "$QDRANT_URL/collections/$collection_name" \
        -H "Content-Type: application/json" \
        -d '{
            "vectors": {
                "size": 768,
                "distance": "Cosine"
            }
        }' 2>&1)
    
    if echo "$create_response" | grep -q '"status":"ok"'; then
        log_success "Collection '$collection_name' created successfully"
        return 0
    else
        log_error "Failed to create collection: $create_response"
        return 1
    fi
}

# Main execution
main() {
    parse_args "$@"
    
    log_info "Starting markdown migration to Qdrant"
    log_info "Log file: $LOG_FILE"
    log_info "Archive file: $ARCHIVE_FILE"
    log_info "Ollama URL: $OLLAMA_URL"
    log_info "Qdrant URL: $QDRANT_URL"
    log_info "Qdrant Collection: $QDRANT_COLLECTION"
    log_info "Apps directory: $APPS_DIR"
    log_info "Memory directory: $MEMORY_DIR"
    
    # Ensure collection exists before processing
    if ! ensure_collection_exists "$QDRANT_COLLECTION"; then
        log_error "Failed to ensure collection exists. Aborting migration."
        exit 1
    fi
    
    if [ -n "$SPECIFIC_REPO" ]; then
        # Process specific repository
        if [ -d "$SPECIFIC_REPO" ]; then
            process_repository "$SPECIFIC_REPO"
        else
            log_error "Repository path not found: $SPECIFIC_REPO"
            exit 1
        fi
    else
        # Process all repositories with .ai-memory
        local repo_count=0
        local processed_count=0
        
        while IFS= read -r repo_path; do
            ((repo_count++))
            if process_repository "$repo_path"; then
                ((processed_count++))
            fi
        done < <(find "$APPS_DIR" -maxdepth 2 -type d -name ".ai-memory" -exec dirname {} \; 2>/dev/null | sort -u)
        
        log_info "Migration complete: Processed $processed_count of $repo_count repositories"
    fi
    
    log_success "Migration process finished. See $LOG_FILE for details."
}

# Run main function
main "$@"
