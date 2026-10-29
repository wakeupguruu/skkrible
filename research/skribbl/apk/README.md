# Scribble & Guess APK inspection

Inspected 30 October 2026. Supplied file: `C:\Users\vyasg\Downloads\kde\Scribble & Guess.apk`.

- Size: 20,070,600 bytes (about 19.1 MiB).
- SHA-256: `3022cadd35ab19b6715cc2ea62f765205d513b1c8692b660b57646f5535c78ff`.
- REA recognized an APK archive and completed its ZIP-entry inventory. No inventory integrity contradictions were reported; this is not Android signature verification.
- Python ZIP inspection counted 740 archive entries. REA's 741 occurrences include the inventory root.
- Contains `classes.dex` and `classes2.dex`; no `.so` native libraries were present.
- The only three assets are baseline compilation profiles and a timezone database. No packaged HTML/JavaScript game files were found in the archive inventory.

## App and game references

DEX class definitions include:

- `com.rahuls.scribbleio.ScribbleDrawApplication`
- `com.rahuls.scribbleio.ui.screens.game.GameActivity`
- `com.rahuls.scribbleio.ui.screens.main.MainActivity`
- `com.rahuls.scribbleio.ui.screens.main.CustomWebView`
- Initializers named AdsInitializer, CrashlyticsInitializer, PlayGamesInitializer, StreamChatInitializer, and TimberInitializer.
- A Firebase messaging service.

The DEX string pools contain `https://scribble.algodextrous.me/`, its hostname, and `skribbl.io`. They also contain public GitHub Gist word-list URLs with filenames `scribble-words.json`, `scribble-words-de.json`, `scribble-words-sr.json`, `scribble-words-in.json`, `scribble-words-ar.json`, and `scribble-words-it.json`. Their current availability, language interpretation, contents, and runtime use were not verified.

A small DEX table inspection located instruction-pattern candidates referencing the developer-domain strings in obfuscated methods and `skribbl.io` inside a method named `onConsoleMessage`. Pattern matching is not a full DEX disassembler: operand words can resemble opcodes. Those candidate sites must not be treated as verified executed instructions or a proven URL-loading call chain.

## What this establishes

This is Android client material with WebView-related classes and references to remote game domains. It is not a self-contained archive of skribbl.io's browser client or server. The observations support a remotely loaded web-game component, but do not prove whether every game mode uses it or whether it currently loads skribbl.io directly.

The APK may still clarify app navigation, WebView customization, game integrations, and word-list handling after proper Android decompilation. Finding a domain string alone does not establish affiliation with its owner or current network behavior.

## Follow-up with the installed JADX provider

The provider was subsequently installed and verified; see [Android tooling](../../../docs/android-tooling.md). REA 6.7.0 with jadx-headless-mcp 0.7.1 successfully decoded this APK and decompiled selected methods without executing the Android application.

- Package: `com.rahuls.scribbleio`.
- App version: 39.0, version code 39.
- Minimum SDK: 24; target SDK: 36.
- REA returned a complete decoded manifest and an engine-reported inventory of 17,541 classes and 740 resources. These are JADX's reported counts, not the raw sum of both DEX class-definition tables.
- `CustomWebView` contains an `android.webkit.WebView` field and an Android Compose view-interoperability call.
- Its constructor looks up `web_view_host` and `web_view_url` configuration values. When those lookups return the string `null`, its defaults are **`doodlr.io`** and **`https://doodlr.io/`**. The original APK therefore does not establish that this view defaults to skribbl.io.
- Its `onCreate` reads an incoming URI and, as a fallback, the `EXTRA_ROOM_URL` intent extra, passing these through a helper with the configured host and URL. It also reads local preferences and initializes play-duration bookkeeping.
- The Compose method consults `web_view_enable_ads` configuration before connecting the Android view to its UI.

These are verified decompiled client-code observations. The configuration lookup implementation, actual current configuration values, final WebView URL-loading callback, and live redirects were not inspected. A constructor fallback is not proof of the URL a particular running app session will load. Neither official affiliation with skribbl.io nor its remote backend implementation follows from this code.

## Initial blocker and remaining limits

During the initial archive-only inspection, REA's Android tools were unavailable because `REA_JADX_MCP_JAR` was not configured, and no JADX or Java command was found on this shell's PATH. This blocker has now been resolved for CLI analysis with a portable full JDK and the pinned provider JAR. Codex's existing REA registration has the new environment paths; its already-running MCP connection still requires restart/reconnection.

The initial inventory made no configuration changes. The follow-up installed the portable tools and backed up and updated only the REA environment configuration. The APK was never executed or modified. Package/version fields and manifest permission declarations are now decoded; signature verification was not performed. Access to the developer-domain website through the web tool failed, so no conclusions about the live site are drawn.

Further useful checks are: follow configuration lookup and final URL-loading call sites, examine game-owned classes, and observe the app in an isolated Android device/emulator. Remote server code still requires separate evidence.

## Saved evidence

- [REA archive inventory summary](rea-inventory-summary.json): actual REA Evidence.
- [DEX observations](dex-observations.json): separate Python table inspection, with candidate-match limitations.
- [Decoded Android package and manifest](android-package.json): actual REA/JADX Evidence.
- [CustomWebView class](custom-webview-class.json): actual REA/JADX member inventory.
- [Constructor](custom-webview-constructor.json), [onCreate](custom-webview-oncreate.json), and [Compose method](custom-webview-compose.json): actual REA/JADX decompilation Evidence.
