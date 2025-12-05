# Web Client

Next.js App Router frontend for LLM Remote Runner. Includes a basic task console that calls the shared SDK to create and stream tasks across multiple LLM backends.

## Environment

Set `NEXT_PUBLIC_GATEWAY_URL` to point at the gateway API (defaults to `http://localhost:3000`).

## Scripts

- `pnpm dev` – start the development server.
- `pnpm build` – create an optimized production build.
- `pnpm start` – run the built app.
