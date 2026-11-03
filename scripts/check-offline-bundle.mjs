// Fails if the built UI references any external origin, so Git Panther keeps
// working on closed networks. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLE_DIR = process.argv[2] ?? 'apps/desktop/dist';

// Origins that appear in the bundle but are never fetched.
const INERT_ORIGINS = new Map([
  ['http://www.w3.org', 'XML/SVG namespace identifiers'],
  ['https://react.dev', 'links inside React error messages'],
]);

const URL_PATTERN = /https?:\/\/[a-z0-9.-]+(?::\d+)?/gi;
const SCANNED_EXTENSIONS = ['.html', '.js', '.css', '.json', '.svg'];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* files(path);
    } else if (SCANNED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      yield path;
    }
  }
}

const violations = [];
for (const file of files(BUNDLE_DIR)) {
  for (const [origin] of readFileSync(file, 'utf8').matchAll(URL_PATTERN)) {
    if (!INERT_ORIGINS.has(origin.toLowerCase())) {
      violations.push(`${file}: ${origin}`);
    }
  }
}

if (violations.length > 0) {
  console.error('External origins found in the UI bundle (closed-network rule):');
  for (const violation of [...new Set(violations)]) {
    console.error(`  ${violation}`);
  }
  console.error('Bundle the resource locally, or add it to INERT_ORIGINS if it is never fetched.');
  process.exit(1);
}
console.log(`No external origins in ${BUNDLE_DIR}.`);
