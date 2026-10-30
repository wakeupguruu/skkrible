# Phone reference layout and private guesses — 30 October 2026

Live website: https://skkrible.vercel.app

The user-supplied phone screenshot is the layout reference. The phone game now has its timer/word/menu at the top, the board above two side-by-side panels (ranked players and successful guesses), and a full-width guess input at the bottom. The artist has a pencil label and blue row indicator; guessed players turn green. Room actions are under the gear button. Desktop retains its three-column game layout.

Between drawings, the HUD timer position shows the local player's earned points, and the board lists every player's points for that drawing turn. These are turn deltas, distinct from total game scores. Custom-word controls and selection are removed. Already-open old clients receive empty compatibility fields; previously stored custom lists are ignored.

Wrong guesses are private. Single-character insertion/deletion/substitution and adjacent transpositions receive private close feedback. Shared messages contain only successful-guess notifications. Points, joining/leaving notices, and the answer do not appear in that feed.

The host cannot kick directly. Any player can open another player's actions and vote. Removal requires a strict majority of the other connected seats captured when the vote starts, with a minimum of two distinct votes. Thresholds do not fall on disconnect; retries cannot add votes; late arrivals cannot join an existing vote; votes expire after 60 seconds. A successful vote removes the seat and its resume token. This is room removal, not a permanent account ban.

## Verification

- 17 engine tests passed, including private guesses, exact hint deadlines, per-turn score persistence/reset, old-room defaults, ignored custom lists, vote deduplication, fixed quorum, expiry/reconnection, and voting out the drawer/host.
- 4 real WebSocket tests passed locally and on Cloudflare (live: 14.0 seconds), including a private close acknowledgement and target removal only after the second voter.
- 5 Chrome browser tests passed locally (51.4 seconds) and on the public website (about 1.1 minutes). They cover a complete game/reconnect/reload, private wrong/close feedback, correct-only feed, turn points replacing the break timer, original touch drawing, side-by-side phone panels, full-width input, avatar persistence, viewport bounds, and three-player voting.
- Tested home sizes: 320×568, 390×844, 1366×768, 1920×1080, and 844×390. Lobby controls were checked at phone, laptop, and landscape sizes. Drawing/chat bounds were checked at 1440×1000, 1366×768, 320×568, 844×390, and the 390×844 touch scenario. The 390×500 keyboard-sized viewport keeps the drawing, player/chat panels, and guess input in frame.
- Frontend build and backend bundle dry-run passed. No dependencies or paid services were added. Client JavaScript: 28.59 kB (10.20 kB gzip); CSS: 22.62 kB (5.72 kB gzip).

Backend commit: `42766e8`. Frontend commit: `b1e2883`.

Cloudflare deployment: `3bfee6b44f42472685197cae4a4ce550`, same Worker and SQLite migration `v1`. Vercel deployment: `dpl_6mBYmmaQpQUYjVFx3axL9tTZp4mg`, same public canonical website.

Limits: physical phones/IME keyboards and sustained 100-player production traffic were not tested. Browser viewport/touch emulation is the evidence for phone layout. The prior GitHub push remains unapproved; these changes are committed locally and were deployed directly through the existing authenticated services.
