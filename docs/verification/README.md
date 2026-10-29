# Local release checks

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

This is a short, synthetic localhost test. It demonstrates the implemented 100-client scenario, not sustained free-tier capacity, production latency, physical mobile-device performance, provider uptime, or behavior after daily quota exhaustion. Hosted checks remain necessary after deployment.

## Deployment state

The app is locally buildable and tested, with Vercel frontend and Cloudflare backend configuration prepared. No paid service was enabled. Cloudflare CLI reported that no account was authenticated. A live public release has not been verified.
