# Friends-only game contract

The first version targets about 100 simultaneous friends across private rooms, with 2–20 seats per room. The frontend is a static Vercel build. Each backend room will be one SQLite-backed Cloudflare Durable Object. There is no shared global leaderboard or account system.

The server owns turns, words, hints, deadlines, and scores. Correct guesses earn 100–500 points based on remaining server time; each correct guess earns the drawer 50 points. The browser never receives other players' resume credentials or the answer before guessing/reveal. These are our game's rules, not a claim about skribbl.io's scoring.

Commands have a random `id`, a `type`, and, for turn-specific actions, a `turnId`. The server retains recent command receipts so replaying an acknowledged or uncertain command cannot double-score or duplicate a drawing. A completed stroke also has its own ID, making stroke retries independent of the receipt window. The client must not carry unsent strokes into another turn.

Commands: `settings`, `start`, `choose`, `chat`, `stroke`, `undo`, `clear`, `kick`, and `leave`. Live ink previews will be transient; completed strokes and game state will be durable before acknowledgement. State views and drawing data are separate, so ordinary score/chat updates do not retransmit the whole board. Snapshots contain the complete committed drawing for resynchronization.

A resume token restores the existing seat and score for the room's lifetime. Disconnecting preserves that seat. Another online player becomes host when necessary. A drawer has up to 30 seconds to reconnect, bounded by the remaining turn time. If everyone disconnects, the game pauses and can resume once two players return. Explicitly leaving or being removed releases the seat. Rooms expire after 24 hours without accepted game commands or joins; this is per-room session storage, not permanent player history.

Limits: 160-character chat, 4,000-character custom vocabulary, 1,200 committed strokes or 40,000 drawing points per turn, and 2,048 points per stroke. The UI will split long gestures into bounded strokes. Only the drawer can change the board, and only the host can change room settings or start a game.

Free hosting is a budget constraint, not an uptime guarantee. Cloudflare's free Durable Objects tier has daily compute and storage-operation quotas; exhausted quotas reject operations. Paid services will not be enabled automatically. Local 100-client verification will measure the implementation rather than certify hosted free-tier capacity.

References checked 30 October 2026: [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), and [Railway credits](https://railway.com/pricing). Railway's free allowance is usage-credit based, so it is not the default for this implementation.
