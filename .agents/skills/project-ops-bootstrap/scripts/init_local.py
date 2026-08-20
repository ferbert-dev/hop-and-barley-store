#!/usr/bin/env python3
"""Install missing project-operations templates without overwriting files."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def copy_missing(source: Path, target: Path) -> list[Path]:
    created = []
    for item in source.rglob('*'):
        if item.is_dir():
            continue
        destination = target / item.relative_to(source)
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, destination)
        created.append(destination)
    return created


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('project_root', type=Path)
    parser.add_argument('--project-name', required=True)
    parser.add_argument('--mode', choices=('core', 'light', 'regulated'), default='core')
    args = parser.parse_args()
    root = args.project_root.resolve()
    if not root.is_dir():
        raise SystemExit(f'Project root does not exist: {root}')
    skill_root = Path(__file__).resolve().parents[1]
    created = copy_missing(skill_root / 'assets' / 'repository', root)
    print(f'Project: {args.project_name}')
    print(f'Mode: {args.mode}')
    print('Created:')
    for file_path in created:
        print(file_path.relative_to(root))
    print('Existing files were preserved.')


if __name__ == '__main__':
    main()
