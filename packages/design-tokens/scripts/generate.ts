import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTokensCss } from '../src/css.ts';

const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/tokens.css');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, renderTokensCss());
console.log(`Wrote ${outputPath}`);
