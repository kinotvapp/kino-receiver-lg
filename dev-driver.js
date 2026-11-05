// Dev driver for the LG receiver: plays a sample WITHOUT the phone, so the TV screen can be iterated on quickly.
// Usage: node dev-driver.js <poster.png> <sample.mp4> ; then, in the other terminal:
//   ares-launch --device lg com.kino.receptor --params '{"host":"<pc-ip>","port":8765,"token":"dev","lang":"es"}'
// Commands are JSON lines on stdin, e.g.
//   {"t":"load","url":"http://<pc-ip>:8767/s.mp4","title":"X","year":2024,"durationMs":180000,"source":"Xuper","poster":"http://<pc-ip>:8766/p.png"}
//   {"t":"pause"}  {"t":"play"}  {"t":"seek","ms":60000}  {"t":"stop"}  {"t":"quit"}
// A sample: ffmpeg -f lavfi -i testsrc2=s=1920x1080:r=24:d=180 -f lavfi -i sine=d=180 -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart sample.mp4
const net = require('net'), http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const PORT = 8765, TOKEN = 'dev', POSTER = process.argv[2], VIDEO = process.argv[3], HOST = process.argv[4];
let sock = null;
function frame(str) { const b = Buffer.from(str); const h = b.length < 126 ? Buffer.from([0x81, b.length]) : Buffer.from([0x81, 126, b.length >> 8, b.length & 255]); return Buffer.concat([h, b]); }
function send(o) { if (sock) sock.write(frame(JSON.stringify(o))); }
net.createServer(s => {
  let buf = '', up = false;
  s.on('data', d => {
    if (!up) {
      buf += d.toString('latin1');
      if (buf.indexOf('\r\n\r\n') < 0) return;
      const key = /Sec-WebSocket-Key: (.+)\r\n/i.exec(buf)[1].trim();
      const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
      up = true; sock = s; console.log('TV connected');
      return;
    }
    let i = 0;
    while (i < d.length) {
      const len0 = d[i + 1] & 127; let len = len0, off = i + 2;
      if (len0 === 126) { len = d.readUInt16BE(off); off += 2; }
      const mask = d.slice(off, off + 4); off += 4;
      const p = Buffer.alloc(len); for (let k = 0; k < len; k++) p[k] = d[off + k] ^ mask[k % 4];
      const t = p.toString();
      if (!/"t":"(status|caps|tracks)"/.test(t)) console.log('TV>', t.slice(0, 200));
      i = off + len;
    }
  });
  s.on('error', () => {});
}).listen(PORT);
http.createServer((q, r) => { r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Content-Type', 'image/png'); r.end(fs.readFileSync(POSTER)); }).listen(8766);
process.stdin.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => { try { send(JSON.parse(l)); } catch (e) { console.log('bad json'); } }));
console.log('ready');
http.createServer((q, r) => {
  const f = path.resolve(process.argv[3]), st = fs.statSync(f);
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Accept-Ranges', 'bytes'); r.setHeader('Content-Type', 'video/mp4');
  const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
  if (m) { const a = +m[1], b = m[2] ? +m[2] : st.size - 1; r.writeHead(206, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }); fs.createReadStream(f, { start: a, end: b }).pipe(r); }
  else { r.writeHead(200, { 'Content-Length': st.size }); fs.createReadStream(f).pipe(r); }
}).listen(8767);
