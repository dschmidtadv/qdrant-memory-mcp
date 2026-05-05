#!/usr/bin/env python3
"""
JIRA Configuration Manager
Handles .env loading, config validation, and SSL context setup
"""

import os
import ssl
import json
from pathlib import Path
from typing import Dict, Optional, Tuple


class JiraConfig:
    """Centralized JIRA configuration management"""
    
    def __init__(self, env_file: Optional[str] = None):
        """
        Initialize JIRA configuration
        
        Args:
            env_file: Path to .env file (defaults to project root .env)
        """
        self.env_file = env_file or self._find_env_file()
        self.config = {}
        self._load_env()
        self._validate()
    
    @staticmethod
    def _find_env_file() -> str:
        """Find .env file by searching up directory tree"""
        # Start from current directory and search up
        current = Path.cwd()
        for _ in range(10):  # Search up to 10 levels
            env_path = current / '.env'
            if env_path.exists():
                return str(env_path)
            if current.parent == current:  # Reached filesystem root
                break
            current = current.parent
        
        # Fallback to home directory
        home_env = Path.home() / '.env'
        if home_env.exists():
            return str(home_env)
        
        return '.env'  # Default, will fail validation if not found
    
    def _load_env(self) -> None:
        """Load environment variables from .env file"""
        if os.path.exists(self.env_file):
            with open(self.env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if '=' in line:
                            key, value = line.split('=', 1)
                            self.config[key.strip()] = value.strip()
        
        # Also load from environment (environment takes precedence)
        for key in ['JIRA_INSTANCE_URL', 'JIRA_PAT', 'JIRA_PROJECT_KEY']:
            if key in os.environ:
                self.config[key] = os.environ[key]
    
    def _validate(self) -> None:
        """Validate required configuration"""
        required = ['JIRA_INSTANCE_URL', 'JIRA_PAT', 'JIRA_PROJECT_KEY']
        missing = [k for k in required if k not in self.config or not self.config[k]]
        
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}\n"
                f"Set them in .env file or environment variables"
            )
    
    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get configuration value"""
        return self.config.get(key, default)
    
    @property
    def instance_url(self) -> str:
        """JIRA instance URL"""
        return self.config['JIRA_INSTANCE_URL'].rstrip('/')
    
    @property
    def pat(self) -> str:
        """Personal Access Token"""
        return self.config['JIRA_PAT']
    
    @property
    def project_key(self) -> str:
        """JIRA project key"""
        return self.config['JIRA_PROJECT_KEY']
    
    @property
    def ssl_context(self) -> ssl.SSLContext:
        """Create SSL context for internal instances"""
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    
    def get_headers(self) -> Dict[str, str]:
        """Get HTTP headers for JIRA API requests"""
        return {
            'Authorization': f'Bearer {self.pat}',
            'Content-Type': 'application/json'
        }
    
    def to_dict(self) -> Dict[str, str]:
        """Export configuration as dictionary"""
        return {
            'instance_url': self.instance_url,
            'project_key': self.project_key,
            'pat': '***' + self.pat[-4:] if len(self.pat) > 4 else '***'
        }


def load_template(template_path: str, overrides: Optional[Dict] = None) -> Dict:
    """
    Load and process a JIRA issue template
    
    Args:
        template_path: Path to template JSON file
        overrides: Dictionary of field overrides
    
    Returns:
        Processed template with ${ENV_VAR} substitution
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")
    
    with open(template_path, 'r') as f:
        template = json.load(f)
    
    # Substitute environment variables
    def substitute_env(obj):
        if isinstance(obj, str):
            # Replace ${VAR_NAME} with environment variable value
            import re
            def replace_var(match):
                var_name = match.group(1)
                return os.environ.get(var_name, match.group(0))
            return re.sub(r'\$\{([^}]+)\}', replace_var, obj)
        elif isinstance(obj, dict):
            return {k: substitute_env(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [substitute_env(item) for item in obj]
        return obj
    
    template = substitute_env(template)
    
    # Apply overrides
    if overrides:
        if 'fields' in template and 'fields' in overrides:
            template['fields'].update(overrides['fields'])
        else:
            template.update(overrides)
    
    return template
