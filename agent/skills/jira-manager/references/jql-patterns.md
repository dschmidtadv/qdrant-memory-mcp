# Common JQL Query Patterns

## Status Queries

```jql
# Open issues in project
project = "AQD" AND status = "Open"

# Issues in progress
project = "AQD" AND status = "In Progress"

# Resolved issues
project = "AQD" AND status = "Resolved"

# Issues by multiple statuses
project = "AQD" AND status IN ("Open", "In Progress")
```

## Type Queries

```jql
# All bugs
project = "AQD" AND type = "Bug"

# Bugs and tasks
project = "AQD" AND type IN ("Bug", "Task")

# Everything except subtasks
project = "AQD" AND type != "Sub-task"
```

## Priority Queries

```jql
# High priority issues
project = "AQD" AND priority = "High"

# Critical or high priority
project = "AQD" AND priority IN ("Critical", "High")

# Not low priority
project = "AQD" AND priority != "Low"
```

## Assignee Queries

```jql
# Unassigned issues
project = "AQD" AND assignee = EMPTY

# Assigned to specific user
project = "AQD" AND assignee = "user@example.com"

# Assigned to current user
project = "AQD" AND assignee = currentUser()
```

## Date Queries

```jql
# Created in last 7 days
project = "AQD" AND created >= -7d

# Updated today
project = "AQD" AND updated >= startOfDay()

# Due date in next week
project = "AQD" AND duedate >= now() AND duedate <= now() + 7d
```

## Label Queries

```jql
# Issues with specific label
project = "AQD" AND labels = "automated"

# Issues with any of multiple labels
project = "AQD" AND labels IN ("bug", "urgent")

# Issues without label
project = "AQD" AND labels = EMPTY
```

## Complex Queries

```jql
# Open bugs assigned to me, high priority
project = "AQD" AND type = "Bug" AND status = "Open" AND assignee = currentUser() AND priority = "High"

# Unresolved issues created in last 30 days
project = "AQD" AND status != "Resolved" AND created >= -30d

# Issues with specific label, not assigned, high priority
project = "AQD" AND labels = "automated" AND assignee = EMPTY AND priority >= "High"
```

## Useful Functions

- `currentUser()` - Current logged-in user
- `startOfDay()` - Start of current day
- `now()` - Current timestamp
- `-7d` - 7 days ago
- `EMPTY` - No value set
- `IN (...)` - Multiple values
- `!=` - Not equal
- `>=` - Greater than or equal
