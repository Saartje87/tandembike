"""Break Claude Code session logs down by phase (T1089).

Usage: python3 docs/research/start-run-cost-phases.py [--trace] [--json] [--durations]

The method and the findings are in docs/research/start-run-cost.md.
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

P = os.path.expanduser('~/.claude/projects/')
MAIN = '-Users-niek-Projects-saartje-ticket'

# label, log (relative to ~/.claude/projects), excluded windows [from, to)
RUNS = [
    ('T1 spike', MAIN + '--claude-worktrees-ticket-1-docs-roadmap/3b464018-4581-4847-95ad-7375225d1823',
     [('2026-11-06T23:03:02', '2099')]),
    ('T1 readme', MAIN + '--claude-worktrees-t1098--claude-worktrees-t1-readme/efa8f02c-73e1-41c1-9728-a07e9258561f', []),
    ('T622', MAIN + '/c78e6677-039b-4ae8-b196-d30257808a85', []),
    ('T623', MAIN + '/73b9cb90-e7d3-4c71-ad3f-8388f385e84e',
     [('2026-11-01T12:23:05', '2026-11-01T12:26:59')]),
    ('T629', MAIN + '/919d6256-a121-4516-b186-023e8627cb1c', []),
]
EXTRA = [
    ('T630 (terminal)', MAIN + '/798358e0-dc55-48fb-8791-8450399a850f', []),
    ('T1134 (terminal)', MAIN + '/50b331b1-169b-4c0f-ae94-8be08534430e', []),
    ('T1133 (terminal)', MAIN + '/edea294f-ee7b-40be-bee9-f39156bedb87', []),
]

# $ per million tokens: input, output, cache read, 5m write, 1h write.
# Opus and Fable reproduce the logs' cost-state exactly; Sonnet's read and
# 5m-write prices were solved from three runs' cost-state and fit exactly.
PRICES = {
    'claude-opus-5-5': (4, 20, 0.20, 5, 8),
    'claude-sonnet-5-5': (2, 10, 0.10, 2.5, 4),
    'claude-fable-5-1': (10, 50, 0.25, 12.5, 20),
    'claude-haiku-5-5': (0.10, 0.50, 0.01, 0.125, 0.2),
}

PHASES = ['brief', 'tracker', 'setup', 'work', 'check', 'review', 'git/PR', 'rebuild']

SETUP_RE = re.compile(
    r'git worktree add|npm ci\b|npm install|npm rebuild|git fetch|git checkout -b|git switch -c|'
    r'git branch ticket|git worktree list|npm run db:migrate')
CHECK_RE = re.compile(r'npm run check')
GIT_RE = re.compile(
    r'^\s*(git (add|commit|push|status|diff|log|checkout main|switch main|pull|worktree (remove|prune)|merge|rev-parse|show)|gh )'
    r'|&& git (commit|push)|gh pr|gh run')
BRIEF_READ_RE = re.compile(r'docs/agents/|\.agents/skills/|\.claude/skills/|AGENTS\.md|CLAUDE\.md|GLOSSARY\.md|docs/adr/')


CALLED_AT = {}
RESULT_AT = {}


def phase_of(block):
    name = block.get('name', '')
    inp = block.get('input') or {}
    if name.startswith('mcp__tandembike__'):
        return 'tracker'
    if name in ('ToolSearch',):
        return 'brief'
    if name == 'Skill':
        skill = inp.get('skill', '')
        if 'code-review' in skill:
            return 'review'
        if skill.endswith('pr'):
            return 'git/PR'
        return 'brief'
    if name in ('Agent', 'Task', 'TaskOutput') or name.startswith('mcp__claude-in-chrome'):
        return 'review'
    if name in ('EnterWorktree',):
        return 'setup'
    if name in ('ExitWorktree',):
        return 'setup'
    if name == 'Bash':
        full = inp.get('command', '')
        # classify by the command line itself, never by heredoc or PR-body text
        cmd = full.split('\n', 1)[0]
        if 'scratchpad' in cmd and re.search(r'npm ci|next dev|pkill|browser', full):
            return 'review'  # a browser check's throwaway server
        if re.search(r'git worktree (remove|prune)', cmd):
            return 'setup'  # worktree lifecycle: creation and teardown
        if re.search(r'git rev-parse|git log origin/main\.\.HEAD', cmd):
            return 'review'  # code-review finding its fixed point
        if SETUP_RE.search(cmd):
            return 'setup'
        if re.match(r'\s*(cd \S+ && )?(git|gh) ', cmd):
            return 'git/PR'
        if re.search(r'(^|&&|;)\s*npm run check', cmd):
            return 'check'
        if BRIEF_READ_RE.search(cmd) and re.match(r'\s*(cat|sed -n|head|grep|ls)\b', cmd):
            return 'brief'
        return 'work'
    if name == 'Read':
        if BRIEF_READ_RE.search(inp.get('file_path', '')):
            return 'brief'
        return 'work'
    return 'work'


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def excluded(t, windows):
    return any(a <= t < b for a, b in windows)


def cost(model, u):
    p = PRICES[model]
    cc = u.get('cache_creation') or {}
    w5 = cc.get('ephemeral_5m_input_tokens', 0)
    w1 = cc.get('ephemeral_1h_input_tokens', 0)
    if not cc:
        w5 = u.get('cache_creation_input_tokens', 0)
    return {
        'input': u.get('input_tokens', 0) * p[0] / 1e6,
        'read': u.get('cache_read_input_tokens', 0) * p[2] / 1e6,
        'write': (w5 * p[3] + w1 * p[4]) / 1e6,
        'output': u.get('output_tokens', 0) * p[1] / 1e6,
    }


def load(path, windows):
    """Return the API requests of one log, in order, each with its tool calls."""
    reqs = {}
    order = []
    events = []  # (timestamp, kind, request id or None)
    for line in open(path):
        try:
            m = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = m.get('timestamp')
        if not t or excluded(t, windows):
            continue
        if m.get('type') == 'assistant':
            msg = m['message']
            rid = msg['id']
            if rid not in reqs:
                reqs[rid] = {'model': msg.get('model'), 'usage': msg['usage'], 'blocks': [], 't': t}
                order.append(rid)
                events.append((t, 'a', rid))
            else:
                # usage repeats per content line; keep the largest output count
                if msg['usage'].get('output_tokens', 0) >= reqs[rid]['usage'].get('output_tokens', 0):
                    reqs[rid]['usage'] = msg['usage']
            for b in msg.get('content', []):
                if b.get('type') == 'tool_use':
                    reqs[rid]['blocks'].append(b)
                    CALLED_AT[b['id']] = (t, b)
            reqs[rid]['t_end'] = t
        elif m.get('type') == 'user':
            events.append((t, 'u', None))
            c = m['message']['content']
            if isinstance(c, list):
                for b in c:
                    if isinstance(b, dict) and b.get('type') == 'tool_result':
                        RESULT_AT[b.get('tool_use_id')] = t
    return [reqs[r] for r in order if reqs[r]['model'] in PRICES], events


def analyse(label, rel, windows, trace=False):
    main = P + rel + '.jsonl'
    reqs, events = load(main, windows)
    rows = {ph: defaultdict(float) for ph in PHASES}
    prev_phases = ['brief']  # the first request writes the system prompt, tools and brief
    for i, r in enumerate(reqs):
        phases = [phase_of(b) for b in r['blocks']] or [prev_phases[-1] if i else 'brief']
        c = cost(r['model'], r['usage'])
        u = r['usage']
        # reading the context and generating: this request's own phase(s)
        for ph in phases:
            share = 1 / len(phases)
            rows[ph]['turns'] += share
            rows[ph]['input_tok'] += u.get('input_tokens', 0) * share
            rows[ph]['cached_tok'] += u.get('cache_read_input_tokens', 0) * share
            rows[ph]['output_tok'] += u.get('output_tokens', 0) * share
            rows[ph]['cost'] += (c['input'] + c['read'] + c['output']) * share
            rows[ph]['read_cost'] += c['read'] * share
        # writing new content to the cache: mostly the previous request's tool
        # results, so it belongs to the phase(s) that produced them.  When the
        # cached prefix shrank (the cache expired during a wait), the part of
        # the write that re-caches old context goes to 'rebuild' instead.
        written = u.get('cache_creation_input_tokens', 0)
        rebuilt = 0
        if i:
            pu = reqs[i - 1]['usage']
            before = pu.get('cache_read_input_tokens', 0) + pu.get('cache_creation_input_tokens', 0)
            if u.get('cache_read_input_tokens', 0) < 0.8 * before:
                rebuilt = min(written, before - u.get('cache_read_input_tokens', 0))
        if rebuilt:
            f = rebuilt / written
            rows['rebuild']['written_tok'] += rebuilt
            rows['rebuild']['cost'] += c['write'] * f
            rows['rebuild']['write_cost'] += c['write'] * f
        for ph in prev_phases:
            share = (1 - (rebuilt / written if written else 0)) / len(prev_phases)
            rows[ph]['written_tok'] += written * share
            rows[ph]['cost'] += c['write'] * share
            rows[ph]['write_cost'] += c['write'] * share
        if trace:
            names = []
            for b in r['blocks']:
                inp = b.get('input') or {}
                d = inp.get('command') or inp.get('file_path') or inp.get('skill') or inp.get('pattern') or ''
                names.append(f"{b['name'].replace('mcp__tandembike__', 'tb:')}[{phase_of(b)}] {d[:70]!r}")
            print(f"  {r['t'][11:19]} w={u.get('cache_creation_input_tokens', 0):>6} r={u.get('cache_read_input_tokens', 0):>7} "
                  f"o={u.get('output_tokens', 0):>5} ${sum(c.values()):.3f} | {'; '.join(names) or '(text)'}")
        prev_phases = phases

    # subagents: review (code-review's parallel reviewers)
    sub_cost = 0
    for f in glob.glob(P + rel + '/subagents/*.jsonl'):
        sreqs, _ = load(f, windows)
        for r in sreqs:
            c = cost(r['model'], r['usage'])
            sub_cost += sum(c.values())
            rows['review']['sub_cost'] += sum(c.values())
            rows['review']['cost'] += sum(c.values())

    # wall clock: generation time goes to the request that ends the interval,
    # tool time to the request that started it.  Gaps longer than 120 s are
    # counted apart as waiting (the User, CI, or a background agent).
    # A text-only request keeps the phase of the request before it.
    phases_at = {r['t']: [phase_of(b) for b in r['blocks']] for r in reqs}
    events.sort()
    wall = defaultdict(float)
    waiting = 0.0
    cur = ['brief']
    for (t0, _, _), (t1, k1, _) in zip(events, events[1:]):
        dt = (ts(t1) - ts(t0)).total_seconds()
        if dt > 120:
            waiting += dt
            continue
        if k1 == 'a' and phases_at.get(t1):
            cur = phases_at[t1]
        phs = cur
        for ph in phs:
            wall[ph] += dt / len(phs)
    total_wall = sum(wall.values())
    return rows, wall, waiting, total_wall, len(reqs), sub_cost


def main():
    trace = '--trace' in sys.argv
    out = {}
    for group, runs in (('start', RUNS), ('terminal', EXTRA)):
        for label, rel, windows in runs:
            if trace:
                print('=====', label)
            rows, wall, waiting, total_wall, n, sub = analyse(label, rel, windows, trace)
            out[label] = {'group': group, 'rows': {k: dict(v) for k, v in rows.items()}, 'wall': dict(wall),
                          'waiting': waiting, 'active_wall': total_wall, 'requests': n, 'sub_cost': sub}
    if '--durations' in sys.argv:
        for tid, (t, b) in CALLED_AT.items():
            if tid in RESULT_AT and b['name'] in ('Bash', 'EnterWorktree', 'ExitWorktree'):
                cmd = (b.get('input') or {}).get('command', b['name']).split('\n')[0]
                if re.search(r'npm ci|npm run check|worktree|EnterWorktree|ExitWorktree|npm rebuild', cmd):
                    print(f"{(ts(RESULT_AT[tid]) - ts(t)).total_seconds():6.1f}s  {t[:16]}  {cmd[:110]}")
        return
    if '--json' in sys.argv:
        print(json.dumps(out, indent=1))
        return
    for label, d in out.items():
        tot = sum(r.get('cost', 0) for r in d['rows'].values())
        print(f"\n## {label} [{d['group']}] requests={d['requests']} cost=${tot:.2f} active={d['active_wall']:.0f}s waiting={d['waiting']:.0f}s")
        print(f"{'phase':8} {'turns':>5} {'input':>6} {'cached':>9} {'written':>8} {'output':>7} {'cost':>6} {'share':>5} {'wall s':>6}")
        for ph in PHASES:
            r = d['rows'][ph]
            print(f"{ph:8} {r.get('turns', 0):5.1f} {r.get('input_tok', 0):6.0f} {r.get('cached_tok', 0):9.0f} {r.get('written_tok', 0):8.0f} "
                  f"{r.get('output_tok', 0):7.0f} {r.get('cost', 0):6.3f} {100 * r.get('cost', 0) / tot:4.0f}% {d['wall'].get(ph, 0):6.0f}")


if __name__ == '__main__':
    main()
