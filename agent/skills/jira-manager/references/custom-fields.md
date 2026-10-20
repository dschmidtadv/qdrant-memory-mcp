# Custom Fields Reference

## Field ID Mapping

Custom field IDs vary by JIRA instance. Use the following command to discover your instance's custom field IDs:

```bash
python3 jira_client.py get CLOUD-1 --json | grep -i "customfield"
```

Or query the JIRA API directly:

```bash
curl -H "Authorization: Bearer $JIRA_PAT" \
  https://your-jira-instance/rest/api/2/field | jq '.[] | select(.custom==true)'
```

## Custom Fields (example — your field IDs will differ)

### Linking Fields (Discovered)

| Field Name | Field ID | Type | Usage | CLI Support |
|-----------|----------|------|-------|-------------|
| Epic Link | customfield_10100 | Link | Links issue to epic | `--type epic` |
| Parent Link | customfield_10901 | Link | Links to parent issue | `--type parent` |
| Initiative Link | customfield_11022 | Link | Links to initiative | `--type initiative` |

### Other Custom Fields

| Field Name | Field ID | Type | Usage |
|-----------|----------|------|-------|
| Epic Name | customfield_10102 | String | Epic name (required for Epic type) |
| Story Points | customfield_10105 | Number | Agile story points |
| Rank | customfield_10105 | Any | Issue ranking |
| Sprint | customfield_10104 | Array | Sprint assignment |
| Team | customfield_10900 | Any | Team assignment |
| Target start | customfield_10902 | Date | Target start date |
| Target end | customfield_10903 | Date | Target end date |
| Checklist Text | customfield_11200 | String | Checklist items |
| Detailed Feedback | customfield_11201 | String | Feedback details |
| Development Test Results | customfield_10233 | String | Test results |
| Commitment | customfield_11202 | Option | Commitment level |
| Requested On | customfield_11203 | Date | Request date |
| Tag Number | customfield_10234 | String | Tag identifier |
| Tag Date | customfield_10235 | Date | Tag date |
| Found In | customfield_10500 | Array | Found in version |
| Development | customfield_10225 | String | Development status |
| Testing | customfield_10226 | String | Testing status |
| DB/Server | customfield_10227 | String | Database/Server info |
| Deployment | customfield_10228 | String | Deployment status |
| Documentation | customfield_10229 | String | Documentation status |

## Using Custom Fields in Templates

Add custom fields to `templates/bug.json`:

```json
{
  "project": "${JIRA_PROJECT_KEY}",
  "issuetype": "Bug",
  "priority": "High",
  "fields": {
    "customfield_10200": ["Backend"],
    "customfield_10201": "Production",
    "customfield_10202": "Database connection pool exhaustion"
  }
}
```

## Using Custom Fields in CLI

```bash
# Create issue with custom fields (requires JSON)
python3 jira_client.py create \
  --type Bug \
  --summary "Database issue" \
  --priority High
  # Note: Custom fields must be added via template or direct API call
```

## Discovering Your Instance's Fields

Run this to get all available fields:

```bash
curl -s -H "Authorization: Bearer $JIRA_PAT" \
  https://your-jira-instance/rest/api/2/field | \
  python3 -m json.tool | grep -A5 '"custom": true'
```

Look for:
- `id` - The field ID (e.g., `customfield_10100`)
- `name` - Human-readable name
- `schema.type` - Field type (string, number, array, etc.)
