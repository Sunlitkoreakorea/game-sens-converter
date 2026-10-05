(function () {
  'use strict';

  var GAMES = window.__GAMES || [];
  var PRESET = document.body.getAttribute('data-game') || '';
  var CM_PER_360_CONST = 360 * 2.54; // 914.4

  function $(id) { return document.getElementById(id); }
  function byId(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i]; return null; }
  function validGame(id) { return !!byId(id); }

  var els = {
    modeGame: $('mode-game'), modeCm: $('mode-cm'),
    fGame: $('f-game'), fSens: $('f-sens'), fCm: $('f-cm'),
    game: $('game'), sens: $('sens'), sensLabel: $('sens-label'), cm: $('cm'),
    dpi: $('dpi'), tdpi: $('tdpi'),
    oCm: $('o-cm'), oIn: $('o-in'), oEdpi: $('o-edpi'),
    results: $('results'), outDpi: $('out-dpi'), share: $('share')
  };

  var firstId = PRESET && validGame(PRESET) ? PRESET : 'valorant';
  var state = { mode: 'game', game: firstId, sens: String(byId(firstId).defaultSens), cm: '', dpi: '800', tdpi: '' };

  // ---- 계산: 모든 게임을 "마우스 1카운트당 회전 각도(°)"로 통일 ----
  function speedFor(g, sens) {
    if (g.curve === 'exp15') return g.base * Math.pow(2, (sens - g.baseSens) / 15);
    return sens * g.yaw;
  }
  function sensForSpeed(g, speed) {
    if (g.curve === 'exp15') return g.baseSens + 15 * Math.log(speed / g.base) / Math.LN2;
    return speed / g.yaw;
  }
  function cmFromSpeed(speed, dpi) { return CM_PER_360_CONST / (speed * dpi); }
  function speedFromCm(cm, dpi) { return CM_PER_360_CONST / (cm * dpi); }

  function num(str) {
    var n = parseFloat(String(str).replace(',', '.').trim());
    return isFinite(n) && n > 0 ? n : NaN;
  }
  function fmt(n, d) {
    if (!isFinite(n)) return '—';
    var s = n.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  // ---- 저장/복원 (불가능한 환경에서도 동작) ----
  var KEY = 'gameSensConverter.v2';
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return;
      ['mode', 'game', 'sens', 'cm', 'dpi', 'tdpi'].forEach(function (k) {
        if (typeof s[k] === 'string') state[k] = s[k];
      });
      if (state.mode !== 'game' && state.mode !== 'cm') state.mode = 'game';
      if (!validGame(state.game)) { state.game = firstId; state.sens = String(byId(firstId).defaultSens); }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // ---- 공유 링크 (?g=게임&s=감도&d=DPI&t=변환후DPI / ?c=cm&d=DPI) ----
  var NUM_RE = /^\d{1,9}([.,]\d{1,6})?$/;
  function applyQuery() {
    var p;
    try { p = new URLSearchParams(window.location.search); } catch (e) { return false; }
    var used = false;
    var g = p.get('g'), s = p.get('s'), c = p.get('c'), d = p.get('d'), t = p.get('t');
    if (g && validGame(g)) { state.game = g; state.mode = 'game'; used = true; }
    if (s && NUM_RE.test(s)) { state.sens = s; state.mode = 'game'; used = true; }
    if (c && NUM_RE.test(c) && !(s && NUM_RE.test(s))) { state.cm = c; state.mode = 'cm'; used = true; }
    if (d && NUM_RE.test(d)) { state.dpi = d; used = true; }
    if (t && NUM_RE.test(t)) { state.tdpi = t; used = true; }
    return used;
  }
  function shareUrl() {
    var base = window.location.href.split(/[?#]/)[0];
    var p = [];
    if (state.mode === 'cm') p.push('c=' + encodeURIComponent(state.cm.trim()));
    else { p.push('g=' + encodeURIComponent(state.game)); p.push('s=' + encodeURIComponent(state.sens.trim())); }
    p.push('d=' + encodeURIComponent(state.dpi.trim()));
    if (state.tdpi.trim()) p.push('t=' + encodeURIComponent(state.tdpi.trim()));
    return base + '?' + p.join('&');
  }

  // ---- 렌더 ----
  function currentSource() {
    var dpi = num(state.dpi);
    var cm = NaN, sens = NaN;
    if (state.mode === 'game') {
      sens = num(state.sens);
      cm = cmFromSpeed(speedFor(byId(state.game), sens), dpi);
    } else {
      cm = num(state.cm);
    }
    return { dpi: dpi, sens: sens, cm: cm };
  }

  function render() {
    var src = currentSource();
    var okCm = isFinite(src.cm) && src.cm > 0;

    els.oCm.textContent = okCm ? fmt(src.cm, src.cm < 10 ? 2 : 1) : '—';
    els.oIn.textContent = okCm ? fmt(src.cm / 2.54, 2) : '—';
    els.oEdpi.textContent = (state.mode === 'game' && isFinite(src.sens) && isFinite(src.dpi) && !byId(state.game).curve)
      ? fmt(src.sens * src.dpi, 1) : '—';

    var tdpi = num(state.tdpi);
    var outDpi = isFinite(tdpi) ? tdpi : src.dpi;
    els.outDpi.textContent = isFinite(outDpi) ? '· DPI ' + fmt(outDpi, 0) + ' 기준' : '';

    var outOk = okCm && isFinite(outDpi);
    if (els.share) els.share.disabled = !(outOk && isFinite(src.dpi));

    els.results.innerHTML = '';
    if (!outOk) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = state.mode === 'game'
        ? '게임, 감도, DPI를 입력하면 결과가 표시됩니다.'
        : 'cm/360과 DPI를 입력하면 결과가 표시됩니다.';
      els.results.appendChild(li);
      return;
    }

    GAMES.forEach(function (game) {
      var isSrc = state.mode === 'game' && game.id === state.game;
      var value = isSrc && !isFinite(tdpi) ? src.sens : sensForSpeed(game, speedFromCm(src.cm, outDpi));
      var text = fmt(value, game.dec);

      var row = document.createElement('li');
      row.className = 'row' + (isSrc ? ' src' : '');

      var name = document.createElement('div');
      name.className = 'gname';
      name.textContent = game.name;
      if (isSrc) { var b = document.createElement('span'); b.className = 'badge'; b.textContent = '내 설정'; name.appendChild(b); }
      if (game.approx) { var w = document.createElement('span'); w.className = 'badge warn'; w.textContent = '근사값'; name.appendChild(w); }
      if (game.range && (value < game.range[0] || value > game.range[1])) {
        var r = document.createElement('span'); r.className = 'badge warn';
        r.textContent = '범위 밖 (' + game.range[0] + '–' + game.range[1] + ')'; name.appendChild(r);
      }
      var sub = document.createElement('small');
      sub.textContent = game.en;
      name.appendChild(sub);

      var val = document.createElement('div');
      val.className = 'val';
      val.textContent = text;
      if (game.unit) { var u = document.createElement('span'); u.className = 'u'; u.textContent = game.unit; val.appendChild(u); }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      btn.textContent = '복사';
      btn.setAttribute('aria-label', game.name + ' 감도 ' + text + ' 복사');
      btn.addEventListener('click', function () { copyText(text, btn); });

      row.appendChild(name); row.appendChild(val); row.appendChild(btn);
      els.results.appendChild(row);
    });
  }

  function copyText(text, btn) {
    var orig = btn.textContent;
    function done(ok) {
      btn.textContent = ok ? '복사됨' : '실패';
      btn.classList.toggle('done', ok);
      setTimeout(function () { btn.textContent = orig; btn.classList.remove('done'); }, 1200);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else { fallback(); }
  }

  // ---- UI 동기화 ----
  function applyMode() {
    var isGame = state.mode === 'game';
    els.modeGame.setAttribute('aria-pressed', String(isGame));
    els.modeCm.setAttribute('aria-pressed', String(!isGame));
    els.fGame.hidden = !isGame;
    els.fSens.hidden = !isGame;
    els.fCm.hidden = isGame;
  }
  function applyGameLabel() {
    var g = byId(state.game);
    els.sensLabel.textContent = g.unit === '%' ? g.name + ' 감도 (% 값 그대로)' : g.name + ' 감도';
  }
  function update() { save(); render(); }

  function init() {
    GAMES.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id; o.textContent = g.name;
      els.game.appendChild(o);
    });

    load();
    // 게임별 페이지: 그 게임 기준으로 시작 (저장된 DPI는 유지)
    if (PRESET && validGame(PRESET) && state.game !== PRESET) {
      state.game = PRESET; state.sens = String(byId(PRESET).defaultSens);
    }
    if (PRESET && validGame(PRESET)) state.mode = 'game';
    applyQuery();

    els.game.value = state.game;
    els.sens.value = state.sens;
    els.cm.value = state.cm;
    els.dpi.value = state.dpi;
    els.tdpi.value = state.tdpi;
    applyMode(); applyGameLabel(); render();

    els.modeGame.addEventListener('click', function () { state.mode = 'game'; applyMode(); update(); });
    els.modeCm.addEventListener('click', function () { state.mode = 'cm'; applyMode(); update(); });
    els.game.addEventListener('change', function () {
      state.game = els.game.value;
      state.sens = String(byId(state.game).defaultSens);
      els.sens.value = state.sens;
      applyGameLabel(); update();
    });
    els.sens.addEventListener('input', function () { state.sens = els.sens.value; update(); });
    els.cm.addEventListener('input', function () { state.cm = els.cm.value; update(); });
    els.dpi.addEventListener('input', function () { state.dpi = els.dpi.value; update(); });
    els.tdpi.addEventListener('input', function () { state.tdpi = els.tdpi.value; update(); });

    Array.prototype.forEach.call(document.querySelectorAll('.chips'), function (box) {
      var target = box.getAttribute('data-target');
      box.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('chip')) return;
        var v = t.getAttribute('data-v');
        state[target] = v;
        els[target].value = v;
        update();
      });
    });

    if (els.share) els.share.addEventListener('click', function () { copyText(shareUrl(), els.share); });
  }

  init();
})();
