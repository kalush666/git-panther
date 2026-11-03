// Checks that the Windows installers are self-contained for closed networks
// (ADR 5): each must embed the WebView2 offline installer, which is well over
// 100 MB, so an installer below that size would try to download WebView2.
//
// Usage: node scripts/verify-installers.mjs <bundle-dir>

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIN_SELF_CONTAINED_BYTES = 100 * 1024 * 1024;
const INSTALLERS = [
  { folder: 'nsis', extension: '.exe' },
  { folder: 'msi', extension: '.msi' },
];

const bundleDir = process.argv[2];
if (!bundleDir) {
  console.error('Usage: node scripts/verify-installers.mjs <bundle-dir>');
  process.exit(2);
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
let failed = false;

for (const { folder, extension } of INSTALLERS) {
  const dir = join(bundleDir, folder);
  let files;
  try {
    files = readdirSync(dir).filter((name) => name.endsWith(extension));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.error(`No ${extension} installer found in ${dir}.`);
    failed = true;
    continue;
  }
  for (const name of files) {
    const size = statSync(join(dir, name)).size;
    const selfContained = size >= MIN_SELF_CONTAINED_BYTES;
    console.log(`${selfContained ? 'ok  ' : 'FAIL'} ${name} ${megabytes(size)}`);
    if (!selfContained) {
      console.error(
        `  ${name} is smaller than ${megabytes(MIN_SELF_CONTAINED_BYTES)}, so it cannot contain the WebView2 offline installer.`,
      );
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
