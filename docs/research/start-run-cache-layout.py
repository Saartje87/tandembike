#!/usr/bin/env python3
"""Compare the first API request of two Start runs, block by block (T1160).

Claude Code records each request's layout in the session log: an
`api-request-shape` entry (tools and system blocks), `api-request-blob`
entries (the messages) and an `api-request` entry naming the blobs in order
(`tail`) and the cache breakpoints (`cacheControl`). This prints, for the first
request of each run, every block's size and where the two runs first differ,
and the first assistant entry's cache usage.

Usage: start-run-cache-layout.py <log folder A> <log folder B>
where each folder is under ~/.claude/projects, such as
-Users-niek--tandembike-worktrees-3-c138.
"""

import glob
import json
import os
import sys

PROJECTS = os.path.expanduser("~/.claude/projects")


def first_request(folder):
    path = glob.glob(os.path.join(PROJECTS, folder, "*.jsonl"))[0]
    shape, blobs, request, usage = None, {}, None, None
    for line in open(path):
        entry = json.loads(line)
        kind = entry.get("type")
        if kind == "api-request-shape" and shape is None:
            shape = entry["shape"]
        elif kind == "api-request-blob":
            blobs[entry["hash"]] = entry["message"]
        elif kind == "api-request" and request is None:
            request = entry
        elif kind == "assistant" and "usage" in entry.get("message", {}):
            usage = entry["message"]["usage"]
            break
    blocks = [("tools", json.dumps(shape["tools"]))]
    blocks += [(f"system[{i}]", b["text"]) for i, b in enumerate(shape["system"])]
    for k, digest in enumerate(request["tail"]):
        message = blobs[digest]
        for j, part in enumerate(message["content"]):
            text = part.get("text", json.dumps(part))
            blocks.append((f"messages[{k}] {message['role']} [{j}]", text))
    return blocks, request["cacheControl"], usage


def first_difference(a, b):
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return None if len(a) == len(b) else min(len(a), len(b))


def main(folder_a, folder_b):
    a, breakpoints, usage_a = first_request(folder_a)
    b, _, usage_b = first_request(folder_b)
    print("cache breakpoints:", [c["path"] for c in breakpoints])
    for label, usage in (("A", usage_a), ("B", usage_b)):
        print(
            f"{label}: read {usage['cache_read_input_tokens']},"
            f" written {usage['cache_creation_input_tokens']}"
        )
    for (name, text_a), (_, text_b) in zip(a, b):
        at = first_difference(text_a, text_b)
        where = "same" if at is None else f"differs at char {at}: {text_b[max(0, at - 40):at + 60]!r}"
        print(f"{name:28} {len(text_a):6} chars  {where}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
