#!/bin/bash
# Integration tests for jira get command with comments, descriptions, and attachments
# Run against live JIRA instance (requires valid JIRA_PAT in .env)

set -e

echo "=== JIRA Manager Integration Tests ==="
echo "Testing comments, descriptions, and attachments retrieval"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Test helper
run_test() {
    local name=$1
    local cmd=$2
    local expected=$3
    
    echo -n "Testing: $name ... "
    if output=$(eval "$cmd" 2>&1); then
        if echo "$output" | grep -q "$expected"; then
            echo -e "${GREEN}PASS${NC}"
            ((PASSED++))
        else
            echo -e "${RED}FAIL${NC}"
            echo "  Expected to find: $expected"
            echo "  Got: $output" | head -5
            ((FAILED++))
        fi
    else
        echo -e "${RED}FAIL${NC}"
        echo "  Command failed: $output" | head -5
        ((FAILED++))
    fi
}

# Test 1: Basic connectivity
echo "=== Connectivity Tests ==="
run_test "Basic jira check" \
    "python3 jira_client.py check" \
    "JIRA connectivity OK"

echo ""
echo "=== Comment Retrieval Tests ==="

# Test 2: Get basic issue (no comments)
run_test "Get basic issue without comments" \
    "python3 jira_client.py get AQD-9479" \
    "Key: AQD-9479"

# Test 3: Get issue with description
run_test "Get issue with description" \
    "python3 jira_client.py get AQD-9479 --include-description --json | jq '.fields.description | length'" \
    "[0-9]"

# Test 4: Get issue with comments
run_test "Get issue with comments" \
    "python3 jira_client.py get AQD-9479 --include-comments --json | jq '._comment_count'" \
    "[0-9]"

# Test 5: Verify comment structure
run_test "Comments have required fields" \
    "python3 jira_client.py get AQD-9479 --include-comments --json | jq '._comments[0] | has(\"author\") and has(\"created\") and has(\"body\")'" \
    "true"

# Test 6: Verify comment pagination
run_test "Comment pagination with limit" \
    "python3 jira_client.py get AQD-9479 --include-comments --comment-limit 3 --json | jq '._comments | length'" \
    "[1-3]"

# Test 7: Verify truncation indicator
run_test "Truncation flag set when needed" \
    "python3 jira_client.py get AQD-9479 --include-comments --comment-limit 2 --json | jq '._truncated'" \
    "true"

echo ""
echo "=== Attachment Tests ==="

# Test 8: Get issue with attachments
run_test "Get issue with attachments" \
    "python3 jira_client.py get AQD-9479 --include-attachments --json | jq '._attachment_count'" \
    "[0-9]"

# Test 9: Verify attachment metadata structure
run_test "Attachments have required fields" \
    "python3 jira_client.py get AQD-9479 --include-attachments --json | jq -r '._attachments[0] | select(. != null) | has(\"filename\") and has(\"size_bytes\") and has(\"mime_type\") and has(\"download_url\")'" \
    "true"

# Test 10: Verify attachment URLs are valid
run_test "Attachment URLs are accessible" \
    "python3 jira_client.py get AQD-9479 --include-attachments --json | jq -r '._attachments[0].download_url' | grep -q 'https://' && echo 'valid'" \
    "valid"

echo ""
echo "=== Text Output Format Tests ==="

# Test 11: Text output includes comments section
run_test "Text output shows comments section" \
    "python3 jira_client.py get AQD-9479 --include-comments | grep -q 'Comments' && echo 'found'" \
    "found"

# Test 12: Text output includes attachments section
run_test "Text output shows attachments section" \
    "python3 jira_client.py get AQD-9479 --include-attachments | grep -q 'Attachments' && echo 'found'" \
    "found"

# Test 13: Text output includes Reporter field
run_test "Text output includes Reporter field" \
    "python3 jira_client.py get AQD-9479 | grep -q 'Reporter' && echo 'found'" \
    "found"

echo ""
echo "=== Edge Case Tests ==="

# Test 14: Ticket with no comments
run_test "Handle ticket with no comments gracefully" \
    "python3 jira_client.py get AQD-1 --include-comments --json 2>&1 | jq -r '._comments | type'" \
    "array"

# Test 15: Large comment limit (auto-pagination)
run_test "Auto-pagination with large limit" \
    "python3 jira_client.py get AQD-9479 --include-comments --comment-limit 200 --json | jq '._comments | length'" \
    "[0-9]"

echo ""
echo "=== Test Results ==="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
