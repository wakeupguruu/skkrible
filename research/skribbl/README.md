# skribbl.io investigation

Investigated 30 October 2026. Target: https://skribbl.io/.

This is a product and browser-client investigation, using REA static JavaScript analysis and controlled Chrome sessions. It is not the game's original source repository, a complete server reconstruction, or a security audit.

## What was actually checked

- Read the live homepage, instructions, news, terms, and credits.
- Captured the homepage in an isolated, headless Chrome session through REA.
- Downloaded the public HTML, first-party JavaScript, and stylesheet for local inspection.
- Ran REA's `analyze_javascript_application` on the downloaded client.
- Created an isolated private room through the ordinary UI and inspected its DOM, accessibility tree, HTTP metadata, and WebSocket messages.
- Created another private room, changed capacity from 8 to 20 and mode from Normal to Hidden, and confirmed the server echoed both settings.
- Clicked Start with one player and confirmed the server returned the minimum-player error.
- REA reported that each temporary browser process was terminated after its scenario. No public room was joined and no messages were sent to other players.

Selected REA results are saved in [evidence.json](evidence.json). That file intentionally omits full DOM captures and unrelated advertising traffic. The static graph's original parent evidence remains session-retained rather than exported in full.

## Product and main flow

skribbl.io is a free browser multiplayer drawing-and-guessing game. A player enters a nickname, chooses a language, customizes an avatar, and either enters public matchmaking or creates a private room. The examined entry flow required no account.

Players take turns choosing a word and drawing it. Other players type guesses into the chat input. The site awards points for correct guesses and crowns the highest-scoring player at the end. The instructions explicitly ask drawers not to spell the word.

The client includes waiting, starting, round announcements, word selection, drawing, word reveal with turn results, and final podium screens. It also includes correct-guess messages, close-guess feedback, drawing likes/dislikes, ties, and a no-winner result. These game screens were identified in the delivered client; a full multiplayer match was not played.

Private rooms have a shareable invite URL shaped like `https://skribbl.io/?ROOM_ID`. The creator becomes the room owner. The owner can change settings and start the game. The client disables these controls for non-owners; server authorization for non-owner requests was not tested.

## Private room settings

Defaults below were observed in a fresh private lobby and in its server initialization message.

| Setting | Offered choices | Observed default |
| --- | --- | --- |
| Players | 2–20 | 8 |
| Language | 28 language entries | English |
| Drawing time | 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240 seconds | 80 seconds |
| Rounds | 2–10 | 3 |
| Game mode | Normal, Hidden, Combination | Normal |
| Word choices | 1–5 | 3 |
| Hints | 0–5 | 2 |
| Use custom words only | Checkbox | Off |

The 28 offered languages are English, German, Bulgarian, Czech, Danish, Dutch, Finnish, French, Estonian, Greek, Hebrew, Hungarian, Italian, Japanese, Korean, Latvian, Macedonian, Norwegian, Portuguese, Polish, Romanian, Russian, Serbian, Slovakian, Spanish, Swedish, Tagalog, and Turkish. A game-language selector does not establish that all interface text has a matching translation.

Mode behavior identified in client code:

- **Normal:** shows word-length placeholders and applies received hints.
- **Hidden:** replaces the guesser's length display with three question marks and a hidden-word label.
- **Combination:** presents two successive word selections, passing the two selected indices to the server.

Custom words are comma-separated. The textarea advertises at least 10 words, 1–32 characters per word, and at most 20,000 characters in total. The HTML enforces a 20,000-character textarea limit. However, the Start handler sends trimmed custom entries when the comma-split array has at least 5 elements. It does not itself establish the advertised per-word length or minimum of 10 nonempty words. Actual server acceptance of these edge cases was not tested.

## Drawing and interaction

The board is an HTML canvas with an intrinsic resolution of **800×600**. CSS scales its display; pointer coordinates are converted back to canvas coordinates using its current bounding rectangle.

The delivered drawing client includes:

- Brush and bucket fill.
- 26 preset colors and primary/secondary color selection.
- Five brush-size presets: 4, 10, 20, 32, and 40 canvas pixels.
- Undo and clear.
- Left/right mouse-button drawing and color selection.
- Pointer capture and pen-pressure handling.
- Configurable hotkeys; defaults include B for Brush, F for Fill, U for Undo, C for Clear, and S for swapping colors.

The fill implementation manipulates canvas pixel data and uses a small RGB tolerance. Brush drawing is also implemented in client code. These are local drawing operations synchronized through command data, rather than video streaming.

The drawing client retains a command history, tracks undo boundaries, and caches image regions after groups of 50 commands. Undo truncates the history and reconstructs the remaining image using cached regions plus command replay. Clear resets the history and notifies the server.

While the current user is drawing, a timer sends up to 8 pending commands every 50 milliseconds. Other clients replay queued received commands through a timer. These are observed scheduling constants, not a measured throughput or latency guarantee.

Drawing-state initialization can include `drawCommands`, indicating a client path for restoring an existing board when receiving a room snapshot. Joining mid-drawing was not tested.

## Moderation and room behavior

The public UI and client contain owner kick/ban controls, votekick, mute/unmute, and reporting. Report categories cover inappropriate messages/drawings, spam, and botting/cheating.

The client prevents voting to kick the room owner. It also handles server responses for full/missing rooms, kick cooldowns, bans, joining too quickly, duplicate room connections, too many connections from an IP, and repeated kicks. These handlers do not prove the server's thresholds or enforcement details.

The client handles spam feedback, player joins/leaves, avatar/name updates, owner changes, guesses, hints, scores, and drawing votes. Message rendering includes visibility rules for drawers and players who have already guessed. Moderation effectiveness and role enforcement were not exercised against other users.

## Browser architecture

The examined page loads the first-party files [js/game.js](client/js/game.js), [js/socket.io.js](client/js/socket.io.js), and [css/style.css](client/css/style.css).

`game.js` is a minified browser script that directly manages DOM elements, canvas state, preferences, audio, networking, and game state. The delivered entrypoint does not expose a React/Vue-style application structure. That observation does not establish what build tools or private development source the authors use.

The Socket.IO file identifies itself as **Socket.IO v4.8.3**. The observed live handshake uses **Engine.IO protocol 4**.

Observed connection sequence:

1. The browser posts to `https://skribbl.io/api/play` and receives HTTP 200.
2. The client uses the returned server address to establish a Socket.IO connection.
3. In the captured room, the WebSocket endpoint was `wss://server3.skribbl.io/5003/?EIO=4&transport=websocket`.
4. It sends a `login` event with join/create intent, nickname, language, and avatar.
5. A `data` event with numeric ID 10 initializes room ID/type, local player ID, owner, users, settings, round, and current state.
6. Subsequent gameplay travels through `data` events with numeric operation IDs.

The client configures WebSocket and polling transports. This investigation observed WebSocket; fallback to polling was not exercised. The selected server and path are deployment observations, not permanent API contracts.

The captured Engine.IO opening message advertised a 5,000 ms ping interval, 20,000 ms ping timeout, and 81,920-byte maximum payload. These values apply to that connection.

The bootstrap POST uses form-urlencoded data. The client supplies a language for matchmaking/creation or a room ID for invitation joins. A server URL/path is then selected dynamically. Backend implementation language, database, hosting provider, region routing, capacity, and persistence are unknown.

## Client protocol map

This map comes from the current minified client dispatcher and emit sites. Only initialization, settings, start, and the minimum-player response were verified live. Direction and interpretation of other messages remain based on static client evidence.

| Data ID | Client interpretation / use |
| --- | --- |
| 1 / 2 | Player joined / left |
| 3 / 4 | Kick / ban request |
| 5 | Votekick |
| 7 | Mute action notification |
| 8 | Drawing rating |
| 9 / 90 | Avatar / name update |
| 10 | Initial room snapshot |
| 11 | Game-state update |
| 12 | Room setting update |
| 13 / 14 | Hints / timer update |
| 15 / 16 | Correct guess / close-guess feedback |
| 17 | Owner update |
| 18 | Word selection |
| 19 | Drawing command batch |
| 20 / 21 | Clear / undo |
| 22 | Start request with custom-word text |
| 30 | Chat message |
| 31 | System notification |
| 32 | Spam warning |

The settings array is indexed as language, slots, draw time, rounds, word-choice count, hint count, word mode, and custom-only flag. The observed initial array was `[0,8,80,3,3,2,0,0]`.

The current client state IDs map to waiting for players (0), starting (1), round announcement (2), word selection (3), drawing (4), turn reveal/results (5), game results (6), and private lobby (7). The private lobby state was observed live; the other mappings come from client screen/state handlers.

Scores, chosen-word information, hints, room state, and owner changes arrive from the server. This supports a server-coordinated game architecture. It does not establish the exact scoring formula, answer-matching rules, or resistance to forged requests.

## Visual structure and mobile support

The HTML/CSS define a blue patterned page, pixel-art avatars/icons, and Nunito interface typography, with Inconsolata also requested. Avatars compose color, eyes, mouth, and special layers from sprite atlases. The script defines 28 color/body choices, 57 eye choices, and 51 mouth choices; special avatar handling is separate.

Desktop gameplay uses CSS Grid: a top information bar, players on the left, canvas in the center, chat on the right, and drawing tools below the canvas. Base player/chat widths are 200/300 pixels.

The stylesheet has a landscape adjustment at widths up to 1166 pixels that rearranges the toolbar. Portrait layouts place the canvas above the player/chat areas and allow the chat input at the top or bottom. These are source observations; no mobile device or screenshot-based layout QA was performed.

Settings include volume, hotkey reset/remapping, an experimental mobile keyboard, keyboard language layout, mobile chat input placement, brush pressure sensitivity, and chat bubbles on the board. Dark-theme and chat-filter preference handling also exists in the script.

Audio uses the Web Audio API and downloaded OGG effects for joins/leaves, round start, guessing, round outcome, and ticking. Sound playback was not listened to.

## Local persistence, ads, and public site information

The client probes localStorage availability and saves preferences including nickname, game language, display language, avatar, volume, dark theme, filter, pressure, mobile chat layout, keyboard settings, chat bubbles, and hotkeys. It also stores a last-ad timestamp. This describes browser preferences, not a server-side player account or data-retention policy.

The page includes AdinPlay advertising integration, Google advertising scripts, and Google Analytics loading code. The controlled homepage capture observed those integrations loading. Advertising requests account for considerable page content beyond the relatively small game client. No performance benchmark or tracking/compliance audit was performed.

The homepage's latest visible news entry is “Fresh paint,” dated 9 November 2022. It lists mobile support, the reworked toolbar, moderation, more room settings, languages, and avatar options. That old news date does not establish that development stopped; the currently delivered Socket.IO header identifies a later library version.

The credits acknowledge a sampled clock sound by InspectorJ and community contributors. The site lists `contact@skribbl.io`; its terms page additionally lists `skribblcontact@gmail.com`. The public terms include a restriction on reverse engineering and reuse of site software. Downloaded client files here are research references, not an open-source license or permission to republish assets.

## Important unknowns

- Exact scoring, fuzzy matching, word-selection/randomness rules, and word-list contents.
- Server implementation, source, infrastructure, storage, and scaling behavior.
- Full two-player turn flow, draw synchronization latency, mid-game joins, disconnect/rejoin recovery, and final results in a played match.
- Server enforcement of custom-word limits, settings permissions, moderation, rate limits, and anti-cheat protections.
- Public matchmaking behavior and mobile/stylus experience on real devices.
- Complete accessibility, security, privacy, browser compatibility, and performance results.

REA parsed both downloaded JavaScript files without parse failures, but reported partial application graph coverage and unknown semantic coverage, including 6,943 conservative semantic unknown records. Its static analysis did not analyze the HTML's two inline JavaScript bodies; those were read separately for this report. A successful parse is not complete semantic recovery or proof of runtime behavior.

## Sources and reproducibility

- [Live site and instructions](https://skribbl.io/)
- [Terms/privacy page](https://skribbl.io/terms)
- [Credits](https://skribbl.io/credits)
- [Public game client](https://skribbl.io/js/game.js)
- [Socket.IO bundle](https://skribbl.io/js/socket.io.js)
- [Stylesheet](https://skribbl.io/css/style.css)
- [Selected REA evidence](evidence.json)

Saved first-party file identities:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `client/index.html` | 21,530 | `9dfb62e32bd01f1391cb64793ee87eda632d0a544e863b1b9f0034b6a85a583a` |
| `client/js/game.js` | 59,478 | `5bbecae0727c84008b08e006dceb5838c42237e48ae2c8a0faddd1484cf57829` |
| `client/js/socket.io.js` | 46,822 | `7bcff1b4f1442787ff11dfc510dedb8de16502ff5c987c4bbeb477605f76d9a0` |
| `client/css/style.css` | 63,932 | `ad649f9be72263d33082c94c93468714296b0545b98607847700d14a89cc3f51` |

These identify this capture only; the live site can change.
