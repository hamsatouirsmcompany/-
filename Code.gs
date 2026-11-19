/**
 * Hamsa Tourism – Live lottery backend (Google Apps Script)
 * 1) Project Settings > Script Properties > add:  ADMIN_PASSWORD = (your password)
 * 2) Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy
 *
 * فقرات الحفل: كل فقرة {id, type: text|draw|end, title, text}
 * current = رقم الفقرة المعروضة دلوقتي (0 = شاشة الانتظار)
 */
function doGet() { return out_(getState_()); }

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  var pass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pass || String(b.password) !== pass) return out_({ ok: false, error: 'unauthorized' });
  if (b.action === 'check') return out_({ ok: true });
  if (b.action === 'list') return out_(Object.assign({ ok: true }, load_()));
  if (b.action === 'driveToken') {
    // رفع الفيديو بيتم من المتصفح مباشرة لـ Drive (علشان الملفات الكبيرة)
    try { return out_({ ok: true, token: ScriptApp.getOAuthToken(), folder: videoFolder_().getId() }); }
    catch (err) { return out_({ ok: false, error: 'upload_failed: ' + err.message }); }
  }
  if (b.action === 'shareFile') {
    try {
      var sf = DriveApp.getFileById(String(b.id || '')), ps = sf.getParents(), allowed = false;
      while (ps.hasNext()) { var pn = ps.next().getName(); if (pn === 'Hamsa Lottery Videos' || pn === 'Hamsa Lottery Photos') allowed = true; }
      if (!allowed) return out_({ ok: false, error: 'not_allowed' });
      sf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out_({ ok: true, url: 'https://drive.google.com/file/d/' + sf.getId() + '/view' });
    } catch (err) { return out_({ ok: false, error: 'upload_failed: ' + err.message }); }
  }
  if (b.action === 'uploadPhoto') {
    try {
      var data = String(b.data || '');
      if (!data || data.length > 4000000) return out_({ ok: false, error: 'bad_image' });
      var nm = String(b.name || 'winner').replace(/[^\w\u0600-\u06FF ]/g, '').slice(0, 40) || 'winner';
      var blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', nm + '-' + Date.now() + '.jpg');
      var f = photoFolder_().createFile(blob);
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out_({ ok: true, url: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1200' });
    } catch (err) { return out_({ ok: false, error: 'upload_failed: ' + err.message }); }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = load_();
    var a = b.action, id = Number(b.id);
    if (a === 'addWinner') {
      var name = String(b.name || '').trim().slice(0, 80);
      var prize = String(b.prize || '').trim().slice(0, 40);
      if (!name || !prize) return out_({ ok: false, error: 'missing' });
      s.seq = (s.seq || 0) + 1;
      var photo = String(b.photo || '').trim().slice(0, 600);
      s.winners.unshift({ id: s.seq, name: name, prize: prize, photo: photo, pos: pos_(b.pos), ts: Date.now() });
      s.winners = s.winners.slice(0, 200);
      s.waiting = false;
    } else if (a === 'setWinnerPhoto') {
      var wi = null;
      for (var q = 0; q < s.winners.length; q++) if (s.winners[q].id === b.id) wi = s.winners[q];
      if (!wi) return out_({ ok: false, error: 'not_found' });
      if (b.photo !== undefined) wi.photo = String(b.photo || '').trim().slice(0, 600);
      if (b.pos) wi.pos = pos_(b.pos);
    } else if (a === 'nextWinner') {
      s.waiting = true;
    } else if (a === 'deleteWinner') {
      s.winners = s.winners.filter(function (w) { return w.id !== b.id; });
    } else if (a === 'setStream') {
      s.stream = String(b.url || '').trim().slice(0, 500);
    } else if (a === 'clearWinners') {
      s.winners = []; s.waiting = false;
    } else if (a === 'addSegment' || a === 'updateSegment') {
      var title = String(b.title || '').trim().slice(0, 120);
      var text = String(b.text || '').trim().slice(0, 600);
      var type = String(b.type || 'text');
      var img = String(b.img || '').trim().slice(0, 600);
      if (['text', 'draw', 'end', 'photo', 'video', 'gallery'].indexOf(type) < 0) type = 'text';
      if (!title) return out_({ ok: false, error: 'missing' });
      if (a === 'addSegment') {
        s.segSeq = (s.segSeq || 0) + 1;
        s.segments.push({ id: s.segSeq, type: type, title: title, text: text, img: img });
      } else {
        var g = find_(s, id);
        if (!g) return out_({ ok: false, error: 'not_found' });
        g.title = title; g.text = text; g.type = type; g.img = img;
      }
    } else if (a === 'deleteSegment') {
      s.segments = s.segments.filter(function (g) { return g.id !== id; });
      if (s.current === id) s.current = 0;
    } else if (a === 'moveSegment') {
      var i = idx_(s, id), j = i + (Number(b.dir) < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= s.segments.length) return out_({ ok: false, error: 'cannot_move' });
      var t = s.segments[i]; s.segments[i] = s.segments[j]; s.segments[j] = t;
    } else if (a === 'setCurrent') {
      if (id && !find_(s, id)) return out_({ ok: false, error: 'not_found' });
      s.current = id || 0;
      if (id) s.waiting = false;
    } else {
      return out_({ ok: false, error: 'unknown_action' });
    }
    save_(s);
    return out_(Object.assign({ ok: true }, s));
  } finally { lock.releaseLock(); }
}

// صور الفائزين بتتخزن في فولدر على Drive. شغّل authorizeDrive مرة واحدة من المحرر لإعطاء الصلاحية.
function photoFolder_() {
  var it = DriveApp.getFoldersByName('Hamsa Lottery Photos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Hamsa Lottery Photos');
}
function videoFolder_() {
  var it = DriveApp.getFoldersByName('Hamsa Lottery Videos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Hamsa Lottery Videos');
}
function authorizeDrive() { photoFolder_(); videoFolder_(); }

// مكان وتكبير الصورة جوه الكارت: x,y نسبة مئوية (0-100) و z تكبير (1-3)
function pos_(p) {
  if (!p || typeof p !== 'object') return null;
  function c(v, a, b, d) { v = Number(v); return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }
  return { x: c(p.x, 0, 100, 50), y: c(p.y, 0, 100, 22), z: c(p.z, 1, 3, 1) };
}

function idx_(s, id) { for (var i = 0; i < s.segments.length; i++) if (s.segments[i].id === id) return i; return -1; }
function find_(s, id) { var i = idx_(s, id); return i < 0 ? null : s.segments[i]; }

function norm_(s) {
  s.winners = s.winners || []; s.stream = s.stream || ''; s.seq = s.seq || 0; s.waiting = !!s.waiting;
  if (!s.segments) {
    s.segments = [
      { id: 1, type: 'text', title: 'تلاوة من القرآن الكريم', text: '' },
      { id: 2, type: 'text', title: 'كلمة رئيس مجلس الإدارة', text: '' },
      { id: 3, type: 'draw', title: 'فريق القرعة', text: '' },
      { id: 4, type: 'end', title: 'شكرًا لكم', text: 'ما كل مشتاقٍ يصل.. لكن الله يختار من يشاء لضيافته،\nفهنيئًا لمن نادته مكة، وجعلنا الله جميعًا من زوّار بيته الحرام.' }
    ];
    s.segSeq = 4; s.current = 0;
  }
  s.segSeq = s.segSeq || 0; s.current = s.current || 0;
  // إضافة فقرة "الصورة الجماعية" مرة واحدة بعد فقرة القرعة (الـ id ثابت لحد ما يتحفظ)
  if (!s.photoSeeded) {
    var at = -1;
    for (var i = 0; i < s.segments.length; i++) if (s.segments[i].type === 'draw') at = i;
    var seg = { id: s.segSeq + 1, type: 'photo', title: 'صورة جماعية', text: 'الفائزون مع مجلس الإدارة', img: '' };
    if (at >= 0) s.segments.splice(at + 1, 0, seg); else s.segments.push(seg);
    s.segSeq = s.segSeq + 1; s.photoSeeded = true;
  }
  // إضافة فقرة "الفيديو" مرة واحدة بعد الصورة الجماعية (أو قبل الختام)
  if (!s.videoSeeded) {
    var pi = -1, ei = -1;
    for (var k = 0; k < s.segments.length; k++) {
      if (s.segments[k].type === 'photo') pi = k;
      if (s.segments[k].type === 'end') ei = k;
    }
    var vseg = { id: s.segSeq + 1, type: 'video', title: 'فيديو تذكاري', text: '', img: '' };
    if (pi >= 0) s.segments.splice(pi + 1, 0, vseg);
    else if (ei >= 0) s.segments.splice(ei, 0, vseg);
    else s.segments.push(vseg);
    s.segSeq = s.segSeq + 1; s.videoSeeded = true;
  }
  // إضافة فقرة "صور الفائزين" مرة واحدة بعد الفيديو (أو قبل الختام)
  if (!s.gallerySeeded) {
    var vi = -1, ge = -1;
    for (var m = 0; m < s.segments.length; m++) {
      if (s.segments[m].type === 'video') vi = m;
      if (s.segments[m].type === 'end') ge = m;
    }
    var gseg = { id: s.segSeq + 1, type: 'gallery', title: 'الفائزون', text: 'مبروك لكل الفائزين', img: '' };
    if (vi >= 0) s.segments.splice(vi + 1, 0, gseg);
    else if (ge >= 0) s.segments.splice(ge, 0, gseg);
    else s.segments.push(gseg);
    s.segSeq = s.segSeq + 1; s.gallerySeeded = true;
  }
  return s;
}
function load_() {
  var raw = PropertiesService.getScriptProperties().getProperty('DATA');
  return norm_(raw ? JSON.parse(raw) : {});
}
function save_(s) {
  var raw = JSON.stringify(s);
  PropertiesService.getScriptProperties().setProperty('DATA', raw);
  CacheService.getScriptCache().put('DATA', raw, 21600);
}
function getState_() {
  var raw = CacheService.getScriptCache().get('DATA');
  var s;
  if (raw) s = norm_(JSON.parse(raw));
  else { s = load_(); CacheService.getScriptCache().put('DATA', JSON.stringify(s), 21600); }
  var g = s.current ? find_(s, s.current) : null;
  return {
    stream: s.stream, winners: s.winners, waiting: s.waiting,
    program: s.segments.length > 0,
    segment: g ? { id: g.id, type: g.type, title: g.title, text: g.text, img: g.img || '' } : null
  };
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
