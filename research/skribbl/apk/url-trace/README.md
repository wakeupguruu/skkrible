# Verified Android WebView URL path

Follow-up after restarting Codex on 30 October 2026. Artifact SHA-256: `3022cadd35ab19b6715cc2ea62f765205d513b1c8692b660b57646f5535c78ff`. REA 6.7.0, JADX provider 0.7.1, Java 21.0.13.

## Result

The app contains an explicit skribbl.io wrapper path. Its **bundled Firebase defaults select `https://skribbl.io/`**. The previously found `https://doodlr.io/` is the constructor's lower-level fallback when its configuration lookup yields `null`. Activated Firebase Remote Config values can replace the bundled defaults, so the exact current destination on a particular phone remains unobserved.

This explains why a single domain string or constructor fallback was insufficient to identify the actual configuration hierarchy. It also establishes a meaningful relationship between this APK and the website's client UI, without establishing official affiliation or access to its server source.

## Evidence chain

1. **MainActivity initialization** obtains Firebase Remote Config, installs `R.xml.remote_config_defaults`, then calls `fetchAndActivate()` and registers a completion listener. See [main-oncreate.json](main-oncreate.json).
2. **The completion listener** reads `FirebaseRemoteConfig.getAll()`, serializes it, and writes it into SharedPreferences under `key_app_config`. It attempts this read after both successful and failed task completion. See [config-completion.json](config-completion.json).
3. **`bg.f.d(key)`** lazily parses that saved configuration into a map and reads each entry's `value`. It returns the literal string `null` for missing values and caught failures. The parsed map is cached in a static field; this method itself does not refresh a map already loaded in memory. See [config-lookup.json](config-lookup.json).
4. **The CustomWebView constructor** reads `web_view_host` and `web_view_url`; absent configuration uses the `doodlr.io` fallbacks. Its complete constructor Evidence is retained in the parent APK investigation.
5. **CustomWebView.onCreate** passes its incoming URI, and then the `EXTRA_ROOM_URL` extra when applicable, through `bg.f.b` with the selected host and default URL. The selected result is assigned to field `B`. The helper returns the default URL when its host-text condition fails and rewrites `http:` to `https:` on the accepted path. See [room-url-helper.json](room-url-helper.json) and the existing onCreate Evidence. The internal obfuscated string predicate was not separately decompiled; no URL-origin security conclusion is drawn.
6. **The Compose factory** creates a real Android WebView and calls `webView.loadUrl(customWebView.B)`. This is in discriminator case 7 of the R8-shared lambda `e0.s.invoke`, selected by the previously inspected CustomWebView Compose method. See [webview-factory.json](webview-factory.json).

These steps describe client code and packaged configuration. They do not establish task ordering, cache freshness, live configuration values, or navigation in an executed Android session.

## Packaged defaults

[bundled-config-defaults.json](../bundled-config-defaults.json) records selected values decoded from `res/xml/remote_config_defaults.xml` using Python's standard library. It is a separate binary-XML observation, not REA output. The decoder asserted a complete balanced zero-attribute element tree and 40 unique configuration entries.

Resource SHA-256: `f888503878ce9fb8701cf7e356eea8907c1e6bcb4162ba7a46c51aa59ded1fdc`.

| Key | Packaged default |
| --- | --- |
| `web_view_host` | `skribbl.io` |
| `web_view_url` | `https://skribbl.io/` |
| `web_view_game_name` | `Scribble.io` |
| `web_view_enable_ads` | `false` |
| `disable_web_view_navigation` | `false` |
| `mobile_keyboard_enabled` | `0` |
| `mobile_chat_bubbles` | `0` |
| `mobile_chat_input_layout` | `bottom` |
| `brush_pressure_sensitivity` | `1` |
| `web_view_console_copy` | `Async: Could not copy text:` |
| `web_view_console_copy_command` | `document.querySelector('#input-invite').value` |
| `web_view_console_init` | `loaded` |

The bundled language-code map contains English 0, German 1, Italian 12, and Serbian 22. These are defaults for the app integration, not an exhaustive statement about the website's languages.

## What the Android wrapper adds

The factory enables JavaScript, DOM storage, automatic image loading, cookies, and a wide viewport. It disables built-in zoom controls and installs custom WebViewClient/WebChromeClient instances. These settings are code observations, not a runtime compatibility test.

The WebChromeClient has an explicit `skribbl.io` branch. On the site's copy-failure console message, it evaluates `document.querySelector('#input-invite').value` and passes the result to an Android helper. That downstream helper was not decompiled, so a complete native clipboard/share implementation is not claimed. On its initialization console message, it injects localStorage settings for keyboard, display language, game language, chat bubbles, chat placement, and pressure. A second branch uses configuration-defined host and console hooks. See [console-bridge.json](console-bridge.json) and [chrome-constructor.json](chrome-constructor.json).

The WebViewClient updates back-navigation state on page starts and has a request interceptor that can return an empty response when a state string matches a requested host. The state population and complete blocking policy were not traced. See [request-interceptor.json](request-interceptor.json) and [webview-page-start.json](webview-page-start.json).

## Connection verification

The restarted MCP server reported all five Android inspection/reference tools as available. Subsequent class, reference, and method requests succeeded through MCP. [mcp-connection.json](mcp-connection.json) is an explicitly selected subset of the live read-only session response; the other JSON files preserve complete REA Evidence for their selected operations.

## Remaining limits

- No Android app execution, device connection, emulator, or current Firebase configuration fetch was performed.
- No private app preferences were accessed. Installed copies can retain older configuration.
- `e0.s.invoke` is a large shared lambda with JADX type-inference warnings in other branches. The relevant case has an explicit WebView constructor and `loadUrl` call, but reconstructed Java is not original source.
- The package also declares a separate GameActivity. Its entrypoint was inspected, but the native game implementation was not traced here. These findings apply to the CustomWebView path, not every app mode.
- This APK provides wrapper behavior and configuration, not skribbl.io's remote scoring, word lists, backend code, or enforcement rules.
