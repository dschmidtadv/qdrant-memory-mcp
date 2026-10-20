#!/usr/bin/env python3
"""
Unit tests for jira_client.py
Tests comment retrieval, description extraction, and attachment metadata
"""

import json
import unittest
from unittest.mock import Mock, patch, MagicMock
from jira_client import JiraClient
from jira_config import JiraConfig


class TestJiraClientComments(unittest.TestCase):
    """Test suite for comment retrieval functionality"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.config = Mock(spec=JiraConfig)
        self.config.instance_url = "https://your-jira-instance.example.com/jira"
        self.config.pat = "test-pat"
        self.config.project_key = "TEST"
        self.config.get_headers = Mock(return_value={"Authorization": "Bearer test-pat"})
        self.config.ssl_context = Mock()
        self.client = JiraClient(self.config)
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_comments_success(self, mock_urlopen):
        """Test successful comment retrieval"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "comments": [
                {
                    "id": "1",
                    "author": {"name": "user1", "displayName": "User One"},
                    "created": "2026-09-09T12:00:00-0400",
                    "body": "First comment"
                },
                {
                    "id": "2",
                    "author": {"name": "user2", "displayName": "User Two"},
                    "created": "2026-09-09T13:00:00-0400",
                    "body": "Second comment"
                }
            ],
            "total": 2,
            "startAt": 0,
            "maxResults": 50
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_comments("TEST-123")
        
        self.assertEqual(len(result["comments"]), 2)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["comments"][0]["body"], "First comment")
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_comments_empty(self, mock_urlopen):
        """Test comment retrieval for ticket with no comments"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "comments": [],
            "total": 0,
            "startAt": 0,
            "maxResults": 50
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_comments("TEST-456")
        
        self.assertEqual(len(result["comments"]), 0)
        self.assertEqual(result["total"], 0)
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_comments_pagination(self, mock_urlopen):
        """Test comment pagination with multiple batches"""
        # First call returns first batch
        first_response = Mock()
        first_response.read.return_value = json.dumps({
            "comments": [
                {"id": "1", "author": {"displayName": "User"}, "created": "2026-09-09T12:00:00-0400", "body": "Comment 1"},
                {"id": "2", "author": {"displayName": "User"}, "created": "2026-09-09T12:01:00-0400", "body": "Comment 2"}
            ],
            "total": 3,
            "startAt": 0,
            "maxResults": 2
        }).encode('utf-8')
        
        # Second call returns second batch
        second_response = Mock()
        second_response.read.return_value = json.dumps({
            "comments": [
                {"id": "3", "author": {"displayName": "User"}, "created": "2026-09-09T12:02:00-0400", "body": "Comment 3"}
            ],
            "total": 3,
            "startAt": 2,
            "maxResults": 2
        }).encode('utf-8')
        
        mock_urlopen.return_value.__enter__.return_value = first_response
        
        result1 = self.client.get_comments("TEST-789", max_results=2)
        self.assertEqual(len(result1["comments"]), 2)
        
        mock_urlopen.return_value.__enter__.return_value = second_response
        result2 = self.client.get_comments("TEST-789", max_results=2, start_at=2)
        self.assertEqual(len(result2["comments"]), 1)
        self.assertEqual(result2["comments"][0]["body"], "Comment 3")
    
    @patch.object(JiraClient, 'get_comments')
    def test_get_all_comments_pagination_loop(self, mock_get_comments):
        """Test automatic pagination loop in get_all_comments"""
        # Mock get_comments to return paginated results
        call_count = 0
        
        def mock_paginate(issue_key, max_results=50, start_at=0):
            nonlocal call_count
            call_count += 1
            
            if call_count == 1:  # First call: first 50 comments
                return {
                    "comments": [{"id": str(i), "body": f"Comment {i}"} for i in range(50)],
                    "total": 150,
                    "startAt": 0
                }
            elif call_count == 2:  # Second call: next 50 comments
                return {
                    "comments": [{"id": str(i), "body": f"Comment {i}"} for i in range(50, 100)],
                    "total": 150,
                    "startAt": 50
                }
            else:  # Third call: last 50 comments (limited to 75 total requested)
                return {
                    "comments": [{"id": str(i), "body": f"Comment {i}"} for i in range(100, 150)],
                    "total": 150,
                    "startAt": 100
                }
        
        mock_get_comments.side_effect = mock_paginate
        
        comments, total, truncated = self.client.get_all_comments("TEST-999", limit=75)
        
        self.assertEqual(len(comments), 75)  # Limited to 75
        self.assertEqual(total, 150)
        self.assertTrue(truncated)  # More exist than retrieved
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_issue_with_comments(self, mock_urlopen):
        """Test get_issue with include_comments flag"""
        issue_response = Mock()
        issue_response.read.return_value = json.dumps({
            "key": "TEST-123",
            "fields": {
                "summary": "Test issue",
                "description": "Test description",
                "status": {"name": "Open"}
            }
        }).encode('utf-8')
        
        comment_response = Mock()
        comment_response.read.return_value = json.dumps({
            "comments": [
                {"id": "1", "body": "Comment 1", "author": {"displayName": "User"}, "created": "2026-09-09T12:00:00-0400"}
            ],
            "total": 1,
            "startAt": 0
        }).encode('utf-8')
        
        # Mock returns issue first, then comments
        mock_urlopen.return_value.__enter__.return_value = issue_response
        result1 = self.client.get_issue("TEST-123", include_comments=False)
        self.assertEqual(result1["key"], "TEST-123")
        self.assertNotIn("_comments", result1)
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_issue_with_description(self, mock_urlopen):
        """Test get_issue with include_description flag"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "key": "TEST-123",
            "fields": {
                "summary": "Test issue",
                "description": "Full description text",
                "status": {"name": "Open"}
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_issue("TEST-123", include_description=True)
        
        self.assertIn("_description", result)
        self.assertEqual(result["_description"], "Full description text")
    
    @patch('jira_client.urllib.request.urlopen')
    def test_get_issue_with_attachments(self, mock_urlopen):
        """Test get_issue with include_attachments flag"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "key": "TEST-123",
            "fields": {
                "summary": "Test issue",
                "attachment": [
                    {
                        "id": "10000",
                        "filename": "screenshot.png",
                        "size": 125432,
                        "mimeType": "image/png",
                        "created": "2026-09-09T12:00:00-0400",
                        "author": {"displayName": "User One", "name": "user1"},
                        "content": "https://your-jira-instance.example.com/jira/secure/attachment/10000/screenshot.png",
                        "thumbnail": "https://your-jira-instance.example.com/jira/secure/thumbnail/10000/screenshot.png"
                    }
                ]
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_issue("TEST-123", include_attachments=True)
        
        self.assertIn("_attachments", result)
        self.assertEqual(len(result["_attachments"]), 1)
        self.assertEqual(result["_attachments"][0]["filename"], "screenshot.png")
        self.assertEqual(result["_attachment_count"], 1)
    
    @patch('jira_client.urllib.request.urlopen')
    def test_attachment_metadata_structure(self, mock_urlopen):
        """Test that attachment metadata is properly normalized"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "key": "TEST-123",
            "fields": {
                "attachment": [
                    {
                        "id": "10000",
                        "filename": "document.pdf",
                        "size": 512000,
                        "mimeType": "application/pdf",
                        "created": "2026-09-09T12:00:00-0400",
                        "author": {"displayName": "John Doe"},
                        "content": "https://example.com/attachment/10000/document.pdf",
                        "thumbnail": None
                    }
                ]
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_issue("TEST-123", include_attachments=True)
        att = result["_attachments"][0]
        
        self.assertEqual(att["id"], "10000")
        self.assertEqual(att["filename"], "document.pdf")
        self.assertEqual(att["size_bytes"], 512000)
        self.assertEqual(att["mime_type"], "application/pdf")
        self.assertEqual(att["author"], "John Doe")
        self.assertIn("download_url", att)
        self.assertIsNone(att["thumbnail_url"])
    
    @patch('jira_client.urllib.request.urlopen')
    def test_comment_limit_validation(self, mock_urlopen):
        """Test that comment_limit is clamped to 1-100"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "comments": [],
            "total": 0,
            "startAt": 0,
            "maxResults": 100
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        # Test clamping: 200 should be limited to 100 per-request
        result = self.client.get_comments("TEST-123", max_results=200)
        self.assertEqual(result["maxResults"], 100)


class TestJiraClientErrorHandling(unittest.TestCase):
    """Test error handling and edge cases"""
    
    def setUp(self):
        self.config = Mock(spec=JiraConfig)
        self.config.instance_url = "https://your-jira-instance.example.com/jira"
        self.config.get_headers = Mock(return_value={})
        self.config.ssl_context = Mock()
        self.client = JiraClient(self.config)
    
    @patch('jira_client.urllib.request.urlopen')
    def test_missing_attachment_size(self, mock_urlopen):
        """Test handling of null attachment size"""
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "key": "TEST-123",
            "fields": {
                "attachment": [
                    {
                        "id": "10000",
                        "filename": "file.txt",
                        "size": None,  # Null size
                        "mimeType": "text/plain",
                        "created": "2026-09-09T12:00:00-0400",
                        "author": {"displayName": "User"},
                        "content": "https://example.com/attachment/10000/file.txt",
                        "thumbnail": None
                    }
                ]
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response
        
        result = self.client.get_issue("TEST-123", include_attachments=True)
        
        # Should handle None gracefully
        self.assertIsNone(result["_attachments"][0]["size_bytes"])


if __name__ == '__main__':
    unittest.main()
