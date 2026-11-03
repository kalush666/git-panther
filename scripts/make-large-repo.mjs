// Builds a synthetic repository for performance testing.
//
//   node scripts/make-large-repo.mjs <target-dir> [commits=100000]
//
// Mainline commits each touch one of 100 files; every tenth mainline commit
// merges a three-commit topic branch, like a busy team repository. Uses
// `git fast-import`, so 100k commits take seconds rather than minutes.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const [target, requested = '100000'] = process.argv.slice(2);
if (!target) {
  console.error('usage: node scripts/make-large-repo.mjs <target-dir> [commits]');
  process.exit(2);
}
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${target} is not empty; choose a new folder.`);
  process.exit(2);
}
const totalCommits = Number.parseInt(requested, 10);
const TOPIC_EVERY = 10;
const TOPIC_LENGTH = 3;
const START_TIME = 1_600_000_000;

const parts = [];
let mark = 0;
let time = START_TIME;
let lastMain = null;

function data(text) {
  return `data ${Buffer.byteLength(text)}\n${text}\n`;
}

function commit(branch, message, file, { from, merge } = {}) {
  mark += 1;
  time += 60;
  parts.push(
    `commit refs/heads/${branch}\nmark :${mark}\n`,
    `author Dev ${mark % 7} <dev${mark % 7}@example.invalid> ${time} +0000\n`,
    `committer Dev ${mark % 7} <dev${mark % 7}@example.invalid> ${time} +0000\n`,
    data(message),
    from ? `from :${from}\n` : '',
    merge ? `merge :${merge}\n` : '',
    `M 644 inline ${file}\n`,
    data(`${message}\n`),
  );
  return mark;
}

let mainIndex = 0;
while (mark < totalCommits) {
  mainIndex += 1;
  const file = `src/file${mainIndex % 100}.txt`;
  if (lastMain !== null && mainIndex % TOPIC_EVERY === 0) {
    let topicTip = lastMain;
    for (let step = 1; step <= TOPIC_LENGTH; step += 1) {
      topicTip = commit(
        `topic/${mainIndex}`,
        `Topic ${mainIndex} step ${step}`,
        `topic/${mainIndex}.txt`,
        {
          from: step === 1 ? lastMain : undefined,
        },
      );
    }
    lastMain = commit('main', `Merge topic ${mainIndex}`, file, {
      from: lastMain,
      merge: topicTip,
    });
  } else {
    lastMain = commit('main', `Change ${mainIndex}`, file, { from: lastMain ?? undefined });
  }
}

const run = (args, input) => {
  const result = spawnSync('git', args, {
    cwd: target,
    input,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

spawnSync('git', ['init', '--quiet', '--initial-branch=main', target], { stdio: 'inherit' });
run(['fast-import', '--quiet'], parts.join(''));
run(['reset', '--quiet', '--hard', 'main']);
// Clones and `git gc` keep refs in packed-refs; fast-import leaves them loose.
run(['pack-refs', '--all']);
console.log(`Created ${mark} commits in ${target}`);
