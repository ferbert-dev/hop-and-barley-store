<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hop & Barley Web

- Read the repository-root `AGENTS.md` before state-changing work.
- This app uses Next.js 16 App Router, React 19, and Tailwind CSS 4. Read relevant version-matched guidance in `node_modules/next/dist/docs/` and use Context7 for current external documentation.
- Use `vercel-react-best-practices` for React and Next.js performance review only; it does not imply Vercel hosting.
- The browser never connects to PostgreSQL directly. Server-rendered code reaches the API through `API_INTERNAL_URL`; inside Docker that address is `http://api:3001/api/v1`.
- Keep graceful API-unavailable states, but verify successful changes against the live local stack with Playwright.
- Production hosting is undecided. Do not add provider-specific deployment files without an explicit decision and ticket.
