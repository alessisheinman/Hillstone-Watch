import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Output is committed so the folder can be loaded unpacked without Node.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here('./dist/');
rmSync(dist, { recursive: true, force: true });
const common = { bundle: true, target: 'chrome120', outdir: dist, logLevel: 'info' };
// The service worker and offscreen page are modules; content scripts must be classic scripts.
await build({ ...common, entryPoints: [here('./src/background.ts'), here('./src/offscreen.ts')], format: 'esm' });
await build({ ...common, entryPoints: [here('./src/site-bridge.ts'), here('./src/wisely-driver.ts')], format: 'iife' });
cpSync(here('./static/'), dist, { recursive: true });
