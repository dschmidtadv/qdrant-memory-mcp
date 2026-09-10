#!/usr/bin/env python3
"""
JIRA Manager - Programmatic JIRA ticket management CLI
Supports Jira Cloud and Jira Server/Data Center instances
Uses stdlib urllib only - no external dependencies required

Cross-repo invocation: this script can be called from ANY working directory.
sys.path is patched at startup so jira_config is always importable regardless
of where the caller's cwd is.
"""

import sys
import os
from pathlib import Path

# --- Cross-repo path fix ---
# Insert the directory containing THIS file into sys.path so that
# `from jira_config import ...` resolves correctly even when the caller's
# cwd is a completely different repository.
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
# --- end path fix ---

import json
import urllib.request
import urllib.error
import urllib.parse
import argparse
from typing import Dict, List, Optional, Any
from jira_config import JiraConfig, load_template


class JiraClient:
    """JIRA API client using stdlib urllib"""
    
    def __init__(self, config: JiraConfig):
        """Initialize JIRA client"""
        self.config = config
        self.base_url = f"{config.instance_url}/rest/api/2"
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        """Make HTTP request to JIRA API"""
        url = f"{self.base_url}{endpoint}"
        
        if params:
            url += "?" + urllib.parse.urlencode(params)
        
        headers = self.config.get_headers()
        
        try:
            if data:
                data_bytes = json.dumps(data).encode('utf-8')
                req = urllib.request.Request(
                    url,
                    data=data_bytes,
                    headers=headers,
                    method=method
                )
            else:
                req = urllib.request.Request(
                    url,
                    headers=headers,
                    method=method
                )
            
            with urllib.request.urlopen(req, context=self.config.ssl_context) as response:
                response_data = response.read().decode('utf-8')
                return json.loads(response_data) if response_data else {}
        
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            if e.code == 401:
                raise Exception("❌ Authentication failed. Check JIRA_PAT.")
            elif e.code == 404:
                raise Exception(f"❌ Resource not found: {endpoint}")
            elif e.code == 400:
                try:
                    error_data = json.loads(error_body)
                    if 'errors' in error_data:
                        raise Exception(f"❌ Validation error: {error_data['errors']}")
                except json.JSONDecodeError:
                    pass
                raise Exception(f"❌ Bad request: {error_body}")
            else:
                raise Exception(f"❌ HTTP {e.code}: {error_body}")
        
        except urllib.error.URLError as e:
            raise Exception(f"❌ Connection error: {e.reason}")
    
    def check_connectivity(self) -> bool:
        """Test JIRA connectivity"""
        try:
            self._make_request("GET", "/myself")
            return True
        except Exception as e:
            print(f"Connection check failed: {e}")
            return False
    
    def create_issue(
        self,
        issue_type: str,
        summary: str,
        description: Optional[str] = None,
        priority: Optional[str] = None,
        assignee: Optional[str] = None,
        labels: Optional[List[str]] = None,
        custom_fields: Optional[Dict] = None
    ) -> Dict:
        """Create a new JIRA issue"""
        fields = {
            "project": {"key": self.config.project_key},
            "issuetype": {"name": issue_type},
            "summary": summary
        }
        
        if description:
            fields["description"] = description
        if priority:
            fields["priority"] = {"name": priority}
        if assignee:
            fields["assignee"] = {"emailAddress": assignee}
        if labels:
            fields["labels"] = labels
        if custom_fields:
            fields.update(custom_fields)
        
        return self._make_request("POST", "/issue", {"fields": fields})
    
    def get_issue(self, issue_key: str, include_description: bool = False,
                  include_comments: bool = False, include_attachments: bool = False,
                  comment_limit: int = 50) -> Dict:
        """
        Get issue details with optional description, comments, and attachments.
        
        Args:
            issue_key: Issue key (e.g., "AQD-123")
            include_description: Include full issue description (default: False)
            include_comments: Include all ticket comments (default: False)
            include_attachments: Include metadata for all attached files (default: False)
            comment_limit: Max comments to retrieve (default: 50, max: 100)
        
        Returns:
            Issue dict with optional '_description', '_comments', '_attachments' keys
        """
        issue = self._make_request("GET", f"/issue/{issue_key}")
        
        # Extract description if requested (it's already in the response)
        if include_description:
            description = issue.get("fields", {}).get("description")
            if description:
                issue["_description"] = description
        
        # Fetch comments if requested
        if include_comments:
            try:
                comments, total, truncated = self.get_all_comments(issue_key, limit=comment_limit)
                issue["_comments"] = comments
                issue["_comment_count"] = total
                issue["_truncated"] = truncated
            except Exception as e:
                issue["_comments"] = []
                issue["_comment_error"] = str(e)
        
        # Extract attachments if requested (already in response)
        if include_attachments:
            attachments = issue.get("fields", {}).get("attachment", [])
            if attachments:
                issue["_attachments"] = [
                    {
                        "id": att.get("id"),
                        "filename": att.get("filename"),
                        "size_bytes": att.get("size"),
                        "mime_type": att.get("mimeType"),
                        "created": att.get("created"),
                        "author": att.get("author", {}).get("displayName") or att.get("author", {}).get("name"),
                        "download_url": att.get("content"),
                        "thumbnail_url": att.get("thumbnail")
                    }
                    for att in attachments
                ]
                issue["_attachment_count"] = len(attachments)
            else:
                issue["_attachments"] = []
                issue["_attachment_count"] = 0
        
        return issue
    
    def get_comments(self, issue_key: str, max_results: int = 50, start_at: int = 0) -> Dict:
        """
        Fetch comments for an issue with pagination support.
        
        Args:
            issue_key: Issue key (e.g., "AQD-479")
            max_results: Max comments per request (default: 50, max: 100)
            start_at: Pagination offset (default: 0)
        
        Returns:
            Dict with 'comments', 'total', 'startAt', 'maxResults' keys
        """
        params = {
            "maxResults": min(max_results, 100),  # Jira API max is 100
            "startAt": start_at
        }
        return self._make_request("GET", f"/issue/{issue_key}/comment", params=params)
    
    def get_all_comments(self, issue_key: str, limit: int = 50) -> tuple:
        """
        Fetch all comments up to `limit` with automatic pagination.
        
        Args:
            issue_key: Issue key (e.g., "AQD-479")
            limit: Total number of comments to retrieve (default: 50)
        
        Returns:
            Tuple of (comments: List[Dict], total: int, truncated: bool)
        """
        all_comments = []
        start_at = 0
        batch_size = min(limit, 100)  # Max per Jira API request
        total = 0

        while True:
            resp = self.get_comments(issue_key, max_results=batch_size, start_at=start_at)
            batch = resp.get("comments", [])
            all_comments.extend(batch)
            total = resp.get("total", 0)
            start_at += len(batch)

            # Stop conditions: hit user limit, exhausted all comments, or empty page
            if len(all_comments) >= limit or start_at >= total or not batch:
                break

        truncated = len(all_comments) < total
        return all_comments[:limit], total, truncated
    
    def update_issue(
        self,
        issue_key: str,
        summary: Optional[str] = None,
        description: Optional[str] = None,
        priority: Optional[str] = None,
        assignee: Optional[str] = None,
        labels: Optional[List[str]] = None,
        custom_fields: Optional[Dict] = None
    ) -> Dict:
        """Update an existing JIRA issue"""
        fields = {}
        
        if summary:
            fields["summary"] = summary
        if description:
            fields["description"] = description
        if priority:
            fields["priority"] = {"name": priority}
        if assignee:
            fields["assignee"] = {"emailAddress": assignee}
        if labels:
            fields["labels"] = labels
        if custom_fields:
            fields.update(custom_fields)
        
        return self._make_request("PUT", f"/issue/{issue_key}", {"fields": fields})
    
    def add_comment(self, issue_key: str, comment: str) -> Dict:
        """Add comment to issue"""
        return self._make_request(
            "POST",
            f"/issue/{issue_key}/comment",
            {"body": comment}
        )
    
    def get_transitions(self, issue_key: str) -> List[Dict]:
        """Get available transitions for an issue"""
        response = self._make_request("GET", f"/issue/{issue_key}/transitions")
        return response.get("transitions", [])
    
    def transition_issue(
        self,
        issue_key: str,
        transition_name: str,
        comment: Optional[str] = None
    ) -> Dict:
        """Transition issue to new state"""
        transitions = self.get_transitions(issue_key)
        
        transition_id = None
        for t in transitions:
            if t["name"].lower() == transition_name.lower():
                transition_id = t["id"]
                break
        
        if not transition_id:
            available = [t["name"] for t in transitions]
            raise Exception(
                f"❌ Transition '{transition_name}' not found.\n"
                f"Available: {', '.join(available)}"
            )
        
        data = {"transition": {"id": transition_id}}
        if comment:
            data["update"] = {"comment": [{"add": {"body": comment}}]}
        
        return self._make_request("POST", f"/issue/{issue_key}/transitions", data)
    
    def search_issues(self, jql: str, max_results: int = 50) -> List[Dict]:
        """Search for issues using JQL"""
        response = self._make_request(
            "GET",
            "/search",
            params={"jql": jql, "maxResults": max_results}
        )
        return response.get("issues", [])
    
    def get_link_types(self) -> List[Dict]:
        """
        Get all available issue link types on this JIRA instance.
        Returns list of link type objects with 'name' and optional 'inward'/'outward'.
        """
        response = self._make_request("GET", "/issueLinkType")
        return response.get("issueLinkTypes", [])

    def link_issues(
        self,
        from_issue: str,
        to_issue: str,
        link_type: str = "relates to"
    ) -> Dict:
        """
        Link two issues using the appropriate API endpoint.
        
        Routing strategy:
        - If link_type is in ["epic", "parent", "initiative"]: use custom field PUT
        - Otherwise: use standard /issueLink POST endpoint
        
        Standard relationship types (via /issueLink):
          - "relates to"
          - "blocks"
          - "is blocked by"
          - "clones"
          - "is cloned by"
          - "duplicates"
          - "is duplicated by"
          (full list via get_link_types())
        
        Hierarchical types (via custom field PUT):
          - "epic": customfield_10100
          - "parent": customfield_10901
          - "initiative": customfield_11022
        """
        # Hierarchical (custom field) link types
        hierarchical_fields = {
            "epic": "customfield_10100",
            "parent": "customfield_10901",
            "initiative": "customfield_11022"
        }
        
        link_type_lower = link_type.lower()
        
        # Route 1: Hierarchical link via custom field PUT
        if link_type_lower in hierarchical_fields:
            field_id = hierarchical_fields[link_type_lower]
            try:
                return self._make_request(
                    "PUT",
                    f"/issue/{to_issue}",
                    {
                        "fields": {
                            field_id: {"key": from_issue}
                        }
                    }
                )
            except Exception as e:
                if "not on the appropriate screen" in str(e):
                    raise Exception(
                        f"❌ Link field '{link_type}' not available on issue screen.\n"
                        f"Configure in JIRA Project Settings → Issue Types → Screens"
                    )
                raise
        
        # Route 2: Standard relationship link via /issueLink POST
        else:
            # Find the exact link type name (case-insensitive match)
            available_types = self.get_link_types()
            matched_type = None
            for lt in available_types:
                if lt.get("name", "").lower() == link_type_lower:
                    matched_type = lt
                    break
            
            if not matched_type:
                available_names = [lt.get("name") for lt in available_types]
                raise Exception(
                    f"❌ Link type '{link_type}' not recognized.\n"
                    f"Run 'jira link-types' to see valid names.\n"
                    f"Available: {', '.join(available_names)}"
                )
            
            # Use inwardIssue for source → target direction
            return self._make_request(
                "POST",
                "/issueLink",
                {
                    "type": {"name": matched_type["name"]},
                    "inwardIssue": {"key": to_issue},
                    "outwardIssue": {"key": from_issue}
                }
            )


def cmd_check(args, config: JiraConfig) -> None:
    """Check JIRA connectivity"""
    client = JiraClient(config)
    if client.check_connectivity():
        print("✅ JIRA connectivity OK")
        print(f"Instance: {config.instance_url}")
        print(f"Project: {config.project_key}")
    else:
        sys.exit(1)


def cmd_create(args, config: JiraConfig) -> None:
    """Create a new JIRA issue"""
    client = JiraClient(config)
    
    # Load template if provided
    if args.template:
        template = load_template(args.template)
        fields = template.get("fields", {})
    else:
        fields = {}
    
    # Override with command-line arguments
    if args.summary:
        fields["summary"] = args.summary
    if args.description:
        fields["description"] = args.description
    if args.priority:
        fields["priority"] = args.priority
    if args.assignee:
        fields["assignee"] = args.assignee
    if args.labels:
        fields["labels"] = args.labels.split(",")
    
    issue_type = fields.pop("issuetype", args.type or "Task")
    
    result = client.create_issue(
        issue_type=issue_type,
        summary=fields.pop("summary"),
        description=fields.pop("description", None),
        priority=fields.pop("priority", None),
        assignee=fields.pop("assignee", None),
        labels=fields.pop("labels", None),
        custom_fields=fields
    )
    
    print(f"✅ Created ticket: {result['key']}")
    if args.json:
        print(json.dumps(result, indent=2))


def cmd_get(args, config: JiraConfig) -> None:
    """Get issue details with optional comments, description, and attachments"""
    client = JiraClient(config)
    
    # Validate comment-limit range
    comment_limit = getattr(args, 'comment_limit', 50)
    comment_limit = max(1, min(comment_limit, 100))  # Clamp to 1-100
    
    # Fetch issue with optional description/comments/attachments
    result = client.get_issue(
        args.issue_key,
        include_description=getattr(args, 'include_description', False),
        include_comments=getattr(args, 'include_comments', False),
        include_attachments=getattr(args, 'include_attachments', False),
        comment_limit=comment_limit
    )
    
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        # TEXT OUTPUT FORMAT
        fields = result.get("fields", {})
        
        # Basic fields
        print(f"Key: {result['key']}")
        print(f"Summary: {fields.get('summary')}")
        print(f"Status: {fields.get('status', {}).get('name')}")
        print(f"Priority: {(fields.get('priority') or {}).get('name', 'None')}")
        print(f"Assignee: {(fields.get('assignee') or {}).get('displayName', 'Unassigned')}")
        print(f"Reporter: {(fields.get('reporter') or {}).get('displayName', 'Unknown')}")
        
        # Story points (if present)
        story_points = fields.get('customfield_10106') or fields.get('story_points')
        if story_points is not None:
            print(f"Story Points: {story_points}")
        
        # Description (if requested)
        if getattr(args, 'include_description', False):
            description = result.get("_description")
            if description:
                print(f"\nDescription:")
                print(f"  {description[:200]}..." if len(description) > 200 else f"  {description}")
        
        # Links (if present)
        issue_links = result.get("fields", {}).get("issuelinks", [])
        if issue_links:
            print("\nLinks:")
            for link in issue_links:
                link_type = link.get("type", {}).get("name", "Unknown")
                if "inwardIssue" in link:
                    linked_issue = link["inwardIssue"]
                    link_direction = link.get("type", {}).get("inward", link_type)
                else:
                    linked_issue = link["outwardIssue"]
                    link_direction = link.get("type", {}).get("outward", link_type)
                
                linked_key = linked_issue.get("key", "?")
                linked_status = linked_issue.get("fields", {}).get("status", {}).get("name", "?")
                print(f"  {link_direction} → {linked_key} ({linked_status})")
        
        # Comments (if requested)
        if getattr(args, 'include_comments', False):
            comments = result.get("_comments", [])
            if comments:
                print(f"\nComments ({len(comments)} total):")
                for i, comment in enumerate(comments, 1):
                    author = comment.get("author", {})
                    author_name = author.get("displayName") or author.get("name") or "Unknown"
                    created = comment.get("created", "Unknown")
                    body = comment.get("body", "")
                    
                    # Truncate long comment bodies for readability
                    body_preview = body[:150] + "..." if len(body) > 150 else body
                    
                    print(f"\n  [{i}] {author_name} ({created})")
                    print(f"      {body_preview}")
                
                # Pagination indicator
                if result.get("_truncated"):
                    comment_count = result.get("_comment_count", "?")
                    print(f"\n  ⚠️  Truncated (showing {len(comments)} of {comment_count} comments)")
            else:
                print("\nComments: None")
        
        # Attachments (if requested)
        if getattr(args, 'include_attachments', False):
            attachments = result.get("_attachments", [])
            if attachments:
                print(f"\nAttachments ({len(attachments)} total):")
                for i, att in enumerate(attachments, 1):
                    filename = att.get("filename", "unknown")
                    size_kb = (att.get("size_bytes") or 0) / 1024
                    mime_type = att.get("mime_type", "unknown")
                    author = att.get("author", "Unknown")
                    created = att.get("created", "Unknown")
                    url = att.get("download_url", "")
                    
                    # Determine file type icon
                    icon = "📄"
                    if mime_type.startswith("image/"):
                        icon = "🖼️"
                    elif mime_type.startswith("video/"):
                        icon = "🎥"
                    elif mime_type.startswith("audio/"):
                        icon = "🎵"
                    elif "pdf" in mime_type:
                        icon = "📕"
                    elif "zip" in mime_type or "compressed" in mime_type:
                        icon = "📦"
                    
                    print(f"\n  [{i}] {icon} {filename} ({size_kb:.1f} KB)")
                    print(f"      Type: {mime_type}")
                    print(f"      Uploaded: {created} by {author}")
                    print(f"      URL: {url}")
            else:
                print("\nAttachments: None")


def cmd_update(args, config: JiraConfig) -> None:
    """Update an issue"""
    client = JiraClient(config)

    custom_fields = {}
    if getattr(args, 'story_points', None) is not None:
        custom_fields['customfield_10106'] = args.story_points

    client.update_issue(
        args.issue_key,
        summary=args.summary,
        description=args.description,
        priority=args.priority,
        assignee=args.assignee,
        labels=args.labels.split(",") if args.labels else None,
        custom_fields=custom_fields if custom_fields else None
    )

    print(f"✅ Updated ticket: {args.issue_key}")


def cmd_comment(args, config: JiraConfig) -> None:
    """Add comment to issue"""
    client = JiraClient(config)
    
    result = client.add_comment(args.issue_key, args.body)
    print(f"✅ Added comment to: {args.issue_key}")
    if args.json:
        print(json.dumps(result, indent=2))


def cmd_transitions(args, config: JiraConfig) -> None:
    """List available transitions for an issue"""
    client = JiraClient(config)
    
    transitions = client.get_transitions(args.issue_key)
    print(f"Available transitions for {args.issue_key}:")
    for t in transitions:
        print(f"  - {t['name']} (ID: {t['id']})")


def cmd_transition(args, config: JiraConfig) -> None:
    """Transition issue to new state"""
    client = JiraClient(config)
    
    client.transition_issue(args.issue_key, args.to, comment=args.comment)
    print(f"✅ Transitioned {args.issue_key} to '{args.to}'")


def cmd_search(args, config: JiraConfig) -> None:
    """Search for issues using JQL"""
    client = JiraClient(config)
    
    issues = client.search_issues(args.jql, max_results=args.max)
    print(f"Found {len(issues)} issues:")
    
    for issue in issues:
        fields = issue.get("fields", {})
        print(f"  {issue['key']}: {fields.get('summary')}")
    
    if args.json:
        print(json.dumps(issues, indent=2))


def cmd_link(args, config: JiraConfig) -> None:
    """Link two issues"""
    client = JiraClient(config)
    
    client.link_issues(args.from_issue, args.to_issue, link_type=args.type)
    print(f"✅ Linked {args.from_issue} to {args.to_issue} ({args.type})")


def cmd_link_types(args, config: JiraConfig) -> None:
    """List available link types on this JIRA instance"""
    client = JiraClient(config)
    
    link_types = client.get_link_types()
    print(f"Available link types ({len(link_types)} total):")
    for lt in link_types:
        name = lt.get("name", "Unknown")
        inward = lt.get("inward", "")
        outward = lt.get("outward", "")
        if inward and outward:
            print(f"  {name}")
            print(f"    → inward: {inward}")
            print(f"    → outward: {outward}")
        else:
            print(f"  {name}")
    
    if args.json:
        print(json.dumps(link_types, indent=2))


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="JIRA Manager - Programmatic JIRA ticket management",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s check
  %(prog)s check --env-file /other/repo/.env
  %(prog)s create --type Bug --summary "Database pool exhaustion" --priority High
  %(prog)s create --template templates/bug.json --summary "New bug"
  %(prog)s get AQD-123
  %(prog)s update AQD-123 --priority Critical
  %(prog)s comment AQD-123 --body "Investigation complete"
  %(prog)s transitions AQD-123
  %(prog)s transition AQD-123 --to "In Progress"
  %(prog)s search --jql 'project = AQD AND status = "Open"'
  %(prog)s link AQD-123 AQD-456 --type "relates to"

Cross-repo invocation (from a different repository):
  python3 /path/to/qdrant-memory-mcp/agent/skills/jira-manager/scripts/jira_client.py \\
    --env-file /path/to/other-repo/.env check
        """
    )

    # Global option: explicit .env file path (cross-repo support)
    parser.add_argument(
        "--env-file",
        metavar="PATH",
        default=None,
        help=(
            "Explicit path to .env file containing JIRA_INSTANCE_URL, JIRA_PAT, "
            "JIRA_PROJECT_KEY. When omitted, the script searches up from its own "
            "directory then from cwd. Use this flag when invoking from a different repo."
        )
    )

    # Global option: per-invocation project key override
    parser.add_argument(
        "--project",
        metavar="KEY",
        default=None,
        help=(
            "JIRA project key for this invocation (e.g. ADO, AQD, EHCD). "
            "Overrides JIRA_PROJECT_KEY from any .env file. Use when calling "
            "the skill from a repo that does not have its own .env, or to "
            "target a specific project without editing .env."
        )
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # check command
    subparsers.add_parser("check", help="Check JIRA connectivity")
    
    # create command
    create_parser = subparsers.add_parser("create", help="Create a new issue")
    create_parser.add_argument("--type", default="Task", help="Issue type (default: Task)")
    create_parser.add_argument("--template", help="Path to issue template JSON")
    create_parser.add_argument("--summary", help="Issue summary")
    create_parser.add_argument("--description", help="Issue description")
    create_parser.add_argument("--priority", help="Priority (High, Medium, Low)")
    create_parser.add_argument("--assignee", help="Assignee email")
    create_parser.add_argument("--labels", help="Comma-separated labels")
    create_parser.add_argument("--json", action="store_true", help="Output JSON")
    
    # get command
    get_parser = subparsers.add_parser("get", help="Get issue details")
    get_parser.add_argument("issue_key", help="Issue key (e.g., AQD-123)")
    get_parser.add_argument("--json", action="store_true", help="Output JSON")
    get_parser.add_argument(
        "--include-description",
        action="store_true",
        help="Include full issue description from the API"
    )
    get_parser.add_argument(
        "--include-comments",
        action="store_true",
        help="Include all ticket comments with timestamps and authors"
    )
    get_parser.add_argument(
        "--include-attachments",
        action="store_true",
        help="Include metadata for all attached files (filenames, URLs, sizes)"
    )
    get_parser.add_argument(
        "--comment-limit",
        type=int,
        default=50,
        help="Total number of comments to retrieve (default: 50). Automatically paginated in batches of up to 100."
    )
    
    # update command
    update_parser = subparsers.add_parser("update", help="Update an issue")
    update_parser.add_argument("issue_key", help="Issue key")
    update_parser.add_argument("--summary", help="New summary")
    update_parser.add_argument("--description", help="New description")
    update_parser.add_argument("--priority", help="New priority")
    update_parser.add_argument("--assignee", help="New assignee email")
    update_parser.add_argument("--labels", help="Comma-separated labels")
    update_parser.add_argument("--story-points", type=float, dest="story_points", help="Story points (customfield_10016)")
    
    # comment command
    comment_parser = subparsers.add_parser("comment", help="Add comment to issue")
    comment_parser.add_argument("issue_key", help="Issue key")
    comment_parser.add_argument("--body", required=True, help="Comment text")
    comment_parser.add_argument("--json", action="store_true", help="Output JSON")
    
    # transitions command
    transitions_parser = subparsers.add_parser("transitions", help="List available transitions")
    transitions_parser.add_argument("issue_key", help="Issue key")
    
    # transition command
    transition_parser = subparsers.add_parser("transition", help="Transition issue to new state")
    transition_parser.add_argument("issue_key", help="Issue key")
    transition_parser.add_argument("--to", required=True, help="Transition name")
    transition_parser.add_argument("--comment", help="Optional comment")
    
    # search command
    search_parser = subparsers.add_parser("search", help="Search for issues using JQL")
    search_parser.add_argument("--jql", required=True, help="JQL query")
    search_parser.add_argument("--max", type=int, default=50, help="Max results (default: 50)")
    search_parser.add_argument("--json", action="store_true", help="Output JSON")
    
    # link command
    link_parser = subparsers.add_parser("link", help="Link two issues")
    link_parser.add_argument("from_issue", help="Source issue key")
    link_parser.add_argument("to_issue", help="Target issue key")
    link_parser.add_argument("--type", default="relates to", help="Link type (default: relates to). Run 'jira link-types' to see all available.")
    
    # link-types command
    link_types_parser = subparsers.add_parser("link-types", help="List available issue link types")
    link_types_parser.add_argument("--json", action="store_true", help="Output JSON")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    try:
        config = JiraConfig(env_file=args.env_file, project_key=args.project)
        
        # Dispatch to command handler
        handlers = {
            "check": cmd_check,
            "create": cmd_create,
            "get": cmd_get,
            "update": cmd_update,
            "comment": cmd_comment,
            "transitions": cmd_transitions,
            "transition": cmd_transition,
            "search": cmd_search,
            "link": cmd_link,
            "link-types": cmd_link_types
        }
        
        handler = handlers.get(args.command)
        if handler:
            handler(args, config)
        else:
            print(f"Unknown command: {args.command}")
            sys.exit(1)
    
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
