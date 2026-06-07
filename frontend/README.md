# SignalVault Frontend

## Setup (required)

This app is part of an npm **workspace** monorepo. Install dependencies from the **repository root**, not only inside `frontend/`:

```bash
# From SignalVault/ (repo root)
npm install
```

Then start the dev server:

```bash
# Mock data (no backend or wallet needed)
npm run dev:frontend:mock

# Or with live backend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000).

## Troubleshooting unstyled UI

If the app looks like plain black/white wireframes with no colors or layout polish:

1. Run `npm install` from the **repo root** (`SignalVault/`), not `frontend/` alone.
2. Delete `frontend/.next` and restart the dev server.
3. Use Node.js 20+ (`node -v`).

Styles live in `src/app/globals.css`. If that file fails to compile, the entire Tailwind theme will not load.

## Environment

Copy `frontend/.env.example` to `frontend/.env` and adjust ports if needed.
