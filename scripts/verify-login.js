"use strict";
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDPPORT = parseInt(process.env.CDP_PORT || '9222', 10);
const PAGEURL = process.env.PAGE_URL || 'http://127.0.0.1:5173/#/login';
const OUTDIR = path.resolve(__dirname, 'verify-out');
const CDPHOST = '127.0.0.1';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.waiters = new Map();
    this.nextId = 1;
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (msg) => {
      let data;
      try { data = JSON.parse(typeof msg.data === 'string' ? msg.data : new TextDecoder().decode(new Uint8Array(msg.data))); } catch (e) { return; }
      if (data.id && this.waiters.has(data.id)) {
        const { resolve, reject } = this.waiters.get(data.id);
        this.waiters.delete(data.id);
        if (data.error) reject(data.error); else resolve(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const args = (data.params && data.params.args || []).map((a) => a && a.value !== undefined ? a.value : '').join(' ');
        if (args) console.log('[console]', args);
      }
    });
    this.ws.addEventListener('error', (e) => { console.error('[ws error]', e.message || e); });
  }
  ready() {
    return new Promise((res) => this.ws.readyState === WebSocket.OPEN ? res() : this.ws.addEventListener('open', () => res()));
  }
  async send(method, params) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.waiters.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

(async () => {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const list = await new Promise((resolve, reject) => {
    const r = http.get('http://' + CDPHOST + ':' + CDPPORT + '/json/list', (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
    r.setTimeout(8000, () => { r.destroy(); reject(new Error('timeout listing cdp targets')); });
  });
  if (!list || !list.length) { console.error('No CDP targets.'); process.exit(1); }
  const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || list[0];
  const wsUrl = target.webSocketDebuggerUrl;
  console.log('[cdp] target type:', target.type, '| url:', target.url);

  const cdp = new CdpSession(wsUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await cdp.send('Page.navigate', { url: PAGEURL });
  await sleep(2500);

  const evalFn = "(() => { const root = document.querySelector('#root'); const v = document.querySelector('.satra-bg-video, video'); const props = v ? { paused: v.paused, ended: v.ended, currentTime: Number(v.currentTime), duration: Number(v.duration), networkState: v.networkState, readyState: v.readyState, playbackRate: v.playbackRate, autoplay: v.autoplay, loop: v.loop, muted: v.muted, playsInline: v.playsInline, currentSrc: v.currentSrc, videoWidth: v.videoWidth, videoHeight: v.videoHeight } : null; const bodyText = root ? root.innerText : document.body.innerText; return { video: props, hasRoot: !!root, bodyText }; })()";

  const r1 = await cdp.send('Runtime.evaluate', { expression: evalFn, returnByValue: true, awaitPromise: false });
  const v1 = (r1 && r1.result && r1.result.value && r1.result.value.video) || {};
  const body1 = (r1 && r1.result && r1.result.value && r1.result.value.bodyText) || '';

  try { await cdp.send('Runtime.evaluate', { expression: "var v=document.querySelector('.satra-bg-video, video'); v ? v.play().catch(function(){}) : null", returnByValue: true, awaitPromise: true }); } catch (e) {}
  await sleep(2500);

  const r2 = await cdp.send('Runtime.evaluate', { expression: evalFn, returnByValue: true, awaitPromise: false });
  const v2 = (r2 && r2.result && r2.result.value && r2.result.value.video) || {};

  const moving = v1.currentTime != null && v2.currentTime != null && Math.abs(v2.currentTime - v1.currentTime) > 0.05;
  const unpaused = (v1.paused === false || v2.paused === false);
  const hasGalaxySrc = String(v2.currentSrc || '').toLowerCase().indexOf('dark-galaxy') !== -1;

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 90 });
  const imgPath = path.join(OUTDIR, 'satra-login-screenshot.png');
  fs.writeFileSync(imgPath, Buffer.from(shot.data, 'base64'));

  const dom = await cdp.send('Runtime.evaluate', { expression: "document.querySelector('#root').innerText || ''", returnByValue: true, awaitPromise: false });
  const domText = (dom && dom.result && dom.result.value) || '';
  fs.writeFileSync(path.join(OUTDIR, 'satra-login-bodytext.txt'), String(domText));

  cdp.close();

  const fullText = (body1 + '\n' + domText).trim();
  const hasSatra = /\bSATRA\b/i.test(fullText);
  const hasSentrix = /SENTRIX/i.test(fullText);
  const hasWelcome = /Welcome Back/i.test(fullText);
  const hasSignIn = /SIGN IN/i.test(fullText);
  const hasForm = /EMAIL \/ USERNAME/i.test(fullText) && /PASSWORD/i.test(fullText);
  const hasRemember = /Remember me/i.test(fullText);
  const hasGoogle = /Continue with Google/i.test(fullText);
  const hasCreate = /Create Account/i.test(fullText);
  const hasStatus = /SECURE CONNECTION/i.test(fullText) && /SATRA AI CORE ONLINE/i.test(fullText);
  const hasLeftBrand = /THERMAL RISK ANALYSIS/i.test(fullText) && /AI SATELLITE INTELLIGENCE/i.test(fullText);

  console.log('\n=========================================================');
  console.log(' SATRA LOGIN VERIFICATION REPORT');
  console.log('=========================================================');
  console.log('Video element found        :', !!v2.currentSrc || !!v2.paused);
  console.log('  currentSrc               :', v2.currentSrc);
  console.log('  autoplay/loop/muted/inline:', JSON.stringify({ autoplay: v2.autoplay, loop: v2.loop, muted: v2.muted, playsInline: v2.playsInline }));
  console.log('  paused (t2)              :', v2.paused);
  console.log('  readyState (4=HAVE_DATA) :', v2.readyState);
  console.log('  videoWidth/videoHeight   :', v2.videoWidth, 'x', v2.videoHeight);
  console.log('Galaxy video is MOVING     :', moving ? 'YES' : 'NO');
  console.log('  t1.currentTime           :', v1.currentTime);
  console.log('  t2.currentTime           :', v2.currentTime);
  console.log('Galaxy src correct         :', hasGalaxySrc ? 'YES' : 'NO');
  console.log('SATRA brand present        :', hasSatra ? 'YES' : 'NO');
  console.log('No SENTRIX text on login   :', !hasSentrix ? 'YES (clean)' : 'NO (SENTRIX found!)');
  console.log('Left side telemetry present:', hasLeftBrand ? 'YES' : 'NO');
  console.log('Right-side panel present   :', hasWelcome && hasSignIn ? 'YES' : 'NO');
  console.log('Form + fields present      :', hasForm ? 'YES' : 'NO');
  console.log('Remember me present        :', hasRemember ? 'YES' : 'NO');
  console.log('Google SSO present         :', hasGoogle ? 'YES' : 'NO');
  console.log('Create Account present     :', hasCreate ? 'YES' : 'NO');
  console.log('Status footer present      :', hasStatus ? 'YES' : 'NO');
  const ok = moving && hasGalaxySrc && unpaused && hasSatra && !hasSentrix && hasWelcome && hasForm && hasRemember && hasGoogle && hasCreate && hasStatus;
  console.log('=========================================================');
  console.log(' OVERALL:', ok ? 'PASS' : 'REVIEW');
  console.log('=========================================================');
  process.exit(ok ? 0 : 2);
})().catch((e) => { console.error('[fatal]', e); process.exit(3); });
