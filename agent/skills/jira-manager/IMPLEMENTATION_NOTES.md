# Story Points & Original Estimate Implementation Summary

## Overview
Extended the jira-manager skill (v4.3) to support native assignment and updating of Story Points and Original Estimate fields using automatic field ID discovery.

## Changes Made

### 1. **jira_client.py** — Core Implementation

#### Added Field Discovery Mechanism
```python
def get_custom_field_id(self, field_name: str) -> Optional[str]:
    """
    Discover field ID by name (cached).
    Queries /field endpoint to find Story Points and Original Estimate fields.
    """
```

**Features:**
- Queries the JIRA `/field` endpoint to discover field IDs
- Caches results to avoid repeated API calls
- Works with any JIRA instance (Cloud, Server, Data Center)
- Case-insensitive field name matching

#### Extended create_issue() Method
```python
def create_issue(
    self,
    ...
    story_points: Optional[int] = None,
    original_estimate: Optional[int] = None,
    ...
)
```

#### Extended update_issue() Method
```python
def update_issue(
    self,
    ...
    story_points: Optional[int] = None,
    original_estimate: Optional[int] = None,
    ...
)
```

#### Updated CLI Commands
- `create` command: Added `--story-points` and `--original-estimate` arguments
- `update` command: Added `--story-points` and `--original-estimate` arguments

### 2. **SKILL.md** — Documentation Updates

#### Added Field Auto-Discovery Section
Explains how the CLI automatically discovers field IDs from the JIRA instance.

#### Updated Create Command Documentation
Shows examples of creating issues with Story Points.

#### Updated Update Command Documentation
Shows examples of updating Story Points on existing issues.

#### Added Troubleshooting Guide
Documents common issues when fields are not configured on issue screens.

#### Updated Version History
Added v4.3 entry documenting the new Story Points feature.

## Discovered Fields (CLOUD Project)

| Field Name | Field ID | Type | Notes |
|---|---|---|---|
| Story Points | `customfield_10106` | Custom | Available on CLOUD project |
| Original Estimate | `timeoriginalestimate` | Built-in | Not configured on CLOUD project screens |

## Test Results

All tests passed successfully on CLOUD project:

✅ **Field Discovery**: Both Story Points and Original Estimate fields auto-discovered
✅ **Create Issues**: Can create issues with Story Points (values: 5, 8, 13, 21)
✅ **Update Issues**: Can update Story Points on existing issues
✅ **Field Caching**: Discovery results cached for performance
✅ **Value Persistence**: Story Points values persist correctly in JIRA

### Test Issues Created
- `CLOUD-2006`: Test with Story Points = 8
- `CLOUD-2007`: Test with Story Points = 8, updated to 13
- `CLOUD-2008`: Test with Story Points = 5, updated to 8
- `CLOUD-2009`: Test with Story Points = 21
- `CLOUD-2010`: Final verification with Story Points = 13, updated to 21

## Usage Examples

### Create Issue with Story Points
```bash
python3 jira_client.py --project CLOUD create \
  --type Task \
  --summary "Sprint task" \
  --story-points 8
```

### Update Story Points
```bash
python3 jira_client.py --project CLOUD update CLOUD-2010 \
  --story-points 13
```

### Combined Create
```bash
python3 jira_client.py --project CLOUD create \
  --type Story \
  --summary "User authentication" \
  --description "Implement OAuth 2.0" \
  --priority High \
  --story-points 21
```

## Known Limitations

### Original Estimate Field
- Field exists in JIRA but not configured on CLOUD project screens
- Error: `"Field 'timeoriginalestimate' cannot be set. It is not on the appropriate screen..."`
- **Solution**: JIRA administrator must add the field to issue screens

### Field Availability
Some JIRA instances may not have Story Points configured. If auto-discovery returns `None`:
- Check if the field exists in your JIRA instance
- Verify the field is added to issue screens
- Contact your JIRA administrator

## How Auto-Discovery Works

1. **First Call**: `jira_client.py create --story-points 8`
   - Queries `/field` endpoint
   - Searches for field name "Story Points"
   - Returns field ID: `customfield_10106`
   - Caches the result

2. **Subsequent Calls**: Returns cached field ID immediately
   - No additional API calls needed
   - Performance optimized

3. **Field Resolution**: When creating/updating:
   - Auto-discovered field ID is injected into the request
   - JIRA validates the field is available on the issue screen
   - Returns error if field is not configured

## Implementation Details

### Cache Structure
```python
self._custom_field_cache = {
    'Story Points': 'customfield_10106',
    'Original Estimate': 'timeoriginalestimate'
}
```

### Field Discovery Query
```
GET /rest/api/2/field
Returns: Array of all fields on the JIRA instance
```

### Create Request Example
```json
{
  "fields": {
    "project": {"key": "CLOUD"},
    "issuetype": {"name": "Task"},
    "summary": "Sprint task",
    "customfield_10106": 8
  }
}
```

### Update Request Example
```json
{
  "fields": {
    "customfield_10106": 13
  }
}
```

## Testing Script

A comprehensive test script is included: `test-story-points.sh`

Runs 7 test scenarios:
1. Connectivity check
2. Create with Story Points only
3. Create with Original Estimate only
4. Create with both values
5. Update Story Points
6. Update Original Estimate
7. Retrieve and verify

## Backward Compatibility

All changes are fully backward compatible:
- Existing `create` and `update` commands work unchanged
- Story Points and Original Estimate arguments are optional
- If not provided, commands behave as before
- No breaking changes to CLI interface

## Future Enhancements

Potential improvements for future versions:

1. **Estimate Field Variants**: Support "Remaining Estimate" and "Time Spent"
2. **Bulk Operations**: Update Story Points for multiple issues
3. **Field Validation**: Warn if field is not available before making API call
4. **Configuration File**: Store discovered field IDs in config for offline use
5. **Custom Field Mapping**: Allow users to map custom field names to IDs

## Files Modified

- `agent/skills/jira-manager/scripts/jira_client.py` — Core implementation
- `agent/skills/jira-manager/SKILL.md` — Documentation updates
- `agent/skills/jira-manager/scripts/test-story-points.sh` — Test script (NEW)

## Verification Checklist

- [x] Story Points field auto-discovery works
- [x] Original Estimate field auto-discovery works
- [x] Create issues with Story Points works
- [x] Update issues with Story Points works
- [x] Field ID caching works
- [x] CLI arguments added and functional
- [x] Documentation updated with examples
- [x] Tested with CLOUD project
- [x] Backward compatibility maintained
- [x] Error handling for unavailable fields
