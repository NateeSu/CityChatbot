# CityChatbot web foundation

The production web application uses Next.js App Router with strict TypeScript. The existing `gui-prototype/` remains a visual reference and is not imported into production code.

## Local setup

From the repository root:

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3100`. The health endpoint is `http://127.0.0.1:3100/api/health`.

Environment parsing is fail-fast and never prints secret values. Tenant IDs and model routes must be supplied by environment/configuration; they are not hard-coded.
