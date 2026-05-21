# Web Client

React 18 + Vite SPA for LLM Remote Runner. Uses `react-router-dom` for client-side routing and the shared `@codex/sdk` package to create, stream, and persist tasks/conversations across multiple LLM backends.

## Environment

Set `VITE_GATEWAY_URL` in `web/.env.local` to point at the gateway API (defaults to `http://localhost:3000`).

## Scripts

- `pnpm dev` – start the Vite dev server on port 3001 (strictPort).
- `pnpm build` – typecheck and produce a production build in `dist/`.
- `pnpm preview` – serve the built app from `dist/`.
- `pnpm typecheck` – run `tsc --noEmit`.
