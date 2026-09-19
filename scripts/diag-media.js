const http = require('http');
const WebSocket = (global.WebSocket);
const PORT = parseInt(process.env.CDP_PORT || '9333', 10);
const PAGEURL = process.env.PAGE_URL || 'http://localhost:8090/#/login';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const list = await new Promise((resolve, reject) => {
    const r = http.get('http://127.0.0.1:' + PORT + '/json/list', (s) => {
      let b = ''; s.on('data', (c) => b += c); s.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', (e) => { reject(e); });
    r.setTimeout(6000, () => { r.destroy(); reject(new Error('timeout')); });
  });
  const t = list.find((x) => x.type === 'page') || list[0];
  console.log('[diag-media] target:', t.type, t.url);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let cid = 1; const waiters = new Map(); const netEvents = [];
  ws.binaryType = 'arraybuffer';
  ws.on('message', (m) => {
    let d; try { d = JSON.parse(typeof m.data === 'string' ? m.data : new TextDecoder().decode(new Uint8Array(m.data))); } catch (e) { return; }
    if (d.id && waiters.has(d.id)) { const { resolve } = waiters.get(d.id); waiters.delete(d.id); resolve(d.result); }
    if (d.method === 'Network.responseReceived' || d.method === 'Network.loadingFinished' || d.method === 'Network.loadingFailed') netEvents.push(d.method + ':' + JSON.stringify(d.params || {}).slice(0, 300));
    if (d.method === 'Runtime.consoleAPICalled') { const a = (d.params && d.params.args||[]).map((x)=>x&&x.value!==undefined?x.value:'').join(''); if (a) console.log('[console]', a); }
  });
  const send = (m, p) => new Promise((resolve, reject) => { const id = cid++; waiters.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method:m,params:p||{}})) });
  const ready = () => new Promise((r)=> ws.readyState===WebSocket.OPEN?r():ws.addEventListener('open',()=>r()));
  await ready();
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: PAGEURL });
  await sleep(5000); // let React mount + video attempt load/play

  const expr = '(function(){var v=document.querySelector(".satra-bg-video")||document.querySelector("video");var r=document.querySelector("#root");if(!v){return {vNull:true, innerLen: r?r.innerHTML.length:0 };}var e=v.error;return {vNull:false, paused:v.paused, ended:v.ended, currentTime:Number(v.currentTime), duration:Number(v.duration), networkState:v.networkState, readyState:v.readyState, playbackRate:v.playbackRate, hasAutoplay:v.hasAttribute("autoplay"), loop:v.loop, muted:v.muted, playsInline:v.playsInline, currentSrc:v.currentSrc, videoWidth:v.videoWidth, videoHeight:v.videoHeight, error: e?{code:e.code, message:e.message, MSGFMT:["MEDIA_ERR_ABORT","MEDIA_ERR_NETWORK","MEDIA_ERR_DECODE","MEDIA_ERR_SRC_NOT_SUPPORTED"][e.code-1]}:null};})()';
  const r1 = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  console.log('[diag-media] state:', JSON.stringify(r1.result.value));

  // Force a play() and capture whether it resolves
  const pexpr = '(document.querySelector(".satra-bg-video")||document.querySelector("video")) ? (document.querySelector(".satra-bg-video")||document.querySelector("video")).play() : Promise.reject("no-video")';
  try { await send('Runtime.evaluate', { expression: pexpr, returnByValue: true, awaitPromise: true }); console.log('[diag-media] play() resolved'); }
  catch (e) { console.log('[diag-media] play() rejected (headless autoplay policy or media error)'); }

  await sleep(2000);
  const r2 = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  console.log('[diag-media] after-play:', JSON.stringify(r2.result.value));

  console.log('[diag-media] network events (mp4-related):');
  netEvents.filter((n) => n.toLowerCase().includes('galaxy') || n.toLowerCase().includes('mp4')).slice(-12).forEach((n)=>console.log('  '+n));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('[fatal]', e); process.exit(1); });