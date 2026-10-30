# Compact game UI release — 30 October 2026

Live website: https://skkrible.vercel.app

The interface now uses a compact game shell, an original face builder, inline room settings, and a timer ring with turn progress and timed-hint countdowns. It uses system fonts with no font-service request. The reference review and its limitations are recorded in [UI research](../../research/skribbl/ui-review-20261030.md).

## Checks passed

- 12 engine/codec tests, including distinct 1–5 word choices, difficulty pools, old-room defaults, exact hint deadlines, hint privacy, and all 800 avatar combinations.
- Backend production bundle dry-run and frontend build. Frontend JavaScript is 26.88 kB (9.77 kB gzip); CSS is 22.47 kB (5.58 kB gzip).
- All 3 real WebSocket tests against both local and deployed backends. The live run took 8.9 seconds and verified origin enforcement, exact drawing recovery, original seat and score recovery, and duplicate stroke handling.
- All 4 Chrome browser tests locally (49.9 seconds) and on the public website (about 1.1 minutes).

The browser scenarios cover a complete two-player match, saved inline settings, five choices from hard vocabulary, disabled guest settings, an actual server-timed letter hint, shared ink, forced disconnect and reconnect, restored drawing/draft/seat, reload, safe chat rendering, final scores, explicit leave, face customization/persistence, mobile touch, invalid invites, and viewport bounds. The game scenarios reported no page errors.

Viewport checks:

- Home: 320×568, 390×844, 1366×768, 1920×1080, and 844×390.
- Inline lobby settings and chat: 320×568, 390×844, 1366×768, and 844×390. Selects, custom words, and Start were asserted within the lobby panel and screen.
- Drawing and chat: 1440×1000, 1366×768, 320×568, 844×390, plus the 390×844 touch scenario.
- Mobile guessing with keyboard-sized viewport: 390×500, with both the drawing and chat input visible.

Page scrolling is eliminated at these sizes. Chat history and player rosters have their own scroll areas. The drawing retains its 4:3 coordinates rather than stretching ink when the screen changes shape.

## Deployment

Backend checkpoint: `0d22ea1`; frontend checkpoint: `51a1e7a`.

- Cloudflare deployment: `a9df8022fb8441a587b544a82d6ca583`, same Worker and migration `v1`. No room schema deletion or reset was performed; missing new settings retain compatible defaults.
- Vercel deployment: `dpl_8MMUWMwXf9711vE6dbQkXbvMrmka`, published to the existing canonical URL using its saved production backend setting.
- No dependencies, paid plans, or separate databases were added. Local preview processes were stopped after verification.

The 100-client load result remains the earlier localhost test. This release was not load-tested with 100 live clients. Physical phones/keyboards, accessibility zoom beyond the tested viewports, and sustained free-tier usage still need real-world verification.
