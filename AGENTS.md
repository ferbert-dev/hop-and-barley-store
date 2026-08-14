# Project Operations

Read the project architecture and relevant ticket before state-changing work.

Sources of truth: repository code, tests, migrations, and Git history define implementation; Notion defines intent, tickets, decisions, roles, and Agent Runs; GitHub defines review, CI, merge, and deployment evidence.

Before implementation or external writes, inspect repository state, identify the ticket, confirm acceptance criteria, risks, verification, rollback, and authority. Create an Agent Run before delegation.

Each ticket has one primary role. Use an Epic for multi-slice work. Every mutating ticket needs an independent closure review before Done. Do not store secrets or credentials in repository files, Notion, GitHub, prompts, or run logs.
