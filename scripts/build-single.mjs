// Packs the production build (dist/) into one self-contained HTML file: the game's JavaScript,
// CSS and fonts are all inlined, so the file runs by simply opening it in a browser.
//
// Outputs:
//   Beyond-the-Fold.html            standalone page (double-click to play, no server needed)
//   dist-single/embed.html          the same game as a body fragment for hosts that supply
//                                   their own <html>/<head> wrapper
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DIST = 'dist';
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const jsRel = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/)?.[1];
const cssRel = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/)?.[1];
if (!jsRel || !cssRel) throw new Error('Could not find the bundled script and stylesheet in dist/index.html. Run `npm run build` first.');

// Keep only the Latin font subsets, inline them as WOFF2 data URIs and drop WOFF fallbacks.
const cssDir = dirname(join(DIST, cssRel));
let css = readFileSync(join(DIST, cssRel), 'utf8');
css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
  const files = [...block.matchAll(/url\(\.\/([^)]+)\)/g)].map((m) => m[1]);
  if (files.length && !files.some((f) => f.includes('-latin-'))) return '';
  return block
    .replace(/,\s*url\(\.\/[^)]+\.woff\)\s*format\(["']?woff["']?\)/g, '')
    .replace(/url\(\.\/([^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(join(cssDir, f)).toString('base64')})`);
});
const leftover = css.match(/url\(\.\/[^)]+\)/);
if (leftover) throw new Error(`Unexpected external asset in CSS: ${leftover[0]}`);

// Inline the module; escape any closing-script sequence so the HTML parser never ends it early.
const js = readFileSync(join(DIST, jsRel), 'utf8').replace(/<\/script/gi, '<\\/script');

const icon = html.match(/<link rel="icon"[^>]*>/)?.[0] ?? '';
const body = '<div id="app"></div>\n<div id="loading"><div class="fold"></div><div>FOLDING THE WORLD</div></div>';
const title = '<title>Beyond the Fold</title>';
const description = '<meta name="description" content="Beyond the Fold — a cinematic 2.5D papercraft science-fiction shooter." />';

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${description}
${title}
${icon}
<style>${css}</style>
</head>
<body>
${body}
<script type="module">${js}</script>
</body>
</html>
`;

const embed = `${title}
${description}
<style>:root{color-scheme:dark}${css}</style>
${body}
<script type="module">${js}</script>
`;

writeFileSync('Beyond-the-Fold.html', standalone);
mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', 'embed.html'), embed);
const mb = (s) => (Buffer.byteLength(s) / 1024 / 1024).toFixed(2);
console.log(`Beyond-the-Fold.html  ${mb(standalone)} MB`);
console.log(`dist-single/embed.html ${mb(embed)} MB`);
