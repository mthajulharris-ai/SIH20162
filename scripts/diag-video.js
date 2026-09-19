const http = require('http');
const WebSocket = (global.WebSocket);

const PORT = parseInt(process.env.CDP_PORT || '9333', 10);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const list = await new Promise((resolve, reject) => {
    const r = http.get('http://127.0.0.1:' + PORT + '/json/list', (s) => {
      let b = ''; s.on('data', (c) => b += c); s.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
    r.setTimeout(6000, () => { r.destroy(); reject(new Error('timeout')); });
  });
  const t = list.find((x) => x.type === 'page') || list[0];
  console.log('[diag] target:', t.type, t.url);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let cid = 1; const waiters = new Map();
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (m) => {
    let d; try { d = JSON.parse(typeof m.data === 'string' ? m.data : new TextDecoder().decode(new Uint8Array(m.data))); } catch (e) { return; }
    if (d.id && waiters.has(d.id)) { const { resolve } = waiters.get(d.id); waiters.delete(d.id); resolve(d.result); }
    else if (d.method === 'Runtime.consoleAPICalled') { const a = (d.params && d.params.args || []).map((x) => x && x.value !== undefined ? x.value : '').join(' '); if (a) console.log('[console]', a); }
  };
  const send = (m, p) => new Promise((resolve, reject) => { const id = cid++; waiters.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method: m, params: p || {} })); });
  const ready = () => new Promise((r) => ws.readyState === WebSocket.OPEN ? r() : ws.addEventListener('open', () => r()));
  await ready();
  await send('Runtime.enable');
  await sleep(1500);
  const expr = '(function(){var v=document.querySelector(".satra-bg-video")||document.querySelector("video");var root=document.querySelector("#root");var lr=document.querySelector(".satra-login-root");var overlay=document.querySelector(".satra-bg-overlay");return {vNull:v===null,vTag:v?v.tagName:null,vClass:v?v.className:null,vAutoplay:v?v.autoplay:null,vMuted:v?v.muted:null,lrClass:lr?lr.className:null,overlay:v===null?"removed":"present",htmlLen:root?root.innerHTML.length:0,htmlSnippet:root?root.innerHTML.slice(0,2500):""};})()';
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  console.log(JSON.stringify(r.result.value, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('[fatal]', e); process.exit(1); });