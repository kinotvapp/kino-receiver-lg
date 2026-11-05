// Kino Receptor for LG webOS (spec docs/superpowers/specs/2026-11-03-webos-receiver-design.md).
// A plain web app: the phone launches it with {host, port, token, lang}, it dials back over a WebSocket and plays what it is
// told with the TV's own <video>. No server, no plugins, no credentials here. Written for Chromium 53+: no modern syntax.
(function () {
  'use strict';

  // The receiver's few texts, in the PHONE's language (sent in the launch params), never the TV's (spec section 3).
  var TEXTS = {
    es: {
      waiting: 'Esperando a Kino…',
      hint: 'Abre un video en Kino y envíalo a esta TV.',
      lost: 'Se perdió la conexión con el celular',
      gaveUp: 'Abre Kino en el celular para volver a conectar.',
      cantPlay: 'No se pudo reproducir este video',
      endsAt: 'Termina a las ',
      audio: 'Audio: ',
      sub: 'Sub: '
    },
    en: {
      waiting: 'Waiting for Kino…',
      hint: 'Open a video in Kino and send it to this TV.',
      lost: 'Lost connection to the phone',
      gaveUp: 'Open Kino on the phone to reconnect.',
      cantPlay: 'This video could not be played',
      endsAt: 'Ends at ',
      audio: 'Audio: ',
      sub: 'Sub: '
    }
  };

  var PROTOCOL = 1;
  var SEEK_STEP_MS = 10000;
  var SEEK_BIG_MS = 30000;
  var STATUS_EVERY_MS = 2000;
  var HUD_MS = 4000;
  var NOTE_MS = 6000;
  // Reconnect backoff: the phone may have slept or switched Wi-Fi; it can relaunch us if it comes back later.
  var RETRY_MS = [1000, 2000, 4000, 8000];
  var GIVE_UP_AFTER_MS = 90000;

  var video = document.getElementById('v');
  var idle = document.getElementById('idle');
  var spin = document.getElementById('spin');
  var hud = document.getElementById('hud');
  var note = document.getElementById('note');

  function readParams() {
    try {
      if (window.PalmSystem && window.PalmSystem.launchParams) {
        var p = JSON.parse(window.PalmSystem.launchParams);
        if (p && typeof p === 'object') return p;
      }
    } catch (e) { /* no params: the app was opened by hand */ }
    return {};
  }

  var params = readParams();
  var lang = params.lang === 'en' ? 'en' : 'es';
  function t(key) { return TEXTS[lang][key]; }

  document.getElementById('idleTitle').textContent = t('waiting');
  document.getElementById('idleHint').textContent = t('hint');

  // --- UI helpers -------------------------------------------------------------------------------------------------------

  var hudTimer = null;
  var noteTimer = null;

  function show(el, on) { if (on) el.classList.remove('hidden'); else el.classList.add('hidden'); }

  function formatTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h > 0 ? h + ':' + two(m) : m) + ':' + two(sec);
  }

  var info = { title: '', year: '', durationMs: 0, source: '', poster: '', subtitle: '' };
  var flashTimer = null;

  function el(id) { return document.getElementById(id); }

  function clock(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var suffix = h >= 12 ? ' PM' : ' AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + (m < 10 ? '0' : '') + m + suffix;
  }

  function videoQuality() {
    var h = video.videoHeight;
    if (!h) return '';
    if (h >= 2000) return '4K';
    if (h >= 1000) return '1080p';
    if (h >= 700) return '720p';
    return h + 'p';
  }

  function audioLabel() {
    var at = video.audioTracks;
    if (!at) return '';
    for (var k = 0; k < at.length; k++) {
      if (at[k].enabled) return at[k].label || at[k].language || '';
    }
    return '';
  }

  function chip(text, red) {
    var c = document.createElement('span');
    c.textContent = text;
    if (red) c.className = 'red';
    return c;
  }

  // The left card: poster, title, year · length · source, and what is playing (quality, audio, subtitle).
  function renderCard() {
    el('hudTitle').textContent = info.title;
    var dur = isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : info.durationMs;
    var bits = [];
    if (info.year) bits.push(info.year);
    if (dur > 0) bits.push(formatTime(dur));
    if (info.source) bits.push(info.source);
    el('hudMeta').textContent = bits.join('  ·  ');
    var chips = el('chips');
    while (chips.firstChild) chips.removeChild(chips.firstChild);
    var q = videoQuality();
    if (q) chips.appendChild(chip(q, true));
    var a = audioLabel();
    if (a) chips.appendChild(chip(t('audio') + a, false));
    if (info.subtitle) chips.appendChild(chip(t('sub') + info.subtitle, false));
  }

  function updateHud() {
    var dur = video.duration;
    var pos = video.currentTime;
    var known = isFinite(dur) && dur > 0;
    var pct = known ? Math.min(100, (pos / dur) * 100) : 0;
    el('barFill').style.width = pct + '%';
    el('barKnob').style.left = pct + '%';
    el('tNow').textContent = formatTime(pos * 1000) + (known ? ' / ' + formatTime(dur * 1000) : '');
    el('tEnd').textContent = known ? t('endsAt') + clock(new Date(Date.now() + (dur - pos) * 1000)) : '';
    var paused = video.paused;
    show(el('iconPause'), !paused);
    show(el('iconPlay'), paused);
    show(el('bigpause'), paused);
  }

  function showHud() {
    renderCard();
    updateHud();
    show(hud, true);
    if (hudTimer) clearTimeout(hudTimer);
    // Paused: the card stays pinned until it plays again.
    hudTimer = video.paused ? null : setTimeout(function () { show(hud, false); }, HUD_MS);
  }

  function flash(text) {
    var f = el('flash');
    f.textContent = text;
    f.classList.add('show');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { f.classList.remove('show'); }, 900);
  }

  function say(text, sticky) {
    note.textContent = text;
    show(note, true);
    if (noteTimer) clearTimeout(noteTimer);
    if (!sticky) noteTimer = setTimeout(function () { show(note, false); }, NOTE_MS);
  }

  function clearNote() {
    if (noteTimer) clearTimeout(noteTimer);
    show(note, false);
  }

  // --- Control channel --------------------------------------------------------------------------------------------------

  var ws = null;
  var retryIndex = 0;
  var lostSince = 0;
  var giveUp = false;
  var hasMedia = false;

  function send(obj) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch (e) { /* the close handler retries */ }
    }
  }

  function log(text) { send({ t: 'log', m: String(text) }); }

  function sendStatus() {
    send({ t: 'status', ms: Math.round(video.currentTime * 1000), paused: video.paused });
  }

  function connect() {
    if (!params.host || !params.port || !params.token || giveUp) return;
    var socket = new WebSocket('ws://' + params.host + ':' + params.port + '/?token=' + encodeURIComponent(params.token));
    ws = socket;
    socket.onopen = function () {
      retryIndex = 0;
      lostSince = 0;
      clearNote();
      send({ t: 'hello', v: PROTOCOL, ua: navigator.userAgent });
      // What this TV can decode, so the phone never sends it a codec it would play black or mute (it gives no error for those).
      send(capsSnapshot());
    };
    socket.onmessage = function (m) {
      var msg;
      try { msg = JSON.parse(m.data); } catch (e) { return; }
      handle(msg);
    };
    socket.onclose = function () {
      if (ws !== socket) return;
      ws = null;
      if (giveUp) return;
      if (!lostSince) lostSince = Date.now();
      if (Date.now() - lostSince > GIVE_UP_AFTER_MS) {
        giveUp = true;
        say(t('gaveUp'), true);
        return;
      }
      // The video it already buffered keeps playing; only a note says the phone is gone.
      say(t('lost'), true);
      var delay = RETRY_MS[Math.min(retryIndex, RETRY_MS.length - 1)];
      retryIndex += 1;
      setTimeout(connect, delay);
    };
    socket.onerror = function () { /* onclose follows */ };
  }

  // --- Playback ---------------------------------------------------------------------------------------------------------

  function showIdle() {
    hasMedia = false;
    show(idle, true);
    show(spin, false);
    show(hud, false);
  }

  // [tell]: false when the phone asked for it (it already knows), true when the TV's own remote did.
  function stopPlayback(reason, tell) {
    try { video.pause(); } catch (e) { /* nothing playing */ }
    removeExternalSubtitle();
    video.removeAttribute('src');
    try { video.load(); } catch (e2) { /* nothing loaded */ }
    showIdle();
    if (tell) send({ t: 'stopped', reason: reason });
  }

  function load(msg) {
    if (!msg.url) return;
    hasMedia = true;
    show(idle, false);
    show(spin, true);
    clearNote();
    info = {
      title: msg.title || '',
      year: msg.year ? String(msg.year) : '',
      durationMs: msg.durationMs > 0 ? msg.durationMs : 0,
      source: msg.source || '',
      poster: msg.poster || '',
      subtitle: ''
    };
    var poster = el('poster');
    if (info.poster) {
      poster.onerror = function () { poster.classList.add('nopic'); };
      poster.onload = function () { poster.classList.remove('nopic'); };
      poster.src = info.poster;
    } else {
      poster.classList.add('nopic');
      poster.removeAttribute('src');
    }
    var startMs = msg.startMs > 0 ? msg.startMs : 0;
    var onMeta = function () {
      video.removeEventListener('loadedmetadata', onMeta);
      if (startMs > 0) { try { video.currentTime = startMs / 1000; } catch (e) { /* not seekable yet */ } }
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.src = msg.url;
    var started = video.play();
    if (started && started.catch) started.catch(function () { /* an error event reports it */ });
    showHud();
  }

  function seekBy(ms) {
    if (!hasMedia) return;
    var target = video.currentTime + ms / 1000;
    if (isFinite(video.duration)) target = Math.min(target, video.duration);
    video.currentTime = Math.max(0, target);
    flash((ms > 0 ? '+' : '−') + Math.round(Math.abs(ms) / 1000) + ' s');
    showHud();
    sendStatus();
  }

  function togglePause() {
    if (!hasMedia) return;
    if (video.paused) video.play(); else video.pause();
    showHud();
  }

  // --- Audio and subtitle tracks ----------------------------------------------------------------------------------------

  // What the TV's player has actually DECODED so far. A codec the TV cannot decode often raises no error: the video keeps its clock but
  // shows black, or the sound is simply absent. The counters are Chromium's (webkit-prefixed); a missing one reads as -1.
  function counter(name) { return typeof video[name] === 'number' ? video[name] : -1; }

  // What the TV says it can play: video.canPlayType per codec string, and MediaSource.isTypeSupported when the TV has it. «maybe» and
  // «probably» both mean yes; «» means no. The codec names are the RFC 6381 / WebM ones the web uses.
  var CAPS_TYPES = [
    ['h264', 'video/mp4; codecs="avc1.640028"'],
    ['hevc', 'video/mp4; codecs="hvc1.1.6.L120.90"'],
    ['hevc10', 'video/mp4; codecs="hvc1.2.4.L150.B0"'],
    ['hevcHev1', 'video/mp4; codecs="hev1.1.6.L120.90"'],
    ['dolbyVision', 'video/mp4; codecs="dvh1.05.06"'],
    ['vp9', 'video/webm; codecs="vp9"'],
    ['av1', 'video/mp4; codecs="av01.0.08M.08"'],
    ['mpeg2', 'video/mpeg'],
    ['aac', 'audio/mp4; codecs="mp4a.40.2"'],
    ['ac3', 'audio/mp4; codecs="ac-3"'],
    ['eac3', 'audio/mp4; codecs="ec-3"'],
    ['dts', 'audio/mp4; codecs="dtsc"'],
    ['dtsx', 'audio/mp4; codecs="dtsx"'],
    ['truehd', 'audio/mp4; codecs="mlpa"'],
    ['flac', 'audio/mp4; codecs="flac"'],
    ['opus', 'audio/webm; codecs="opus"'],
    ['vorbis', 'audio/webm; codecs="vorbis"'],
    ['mp3', 'audio/mpeg'],
    ['mkv', 'video/x-matroska'],
    ['ts', 'video/mp2t'],
    ['hls', 'application/vnd.apple.mpegurl']
  ];

  function capsSnapshot() {
    var out = [];
    for (var k = 0; k < CAPS_TYPES.length; k++) {
      var type = CAPS_TYPES[k][1];
      var native = '';
      var mse = null;
      try { native = video.canPlayType(type); } catch (e) { native = 'error'; }
      try { if (window.MediaSource && MediaSource.isTypeSupported) mse = MediaSource.isTypeSupported(type); } catch (e2) { mse = null; }
      out.push({ k: CAPS_TYPES[k][0], native: native, mse: mse });
    }
    return { t: 'caps', caps: out };
  }

  // The standard counters: frames the player handed to the screen, and how many it had to drop.
  function quality() {
    try {
      var q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality();
      return q ? { total: q.totalVideoFrames, dropped: q.droppedVideoFrames, corrupted: q.corruptedVideoFrames || 0 } : null;
    } catch (e) { return null; }
  }

  function diagSnapshot() {
    return {
      t: 'diag',
      ms: Math.round(video.currentTime * 1000),
      rs: video.readyState,
      w: video.videoWidth,
      h: video.videoHeight,
      frames: counter('webkitDecodedFrameCount'),
      dropped: counter('webkitDroppedFrameCount'),
      audioBytes: counter('webkitAudioDecodedByteCount'),
      videoBytes: counter('webkitVideoDecodedByteCount'),
      audioTracks: video.audioTracks ? video.audioTracks.length : -1,
      paused: video.paused,
      muted: video.muted,
      quality: quality(),
      buffered: video.buffered && video.buffered.length ? Math.round(video.buffered.end(video.buffered.length - 1) * 1000) : -1
    };
  }

  // The subtitle the phone sent as a file ("external"): a <track> of its own, shown by the TV's player.
  var extTrack = null;
  var tracksTimer = null;

  function tracksSnapshot() {
    var audio = [];
    var text = [];
    var i;
    var t;
    var at = video.audioTracks;
    if (at) {
      for (i = 0; i < at.length; i++) {
        t = at[i];
        audio.push({ i: i, id: t.id || '', lang: t.language || '', label: t.label || '', on: !!t.enabled });
      }
    }
    var tt = video.textTracks;
    if (tt) {
      for (i = 0; i < tt.length; i++) {
        t = tt[i];
        if (extTrack && t === extTrack.track) continue;
        text.push({ i: i, kind: t.kind || '', lang: t.language || '', label: t.label || '', mode: t.mode || '' });
      }
    }
    var ext = null;
    if (extTrack) ext = { cues: extTrack.track.cues ? extTrack.track.cues.length : 0, mode: extTrack.track.mode };
    return { t: 'tracks', hasAudioApi: !!at, audio: audio, text: text, ext: ext };
  }

  // Tracks appear a moment after the video starts, one by one: told once they settle.
  function sendTracksSoon() {
    if (tracksTimer) clearTimeout(tracksTimer);
    tracksTimer = setTimeout(function () { tracksTimer = null; send(tracksSnapshot()); }, 400);
  }

  function setAudio(index) {
    var at = video.audioTracks;
    if (!at || index < 0 || index >= at.length) return;
    for (var k = 0; k < at.length; k++) at[k].enabled = (k === index);
    sendTracksSoon();
  }

  // Shows the video's own text track [index] (the file's embedded subtitle), or none with a negative index.
  function setText(index) {
    var tt = video.textTracks;
    if (!tt) return;
    for (var k = 0; k < tt.length; k++) {
      if (extTrack && tt[k] === extTrack.track) continue;
      tt[k].mode = (k === index) ? 'showing' : 'disabled';
    }
    sendTracksSoon();
  }

  function removeExternalSubtitle() {
    if (!extTrack) return;
    try { extTrack.track.mode = 'disabled'; } catch (e) { /* already gone */ }
    if (extTrack.parentNode) extTrack.parentNode.removeChild(extTrack);
    extTrack = null;
  }

  // A subtitle file from the phone ({url, lang, label}), or none ({off: true}).
  function setSubtitle(msg) {
    removeExternalSubtitle();
    info.subtitle = (msg.off || !msg.url) ? '' : (msg.label || msg.lang || 'Kino');
    if (msg.off || !msg.url) { sendTracksSoon(); return; }
    var el = document.createElement('track');
    el.kind = 'subtitles';
    el.src = msg.url;
    el.srclang = msg.lang || 'und';
    el.label = msg.label || 'Kino';
    // The file comes from another origin (the phone): the TV asks for it with CORS.
    el.crossOrigin = 'anonymous';
    el.addEventListener('load', function () { el.track.mode = 'showing'; applySubtitleDelay(); sendTracksSoon(); });
    el.addEventListener('error', function () { send({ t: 'log', m: 'subtitle file did not load' }); sendTracksSoon(); });
    video.appendChild(el);
    extTrack = el;
    // A file's own subtitle must not draw under the phone's.
    var tt = video.textTracks;
    for (var k = 0; k < tt.length; k++) if (tt[k] !== el.track) tt[k].mode = 'disabled';
    el.track.mode = 'showing';
  }

  // The phone's «Sincronizar subtítulos»: every cue of the phone's file moves by [subtitleDelayMs] (positive = later). The cues keep their
  // original times so a new value is applied to the file as sent, never on top of the last one.
  var subtitleDelayMs = 0;

  function applySubtitleDelay() {
    if (!extTrack || !extTrack.track.cues) return;
    var cues = extTrack.track.cues;
    for (var k = 0; k < cues.length; k++) {
      var cue = cues[k];
      if (cue.kinoStart === undefined) { cue.kinoStart = cue.startTime; cue.kinoEnd = cue.endTime; }
      cue.startTime = Math.max(0, cue.kinoStart + subtitleDelayMs / 1000);
      cue.endTime = Math.max(0.01, cue.kinoEnd + subtitleDelayMs / 1000);
    }
  }

  var cueStyle = null;

  // How the lines look, in the phone's subtitle settings: {size (percent of the screen height), color, bg, edge}.
  function applySubtitleStyle(msg) {
    if (!cueStyle) {
      cueStyle = document.createElement('style');
      document.head.appendChild(cueStyle);
    }
    var size = msg.size > 0 ? msg.size : 4;
    var shadow = msg.edge === 'none' ? 'none' : '0 0 4px #000, 0 0 4px #000, 2px 2px 4px #000';
    cueStyle.textContent = 'video::cue { font-size: ' + size + 'vh; color: ' + (msg.color || '#ffffff') +
      '; background-color: ' + (msg.bg || 'transparent') + '; text-shadow: ' + shadow + '; }';
  }

  function handle(msg) {
    switch (msg.t) {
      case 'load': load(msg); break;
      case 'play': if (hasMedia) video.play(); break;
      case 'pause': if (hasMedia) video.pause(); break;
      case 'seek': if (hasMedia && msg.ms >= 0) { video.currentTime = msg.ms / 1000; sendStatus(); } break;
      case 'stop': stopPlayback('phone', false); break;
      case 'tracks': send(tracksSnapshot()); break;
      case 'diag': send(diagSnapshot()); break;
      case 'caps': send(capsSnapshot()); break;
      case 'quit': if (window.webOS && window.webOS.platformBack) window.webOS.platformBack(); else window.close(); break;
      case 'audio': if (hasMedia) setAudio(msg.index); break;
      case 'text': if (hasMedia) setText(msg.index); break;
      case 'subtitle': if (hasMedia) setSubtitle(msg); break;
      case 'subtitleStyle': applySubtitleStyle(msg); break;
      case 'subtitleDelay': subtitleDelayMs = Number(msg.ms) || 0; applySubtitleDelay(); break;
      default: break;
    }
  }

  video.addEventListener('playing', function () { show(spin, false); sendStatus(); if (hasMedia && !hud.classList.contains('hidden')) showHud(); });
  video.addEventListener('loadedmetadata', sendTracksSoon);
  video.addEventListener('waiting', function () { if (hasMedia) show(spin, true); });
  video.addEventListener('pause', function () { sendStatus(); if (hasMedia) showHud(); });
  video.addEventListener('seeked', sendStatus);
  video.addEventListener('timeupdate', function () { if (!hud.classList.contains('hidden')) updateHud(); });
  video.addEventListener('ended', function () { stopPlayback('ended', true); });
  video.addEventListener('error', function () {
    if (!hasMedia) return;
    var e = video.error;
    show(spin, false);
    say(t('cantPlay'));
    send({ t: 'error', code: e ? e.code : null, detail: e && e.message ? e.message : null });
  });

  // --- Remote -----------------------------------------------------------------------------------------------------------

  var KEY = { OK: 13, LEFT: 37, RIGHT: 39, PAUSE: 19, STOP: 413, PLAY: 415, REWIND: 412, FORWARD: 417, BACK: 461, BACKSPACE: 8, ESC: 27 };

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case KEY.OK: togglePause(); break;
      case KEY.PLAY: if (hasMedia) { video.play(); showHud(); } break;
      case KEY.PAUSE: if (hasMedia) { video.pause(); showHud(); } break;
      case KEY.LEFT: seekBy(-SEEK_STEP_MS); break;
      case KEY.RIGHT: seekBy(SEEK_STEP_MS); break;
      case KEY.REWIND: seekBy(-SEEK_BIG_MS); break;
      case KEY.FORWARD: seekBy(SEEK_BIG_MS); break;
      case KEY.STOP: if (hasMedia) stopPlayback('back', true); break;
      case KEY.BACK:
      case KEY.BACKSPACE:
      case KEY.ESC:
        if (hasMedia) {
          stopPlayback('back', true);
        } else {
          // Idle: Back leaves the app, as on any TV app.
          if (window.webOS && window.webOS.platformBack) window.webOS.platformBack(); else window.close();
        }
        break;
      default: return;
    }
    e.preventDefault();
  });

  // A launch while the app is already open does not reload the page: it fires this event and the launch params hold the new
  // session (measured on a real LG, 2026-11-04). Reloading reads them.
  document.addEventListener('webOSRelaunch', function () { location.reload(); });

  setInterval(function () { if (hasMedia) sendStatus(); }, STATUS_EVERY_MS);
  if (video.audioTracks && video.audioTracks.addEventListener) video.audioTracks.addEventListener('addtrack', sendTracksSoon);
  if (video.textTracks && video.textTracks.addEventListener) video.textTracks.addEventListener('addtrack', sendTracksSoon);

  showIdle();
  connect();
  if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
  log('receiver ready, lang=' + lang);
}());
