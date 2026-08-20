# Engineering workflow

Work flows from outcome to Epic when needed, then to decision-complete tickets. A ticket moves Inbox → Ready → In Progress → Review → Done; use Blocked, Won't Do, or Archive only with a recorded reason.

Ready requires one outcome, primary role, dependencies, acceptance criteria, risks, verification, rollback, and required authority. Builders work in a focused branch and provide evidence. A separate reviewer returns PASS, FAIL, or BLOCKED before closure.

Trace completed engineering as: Notion Epic/Ticket/Agent Runs → Git branch/PR/CI → repository code/tests/docs.

## Multi-model orchestration

The root orchestrator owns one vertical scope and its integration, PR, and final status. Use at most two disjoint workers and no idle pool. Stop or reuse workers immediately after handoff; do not start a second scope before merge or an explicit Blocked state.

- Sol: architecture, security-sensitive/risky cross-cutting work, and the single exact-head reviewer after green CI.
- Terra: routine feature implementation, medium-complexity fixes, and integration.
- Luna: bounded mechanical edits, fixtures, repetitive tests, inventories, and documentation.

Every delegation records explicit model, reasoning effort, and a one-line cost/correctness rationale. Uncertainty about boundaries, security, data integrity, or correctness escalates upward to Sol. A new PR head invalidates the prior review verdict.
