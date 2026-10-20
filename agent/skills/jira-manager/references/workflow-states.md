# Workflow States and Transitions

## Common Workflow States

| State | Meaning | Typical Transitions |
|-------|---------|-------------------|
| Open | Issue created, not started | Start Progress, Resolve |
| In Progress | Work has started | Dev Complete, Blocked, Resolve |
| Dev Complete | Development finished | QA Review, Resolve |
| QA Review | Quality assurance testing | QA Pass, QA Fail |
| QA Pass | QA approved | Ready for Release, Resolve |
| QA Fail | QA found issues | Reopen, In Progress |
| Ready for Release | Approved for deployment | Release, Resolve |
| Released | Deployed to production | Close, Reopen |
| Resolved | Issue resolved | Close, Reopen |
| Closed | Issue closed | Reopen |
| Blocked | Waiting on external dependency | Unblock, In Progress |

## Discovering Available Transitions

List all available transitions for an issue:

```bash
python3 jira_client.py transitions AQD-123
```

Output example:
```
Available transitions for AQD-123:
  - Start Progress (ID: 11)
  - Resolve (ID: 5)
  - Close (ID: 10)
```

## Common Transition Workflows

### Bug Fix Workflow
```
Open → In Progress → Dev Complete → QA Review → QA Pass → Released → Closed
```

### Feature Development
```
Open → In Progress → Dev Complete → QA Review → QA Pass → Ready for Release → Released
```

### Quick Fix
```
Open → In Progress → Resolve → Closed
```

### Blocked Issue
```
Open → Blocked → In Progress → Dev Complete → QA Review → QA Pass → Released
```

## Using Transitions in CLI

```bash
# Transition to "In Progress"
python3 jira_client.py transition AQD-123 --to "In Progress"

# Transition with comment
python3 jira_client.py transition AQD-123 --to "QA Pass" --comment "All tests passed"

# Transition to "Resolved"
python3 jira_client.py transition AQD-123 --to "Resolved"
```

## Bulk Transitions

Transition all open bugs to "In Progress":

```bash
python3 jira_client.py search --jql 'project = AQD AND type = Bug AND status = Open' | \
  while read issue; do
    python3 jira_client.py transition "$issue" --to "In Progress"
  done
```

## Workflow Customization

Workflows are project-specific. To view your project's workflow:

1. Go to JIRA Project Settings → Workflows
2. View the workflow diagram
3. Note the exact transition names (case-sensitive)
4. Use those names in the CLI: `--to "Exact Transition Name"`

## Troubleshooting Transitions

**Error: "Transition not found"**
- Use `transitions` command to see available options
- Check exact spelling and capitalization
- Ensure issue is in a state that allows the transition

**Error: "You do not have permission"**
- Check your JIRA permissions for the project
- Ensure your PAT has workflow transition permissions

**Error: "Transition requires fields"**
- Some transitions require additional fields (e.g., resolution)
- Add required fields via `--comment` or update issue first
