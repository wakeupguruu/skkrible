# Android analysis tools

Installed and verified on Windows x64 on 30 October 2026. These tools inspect APKs statically; they do not launch the Android app.

## Installed versions

| Tool | Version | Location |
| --- | --- | --- |
| REA | 6.7.0 | Existing user-level npm installation |
| Temurin full JDK | 21.0.13+9 | `.tools/android/jdk-21.0.13+9` |
| jadx-headless-mcp | 0.7.1 | `.tools/android/jadx-headless-mcp-0.7.1-all.jar` |

The full JDK includes `javac` and the compiler module required by REA. All downloaded binaries remain in the ignored `.tools` directory; no system Java installation or PATH was changed.

## Verified downloads

JADX release:

https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar

SHA-256: `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`

JDK release:

https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.13_9.zip

SHA-256: `a4dbaa05fca4bd89d84584e58c459bd732efebb1722af80ab13c6516832004f9`

Both downloaded files passed checksum verification. The JAR also contains the exact `JadxSession`, `SessionHolder`, and Kotlin MCP `Server` classes required by REA. Java and javac reported version 21.0.13.

To reproduce the local installation, download those files into `.tools/android`, verify their hashes with `Get-FileHash -Algorithm SHA256`, and expand the JDK ZIP there. The extracted directory must be `jdk-21.0.13+9` for the pinned launcher. REA must already be installed under `%APPDATA%/npm/node_modules/rea-agents`.

## Run now through the CLI

From the project root:

```powershell
node scripts/rea-android.mjs inspect-android-package 'C:\Users\vyasg\Downloads\kde\Scribble & Guess.apk' --format json

node scripts/rea-android.mjs inspect-android-class 'C:\Users\vyasg\Downloads\kde\Scribble & Guess.apk' 'com.rahuls.scribbleio.ui.screens.main.CustomWebView' --format json
```

The launcher passes the portable Java/JADX paths only to its child REA process. It forwards REA's output and exit status without changing the parent environment. A Node launcher is used because this machine's default PowerShell policy blocks unsigned `.ps1` scripts; the execution policy was not changed.

REA's Windows native ownership checks need access to the selected local paths and its temporary directory. The restricted agent shell initially refused access to the user directory. The same package and class inspections succeeded through the normal approved local execution boundary; no native ownership safeguards were disabled.

## Codex MCP configuration

The existing `rea` entry in `C:\Users\vyasg\.codex\config.toml` now has this environment table:

```toml
[mcp_servers.rea.env]
JAVA_HOME = 'C:\Users\vyasg\projects\skkrible\.tools\android\jdk-21.0.13+9'
REA_JADX_MCP_JAR = 'C:\Users\vyasg\projects\skkrible\.tools\android\jadx-headless-mcp-0.7.1-all.jar'
```

The original configuration was backed up as `config.toml.before-jadx-20261030-034606.bak` in the same user directory. A parsed comparison verified that only the REA environment table changed. The user configuration and backup are outside Git.

The already-running MCP process retains its old environment. Restart/reconnect REA, or restart the Codex session, to use the Android tools through that connection. CLI verification succeeded independently. Moving or deleting this project's `.tools` directory requires updating these two paths.

## Verification completed

- Launcher passed `node --check`.
- Provider JAR and JDK archive passed SHA-256 checks.
- Required bridge classes exist in the provider JAR.
- REA successfully decoded the supplied APK's package and complete manifest with JADX 0.7.1.
- REA successfully inspected the APK's CustomWebView class.
- The decoded package is `com.rahuls.scribbleio`, version 39.0 (code 39), minimum SDK 24, target SDK 36.

The live Codex MCP connection has not been restarted. APK signature and Android runtime behavior were not verified.

## References

- [REA Android prerequisites and provider configuration](https://github.com/morluto/rea/blob/main/docs/android-analysis.md)
- [Pinned JADX release](https://github.com/1013503897/jadx-headless-mcp/releases/tag/v0.7.1)
- [Temurin JDK release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9)
- [Official OpenAI MCP environment configuration](https://learn.chatgpt.com/docs/extend/mcp#stdio-servers)
