# Notion schema

First search for an existing hub by exact project name and exact GitHub repository URL. Create all items only if a complete matching hub does not exist. Name a new hub `<Project Name> — Project Ops` and include a `GitHub repository` URL property or a visible repository link on the hub page.

## Architecture

- Name: title
- Status: select — Draft, Verified, Superseded
- Scope: select — System, Module, Data, Integration, Decision
- Summary: rich text
- Evidence: URL
- Last verified: date

## Tickets

- Name: title
- Status: select — Inbox, Ready, In Progress, Review, Blocked, Done, Won't Do, Archive
- Type: select — Epic, Research, Design, Implementation, QA, Ops, Documentation, Retrospective
- Priority: select — P0, P1, P2, P3
- Primary role: relation to Agent Registry
- Parent Ticket: relation to Tickets
- Depends On: relation to Tickets
- Acceptance Criteria: rich text
- Risks and Rollback: rich text
- Verification: rich text
- Evidence: URL
- GitHub PR: URL
- Architecture: relation to Architecture

## Agent Registry

- Name: title
- Mission: rich text
- May delegate: checkbox
- Escalate for: rich text
- Default evidence: rich text

## Agent Runs

- Name: title
- Status: select — Running, Succeeded, Failed, Blocked, Cancelled
- Task / Ticket: relation to Tickets
- Agent: relation to Agent Registry
- Started At: date
- Finished At: date
- Duration: formula or number
- Objective: rich text
- Result: rich text
- Links: URL
- Error or blocker: rich text

## Relations and views

Create reciprocal Ticket relations for Parent Ticket and Depends On. Create reciprocal relations from Agent Runs to Tickets and Agent Registry, and from Tickets to Architecture. Add views: Active Tickets, Ready Queue, Review Queue, Blocked, Agent Run History, and Architecture by Status.

## Seed order

1. Project Hub
2. Four databases and relations
3. Agent Registry role records
4. Bootstrap Epic and setup ticket
5. Architecture overview
