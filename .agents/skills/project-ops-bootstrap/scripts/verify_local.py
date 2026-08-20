#!/usr/bin/env python3
"""Verify installed project-operations files against portable source bytes."""
from __future__ import annotations

import sys
from pathlib import Path


REQUIRED = ('AGENTS.md', 'docs/engineering-workflow.md', 'tickets/ticket-template.md')
REQUIRED_AGENT_MARKERS = (
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'at most two disjoint workers',
    'does not keep an idle agent pool',
    'Start one Sol reviewer',
)
REQUIRED_WORKFLOW_MARKERS = (
    '## Multi-model orchestration',
    'explicit model, reasoning effort',
    'escalates upward to Sol',
    'A new PR head invalidates the prior review verdict',
)


def main() -> None:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None
    if root is None or not root.is_dir():
        raise SystemExit('Usage: verify_local.py <project-root>')
    missing = [path for path in REQUIRED if not (root / path).is_file()]
    if missing:
        raise SystemExit('Missing: ' + ', '.join(missing))
    template_root = Path(__file__).resolve().parents[1] / 'assets' / 'repository'
    drifted = [
        path
        for path in REQUIRED
        if (root / path).read_bytes() != (template_root / path).read_bytes()
    ]
    if drifted:
        raise SystemExit('Drifted project-operations files: ' + ', '.join(drifted))
    agents = (root / 'AGENTS.md').read_text(encoding='utf-8')
    workflow = (root / 'docs/engineering-workflow.md').read_text(encoding='utf-8')
    missing_policy = [
        marker
        for marker in REQUIRED_AGENT_MARKERS
        if marker not in agents
    ] + [
        marker
        for marker in REQUIRED_WORKFLOW_MARKERS
        if marker not in workflow
    ]
    if missing_policy:
        raise SystemExit('Missing orchestration policy: ' + ', '.join(missing_policy))
    if len(agents.splitlines()) > 80:
        raise SystemExit('AGENTS.md exceeds the 80-line portability limit')
    print('Local project-operations templates are installed.')


if __name__ == '__main__':
    main()
