#!/usr/bin/env python3
"""
MCP Schema Flattener — Intercepts ListToolsRequest responses and inlines
$defs references to produce AJV Draft-07 compatible schemas.

This script wraps an MCP server subprocess and patches its stdio output to
flatten JSON Schema $defs references. This allows awslabs FastMCP servers
(which use JSON Schema Draft 2020-12 $defs) to work with @arvoretech/mcp-proxy
v1.14.1 (which uses AJV v8 Draft-07).

Usage:
    python3 mcp-schema-flattener.py <command> [args...]

Example:
    python3 mcp-schema-flattener.py uvx --from awslabs.iam-mcp-server@latest awslabs.iam-mcp-server

The script:
1. Spawns the real MCP server as a subprocess
2. Relays stdin from parent → subprocess
3. Intercepts stdout from subprocess, patches tools/list responses, relays to parent
4. Relays stderr from subprocess unchanged
"""

import sys
import json
import subprocess
import threading
import copy
from typing import Any, Dict, Optional


def flatten_defs(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inline all $defs references in a JSON Schema.
    
    Converts:
        {
            "type": "object",
            "properties": {
                "user": { "$ref": "#/$defs/User" }
            },
            "$defs": {
                "User": { "type": "object", "properties": { "id": { "type": "string" } } }
            }
        }
    
    To:
        {
            "type": "object",
            "properties": {
                "user": { "type": "object", "properties": { "id": { "type": "string" } } }
            }
        }
    """
    if not isinstance(schema, dict):
        return schema
    
    defs = schema.get("$defs", {})
    if not defs:
        return schema
    
    def resolve_refs(node: Any) -> Any:
        """Recursively resolve $ref references and remove $defs."""
        if isinstance(node, dict):
            # If this node has a $ref, resolve it
            if "$ref" in node:
                ref = node["$ref"]
                if ref.startswith("#/$defs/"):
                    def_name = ref[len("#/$defs/"):]
                    if def_name in defs:
                        # Recursively resolve the referenced definition
                        return resolve_refs(copy.deepcopy(defs[def_name]))
            
            # Recursively process all values, excluding $defs
            result = {}
            for key, value in node.items():
                if key != "$defs":
                    result[key] = resolve_refs(value)
            return result
        elif isinstance(node, list):
            return [resolve_refs(item) for item in node]
        else:
            return node
    
    return resolve_refs(copy.deepcopy(schema))


def patch_tools_list_response(msg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Patch a tools/list response to flatten $defs in all tool schemas.
    
    Modifies msg["result"]["tools"][*]["inputSchema"] in-place.
    """
    if msg.get("result") and isinstance(msg["result"], dict):
        if "tools" in msg["result"] and isinstance(msg["result"]["tools"], list):
            for tool in msg["result"]["tools"]:
                if isinstance(tool, dict) and "inputSchema" in tool:
                    tool["inputSchema"] = flatten_defs(tool["inputSchema"])
    return msg


def relay_stdio(subprocess_obj: subprocess.Popen) -> None:
    """
    Relay subprocess stdout to parent stdout, patching tools/list responses.
    Runs in a separate thread.
    """
    try:
        while True:
            line = subprocess_obj.stdout.readline()
            if not line:
                break
            
            line_str = line.decode("utf-8", errors="replace").rstrip("\n")
            
            try:
                msg = json.loads(line_str)
                
                # Patch tools/list responses
                if isinstance(msg, dict) and msg.get("method") == "tools/list":
                    msg = patch_tools_list_response(msg)
                
                # Write patched message to stdout
                sys.stdout.write(json.dumps(msg) + "\n")
                sys.stdout.flush()
            except json.JSONDecodeError:
                # Not JSON, pass through unchanged
                sys.stdout.write(line_str + "\n")
                sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"[mcp-schema-flattener] Error relaying stdout: {e}\n")
        sys.stderr.flush()


def relay_stderr(subprocess_obj: subprocess.Popen) -> None:
    """
    Relay subprocess stderr to parent stderr unchanged.
    Runs in a separate thread.
    """
    try:
        while True:
            line = subprocess_obj.stderr.readline()
            if not line:
                break
            sys.stderr.write(line.decode("utf-8", errors="replace"))
            sys.stderr.flush()
    except Exception as e:
        sys.stderr.write(f"[mcp-schema-flattener] Error relaying stderr: {e}\n")
        sys.stderr.flush()


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        sys.stderr.write(
            "Usage: python3 mcp-schema-flattener.py <command> [args...]\n"
            "Example: python3 mcp-schema-flattener.py uvx --from awslabs.iam-mcp-server@latest awslabs.iam-mcp-server\n"
        )
        sys.exit(1)
    
    # Spawn the real MCP server
    command = sys.argv[1:]
    try:
        proc = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,  # Unbuffered
        )
    except FileNotFoundError as e:
        sys.stderr.write(f"[mcp-schema-flattener] Failed to spawn subprocess: {e}\n")
        sys.exit(1)
    
    # Start relay threads
    stdout_thread = threading.Thread(target=relay_stdio, args=(proc,), daemon=True)
    stderr_thread = threading.Thread(target=relay_stderr, args=(proc,), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    
    # Relay stdin to subprocess
    try:
        while True:
            line = sys.stdin.buffer.read(4096)
            if not line:
                break
            proc.stdin.write(line)
            proc.stdin.flush()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    finally:
        try:
            proc.stdin.close()
        except:
            pass
    
    # Wait for subprocess to exit
    exit_code = proc.wait()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
