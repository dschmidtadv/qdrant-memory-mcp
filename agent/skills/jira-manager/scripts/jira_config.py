#!/usr/bin/env python3
"""
JIRA Configuration Manager
Handles .env loading, config validation, and SSL context setup

Split credential model
----------------------
JIRA credentials are split across two sources because they have different
ownership scopes:

  SHARED (skill's host repo .env):
    JIRA_INSTANCE_URL  — same for all projects on the same Jira instance
    JIRA_PAT           — personal token, same across all projects

  PER-PROJECT (caller's repo .env or --project CLI flag):
    JIRA_PROJECT_KEY   — different for every project (ADO, AQD, EHCD, ...)

Resolution order (later sources override earlier ones):
  1. Walk UP from the script file's own directory  → shared creds
  2. Walk UP from cwd                              → project-specific overrides
  3. $HOME/.env                                    → global fallback
  4. Explicit env_file argument                    → full override
  5. project_key constructor argument              → highest-priority override
  6. OS environment variables                      → highest-priority override

This means:
  - Put JIRA_INSTANCE_URL + JIRA_PAT in qdrant-memory-mcp/.env (shared)
  - Put JIRA_PROJECT_KEY in <caller-repo>/.env (per-project)
  - Or pass --project ADO on the CLI for a one-off override
"""

import os
import ssl
import json
from pathlib import Path
from typing import Dict, Optional, Tuple


class JiraConfig:
    """Centralized JIRA configuration management"""

    def __init__(
        self,
        env_file: Optional[str] = None,
        project_key: Optional[str] = None,
    ):
        """
        Initialize JIRA configuration.

        Args:
            env_file:    Explicit path to a .env file that fully overrides
                         auto-discovery (both shared and project-specific vars).
            project_key: Explicit project key (e.g. "ADO"). Overrides
                         JIRA_PROJECT_KEY from any .env file. Use this when
                         invoking the skill from a repo that does not have its
                         own .env, or to override on a per-command basis via
                         the --project CLI flag.
        """
        self.config = {}

        if env_file:
            # Caller supplied an explicit file — use it exclusively
            self._load_env_file(env_file)
            self.env_file = env_file
        else:
            # Layered load: shared creds first, then project-specific overrides
            skill_env = self._walk_up_for_env(Path(__file__).resolve().parent)
            caller_env = self._walk_up_for_env(Path.cwd())
            home_env = Path.home() / '.env'

            loaded = []
            for candidate in [skill_env, caller_env, home_env if home_env.exists() else None]:
                if candidate and Path(candidate).exists():
                    self._load_env_file(str(candidate))
                    loaded.append(str(candidate))

            self.env_file = loaded[-1] if loaded else '.env'

        # OS environment variables take highest priority
        for key in ['JIRA_INSTANCE_URL', 'JIRA_PAT', 'JIRA_PROJECT_KEY']:
            if key in os.environ:
                self.config[key] = os.environ[key]

        # Explicit project_key argument overrides everything
        if project_key:
            self.config['JIRA_PROJECT_KEY'] = project_key

        self._validate()

    @staticmethod
    def _walk_up_for_env(start: Path) -> Optional[Path]:
        """Walk up from *start* looking for a .env file. Returns first match or None."""
        current = start.resolve()
        for _ in range(10):
            candidate = current / '.env'
            if candidate.exists():
                return candidate
            parent = current.parent
            if parent == current:  # filesystem root
                break
            current = parent
        return None

    def _load_env_file(self, path: str) -> None:
        """Parse a .env file and merge into self.config (later calls override earlier)."""
        if not os.path.exists(path):
            return
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    self.config[key.strip()] = value.strip()
    
    def _validate(self) -> None:
        """Validate required configuration"""
        required = ['JIRA_INSTANCE_URL', 'JIRA_PAT', 'JIRA_PROJECT_KEY']
        missing = [k for k in required if k not in self.config or not self.config[k]]
        
        if missing:
            # Build a helpful diagnostic showing which .env files were loaded
            env_sources = getattr(self, 'env_file', 'none')
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}\n"
                f"Last .env loaded: {env_sources}\n"
                f"Shared creds (JIRA_INSTANCE_URL, JIRA_PAT): put in qdrant-memory-mcp/.env\n"
                f"Project key (JIRA_PROJECT_KEY): put in <caller-repo>/.env or pass --project <KEY>"
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
