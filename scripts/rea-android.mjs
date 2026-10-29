import { accessSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const javaHome = join(root, '.tools/android/jdk-21.0.13+9');
const jadxJar = join(root, '.tools/android/jadx-headless-mcp-0.7.1-all.jar');
if (!process.env.APPDATA) throw new Error('This launcher requires Windows APPDATA.');
const rea = join(process.env.APPDATA, 'npm/node_modules/rea-agents/scripts/rea.mjs');
for (const path of [join(javaHome, 'bin/javac.exe'), jadxJar, rea]) {
  accessSync(path);
}

// Keep the portable JDK and provider settings scoped to the child REA process.
const result = spawnSync(process.execPath, [rea, ...process.argv.slice(2)], {
  env: { ...process.env, JAVA_HOME: javaHome, REA_JADX_MCP_JAR: jadxJar },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
