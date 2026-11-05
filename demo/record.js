#!/usr/bin/env node
// Records the README demo: drives the real ferrodo binary inside tmux,
// captures every screen (with colours), renders each one as a terminal
// window in Chromium and joins them into assets/demo.gif and assets/demo.mp4.
//
// Needs: tmux, ffmpeg, Node with Playwright (and its Chromium), the JetBrains Mono font.
// Run from the repo root:  node demo/record.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
const COLS = 74;
const ROWS = 17;
const SOCK = 'ferrodo-demo';

// ---------------------------------------------------------------- setup

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ferrodo-demo-'));
const dataFile = path.join(work, 'tasks.json');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const tmux = (...args) => run('tmux', ['-L', SOCK, '-f', '/dev/null', ...args]);

console.log('Building release binary…');
run('cargo', ['build', '--release', '--quiet'], { cwd: ROOT, stdio: 'inherit' });

// Seed tasks with dates relative to today, so the labels always read naturally.
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const now = Math.floor(Date.now() / 1000);
const task = (id, text, priority, due, done = false) => ({ id, text, done, priority, created: now, ...(due === null ? {} : { due }) });
fs.writeFileSync(dataFile, JSON.stringify({
  next_id: 6,
  tasks: [
    task(1, 'Pay electricity bill', 'medium', day(-3)),
    task(2, 'Call mom', 'medium', day(0)),
    task(3, 'Finish slides for the demo day', 'high', day(2)),
    task(4, 'Read the Rust book, chapter 8', 'low', null),
    task(5, 'Buy a birthday gift for Sam', 'low', day(19)),
    task(6, 'Renew passport', 'medium', null, true),
  ],
}));

try { tmux('kill-server'); } catch { /* no old server */ }
const binDir = path.join(ROOT, 'target', 'release');
const rc = path.join(work, 'bashrc');
fs.writeFileSync(rc, [
  `export PATH='${binDir}':"$PATH"`,
  `export FERRODO_FILE='${dataFile}'`,
  `PS1='\\[\\e[38;5;209m\\]~/projects\\[\\e[0m\\] \\[\\e[1;32m\\]❯\\[\\e[0m\\] '`,
  'clear',
].join('\n') + '\n');
tmux('new-session', '-d', '-s', 'demo', '-x', String(COLS), '-y', String(ROWS),
  `bash --noprofile --rcfile '${rc}'`);
tmux('set', '-g', 'status', 'off');
tmux('resize-window', '-t', 'demo', '-x', String(COLS), '-y', String(ROWS));

// ---------------------------------------------------------------- capture

const frames = []; // { screen, cursor, ms }
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function capture(ms) {
  sleep(45); // let the app redraw
  const screen = tmux('capture-pane', '-p', '-e', '-N', '-t', 'demo');
  const [x, y, visible] = tmux('display', '-p', '-t', 'demo', '#{cursor_x},#{cursor_y},#{cursor_flag}').trim().split(',').map(Number);
  const cursor = visible ? { x, y } : null;
  const last = frames[frames.length - 1];
  if (last && last.screen === screen && JSON.stringify(last.cursor) === JSON.stringify(cursor)) last.ms += ms;
  else frames.push({ screen, cursor, ms });
}
const key = (k, ms = 700) => { tmux('send-keys', '-t', 'demo', k); capture(ms); };
const type = (text, ms = 55) => { for (const c of text) { tmux('send-keys', '-t', 'demo', '-l', c); capture(ms); } };
const pause = (ms) => capture(ms);

console.log('Recording…');
pause(900);
type('ferrodo add -p high -d fri "Ship ferrodo v1"');
pause(400);
key('Enter', 1200);
type('ferrodo');
pause(300);
key('Enter', 2000);       // the full-screen app opens
key('j', 600);            // move to "Call mom"
key('Space', 1300);       // tick it off; it drops to the bottom
key('a', 500);            // add a task
type('Book dentist appointment', 45);
pause(400);
key('Enter', 1100);
key('t', 500);            // give it a due date
type('tomorrow', 70);
pause(400);
key('Enter', 1100);
key('+', 1400);           // raise its priority; it moves up
key('h', 1400);           // hide finished tasks
key('h', 1000);           // and show them again
key('c', 1600);           // clear finished tasks
key('q', 600);            // back to the shell
type('ferrodo ls');
pause(300);
key('Enter', 3500);

tmux('kill-server');
fs.rmSync(work, { recursive: true, force: true });
console.log(`Captured ${frames.length} frames`);

// ---------------------------------------------------------------- ANSI → HTML

// A calm dark theme; the 16 ANSI colours first, then the standard 256-colour cube.
const ANSI = ['#1c2030', '#ff6b6b', '#7ee787', '#f2cc60', '#79c0ff', '#d2a8ff', '#5ce1e6', '#c9d1d9',
  '#6b7385', '#ff8f8f', '#a5f3a5', '#ffe08a', '#a5d6ff', '#e2c5ff', '#8af0f3', '#ffffff'];
const FG = '#d7dce6';
const BG = '#11141c';
function color256(n) {
  if (n < 16) return ANSI[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  n -= 16;
  const c = (v) => (v ? 55 + v * 40 : 0);
  return `rgb(${c(Math.floor(n / 36))},${c(Math.floor(n / 6) % 6)},${c(n % 6)})`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toHtml({ screen, cursor }) {
  const lines = screen.split('\n').slice(0, ROWS);
  while (lines.length < ROWS) lines.push('');
  return lines.map((line, row) => {
    let st = { fg: null, bg: null, bold: false, dim: false, strike: false, rev: false, ul: false };
    const cells = [];
    const re = /\x1b\[([0-9;]*)m|([^\x1b])/gu;
    let m;
    while ((m = re.exec(line))) {
      if (m[2] !== undefined) { cells.push({ ch: m[2], st: { ...st } }); continue; }
      const p = m[1] === '' ? [0] : m[1].split(';').map(Number);
      for (let i = 0; i < p.length; i++) {
        const n = p[i];
        if (n === 0) st = { fg: null, bg: null, bold: false, dim: false, strike: false, rev: false, ul: false };
        else if (n === 1) st.bold = true;
        else if (n === 2) st.dim = true;
        else if (n === 4) st.ul = true;
        else if (n === 7) st.rev = true;
        else if (n === 9) st.strike = true;
        else if (n === 22) { st.bold = false; st.dim = false; }
        else if (n === 24) st.ul = false;
        else if (n === 27) st.rev = false;
        else if (n === 29) st.strike = false;
        else if (n >= 30 && n <= 37) st.fg = ANSI[n - 30];
        else if (n >= 90 && n <= 97) st.fg = ANSI[n - 90 + 8];
        else if (n >= 40 && n <= 47) st.bg = ANSI[n - 40];
        else if (n >= 100 && n <= 107) st.bg = ANSI[n - 100 + 8];
        else if (n === 39) st.fg = null;
        else if (n === 49) st.bg = null;
        else if (n === 38 || n === 48) {
          let c;
          if (p[i + 1] === 5) { c = color256(p[i + 2]); i += 2; }
          else if (p[i + 1] === 2) { c = `rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`; i += 4; }
          if (n === 38) st.fg = c; else st.bg = c;
        }
      }
    }
    while (cells.length < COLS) cells.push({ ch: ' ', st: { ...st, fg: null, bg: null } });

    let html = '';
    cells.slice(0, COLS).forEach((cell, col) => {
      const s = cell.st;
      let fg = s.fg || FG;
      let bg = s.bg;
      if (s.rev) { const t = fg; fg = bg || BG; bg = t; }
      if (cursor && cursor.x === col && cursor.y === row) { bg = '#e8eaf0'; fg = BG; }
      const css = [`color:${fg}`];
      if (bg) css.push(`background:${bg}`);
      if (s.bold) css.push('font-weight:700');
      if (s.dim) css.push('opacity:.6');
      const deco = [s.strike && 'line-through', s.ul && 'underline'].filter(Boolean).join(' ');
      if (deco) css.push(`text-decoration:${deco}`);
      html += `<span class="c" style="${css.join(';')}">${esc(cell.ch)}</span>`;
    });
    return `<div class="row">${html}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- render

const CELL_W = 9.6; // JetBrains Mono at 16px
const CELL_H = 21;
const page_html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  #win{display:inline-block;border-radius:10px;overflow:hidden;background:${BG};border:1px solid #2a3040}
  #bar{height:38px;display:flex;align-items:center;padding:0 14px;background:#1b1f2b;
    font:500 13px 'JetBrains Mono',monospace;color:#8b93a7;position:relative}
  .dot{width:12px;height:12px;border-radius:50%;margin-right:8px}
  #title{position:absolute;left:0;right:0;text-align:center;pointer-events:none}
  #term{padding:14px 18px 18px;font:16px/${CELL_H}px 'JetBrains Mono','DejaVu Sans Mono',monospace}
  .row{height:${CELL_H}px;white-space:pre;display:flex}
  .c{display:inline-block;width:${CELL_W}px;height:${CELL_H}px;text-align:center;overflow:visible}
</style><div id="win"><div id="bar">
  <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
  <div id="title">ferrodo — ~/projects</div></div><div id="term"></div></div>`;

(async () => {
  const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferrodo-frames-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 900, height: 600 } });
  await page.setContent(page_html);
  await page.evaluate(() => document.fonts.ready);

  console.log('Rendering frames…');
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    await page.evaluate((h) => { document.getElementById('term').innerHTML = h; }, toHtml(frames[i]));
    const file = path.join(frameDir, `f${String(i).padStart(4, '0')}.png`);
    await page.locator('#win').screenshot({ path: file, omitBackground: true });
    list.push(`file '${file}'\nduration ${(frames[i].ms / 1000).toFixed(3)}`);
  }
  // Also save one still for the README / social preview.
  const still = frames.findIndex((f) => f.screen.includes('Book dentist') && !f.cursor) ;
  fs.mkdirSync(OUT, { recursive: true });
  await browser.close();

  // ffmpeg's concat demuxer ignores the last duration unless the last file is repeated.
  const lastFile = path.join(frameDir, `f${String(frames.length - 1).padStart(4, '0')}.png`);
  fs.writeFileSync(path.join(frameDir, 'list.txt'), list.join('\n') + `\nfile '${lastFile}'\n`);
  if (still >= 0) fs.copyFileSync(path.join(frameDir, `f${String(still).padStart(4, '0')}.png`), path.join(OUT, 'screenshot.png'));

  console.log('Encoding GIF and MP4…');
  const input = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(frameDir, 'list.txt')];
  run('ffmpeg', [...input, '-vf',
    'scale=iw/1.5:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=full:reserve_transparent=1[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
    '-fps_mode', 'vfr', '-loop', '0', path.join(OUT, 'demo.gif')]);
  run('ffmpeg', [...input, '-vf', 'fps=30,format=yuv420p,pad=ceil(iw/2)*2:ceil(ih/2)*2:color=0x0d1017',
    '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', path.join(OUT, 'demo.mp4')]);

  fs.rmSync(frameDir, { recursive: true, force: true });
  const size = (f) => (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2) + ' MB';
  console.log(`Done: assets/demo.gif (${size('demo.gif')}), assets/demo.mp4 (${size('demo.mp4')})`);
})();
