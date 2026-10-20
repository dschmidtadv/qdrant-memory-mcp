#!/usr/bin/env python3
"""
Batch Indexer - Main execution engine for indexing-manager skill

Orchestrates file discovery, concurrent uploads to Qdrant MCP server, and progress reporting.
Auto-detects configuration from project environment (no config file required).
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'

class BatchIndexer:
    def __init__(self, config_path=None):
        self.config = self._load_or_detect_config(config_path)
        self.start_time = time.time()
        self.stats = {'total': 0, 'success': 0, 'failed': 0}
        
    def _load_or_detect_config(self, config_path):
        """Load config from file or auto-detect from project environment."""
        # Try to load from explicit config file if provided
        if config_path and Path(config_path).exists():
            try:
                import yaml
                with open(config_path, 'r') as f:
                    return yaml.safe_load(f)
            except Exception as e:
                print(f"{YELLOW}⚠ Failed to load config file: {e}{NC}")
        
        # Auto-detect configuration from project environment
        return self._auto_detect_config()
    
    def _auto_detect_config(self):
        """Auto-detect configuration from project environment."""
        cwd = Path.cwd()
        
        # Detect project name
        project_name = self._detect_project_name(cwd)
        
        # Build default config
        config = {
            'project': project_name,
            'memory_dir': '.ai-memory',
            'endpoint': 'http://localhost:3000/mcp',
            'collection_name': 'agent-memory',
            'file_extensions': ['.md', '.sh', '.py', '.json', '.yaml', '.yml'],
            'concurrency': 3,
            'retry_max': 3,
            'retry_backoff_base': 2,
        }
        
        return config
    
    def _detect_project_name(self, project_dir):
        """Auto-detect project name from directory or composer.json."""
        # Try composer.json first
        composer_file = project_dir / "composer.json"
        if composer_file.exists():
            try:
                with open(composer_file) as f:
                    data = json.load(f)
                    if "name" in data:
                        return data["name"].split("/")[-1]
            except:
                pass
        
        # Try package.json
        package_file = project_dir / "package.json"
        if package_file.exists():
            try:
                with open(package_file) as f:
                    data = json.load(f)
                    if "name" in data:
                        return data["name"]
            except:
                pass
        
        # Fall back to directory name
        return project_dir.name
    
    def _print_header(self):
        """Print formatted header."""
        print(f"{BLUE}╔════════════════════════════════════════════════════════════════╗{NC}")
        print(f"{BLUE}║  Indexing Manager - Batch Upload (Qdrant MCP)                 ║{NC}")
        print(f"{BLUE}╚════════════════════════════════════════════════════════════════╝{NC}")
        print()
        print(f"{YELLOW}📁 Source Directory:{NC} {self.config['memory_dir']}")
        print(f"{YELLOW}🌐 Endpoint:{NC} {self.config['endpoint']}")
        print(f"{YELLOW}🧠 Project:{NC} {self.config['project']}")
        print(f"{YELLOW}📦 Collection:{NC} {self.config['collection_name']}")
        print()
    
    def _validate_endpoint(self):
        """Validate endpoint is responding."""
        try:
            response = requests.options(self.config['endpoint'], timeout=5)
            if response.status_code < 500:
                print(f"{GREEN}✓ Endpoint validated: {self.config['endpoint']}{NC}")
                return True
        except:
            pass
        
        print(f"{RED}✗ Endpoint not responding: {self.config['endpoint']}{NC}")
        return False
    
    def _discover_files(self):
        """Discover files matching configured extensions."""
        memory_dir = Path(self.config['memory_dir'])
        if not memory_dir.exists():
            print(f"{RED}✗ Memory directory not found: {memory_dir}{NC}")
            return []
        
        extensions = set(self.config.get('file_extensions', ['.md', '.sh', '.py', '.json', '.yaml']))
        files = []
        
        for root, dirs, filenames in os.walk(memory_dir):
            for filename in filenames:
                if Path(filename).suffix in extensions:
                    files.append(Path(root) / filename)
        
        return sorted(files)
    
    def _upload_file(self, file_path):
        """Upload single file to Qdrant MCP server with retry logic."""
        relative_path = file_path.relative_to(self.config['memory_dir'])
        
        for attempt in range(self.config.get('retry_max', 3)):
            try:
                # Read file content
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                # Prepare MCP JSON-RPC request
                payload = {
                    "jsonrpc": "2.0",
                    "method": "tools/call",
                    "params": {
                        "name": "memorize_context",
                        "arguments": {
                            "content": content,
                            "project": self.config['project'],
                            "tags": ["session-log", "ai-memory", str(relative_path.parent)]
                        }
                    }
                }
                
                # POST to MCP endpoint
                response = requests.post(
                    self.config['endpoint'],
                    json=payload,
                    timeout=30,
                    headers={'Content-Type': 'application/json'}
                )
                
                if response.status_code in [200, 201, 202]:
                    return True, None
                
                # Retry on failure
                if attempt < self.config.get('retry_max', 3) - 1:
                    wait = self.config.get('retry_backoff_base', 2) ** attempt
                    time.sleep(wait)
                
            except Exception as e:
                if attempt < self.config.get('retry_max', 3) - 1:
                    wait = self.config.get('retry_backoff_base', 2) ** attempt
                    time.sleep(wait)
                else:
                    return False, str(e)
        
        return False, "Max retries exceeded"
    
    def run(self):
        """Execute batch indexing."""
        self._print_header()
        
        # Validate endpoint
        if not self._validate_endpoint():
            return 1
        
        # Discover files
        files = self._discover_files()
        if not files:
            print(f"{YELLOW}⚠ No files found to index{NC}")
            return 0
        
        self.stats['total'] = len(files)
        print(f"{GREEN}✓ Found {len(files)} files{NC}")
        print()
        print(f"{BLUE}Uploading ({self.config.get('concurrency', 3)} concurrent workers):{NC}")
        print()
        
        # Upload with concurrency
        with ThreadPoolExecutor(max_workers=self.config.get('concurrency', 3)) as executor:
            futures = {
                executor.submit(self._upload_file, file_path): (i+1, file_path)
                for i, file_path in enumerate(files)
            }
            
            for future in as_completed(futures):
                idx, file_path = futures[future]
                relative_path = file_path.relative_to(self.config['memory_dir'])
                display_path = str(relative_path)[:50]
                
                success, error = future.result()
                
                if success:
                    print(f"  [{idx:2d}/{len(files)}] 📄 {display_path:<50} {GREEN}✓{NC}")
                    self.stats['success'] += 1
                else:
                    print(f"  [{idx:2d}/{len(files)}] 📄 {display_path:<50} {RED}✗{NC}")
                    self.stats['failed'] += 1
        
        # Print summary
        self._print_summary()
        
        return 0 if self.stats['failed'] == 0 else 1
    
    def _print_summary(self):
        """Print execution summary."""
        elapsed = time.time() - self.start_time
        minutes, seconds = divmod(int(elapsed), 60)
        
        print()
        print(f"{BLUE}╔════════════════════════════════════════════════════════════════╗{NC}")
        print(f"{BLUE}║  Summary                                                       ║{NC}")
        print(f"{BLUE}╚════════════════════════════════════════════════════════════════╝{NC}")
        print()
        print(f"  Total Files:      {YELLOW}{self.stats['total']}{NC}")
        print(f"  Successful:       {GREEN}{self.stats['success']}{NC}")
        print(f"  Failed:           {RED}{self.stats['failed']}{NC}")
        print(f"  Execution Time:   {YELLOW}{minutes}m {seconds}s{NC}")
        success_rate = (self.stats['success'] / self.stats['total'] * 100) if self.stats['total'] > 0 else 0
        print(f"  Success Rate:     {GREEN if success_rate == 100 else YELLOW}{success_rate:.1f}%{NC}")
        print()

if __name__ == '__main__':
    indexer = BatchIndexer()
    sys.exit(indexer.run())
