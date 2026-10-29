# Skkrible

A friends-only drawing and guessing game. Make a private room, send the invite, and take turns drawing. The interface uses an original paper-and-ink design, with 18px chat and a compact mobile guessing layout.

## Run locally

Requires Node 22.12+ and npm. Install dependencies with `npm ci`. With npm versions that block install scripts, approve the pinned esbuild/workerd scripts and run `npm rebuild esbuild workerd`.

Start these in separate terminals:

```sh
npm run dev:backend
npm run dev
```

Open http://127.0.0.1:5173. Open another browser profile or private window to join as another player. Browser tests use the installed Google Chrome, not your personal browser profile.

## What works

- Private invite links and 2–20 player rooms, with avatars and host settings.
- Turn-based word selection, hints, server-owned scoring, custom words, and results.
- Mouse, pen, and touch drawing; colors, sizes, eraser, undo, and clear.
- Live ink previews and durable completed strokes.
- Automatic reconnect with backoff, restored seats/scores/boards, and replay of unacknowledged commands.
- Server-side command deduplication, role checks, bounded messages, and text-only chat rendering.
- Host handoff when disconnected and room pause when everyone is away.

Room storage lives in each backend Durable Object's SQLite database. Scores are per-room and persist with the room across hibernation and server restarts. Rooms expire after 24 hours without accepted commands or joins. There is no separate database service, account system, or global leaderboard.

## Checks

```sh
npm test
npm run check:backend
npm run build
# With both development servers running:
npm run test:integration
npm run test:browser
npm run test:load
```

The tests cover engine rules, answer privacy, duplicate commands, real WebSocket disconnect/reconnects, a complete browser game, safe chat rendering, desktop/mobile layouts, and touch input. An actual local backend restart was also checked against saved seat, score, and drawing data.

The [local verification report](docs/verification/README.md) includes the 100-client run: five rooms, 300 committed strokes, 50 recovered connections, and 69 ms p95 local drawing delivery. These are local emulator results, not a hosted latency promise.

Screenshots and local test state are ignored under `.tools`/`test-results`. Tool versions are pinned in `package-lock.json`. No skribbl.io source or assets are imported by the app; earlier artifact research is kept separately under `research`.

## Hosting

The frontend is ready for Vercel's free static hosting using the root `vercel.json`. The backend is a Cloudflare Worker with SQLite-backed Durable Objects, compatible with its free tier. Deployment is not complete until both services are connected to your accounts and configured with their real URLs.

1. Deploy the backend with `npx wrangler deploy --config apps/backend/wrangler.jsonc` while using a Cloudflare Workers **Free** account.
2. Import this repository into Vercel. Keep the root directory at the repository root; build/output settings are in `vercel.json`.
3. Set Vercel's `VITE_BACKEND_URL` to the returned `https://…workers.dev` URL and rebuild.
4. Replace `ALLOWED_ORIGINS` in `apps/backend/wrangler.jsonc` with your exact Vercel origin, such as `https://your-project.vercel.app`, then redeploy. You can retain the two local origins for local development. Separate trusted origins with commas; wildcards are not accepted. A later CLI deployment uses this file, so a dashboard-only variable edit would be overwritten.

`VITE_` variables are public build-time values. No backend credentials belong in them. Local origin defaults are intentionally not a production origin allowlist. Use Cloudflare's free `workers.dev` URL and Vercel's free `vercel.app` URL; a custom domain is not required.

For a local CLI deployment instead of a Git import, sign in with `npx vercel login`, then run `npx vercel --prod` from the repository root. `.vercelignore` omits analysis artifacts, downloaded tools, backend source, and tests from the frontend upload. Cloudflare login is `npx wrangler login`; these interactive account authorizations must be completed by the account owner.

## Reliability and free-tier boundaries

Disconnected seats remain reserved for the room's lifetime unless explicitly left or removed. Keep the tab open to reconnect; this version stores its resume token in sessionStorage, so a completely new browser session is a new seat. A browser that blocks storage can still play, but cannot recover its identity after a page reload.

Live preview packets can be dropped; acknowledged completed strokes and game state are durable. An in-progress gesture interrupted before it becomes a completed command is not guaranteed to survive a tab/process crash. The client splits very long gestures into bounded strokes.

Free hosting has finite daily compute and storage-operation quotas. Quota exhaustion, provider outages, and device/network failures can still interrupt a game. The design makes interruptions recoverable; it does not promise no disconnects. The room-creation throttle is per Worker instance and should become a shared abuse-control mechanism before adding public matchmaking. No paid plan is enabled by this project.

See [game contract](docs/game-protocol.md) for limits and scoring. Deployment and live-provider latency require verification after account setup.
