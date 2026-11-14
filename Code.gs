/**
 * Hamsa Tourism – Live lottery backend (Google Apps Script)
 * 1) Project Settings > Script Properties > add:  ADMIN_PASSWORD = (your password)
 * 2) Deploy > Manage deployments > Edit > New version > Deploy  (Web app, Execute as: Me, Anyone)
 *
 * الفائز بيتضاف في الطابور (shown:false) ومش بيظهر للجمهور
 * غير لما الأدمن يدوس "الفائز التالي" (revealNext).
 */
function doGet() { return out_(getState_()); }

function doPost(e) {
  var b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  var pass = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pass || String(b.password) !== pass) return out_({ ok: false, error: 'unauthorized' });
  if (b.action === 'check') return out_({ ok: true });
  if (b.action === 'list') return out_(Object.assign({ ok: true }, load_()));

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var s = load_();
    if (b.action === 'addWinner') {
      var name = String(b.name || '').trim().slice(0, 80);
      var prize = String(b.prize || '').trim().slice(0, 40);
      if (!name || !prize) return out_({ ok: false, error: 'missing' });
      s.seq = (s.seq || 0) + 1;
      s.winners.unshift({ id: s.seq, name: name, prize: prize, ts: Date.now(), shown: false });
      s.winners = s.winners.slice(0, 200);
    } else if (b.action === 'revealNext') {
      // أقدم واحد لسه ما اتعرضش (الآخر في المصفوفة لأن الأحدث بيتضاف في الأول)
      var idx = -1;
      for (var i = s.winners.length - 1; i >= 0; i--) {
        if (s.winners[i].shown === false) { idx = i; break; }
      }
      if (idx < 0) return out_({ ok: false, error: 'no_pending' });
      s.winners[idx].shown = true;
    } else if (b.action === 'deleteWinner') {
      s.winners = s.winners.filter(function (w) { return w.id !== b.id; });
    } else if (b.action === 'setStream') {
      s.stream = String(b.url || '').trim().slice(0, 500);
    } else if (b.action === 'clearWinners') {
      s.winners = [];
    } else {
      return out_({ ok: false, error: 'unknown_action' });
    }
    save_(s);
    return out_(Object.assign({ ok: true }, s));
  } finally { lock.releaseLock(); }
}

function load_() {
  var raw = PropertiesService.getScriptProperties().getProperty('DATA');
  var s = raw ? JSON.parse(raw) : {};
  s.winners = s.winners || []; s.stream = s.stream || ''; s.seq = s.seq || 0;
  return s;
}
function save_(s) {
  var raw = JSON.stringify(s);
  PropertiesService.getScriptProperties().setProperty('DATA', raw);
  CacheService.getScriptCache().put('DATA', raw, 21600);
}
function getState_() {
  var raw = CacheService.getScriptCache().get('DATA');
  var s;
  if (raw) s = JSON.parse(raw);
  else { s = load_(); CacheService.getScriptCache().put('DATA', JSON.stringify(s), 21600); }
  // الجمهور يشوف بس الفائزين اللي اتعرضوا (القدام اللي من غير shown بيعتبروا معروضين)
  var visible = s.winners.filter(function (w) { return w.shown !== false; });
  return { stream: s.stream, winners: visible };
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
