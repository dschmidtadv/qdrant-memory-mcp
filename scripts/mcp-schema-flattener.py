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
import os
from typing import Any, Dict, Optional

# Debug mode: set MCP_FLATTENER_DEBUG=1 to enable logging
DEBUG = os.environ.get('MCP_FLATTENER_DEBUG', '0') == '1'

def debug_log(msg: str) -> None:
    """Log debug message to stderr if DEBUG is enabled."""
    if DEBUG:
        sys.stderr.write(f"[mcp-schema-flattener] {msg}\n")
        sys.stderr.flush()


def flatten_defs(schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inline all $defs references in a JSON Schema (improved algorithm).
    
    Handles nested $defs at multiple levels and complex cross-references.
    Strategy: Build a global $defs registry, then resolve all references.
    """
    if not isinstance(schema, dict):
        return schema
    
    # Step 1: Collect all $defs from all levels into a global registry
    global_defs: Dict[str, Any] = {}
    
    def collect_defs(node: Any) -> None:
        """Recursively collect all $defs from nested schemas."""
        if isinstance(node, dict):
            if "$defs" in node:
                global_defs.update(node["$defs"])
            for value in node.values():
                collect_defs(value)
        elif isinstance(node, list):
            for item in node:
                collect_defs(item)
    
    collect_defs(schema)
    if not global_defs:
        return schema
    
    # Step 2: Resolve all $ref references using the global registry
    def resolve_refs(node: Any, _seen_refs: Optional[set] = None) -> Any:
        """Recursively resolve $ref references."""
        if _seen_refs is None:
            _seen_refs = set()
        
        if isinstance(node, dict):
            # If this node has a $ref, resolve it
            if "$ref" in node:
                ref = node["$ref"]
                if ref.startswith("#/$defs/"):
                    def_name = ref[len("#/$defs/"):]
                    # Prevent circular references
                    if def_name not in _seen_refs and def_name in global_defs:
                        _seen_refs.add(def_name)
                        # Recursively resolve the referenced definition
                        result = resolve_refs(copy.deepcopy(global_defs[def_name]), _seen_refs)
                        _seen_refs.discard(def_name)
                        return result
                    elif def_name in _seen_refs:
                        debug_log(f"Circular reference detected: {ref}")
                        # Rewrite to definitions path for AJV v8 (Draft-07) compatibility
                        return {"$ref": f"#/definitions/{def_name}"}
                    else:
                        # Not found in global_defs — rewrite to definitions path for AJV v8 compatibility
                        debug_log(f"Unresolved reference: {ref} — rewriting to #/definitions/{def_name}")
                        return {"$ref": f"#/definitions/{def_name}"}
            
            # Recursively process all values, including $defs (rename to definitions for AJV v8 compatibility)
            result = {}
            for key, value in node.items():
                new_key = "definitions" if key == "$defs" else key
                result[new_key] = resolve_refs(value, _seen_refs)
            return result
        elif isinstance(node, list):
            return [resolve_refs(item, _seen_refs) for item in node]
        else:
            return node
    
    return resolve_refs(schema)


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
                debug_log("stdout: EOF reached")
                break
            
            line_str = line.decode("utf-8", errors="replace").rstrip("\n")
            debug_log(f"stdout: received {len(line_str)} bytes")
            
            try:
                msg = json.loads(line_str)
                debug_log(f"stdout: parsed JSON, id={msg.get('id')}")
                
                # Patch tools/list responses (JSON-RPC result with "result" containing "tools")
                if isinstance(msg, dict) and msg.get("result") and isinstance(msg.get("result"), dict) and "tools" in msg.get("result", {}):
                    debug_log("stdout: patching tools/list response")
                    msg = patch_tools_list_response(msg)
                
                # Write patched message to stdout
                output = json.dumps(msg) + "\n"
                sys.stdout.write(output)
                sys.stdout.flush()
                debug_log(f"stdout: relayed {len(output)} bytes")
            except json.JSONDecodeError as e:
                # Not JSON, pass through unchanged
                debug_log(f"stdout: not JSON, passing through ({e})")
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
                debug_log("stderr: EOF reached")
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
    
    debug_log(f"Starting with command: {' '.join(sys.argv[1:])}")
    
    # Spawn the real MCP server
    command = sys.argv[1:]
    try:
        proc = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,  # Unbuffered binary I/O — correct for Python 3.12
        )
        debug_log(f"Subprocess spawned with PID {proc.pid}")
    except FileNotFoundError as e:
        sys.stderr.write(f"[mcp-schema-flattener] Failed to spawn subprocess: {e}\n")
        sys.exit(1)
    
    # Start relay threads
    stdout_thread = threading.Thread(target=relay_stdio, args=(proc,), daemon=True)
    stderr_thread = threading.Thread(target=relay_stderr, args=(proc,), daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    debug_log("Relay threads started")
    
    # Relay stdin to subprocess
    try:
        while True:
            line = sys.stdin.buffer.readline()
            if not line:
                debug_log("stdin: EOF reached")
                break
            debug_log(f"stdin: received {len(line)} bytes")
            proc.stdin.write(line)
            proc.stdin.flush()
    except (BrokenPipeError, KeyboardInterrupt):
        debug_log("stdin: broken pipe or keyboard interrupt")
        pass
    finally:
        try:
            proc.stdin.close()
            debug_log("stdin: closed")
        except:
            pass
    
    # Wait for subprocess to exit
    debug_log("Waiting for subprocess to exit...")
    exit_code = proc.wait()
    debug_log(f"Subprocess exited with code {exit_code}")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
