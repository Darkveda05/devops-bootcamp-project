#!/usr/bin/env node
/**
 * Bidirectional docs sync between README.MD and index.html.
 *
 * - README.MD  == the Markdown source of the project docs
 * - index.html == the GitHub Pages entry point (hero/header kept outside markers)
 *
 * The readable "content window" of index.html lives between
 * `<!-- SYNC:START -->` and `<!-- SYNC:END -->` inside <main>.
 *
 * When README.MD changes  -> index.html is regenerated from it.
 * When index.html changes -> README.MD is regenerated from it.
 * When both change        -> README.MD wins (documented policy), index.html
 *                            is regenerated from the updated README.
 *
 * Usage:
 *   node scripts/sync-docs.mjs                 # auto: pick source by CHANGED env or git diff
 *   node scripts/sync-docs.mjs --source=readme # force README.MD -> index.html
 *   node scripts/sync-docs.mjs --source=index  # force index.html -> README.MD
 *   node scripts/sync-docs.mjs --write         # persist changes (default is dry-run)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { marked } from 'marked';
import TurndownService from 'turndown';
import turndownGfm from 'turndown-plugin-gfm';

const { gfm } = turndownGfm;

const README_PRIMARY = 'README.MD';
const README_ALT = 'README.md';
const INDEX_FILE = 'index.html';
const START = '<!-- SYNC:START -->';
const END = '<!-- SYNC:END -->';
const RESULT = 'README + index.html are in sync.';

const args = process.argv.slice(2);
const forceWrite = args.includes('--write');
const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1];

const read = (p) => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Collapse blank-line runs and trailing whitespace for meaningful comparison. */
const normalize = (s) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

/** Markdown -> card-based HTML for the content window. */
function toHtml(md) {
  const tokens = marked.lexer(md);
  const sections = [];
  let current = { heading: null, tokens: [] };

  for (const t of tokens) {
    if (t.type === 'space') continue;
    if (t.type === 'heading' && t.depth === 1) continue; // hero title lives in <header>
    if (t.type === 'heading' && t.depth === 2) {
      sections.push(current);
      current = { heading: t.text, tokens: [] };
      continue;
    }
    current.tokens.push(t);
  }
  sections.push(current);

  const cards = [];
  for (const s of sections) {
    const body = marked.parser(s.tokens).trim();
    if (!body) continue;
    const title = s.heading ? esc(s.heading) : 'Overview';
    cards.push(`    <section class="card">\n      <h2>${title}</h2>\n${body}\n    </section>`);
  }
  return cards.join('\n\n');
}

/** HTML content window -> Markdown body. */
function toMd(html) {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    strongDelimiter: '**',
    emDelimiter: '*',
  });
  td.use(gfm);
  td.addRule('section', { filter: ['section'], replacement: (content) => content });
  return td.turndown(html).trim();
}

const composeReadme = (body) => `# DevOps Bootcamp Project\n\n${body}\n`;

const extractWindow = (html) => {
  const i = html.indexOf(START);
  const j = html.indexOf(END);
  if (i === -1 || j === -1) return null;
  return html.slice(i + START.length, j);
};

const buildIndex = (html, windowHtml) => {
  const i = html.indexOf(START);
  const j = html.indexOf(END);
  if (i === -1 || j === -1) return null;
  return html.slice(0, i + START.length) + '\n' + windowHtml + '\n' + html.slice(j);
};

function changedFiles() {
  if (process.env.CHANGED) {
    return new Set(process.env.CHANGED.split(/\s+/).filter(Boolean));
  }
  const set = new Set();
  try {
    const out = execSync('git diff --name-only HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of out.split('\n')) if (line.trim()) set.add(line.trim());
  } catch {
    /* not a git checkout — treat as "nothing changed" */
  }
  return set;
}

const isReadmePath = (p) => /^README\.md$/i.test(p);

function main() {
  const readmePath = read(README_PRIMARY) !== null ? README_PRIMARY : README_ALT;
  const md = read(readmePath);
  const html = read(INDEX_FILE);

  if (!md || !html) {
    console.error(`sync-docs: missing ${readmePath} or ${INDEX_FILE}`);
    process.exit(2);
  }

  if (!html.includes(START) || !html.includes(END)) {
    console.error(`sync-docs: ${INDEX_FILE} is missing the ${START} / ${END} markers.`);
    process.exit(2);
  }

  const changed = changedFiles();
  const readmeChanged = [...changed].some(isReadmePath);
  const indexChanged = changed.has(INDEX_FILE);

  let source = sourceArg;
  if (!source || source === 'auto') {
    if (indexChanged && readmeChanged) source = 'readme'; // README wins
    else if (indexChanged) source = 'index';
    else if (readmeChanged) source = 'readme';
    else {
      console.log(RESULT);
      return;
    }
  }

  let nextMd = md;
  let nextHtml = html;

  if (source === 'readme') {
    nextHtml = buildIndex(html, toHtml(md));
  } else if (source === 'index') {
    const rendered = toHtml(md);
    if (normalize(extractWindow(html)) === normalize(rendered)) {
      console.log(RESULT); // index is already the rendering of README — skip rewrite
      return;
    }
    nextMd = composeReadme(toMd(extractWindow(html)));
    nextHtml = buildIndex(html, toHtml(nextMd));
  }

  const mdChanged = normalize(nextMd) !== normalize(md);
  const htmlChanged = extractWindow(nextHtml) !== null && normalize(extractWindow(nextHtml)) !== normalize(extractWindow(html));

  if (!mdChanged && !htmlChanged) {
    console.log(RESULT);
    return;
  }

  if (forceWrite) {
    const changes = [];
    if (mdChanged) writeFileSync(readmePath, nextMd), changes.push('README.MD (from index.html)');
    if (htmlChanged) writeFileSync(INDEX_FILE, nextHtml), changes.push('index.html (from README.MD)');
    console.log(`sync-docs: wrote ${changes.join(' and ')}`);
  } else {
    console.log('sync-docs: changes detected (dry-run, pass --write to persist):');
    if (mdChanged) console.log(`  - README.MD would be regenerated from index.html`);
    if (htmlChanged) console.log(`  - index.html would be regenerated from README.MD`);
  }
}

main();