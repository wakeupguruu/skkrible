# Release checks

Latest release: [phone reference layout, private guesses, turn points, and voting](phone-layout.md). Previous UI release: [compact game UI and custom faces](ui-redesign.md). The record below describes the initial release.

Verified 30 October 2026 on Windows with Node 24.21.0, Wrangler 4.156.0, Vite 8.3.5, Playwright 1.64.1, and installed Google Chrome. The frontend and backend were running locally.

## Functional coverage

- 9 Node game-rule tests: full games, server-owned scores, answer/credential privacy, command deduplication, role and input validation, pause/resume, host handoff, saved-state restoration, and bounded hint scheduling.
- 3 real WebSocket integration tests: origin/API boundaries, shared drawing, lost connections, score recovery, and duplicate drawing delivery.
- 3 Chrome browser tests: a complete two-player game, intentional connection interruption and page reload, preserved chat draft, drawing geometry restoration, text-only chat rendering, final scores, mobile touch input, no viewport overflow, and board/input visibility in a reduced keyboard-sized viewport.
- An actual backend process stop/restart restored a test player's original seat, score, and committed drawing from the local SQLite database.
- Production frontend build and backend deployment dry-run succeeded. Dependency audit reported zero known vulnerabilities after using the fixed `ws` release.

The canvas recovery test compares geometry and ink coverage with a small antialiasing tolerance. Chrome GPU and software canvas readback can rasterize the same stored stroke with different edge pixels; exact PNG encoding is not used as a game-correctness condition. The transport test checks the committed stroke data exactly.

## 100-client run

The reproducible command is `npm run test:load` while the local backend is running. [Raw results](load-100-clients.json) record the measured run:

| Measurement | Result |
| --- | --- |
| Concurrent clients | 100 |
| Rooms | 5 × 20 players |
| Active drawers | 5 |
| Committed strokes | 300, with 20 points each |
| Drawing delivery samples | 5,700 |
| Drawing delivery p50 / p95 / p99 | 26.71 / 69.03 / 81.43 ms |
| Durable command acknowledgement p95 | 77.33 ms |
| Dropped/recovered connections | 50 |
| Additional scored seats reconnected and checked | 5 |
| 50-client reconnect wave | 2,898 ms |
| Total synthetic run | 19 seconds |

Every observer received the final stroke in its room. Restored seats retained their IDs and complete committed drawings without receiving the secret answer. Scored players retained the exact score on a second reconnection. The browser suite was also running during this load test.

This is a short, synthetic localhost test. It demonstrates the implemented 100-client scenario, not sustained free-tier capacity, production latency, physical mobile-device performance, provider uptime, or behavior after daily quota exhaustion. The 100-client run has not been repeated against production.

## Deployment state

Deployed and verified on 30 October 2026:

- Website: https://skkrible.vercel.app (unauthenticated HTTP 200 and the expected game HTML).
- Backend: https://skkrible-rooms.vyasguru44.workers.dev, Worker `skkrible-rooms`, SQLite Durable Object `GameRoom`, migration `v1`.
- Initial Cloudflare deployment ID: `8b3fd7f753724415b5066a77bd08fb5f`, uploaded through the authenticated Cloudflare MCP using Wrangler's validated bundle.
- Initial Vercel deployment: `dpl_6fMfsQ86q4WbiuqBMHf8spKKATo8`, Hobby plan. Production backend URL is saved in Vercel and GitHub integration is connected.
- All 3 real WebSocket tests passed against the deployed backend with the production Origin: boundary checks, exact drawing restoration, seat/score recovery, and duplicate command handling (9.2 seconds).
- All 3 Chrome browser tests passed against the live website: complete game, disconnect/reconnect, reload, safe chat, final scores, explicit leave, mobile touch/keyboard layout, and invalid invite (40.8 seconds). No page errors were reported by the covered game scenarios.
- All 9 game-rule tests and both production builds passed before deployment. No paid plan or subscription was enabled. The existing Vercel access settings were left unchanged after the canonical production URL was confirmed public.

To rerun the deployed checks from PowerShell:

```powershell
$env:TEST_BACKEND_URL = 'https://skkrible-rooms.vyasguru44.workers.dev'
$env:TEST_ORIGIN = 'https://skkrible.vercel.app'
npm.cmd run test:integration
$env:TEST_BASE_URL = 'https://skkrible.vercel.app'
npm.cmd run test:browser
```

These tests create temporary test rooms that expire after 24 hours. Hosted checks used one Windows machine with separate Chrome contexts and mobile emulation. Physical phones, multiple geographic regions, extended outages, sustained 100-player production traffic, and free-tier exhaustion remain unverified.
