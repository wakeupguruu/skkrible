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

## Limitations and next evidence

REA's `inspect_android_package`, class, method, and reference tools are unavailable because `REA_JADX_MCP_JAR` is not configured. REA requests a caller-supplied `jadx-headless-mcp 0.7.1` JAR; an appropriate Java runtime is also needed. No JADX or Java command was found on this shell's PATH. That does not establish that neither is installed elsewhere.

No software was installed, configuration changed, APK executed, or original APK modified. Android package/version fields and permissions were not fully decoded; signature verification was not performed. Access to the developer-domain website through the web tool failed, so no conclusions about the live site are drawn.

Further useful checks are: decompile app-owned classes and URL-loading call sites; decode the manifest/resources; and observe the app in an isolated Android device/emulator. Remote server code will still require separate evidence.

## Saved evidence

- [REA archive inventory summary](rea-inventory-summary.json): actual REA Evidence.
- [DEX observations](dex-observations.json): separate Python table inspection, with candidate-match limitations.
