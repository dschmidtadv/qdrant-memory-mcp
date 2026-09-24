# JIRA Manager Skill - Test Guide

## Test Environment Setup

### Prerequisites

1. **JIRA Instance Access**
   - Jira Server/Data Center instance (e.g., https://your-jira-instance.example.com/jira)
   - Personal Access Token (PAT) with permissions to create/update issues
   - Project key (e.g., AQD)

2. **Python Environment**
   - Python 3.7+
   - No external dependencies required (stdlib only)

3. **Configuration**
   ```bash
   # Create .env file in project root
   cat > .env << 'EOF'
   JIRA_INSTANCE_URL=https://your-jira-instance.example.com/jira
   JIRA_PAT=your-personal-access-token-here
   JIRA_PROJECT_KEY=AQD
   EOF
   ```

## Test Execution Plan

### Phase 1: Configuration & Connectivity Tests

#### Test 1.1: Configuration Loading
```bash
# Test: .env file loading
cd skills/jira-manager/scripts
python3 -c "from jira_config import JiraConfig; c = JiraConfig(); print('✅ Config loaded:', c.to_dict())"
```

**Expected Output:**
```
✅ Config loaded: {'instance_url': 'https://your-jira-instance.example.com/jira', 'project_key': 'AQD', 'pat': '***xxxx'}
```

**Validation:**
- ✅ .env file parsed correctly
- ✅ Environment variables loaded
- ✅ PAT masked in output (security check)

#### Test 1.2: JIRA Connectivity
```bash
python3 jira_client.py check
```

**Expected Output:**
```
✅ JIRA connectivity OK
Instance: https://your-jira-instance.example.com/jira
Project: AQD
```

**Validation:**
- ✅ Connection successful
- ✅ Authentication valid
- ✅ Instance URL correct
- ✅ Project key accessible

#### Test 1.3: Missing Configuration
```bash
# Test: Missing .env file
rm .env
python3 jira_client.py check 2>&1 | head -5
```

**Expected Output:**
```
Error: Missing required environment variables: JIRA_INSTANCE_URL, JIRA_PAT, JIRA_PROJECT_KEY
```

**Validation:**
- ✅ Clear error message
- ✅ Lists missing variables
- ✅ Graceful failure

### Phase 2: Issue Creation Tests

#### Test 2.1: Create Issue from CLI Arguments
```bash
python3 jira_client.py create \
  --type Bug \
  --summary "Test Bug - $(date +%s)" \
  --description "Automated test issue" \
  --priority High
```

**Expected Output:**
```
✅ Created ticket: AQD-XXXX
```

**Validation:**
- ✅ Issue created successfully
- ✅ Issue key returned
- ✅ All fields set correctly

#### Test 2.2: Create Issue from Template
```bash
python3 jira_client.py create \
  --template ../templates/bug.json \
  --summary "Template Bug - $(date +%s)" \
  --description "Created from template"
```

**Expected Output:**
```
✅ Created ticket: AQD-XXXX
```

**Validation:**
- ✅ Template loaded
- ✅ ${JIRA_PROJECT_KEY} substituted
- ✅ Overrides applied
- ✅ Issue created with template defaults

#### Test 2.3: Create Issue with All Fields
```bash
python3 jira_client.py create \
  --type Task \
  --summary "Full Test - $(date +%s)" \
  --description "Test with all fields" \
  --priority Medium \
  --assignee user@example.com \
  --labels "test,automated" \
  --json
```

**Expected Output:**
```
✅ Created ticket: AQD-XXXX
{
  "id": "...",
  "key": "AQD-XXXX",
  "self": "...",
  ...
}
```

**Validation:**
- ✅ All fields set
- ✅ JSON output valid
- ✅ Labels parsed correctly

#### Test 2.4: Create Issue - Missing Required Field
```bash
python3 jira_client.py create --type Bug 2>&1
```

**Expected Output:**
```
Error: ❌ Validation error: {'summary': 'Summary is required'}
```

**Validation:**
- ✅ Validation error caught
- ✅ Clear error message
- ✅ Required field identified

### Phase 3: Issue Retrieval Tests

#### Test 3.1: Get Issue Details
```bash
# Use issue created in Test 2.1
ISSUE_KEY="AQD-XXXX"
python3 jira_client.py get $ISSUE_KEY
```

**Expected Output:**
```
Key: AQD-XXXX
Summary: Test Bug - 1234567890
Status: Open
Priority: High
Assignee: Unassigned
```

**Validation:**
- ✅ Issue retrieved
- ✅ All fields displayed
- ✅ Correct values shown

#### Test 3.2: Get Issue - JSON Output
```bash
python3 jira_client.py get $ISSUE_KEY --json | python3 -m json.tool | head -20
```

**Expected Output:**
```json
{
  "expand": "...",
  "id": "...",
  "key": "AQD-XXXX",
  "self": "...",
  "fields": {
    "summary": "Test Bug - 1234567890",
    "status": {
      "name": "Open"
    },
    ...
  }
}
```

**Validation:**
- ✅ Valid JSON output
- ✅ All fields present
- ✅ Nested structure correct

#### Test 3.3: Get Issue - Not Found
```bash
python3 jira_client.py get INVALID-999 2>&1
```

**Expected Output:**
```
Error: ❌ Resource not found: /issue/INVALID-999
```

**Validation:**
- ✅ 404 error handled
- ✅ Clear error message
- ✅ Graceful failure

### Phase 4: Issue Update Tests

#### Test 4.1: Update Issue Summary
```bash
python3 jira_client.py update $ISSUE_KEY \
  --summary "Updated Summary - $(date +%s)"
```

**Expected Output:**
```
✅ Updated ticket: AQD-XXXX
```

**Validation:**
- ✅ Update successful
- ✅ Verify with `get` command

#### Test 4.2: Update Multiple Fields
```bash
python3 jira_client.py update $ISSUE_KEY \
  --priority Critical \
  --description "Updated description"
```

**Expected Output:**
```
✅ Updated ticket: AQD-XXXX
```

**Validation:**
- ✅ Multiple fields updated
- ✅ Verify with `get` command

### Phase 5: Comment Tests

#### Test 5.1: Add Comment
```bash
python3 jira_client.py comment $ISSUE_KEY \
  --body "Test comment - $(date)"
```

**Expected Output:**
```
✅ Added comment to: AQD-XXXX
```

**Validation:**
- ✅ Comment added
- ✅ Verify in JIRA UI

#### Test 5.2: Add Comment with Special Characters
```bash
python3 jira_client.py comment $ISSUE_KEY \
  --body "Test with special chars: @#$%^&*() and unicode: 你好"
```

**Expected Output:**
```
✅ Added comment to: AQD-XXXX
```

**Validation:**
- ✅ Special characters handled
- ✅ Unicode preserved

### Phase 6: Workflow Transition Tests

#### Test 6.1: List Available Transitions
```bash
python3 jira_client.py transitions $ISSUE_KEY
```

**Expected Output:**
```
Available transitions for AQD-XXXX:
  - Start Progress (ID: 11)
  - Resolve (ID: 5)
  - Close (ID: 10)
```

**Validation:**
- ✅ Transitions listed
- ✅ IDs shown
- ✅ At least one transition available

#### Test 6.2: Transition Issue
```bash
python3 jira_client.py transition $ISSUE_KEY --to "Start Progress"
```

**Expected Output:**
```
✅ Transitioned AQD-XXXX to 'Start Progress'
```

**Validation:**
- ✅ Transition successful
- ✅ Verify status changed with `get` command

#### Test 6.3: Transition with Comment
```bash
python3 jira_client.py transition $ISSUE_KEY \
  --to "Resolve" \
  --comment "Issue resolved in testing"
```

**Expected Output:**
```
✅ Transitioned AQD-XXXX to 'Resolve'
```

**Validation:**
- ✅ Transition successful
- ✅ Comment added
- ✅ Verify both in JIRA UI

#### Test 6.4: Invalid Transition
```bash
python3 jira_client.py transition $ISSUE_KEY --to "Invalid State" 2>&1
```

**Expected Output:**
```
Error: ❌ Transition 'Invalid State' not found.
Available: Start Progress, Resolve, Close
```

**Validation:**
- ✅ Error caught
- ✅ Available transitions listed
- ✅ Helpful error message

### Phase 7: Search Tests

#### Test 7.1: Search by Status
```bash
python3 jira_client.py search --jql 'project = AQD AND status = "Open"' --max 5
```

**Expected Output:**
```
Found N issues:
  AQD-123: Issue summary 1
  AQD-124: Issue summary 2
  ...
```

**Validation:**
- ✅ Search executed
- ✅ Results returned
- ✅ Correct format

#### Test 7.2: Search with JSON Output
```bash
python3 jira_client.py search \
  --jql 'project = AQD AND type = Bug' \
  --max 3 \
  --json | python3 -m json.tool | head -30
```

**Expected Output:**
```json
[
  {
    "key": "AQD-XXX",
    "fields": {
      "summary": "...",
      ...
    }
  },
  ...
]
```

**Validation:**
- ✅ Valid JSON
- ✅ Correct structure
- ✅ All fields present

#### Test 7.3: Empty Search Results
```bash
python3 jira_client.py search --jql 'project = AQD AND summary ~ "NONEXISTENT_PATTERN_XYZ"'
```

**Expected Output:**
```
Found 0 issues:
```

**Validation:**
- ✅ Handles empty results
- ✅ No errors
- ✅ Clear message

### Phase 8: Link Tests

#### Test 8.1: Link Two Issues
```bash
# Create two test issues first
ISSUE1=$(python3 jira_client.py create --type Task --summary "Link Test 1 - $(date +%s)" | grep -oP 'AQD-\d+')
ISSUE2=$(python3 jira_client.py create --type Task --summary "Link Test 2 - $(date +%s)" | grep -oP 'AQD-\d+')

python3 jira_client.py link $ISSUE1 $ISSUE2 --type "relates to"
```

**Expected Output:**
```
✅ Linked AQD-XXXX to AQD-YYYY (relates to)
```

**Validation:**
- ✅ Link created
- ✅ Verify in JIRA UI

### Phase 9: Error Handling Tests

#### Test 9.1: Authentication Error
```bash
# Corrupt PAT in .env
sed -i 's/JIRA_PAT=.*/JIRA_PAT=invalid-token/' .env
python3 jira_client.py check 2>&1
```

**Expected Output:**
```
Error: ❌ Authentication failed. Check JIRA_PAT.
```

**Validation:**
- ✅ 401 error caught
- ✅ Clear error message
- ✅ Actionable guidance

#### Test 9.2: Connection Error
```bash
# Invalid instance URL
sed -i 's|JIRA_INSTANCE_URL=.*|JIRA_INSTANCE_URL=https://invalid-host-xyz.example.com|' .env
python3 jira_client.py check 2>&1
```

**Expected Output:**
```
Error: ❌ Connection error: ...
```

**Validation:**
- ✅ Connection error caught
- ✅ Clear error message

### Phase 10: Integration Tests

#### Test 10.1: Complete Workflow
```bash
# 1. Create issue
ISSUE=$(python3 jira_client.py create \
  --template ../templates/bug.json \
  --summary "Integration Test - $(date +%s)" \
  --description "Full workflow test" | grep -oP 'AQD-\d+')

echo "Created: $ISSUE"

# 2. Get issue
python3 jira_client.py get $ISSUE

# 3. Add comment
python3 jira_client.py comment $ISSUE --body "Starting investigation"

# 4. Transition
python3 jira_client.py transition $ISSUE --to "Start Progress"

# 5. Update
python3 jira_client.py update $ISSUE --priority Critical

# 6. Get final state
python3 jira_client.py get $ISSUE
```

**Validation:**
- ✅ All operations succeed
- ✅ State changes reflected
- ✅ No errors

## Test Execution Checklist

```bash
# Run all tests in sequence
cd skills/jira-manager/scripts

# Phase 1: Configuration
echo "=== Phase 1: Configuration ===" && \
python3 -c "from jira_config import JiraConfig; c = JiraConfig(); print('✅ Config OK')" && \
python3 jira_client.py check && \

# Phase 2: Create
echo "=== Phase 2: Create ===" && \
ISSUE=$(python3 jira_client.py create --type Bug --summary "Test $(date +%s)" | grep -oP 'AQD-\d+') && \
echo "Created: $ISSUE" && \

# Phase 3: Get
echo "=== Phase 3: Get ===" && \
python3 jira_client.py get $ISSUE && \

# Phase 4: Update
echo "=== Phase 4: Update ===" && \
python3 jira_client.py update $ISSUE --priority Critical && \

# Phase 5: Comment
echo "=== Phase 5: Comment ===" && \
python3 jira_client.py comment $ISSUE --body "Test comment" && \

# Phase 6: Transitions
echo "=== Phase 6: Transitions ===" && \
python3 jira_client.py transitions $ISSUE && \

# Phase 7: Search
echo "=== Phase 7: Search ===" && \
python3 jira_client.py search --jql "project = AQD AND key = $ISSUE" && \

echo "✅ All tests passed!"
```

## Success Criteria

- ✅ All 10 phases execute without errors
- ✅ Configuration loads from .env
- ✅ JIRA connectivity verified
- ✅ Issues created, retrieved, updated
- ✅ Comments added successfully
- ✅ Workflow transitions work
- ✅ Search returns results
- ✅ Error handling is graceful
- ✅ JSON output is valid
- ✅ No external dependencies required

## Cleanup

```bash
# Delete test issues created during testing
python3 jira_client.py search --jql 'project = AQD AND summary ~ "Test\|Integration"' | \
  grep -oP 'AQD-\d+' | \
  while read issue; do
    echo "Note: Manual deletion required for $issue (no delete API in this skill)"
  done
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: No module named 'jira_config'` | Ensure you're in `skills/jira-manager/scripts/` directory |
| `JIRA_PAT not found` | Create `.env` file in project root with required variables |
| `401 Unauthorized` | Verify PAT is valid and not expired |
| `404 Not Found` | Check JIRA_INSTANCE_URL and issue key |
| `Transition not found` | Use `transitions` command to see available options |
| `Connection refused` | Verify JIRA instance is accessible and firewall allows connection |
