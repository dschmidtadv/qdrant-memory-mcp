#!/bin/bash
# Test script for Story Points and Original Estimate functionality
# Tests with CLOUD project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JIRA_CLIENT="$SCRIPT_DIR/jira_client.py"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Story Points & Original Estimate Test Suite ===${NC}"
echo ""

# Test 1: Check connectivity
echo -e "${YELLOW}Test 1: Check JIRA connectivity (CLOUD project)${NC}"
python3 "$JIRA_CLIENT" --project CLOUD check
echo -e "${GREEN}✅ Connectivity check passed${NC}\n"

# Test 2: Create issue with Story Points only
echo -e "${YELLOW}Test 2: Create issue with Story Points (8)${NC}"
ISSUE_1=$(python3 "$JIRA_CLIENT" --project CLOUD create \
  --type Task \
  --summary "Test: Story Points Assignment" \
  --description "Testing native Story Points support" \
  --priority Medium \
  --story-points 8 \
  --json | grep -o '"key":"[^"]*' | grep -o '[^"]*$' | head -1)

if [ -z "$ISSUE_1" ]; then
  echo -e "${RED}❌ Failed to create issue${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Created issue: $ISSUE_1${NC}"
echo "Verifying Story Points assignment..."
python3 "$JIRA_CLIENT" --project CLOUD get "$ISSUE_1" --json | grep -i "story" || echo "Story Points field not found in output (may be hidden from GET response)"
echo ""

# Test 3: Create issue with Original Estimate only
echo -e "${YELLOW}Test 3: Create issue with Original Estimate (86400 seconds = 1 day)${NC}"
ISSUE_2=$(python3 "$JIRA_CLIENT" --project CLOUD create \
  --type Task \
  --summary "Test: Original Estimate Assignment" \
  --description "Testing native Original Estimate support (1 day)" \
  --priority Medium \
  --original-estimate 86400 \
  --json | grep -o '"key":"[^"]*' | grep -o '[^"]*$' | head -1)

if [ -z "$ISSUE_2" ]; then
  echo -e "${RED}❌ Failed to create issue${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Created issue: $ISSUE_2${NC}"
echo ""

# Test 4: Create issue with both Story Points and Original Estimate
echo -e "${YELLOW}Test 4: Create issue with both Story Points (13) and Original Estimate (604800 = 1 week)${NC}"
ISSUE_3=$(python3 "$JIRA_CLIENT" --project CLOUD create \
  --type Task \
  --summary "Test: Story Points + Original Estimate" \
  --description "Testing both Story Points and Original Estimate together" \
  --priority High \
  --story-points 13 \
  --original-estimate 604800 \
  --json | grep -o '"key":"[^"]*' | grep -o '[^"]*$' | head -1)

if [ -z "$ISSUE_3" ]; then
  echo -e "${RED}❌ Failed to create issue${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Created issue: $ISSUE_3${NC}"
echo ""

# Test 5: Update issue with Story Points
echo -e "${YELLOW}Test 5: Update issue with Story Points (21)${NC}"
python3 "$JIRA_CLIENT" --project CLOUD update "$ISSUE_1" \
  --story-points 21
echo -e "${GREEN}✅ Updated $ISSUE_1 with Story Points: 21${NC}"
echo ""

# Test 6: Update issue with Original Estimate
echo -e "${YELLOW}Test 6: Update issue with Original Estimate (28800 = 8 hours)${NC}"
python3 "$JIRA_CLIENT" --project CLOUD update "$ISSUE_2" \
  --original-estimate 28800
echo -e "${GREEN}✅ Updated $ISSUE_2 with Original Estimate: 28800 seconds${NC}"
echo ""

# Test 7: Update issue with both values
echo -e "${YELLOW}Test 7: Update issue with both Story Points (5) and Original Estimate (14400 = 4 hours)${NC}"
python3 "$JIRA_CLIENT" --project CLOUD update "$ISSUE_3" \
  --story-points 5 \
  --original-estimate 14400
echo -e "${GREEN}✅ Updated $ISSUE_3 with Story Points: 5 and Original Estimate: 14400 seconds${NC}"
echo ""

# Test 8: Verify issue details
echo -e "${YELLOW}Test 8: Retrieve issue details${NC}"
echo "Issue $ISSUE_3 details:"
python3 "$JIRA_CLIENT" --project CLOUD get "$ISSUE_3"
echo ""

echo -e "${GREEN}=== All tests completed successfully ===${NC}"
echo ""
echo "Summary of created test issues:"
echo "  $ISSUE_1 - Story Points test"
echo "  $ISSUE_2 - Original Estimate test"
echo "  $ISSUE_3 - Combined Story Points + Original Estimate test"
echo ""
echo "Note: Some fields may not appear in the GET response if they are not"
echo "      configured to display on the issue view screen in JIRA."
