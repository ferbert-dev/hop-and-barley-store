<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hop & Barley Web

- Follow the root `AGENTS.md`, relevant ticket and architecture. Web tickets inherit its one-branch/PR, model-routing and agent-lifecycle rules.
- Stack: Next.js 16 App Router, React 19 and Tailwind CSS 4. Read version-matched bundled Next docs and use Context7 for current external documentation.
- Before any frontend implementation or UI change, read `docs/figma-design-navigation.md`, open the exact screen/node link recorded there, and reproduce the confirmed design faithfully. If a detail is unclear, verify it in Figma through an available browser session; if neither the document nor Figma confirms it, stop and ask the user one short, concrete question instead of inventing it. Keep user-confirmed additions explicitly separate from Figma-authored details.
- Use `vercel-react-best-practices` only as a React/Next performance checklist; it does not select Vercel hosting.
- Prefer Server Components. Add a client boundary only for browser-only state, events or APIs, and keep it as narrow as possible.
- Browser code never accesses PostgreSQL or imports API source. Server-rendered code uses the generated `@hop-and-barley/api-client`; Docker API base is `http://api:3001/api/v1`.
- Reuse established UI primitives, design tokens and local production assets. Do not create duplicate product-card, price or status implementations.
- Preserve accessible names, keyboard order, visible focus, reduced motion, responsive reflow and explicit loading/empty/error states.
- Public catalog caching stays query-specific; private identity/cart/order data must remain private and no-store.
- Verify UI behavior in a real browser against the live or isolated ticket-approved stack. Static rendering/unit tests alone do not prove a flow.
- Keep Playwright screenshots, traces, reports, coverage and generated evidence outside Git. Record only concise checks, cleanup and exact head SHA.
- Production hosting remains provider-neutral; do not add provider-specific deployment files without an approved decision and ticket.
