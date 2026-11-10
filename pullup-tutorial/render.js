// Renders index.html to an MP4 (frame-by-frame, deterministic).
// Usage: node render.js out.mp4 [fps]      or: node render.js --stills dir t1 t2 ...
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  page.on('pageerror', e => console.error('PAGE ERROR', e));
  page.on('console', m => console.log('console:', m.text()));
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?record');
  await page.waitForFunction(() => window.renderAt);
  if (args[0] === '--stills') {
    for (const t of args.slice(2)) {
      await page.evaluate(t => renderAt(t), +t);
      await page.screenshot({ path: path.join(args[1], `t${String(t).padStart(5, '0')}.jpg`), quality: 85, type: 'jpeg' });
    }
  } else {
    const out = args[0] || 'pullup-tutorial.mp4', fps = +(args[1] || 30);
    const total = await page.evaluate(() => TOTAL), n = Math.round(total * fps);
    const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => renderAt(t), i / fps);
      const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 150 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
