// «Месть грибов» — перевёрнутый платформер: ты грибок, давишь героев-прыгунов.
// Чистый Canvas + JS, без библиотек. Уровни лежат в levels.js.
(function () {
  'use strict';

  // ================= Константы =================
  var T = 16;                    // размер клетки, пикселей
  var STEP = 1 / 120;            // шаг физики, секунд
  var STORE = 'mushroomRevenge.';
  var LEVELS = window.MUSHROOM_LEVELS || [];

  // Физика грибка (пиксели и секунды)
  var GRAVITY = 950;
  var MAX_FALL = 420;
  var RUN_SPEED = 96;
  var ACCEL_GROUND = 900;
  var ACCEL_AIR = 620;
  var FRICTION_GROUND = 1100;
  var FRICTION_AIR = 260;
  var JUMP_SPEED = 350;          // ≈ 4 клетки в высоту при полном прыжке
  var JUMP_CUT = 120;            // отпустил кнопку — прыжок обрезается
  var COYOTE_TIME = 0.1;         // можно прыгнуть чуть позже края
  var JUMP_BUFFER = 0.12;        // нажатие чуть раньше приземления засчитывается
  var STOMP_BOUNCE = 230;
  var STOMP_BOUNCE_HELD = 340;
  var MAX_LIVES = 5;
  var START_LIVES = 3;

  // Хитбоксы и смещения спрайтов (по реальным границам картинок)
  var PW = 18, PH = 24, P_OX = -7, P_OY = -7;      // грибок 32×32
  var EW = 16, EH = 34, E_OX = -8, E_OY = -8;      // герой 32×48
  var FLAG_POLE = 6;                               // высота шеста флага, клеток

  var SKY = { meadow: '#1e3a5f', cave: '#1a1016' };

  // ================= Хранилище =================
  function load(key, def) {
    try {
      var v = localStorage.getItem(STORE + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function save(key, value) {
    try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) { /* нет доступа — не страшно */ }
  }

  // ================= DOM =================
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var screenEl = $('screen');
  var stageEl = $('stage');
  var overlay = $('overlay');
  var ovTitle = $('ov-title');
  var ovText = $('ov-text');
  var ovButtons = $('ov-buttons');
  var banner = $('banner');
  var hud = {
    lives: $('hud-lives'), coins: $('hud-coins'), score: $('hud-score'), level: $('hud-level'),
    sound: $('btn-sound'), pause: $('btn-pause')
  };

  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(hover: none)').matches);
  if (isTouch) document.body.classList.add('touch');

  // ================= Картинки =================
  var IMG = {};
  function loadImages(done) {
    var names = ['player', 'enemy', 'tiles', 'items', 'bg_meadow', 'bg_cave'];
    var left = names.length;
    names.forEach(function (n) {
      var im = new Image();
      im.onload = im.onerror = function () { if (--left === 0) done(); };
      im.src = 'assets/' + n + '.png';
      IMG[n] = im;
    });
  }
  function ready(im) { return im && im.complete && im.naturalWidth > 0; }

  // ================= Звук (Web Audio, всё синтезируется) =================
  var Sound = {
    ctx: null, master: null, on: load('sound', true), meme: null, memeTried: false, memeSrc: null,

    unlock: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        this.loadMeme();
      }
      if (this.ctx.state === 'suspended') {
        var p = this.ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    },

    // assets/meme.mp3 — необязательный файл. Нет его — играем синтезированный звук.
    loadMeme: function () {
      var self = this;
      if (this.memeTried || !window.fetch || location.protocol === 'file:') return;
      this.memeTried = true;
      fetch('assets/meme.mp3').then(function (r) {
        return r.ok ? r.arrayBuffer() : null;
      }).then(function (buf) {
        if (!buf) return null;
        try {
          var p = self.ctx.decodeAudioData(buf);
          return p && p.then ? p : null;
        } catch (e) { return null; }
      }).then(function (decoded) {
        if (decoded) self.meme = decoded;
      }).catch(function () { self.meme = null; });
    },

    usable: function () { return this.on && this.ctx && this.ctx.state === 'running'; },

    tone: function (type, f0, f1, dur, vol, delay) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },

    noise: function (dur, vol, delay, freq) {
      var c = this.ctx, t = c.currentTime + (delay || 0);
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq || 2000;
      g.gain.value = vol || 0.4;
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t);
    },

    notes: function (type, list, step, vol) {
      for (var i = 0; i < list.length; i++) this.tone(type, list[i], list[i], step * 1.1, vol, i * step);
    },

    play: function (name) {
      if (!this.usable()) return;
      try {
        switch (name) {
          case 'jump': this.tone('square', 260, 620, 0.14, 0.25); break;
          case 'coin': this.tone('square', 990, 990, 0.06, 0.25); this.tone('square', 1320, 1320, 0.18, 0.25, 0.06); break;
          case 'bump': this.tone('square', 140, 90, 0.08, 0.3); break;
          case 'break': this.noise(0.18, 0.5, 0, 1800); this.tone('square', 200, 60, 0.12, 0.2); break;
          case 'hurt': this.tone('square', 520, 110, 0.35, 0.3); this.tone('sawtooth', 300, 80, 0.3, 0.12, 0.05); break;
          case 'fall': this.tone('triangle', 700, 90, 0.6, 0.4); break;
          case 'life': this.notes('square', [523, 659, 784, 1047], 0.07, 0.22); break;
          case 'flag': this.notes('square', [392, 523, 659, 784, 1047, 784, 1047], 0.09, 0.22); break;
          case 'over': this.notes('triangle', [494, 440, 392, 330, 262], 0.18, 0.4); break;
          case 'win': this.notes('square', [523, 659, 784, 659, 784, 1047, 1047], 0.12, 0.22); break;
          case 'stomp': this.stomp(); break;
        }
      } catch (e) { /* звук не критичен */ }
    },

    stomp: function () {
      if (this.meme) {
        try {
          if (this.memeSrc) { try { this.memeSrc.stop(); } catch (e) {} }
          var s = this.ctx.createBufferSource();
          s.buffer = this.meme;
          s.connect(this.master);
          s.start();
          this.memeSrc = s;
          return;
        } catch (e) { /* дальше — запасной звук */ }
      }
      // Синтезированная замена: «бдыщ» с сплющиванием
      this.noise(0.12, 0.6, 0, 900);
      this.tone('square', 420, 70, 0.18, 0.35);
      this.tone('square', 880, 880, 0.05, 0.15, 0.12);
    },

    toggle: function () {
      this.on = !this.on;
      save('sound', this.on);
      updateSoundButton();
    }
  };

  // ================= Ввод =================
  var keys = { left: false, right: false, jump: false };
  var touch = { left: 0, right: 0, jump: 0 };
  var input = { left: false, right: false, jump: false, jumpPressed: false };

  function syncInput() {
    input.left = keys.left || touch.left > 0;
    input.right = keys.right || touch.right > 0;
    input.jump = keys.jump || touch.jump > 0;
  }

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', KeyZ: 'jump'
  };

  window.addEventListener('keydown', function (e) {
    Sound.unlock();
    var k = KEYMAP[e.code];
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) togglePause();
      return;
    }
    if (!overlay.classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      if (!e.repeat && primaryAction) primaryAction();
      return;
    }
    if (k) {
      e.preventDefault();
      if (k === 'jump' && !keys.jump) input.jumpPressed = true;
      keys[k] = true;
      syncInput();
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) { e.preventDefault(); keys[k] = false; syncInput(); }
    if (e.code === 'Enter' || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('blur', function () {
    keys.left = keys.right = keys.jump = false;
    touch.left = touch.right = touch.jump = 0;
    syncInput();
  });

  // Экранные кнопки: pointer-события, каждый палец отдельно (мультитач)
  Array.prototype.forEach.call(document.querySelectorAll('.pad-btn'), function (btn) {
    var key = btn.getAttribute('data-key');
    var pointers = {};
    function count() { return Object.keys(pointers).length; }
    function refresh() {
      touch[key] = count();
      btn.classList.toggle('down', touch[key] > 0);
      syncInput();
    }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      Sound.unlock();
      if (key === 'jump' && count() === 0) input.jumpPressed = true;
      pointers[e.pointerId] = true;
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      refresh();
    });
    function up(e) { delete pointers[e.pointerId]; refresh(); }
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  document.addEventListener('pointerdown', function () { Sound.unlock(); });
  $('pad').addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });

  hud.sound.addEventListener('click', function () { Sound.unlock(); Sound.toggle(); hud.sound.blur(); });
  hud.pause.addEventListener('click', function () { togglePause(); hud.pause.blur(); });

  function updateSoundButton() {
    hud.sound.classList.toggle('off', !Sound.on);
    hud.sound.setAttribute('aria-label', Sound.on ? 'Звук включён' : 'Звук выключен');
  }

  // ================= Состояние игры =================
  var game = {
    mode: 'start',          // start | play | pause | respawn | dying | clear | over | win
    levelIndex: 0,
    score: 0, coins: 0, lives: START_LIVES,
    best: load('best', 0),
    timer: 0
  };
  var lvl = null;           // текущий уровень (сетка и настройки)
  var player = null;
  var enemies = [], coins = [], hearts = [], particles = [], bumps = [];
  var cam = { x: 0, y: 0 };
  var view = { w: 240, h: 208, scale: 2 };
  var time = 0;
  var primaryAction = null;
  var bannerTimer = 0;

  // ================= Уровень =================
  function isSolid(c) { return c === '#' || c === 'B' || c === 'C' || c === 'X' || c === '?' || c === 'H' || c === 'I' || c === 'U'; }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= lvl.w) return 'B';       // невидимые стены по краям
    if (ty < 0 || ty >= lvl.h) return '.';
    return lvl.grid[ty][tx];
  }
  function setTile(tx, ty, c) { lvl.grid[ty][tx] = c; }

  function buildLevel(index) {
    var def = LEVELS[index];
    var rows = def.map;
    var h = rows.length;
    var w = 0;
    rows.forEach(function (r) { w = Math.max(w, r.length); });

    lvl = { def: def, w: w, h: h, grid: [], flag: null, start: { x: 2 * T, y: (h - 3) * T } };
    enemies = []; coins = []; hearts = []; particles = []; bumps = [];

    for (var ty = 0; ty < h; ty++) {
      var line = [];
      for (var tx = 0; tx < w; tx++) {
        var c = rows[ty][tx] || '.';
        var x = tx * T, y = ty * T;
        switch (c) {
          case 'P': lvl.start = { x: x + (T - PW) / 2, y: y + T - PH }; c = '.'; break;
          case 'e':
          case 'j':
            enemies.push(makeEnemy(c, x + (T - EW) / 2, y + T - EH)); c = '.'; break;
          case 'o': coins.push({ x: x + 3, y: y + 2, w: 10, h: 12, phase: (tx * 0.37) % 1 }); c = '.'; break;
          case 'h': hearts.push({ x: x + 1, y: y + 2, w: 14, h: 12, vy: 0, onGround: true, still: true }); c = '.'; break;
          case 'F': lvl.flag = { tx: tx, ty: ty, x: x + 8 }; c = '.'; break;
          case '#': case 'B': case 'C': case 'X': case '?': case 'H': case '=': case '^': case 'I': break;
          default: c = '.';
        }
        line.push(c);
      }
      lvl.grid.push(line);
    }
  }

  function makeEnemy(type, x, y) {
    return {
      type: type, x: x, y: y, w: EW, h: EH, vx: 0, vy: 0, face: -1,
      onGround: false, state: 'walk', t: 0, active: false,
      jumpT: 0.5 + Math.random(), anim: Math.random() * 4
    };
  }

  function makePlayer() {
    return {
      x: lvl.start.x, y: lvl.start.y, w: PW, h: PH, vx: 0, vy: 0, face: 1,
      onGround: false, coyote: 0, buffer: 0, jumping: false,
      inv: 0, hurtT: 0, anim: 0, combo: 0, prevBottom: 0,
      safe: { x: lvl.start.x, y: lvl.start.y }, dead: false, onFlag: false
    };
  }

  // ================= Движение с коллизиями по сетке =================
  function moveBody(b, dt) {
    var res = { wall: 0, bumped: null };
    var tx, ty, i;

    // По горизонтали
    b.x += b.vx * dt;
    var ty0 = Math.floor(b.y / T), ty1 = Math.floor((b.y + b.h - 0.01) / T);
    if (b.vx > 0) {
      tx = Math.floor((b.x + b.w - 0.01) / T);
      for (ty = ty0; ty <= ty1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = tx * T - b.w; b.vx = 0; res.wall = 1; break; }
    } else if (b.vx < 0) {
      tx = Math.floor(b.x / T);
      for (ty = ty0; ty <= ty1; ty++) if (isSolid(tileAt(tx, ty))) { b.x = (tx + 1) * T; b.vx = 0; res.wall = -1; break; }
    }

    // По вертикали
    var prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    b.onGround = false;
    var tx0 = Math.floor(b.x / T), tx1 = Math.floor((b.x + b.w - 0.01) / T);
    if (b.vy > 0) {
      ty = Math.floor((b.y + b.h - 0.01) / T);
      for (tx = tx0; tx <= tx1; tx++) {
        var c = tileAt(tx, ty);
        if (isSolid(c) || (c === '=' && prevBottom <= ty * T + 0.5)) {
          b.y = ty * T - b.h; b.vy = 0; b.onGround = true; break;
        }
      }
    } else if (b.vy < 0) {
      ty = Math.floor(b.y / T);
      var hits = [];
      for (tx = tx0; tx <= tx1; tx++) if (isSolid(tileAt(tx, ty))) hits.push(tx);
      if (hits.length) {
        b.y = (ty + 1) * T; b.vy = 0;
        // ударили головой — выбираем блок ближе к центру тела
        var cx = Math.floor((b.x + b.w / 2) / T);
        var best = hits[0];
        for (i = 0; i < hits.length; i++) if (hits[i] === cx) best = cx;
        res.bumped = { tx: best, ty: ty };
      }
    }
    return res;
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ================= Игрок =================
  function updatePlayer(dt) {
    var p = player;
    p.anim += dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;

    if (p.dead) {                       // падение за экран после последней жизни
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
      p.y += p.vy * dt;
      return;
    }

    if (p.onFlag) {                     // скользим по флагштоку вниз
      var baseY = lvl.flag.ty * T + T - p.h;
      p.vx = 0;
      p.y = Math.min(baseY, p.y + 90 * dt);
      p.onGround = p.y >= baseY;
      return;
    }

    var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      p.vx += dir * (p.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
      if (p.vx > RUN_SPEED) p.vx = RUN_SPEED;
      if (p.vx < -RUN_SPEED) p.vx = -RUN_SPEED;
      p.face = dir;
    } else {
      var fr = (p.onGround ? FRICTION_GROUND : FRICTION_AIR) * dt;
      if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr;
    }

    // Прыжок: буфер нажатия + койот-тайм
    if (input.jumpPressed) { p.buffer = JUMP_BUFFER; input.jumpPressed = false; }
    else p.buffer -= dt;
    p.coyote = p.onGround ? COYOTE_TIME : p.coyote - dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -JUMP_SPEED; p.buffer = 0; p.coyote = 0; p.jumping = true; p.onGround = false;
      Sound.play('jump');
    }
    // Переменная высота: отпустил кнопку — подъём обрезается
    if (p.jumping && !input.jump && p.vy < -JUMP_CUT) p.vy = -JUMP_CUT;
    if (p.vy >= 0) p.jumping = false;

    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
    p.prevBottom = p.y + p.h;
    var res = moveBody(p, dt);
    if (res.bumped) hitBlock(res.bumped.tx, res.bumped.ty);

    if (p.onGround) {
      p.combo = 0;
      rememberSafeSpot(p);
    }

    // Шипы (опасна нижняя часть клетки)
    var hz = { x: p.x + 2, y: p.y + 4, w: p.w - 4, h: p.h - 4 };
    var a0 = Math.floor(hz.x / T), a1 = Math.floor((hz.x + hz.w) / T);
    var b0 = Math.floor(hz.y / T), b1 = Math.floor((hz.y + hz.h) / T);
    for (var ty = b0; ty <= b1; ty++) for (var tx = a0; tx <= a1; tx++) {
      if (tileAt(tx, ty) === '^' && overlap(hz, { x: tx * T + 2, y: ty * T + 7, w: 12, h: 9 })) {
        hurt(p.vx > 0 ? -1 : 1, true);
      }
    }

    // Яма
    if (p.y > lvl.h * T + 24) fellInPit();

    // Монетки и сердечки
    for (var i = coins.length - 1; i >= 0; i--) {
      if (overlap(p, coins[i])) { collectCoin(coins[i].x + 5, coins[i].y + 6); coins.splice(i, 1); }
    }
    for (i = hearts.length - 1; i >= 0; i--) {
      if (overlap(p, hearts[i])) { collectHeart(hearts[i]); hearts.splice(i, 1); }
    }

    // Флаг
    if (lvl.flag && p.x + p.w >= lvl.flag.x - 1 && game.mode === 'play') reachFlag();
  }

  function rememberSafeSpot(p) {
    var feetY = Math.floor((p.y + p.h + 1) / T);
    var l = tileAt(Math.floor(p.x / T), feetY), r = tileAt(Math.floor((p.x + p.w - 1) / T), feetY);
    var ok = (isSolid(l) || l === '=') && (isSolid(r) || r === '=');
    var row = Math.floor((p.y + p.h - 1) / T);
    for (var tx = Math.floor(p.x / T) - 1; tx <= Math.floor((p.x + p.w) / T) + 1; tx++) {
      if (tileAt(tx, row) === '^') ok = false;
    }
    if (ok) { p.safe.x = p.x; p.safe.y = p.y; }
  }

  function hurt(fromDir, spikes) {
    var p = player;
    if (p.inv > 0 || p.dead || game.mode !== 'play') return;
    game.lives--;
    updateHud();
    if (game.lives <= 0) { die(); return; }
    Sound.play('hurt');
    p.inv = 1.6;
    p.hurtT = 0.35;
    p.vy = spikes ? -260 : -200;
    p.vx = fromDir * 120;
    p.jumping = false;
    shake(3);
  }

  function fellInPit() {
    if (game.mode !== 'play') return;
    game.lives--;
    updateHud();
    if (game.lives <= 0) { die(); return; }
    Sound.play('fall');
    game.mode = 'respawn';
    game.timer = 0.9;
  }

  function die() {
    var p = player;
    p.dead = true;
    p.hurtT = 99;
    p.vy = -260;
    p.vx = 0;
    game.mode = 'dying';
    game.timer = 1.4;
    Sound.play('over');
  }

  function collectCoin(x, y) {
    game.coins++;
    addScore(10, x, y - 6, false);
    spark(x, y);
    Sound.play('coin');
  }

  function collectHeart(h) {
    if (game.lives < MAX_LIVES) {
      game.lives++;
      popText('+♥', h.x + 7, h.y - 4, '#ff6b6b');
    } else {
      addScore(500, h.x + 7, h.y - 4, true);
    }
    spark(h.x + 7, h.y + 6);
    Sound.play('life');
    updateHud();
  }

  function addScore(n, x, y, show) {
    game.score += n;
    if (show !== false) popText('+' + n, x, y, '#fff6c8');
    updateHud();
  }

  // ================= Блоки =================
  function hitBlock(tx, ty) {
    var c = tileAt(tx, ty);
    var x = tx * T, y = ty * T;
    if (c === '?' || c === 'H') {
      setTile(tx, ty, 'U');
      bumps.push({ tx: tx, ty: ty, t: 0 });
      if (c === '?') {
        game.coins++;
        addScore(10, x + 8, y - 20, false);
        particles.push({ kind: 'coin', x: x + 3, y: y - 14, vy: -150, t: 0, life: 0.45 });
        Sound.play('coin');
      } else {
        hearts.push({ x: x + 1, y: y - 12, w: 14, h: 12, vy: -140, vx: 0, onGround: false, still: false });
        Sound.play('life');
      }
    } else if (c === 'C') {
      setTile(tx, ty, '.');
      addScore(20, x + 8, y - 4, false);
      for (var i = 0; i < 4; i++) {
        particles.push({
          kind: 'brick', x: x + (i % 2) * 8, y: y + Math.floor(i / 2) * 8,
          vx: (i % 2 ? 1 : -1) * (40 + Math.random() * 30), vy: -180 - (i < 2 ? 60 : 0),
          sx: (i % 2) * 8, sy: Math.floor(i / 2) * 8, t: 0, life: 1.2
        });
      }
      Sound.play('break');
      shake(2);
    } else {
      if (c === 'U' || c === 'X' || c === 'B') bumps.push({ tx: tx, ty: ty, t: 0 });
      Sound.play('bump');
    }

    // Враги, стоящие на блоке, получают снизу
    enemies.forEach(function (e) {
      if (e.state === 'walk' && Math.abs(e.y + e.h - y) < 2 && e.x + e.w > x && e.x < x + T) squash(e, true);
    });
    // Монетка над блоком подпрыгивает к игроку
    for (var k = coins.length - 1; k >= 0; k--) {
      var cn = coins[k];
      if (cn.x + cn.w > x && cn.x < x + T && cn.y + cn.h >= y - T && cn.y < y) {
        collectCoin(cn.x + 5, cn.y + 6); coins.splice(k, 1);
      }
    }
  }

  // ================= Враги =================
  function updateEnemies(dt) {
    var speed = lvl.def.enemySpeed || 30;
    var p = player;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.state === 'squashed') {
        e.t -= dt;
        if (e.t <= 0) enemies.splice(i, 1);
        continue;
      }
      // просыпаются, когда попадают в кадр
      if (!e.active) {
        if (e.x < cam.x + view.w + 24) e.active = true; else continue;
      }
      e.anim += dt;
      e.vx = e.face * speed;
      e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
      var res = moveBody(e, dt);
      if (res.wall) e.face = -res.wall;

      if (e.onGround) {
        // разворот у края платформы и перед шипами
        var fx = e.face > 0 ? e.x + e.w + 1 : e.x - 1;
        var ftx = Math.floor(fx / T);
        var below = tileAt(ftx, Math.floor((e.y + e.h + 1) / T));
        var ahead = tileAt(ftx, Math.floor((e.y + e.h - 1) / T));
        if ((!isSolid(below) && below !== '=') || ahead === '^') e.face = -e.face;

        if (e.type === 'j') {
          e.jumpT -= dt;
          if (e.jumpT <= 0) {
            e.vy = -270;
            var je = lvl.def.jumpEvery || 2;
            e.jumpT = je * (0.75 + Math.random() * 0.5);
          }
        }
      }
      if (e.y > lvl.h * T + 40) { enemies.splice(i, 1); continue; }

      // Столкновение с грибком
      if (!p.dead && !p.onFlag && game.mode === 'play') {
        var box = { x: e.x + 2, y: e.y + 2, w: e.w - 4, h: e.h - 2 };
        if (overlap(p, box)) {
          var stomp = p.vy > 0 && p.prevBottom <= e.y + 10;
          if (stomp) {
            squash(e, false);
            p.vy = -(input.jump ? STOMP_BOUNCE_HELD : STOMP_BOUNCE);
            p.jumping = false;
            p.y = e.y - p.h;
          } else {
            hurt(p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1, false);
          }
        }
      }
    }
  }

  function squash(e, fromBelow) {
    e.state = 'squashed';
    e.t = 0.8;
    e.vx = 0;
    var p = player;
    var pts = fromBelow ? 100 : 100 * Math.pow(2, Math.min(p.combo, 3));
    if (!fromBelow) p.combo++;
    addScore(pts, e.x + e.w / 2, e.y + 6, true);
    spark(e.x + e.w / 2, e.y + e.h - 8);
    Sound.play('stomp');
    shake(2);
  }

  // ================= Сердечки (физика), эффекты =================
  function updateItems(dt) {
    hearts.forEach(function (h) {
      if (h.still) return;
      h.vy = Math.min((h.vy || 0) + GRAVITY * dt, MAX_FALL);
      h.vx = 0;
      moveBody(h, dt);
      if (h.onGround) h.still = true;
    });
    for (var i = hearts.length - 1; i >= 0; i--) if (hearts[i].y > lvl.h * T + 40) hearts.splice(i, 1);

    for (i = particles.length - 1; i >= 0; i--) {
      var q = particles[i];
      q.t += dt;
      if (q.kind === 'brick') { q.vy += GRAVITY * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      else if (q.kind === 'coin') { q.vy += 600 * dt; q.y += q.vy * dt; }
      else if (q.kind === 'text') { q.y -= 22 * dt; }
      if (q.t >= q.life) particles.splice(i, 1);
    }
    for (i = bumps.length - 1; i >= 0; i--) { bumps[i].t += dt; if (bumps[i].t > 0.16) bumps.splice(i, 1); }
  }

  function spark(x, y) { particles.push({ kind: 'spark', x: x - 8, y: y - 8, t: 0, life: 0.32 }); }
  function popText(text, x, y, color) { particles.push({ kind: 'text', text: text, x: x, y: y, color: color, t: 0, life: 0.8 }); }

  var shakeT = 0, shakeAmp = 0;
  function shake(a) { shakeT = 0.15; shakeAmp = a; }

  // ================= Флаг и переходы =================
  function reachFlag() {
    var p = player;
    var base = lvl.flag.ty * T + T;
    var height = Math.max(0, Math.floor((base - (p.y + p.h)) / T));
    p.onFlag = true;
    p.vx = 0; p.vy = 0;
    p.x = lvl.flag.x - p.w + 3;
    p.face = 1;
    game.mode = 'clear';
    game.timer = 2.2;
    addScore(300 + height * 100, p.x + p.w / 2, p.y - 8, true);
    Sound.play('flag');
  }

  function startLevel(index) {
    game.levelIndex = index;
    buildLevel(index);
    player = makePlayer();
    input.jumpPressed = false;
    snapCamera();
    game.mode = 'play';
    hideOverlay();
    showBanner('Уровень ' + (index + 1) + '\n' + lvl.def.name, 1.6);
    updateHud();
  }

  function newGame() {
    game.score = 0; game.coins = 0; game.lives = START_LIVES;
    startLevel(0);
  }

  function finishRun(won) {
    var record = game.score > game.best;
    if (record) { game.best = game.score; save('best', game.best); }
    var text = 'Счёт: ' + game.score + '\nМонетки: ' + game.coins + '\nРекорд: ' + game.best + (record && game.score > 0 ? '\nНОВЫЙ РЕКОРД!' : '');
    if (won) {
      game.mode = 'win';
      Sound.play('win');
      showOverlay('МЕСТЬ СВЕРШИЛАСЬ!', 'Все герои раздавлены, грибная поляна свободна.\n\n' + text,
        [{ label: 'Играть снова', action: newGame }]);
    } else {
      game.mode = 'over';
      showOverlay('ГЕРОИ ПОБЕДИЛИ…', 'Грибок пал, но споры остались.\n\n' + text,
        [{ label: 'Ещё раз', action: newGame }]);
    }
  }

  function togglePause() {
    if (game.mode === 'play' || game.mode === 'respawn' || game.mode === 'clear' || game.mode === 'dying') {
      game.pausedFrom = game.mode;
      game.mode = 'pause';
      showOverlay('ПАУЗА', 'Уровень ' + (game.levelIndex + 1) + ': ' + lvl.def.name + '\nСчёт: ' + game.score,
        [{ label: 'Продолжить', action: resume },
         { label: 'Начать заново', action: newGame, secondary: true }]);
    } else if (game.mode === 'pause') {
      resume();
    }
  }
  function resume() {
    if (game.mode !== 'pause') return;
    game.mode = game.pausedFrom || 'play';
    hideOverlay();
    keys.left = keys.right = keys.jump = false; syncInput();
    input.jumpPressed = false;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && game.mode !== 'pause' && (game.mode === 'play' || game.mode === 'respawn' || game.mode === 'clear')) togglePause();
  });

  // ================= Главный цикл =================
  function update(dt) {
    time += dt;
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) banner.classList.add('hidden'); }
    if (shakeT > 0) shakeT -= dt;

    switch (game.mode) {
      case 'play':
        updatePlayer(dt);
        updateEnemies(dt);
        updateItems(dt);
        break;
      case 'clear':
        updatePlayer(dt);
        updateItems(dt);
        game.timer -= dt;
        if (game.timer <= 0) {
          if (game.levelIndex + 1 < LEVELS.length) startLevel(game.levelIndex + 1);
          else finishRun(true);
        }
        break;
      case 'respawn':
        updateItems(dt);
        game.timer -= dt;
        if (game.timer <= 0) {
          player.x = player.safe.x; player.y = player.safe.y;
          player.vx = 0; player.vy = 0; player.inv = 2; player.hurtT = 0;
          // если на точке возрождения стоит герой — отодвигаем его
          enemies.forEach(function (e) {
            if (e.state === 'walk' && Math.abs(e.x - player.x) < 40) e.x += e.x < player.x ? -40 : 40;
          });
          game.mode = 'play';
        }
        break;
      case 'dying':
        updatePlayer(dt);
        updateItems(dt);
        game.timer -= dt;
        if (game.timer <= 0) finishRun(false);
        break;
    }
    if (game.mode !== 'start') updateCamera(dt);
  }

  function updateCamera(dt) {
    if (!player) return;
    var p = player;
    var lw = lvl.w * T, lh = lvl.h * T;
    var tx = p.x + p.w / 2 - view.w / 2 + p.face * 18;
    cam.x += (tx - cam.x) * Math.min(1, dt * 5);
    cam.x = lw <= view.w ? (lw - view.w) / 2 : Math.max(0, Math.min(lw - view.w, cam.x));
    if (lh <= view.h) {
      cam.y = lh - view.h;                         // уровень ниже экрана — небо сверху
    } else if (!p.dead && game.mode !== 'respawn') {
      var ty = p.y + p.h / 2 - view.h * 0.55;
      cam.y += (ty - cam.y) * Math.min(1, dt * 5);
      cam.y = Math.max(0, Math.min(lh - view.h, cam.y));
    }
  }

  function snapCamera() {
    var p = player, lw = lvl.w * T, lh = lvl.h * T;
    cam.x = lw <= view.w ? (lw - view.w) / 2 : Math.max(0, Math.min(lw - view.w, p.x + p.w / 2 - view.w / 2 + 18));
    cam.y = lh <= view.h ? lh - view.h : Math.max(0, Math.min(lh - view.h, p.y + p.h / 2 - view.h * 0.55));
  }

  // ================= Отрисовка =================
  var TILE_INDEX = { 'B': 2, 'C': 3, 'X': 4, '?': 5, 'H': 5, 'U': 6, '=': 7, '^': 8 };

  function tileIndex(c, tx, ty) {
    if (c === '#') return lvl.def.grass && tileAt(tx, ty - 1) !== '#' ? 0 : 1;
    if (c === 'I') return tileAt(tx, ty - 1) === 'I' ? 10 : 9;
    return TILE_INDEX[c];
  }

  function render() {
    var vw = view.w, vh = view.h;
    if (!lvl) { ctx.fillStyle = '#120c14'; ctx.fillRect(0, 0, vw, vh); return; }
    var sx = 0, sy = 0;
    if (shakeT > 0) { sx = Math.round((Math.random() * 2 - 1) * shakeAmp); sy = Math.round((Math.random() * 2 - 1) * shakeAmp); }
    var cx = Math.round(cam.x) + sx, cy = Math.round(cam.y) + sy;

    // Небо и фон с параллаксом
    var bgName = lvl.def.bg === 'cave' ? 'cave' : 'meadow';
    ctx.fillStyle = SKY[bgName];
    ctx.fillRect(0, 0, vw, vh);
    var bg = IMG['bg_' + bgName];
    if (ready(bg)) {
      var bgY = lvl.h * T - bg.height - cy;      // низ фона совпадает с низом уровня
      var off = -(Math.floor(cx * 0.35) % bg.width);
      for (var bx = off; bx < vw; bx += bg.width) ctx.drawImage(bg, bx, bgY);
      if (bgY + bg.height < vh) { ctx.fillStyle = '#0d0a0e'; ctx.fillRect(0, bgY + bg.height, vw, vh - bgY - bg.height); }
    }
    if (lvl.def.tint) { ctx.fillStyle = 'rgba(8,4,12,' + lvl.def.tint + ')'; ctx.fillRect(0, 0, vw, vh); }

    // Клетки
    var tiles = IMG.tiles;
    var tx0 = Math.floor(cx / T), tx1 = Math.floor((cx + vw) / T);
    var ty0 = Math.max(0, Math.floor(cy / T)), ty1 = Math.min(lvl.h - 1, Math.floor((cy + vh) / T));
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || tx >= lvl.w) continue;
        var c = lvl.grid[ty][tx];
        if (c === '.') continue;
        var idx = tileIndex(c, tx, ty);
        if (idx === undefined) continue;
        var dy = bumpOffset(tx, ty);
        var glow = (c === '?' || c === 'H');
        ctx.drawImage(tiles, idx * T, 0, T, T, tx * T - cx, ty * T - cy + dy, T, T);
        if (glow && Math.floor(time * 3) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,240,170,0.18)';
          ctx.fillRect(tx * T - cx, ty * T - cy + dy, T, T);
        }
      }
    }

    // Флаг
    if (lvl.flag) {
      var f = lvl.flag, fx = f.tx * T - cx;
      ctx.drawImage(tiles, 13 * T, 0, T, T, fx, f.ty * T - cy, T, T);
      for (var k = 1; k <= FLAG_POLE; k++) ctx.drawImage(tiles, 12 * T, 0, T, T, fx, (f.ty - k) * T - cy, T, T);
      var flagY = (f.ty - FLAG_POLE - 1) * T - cy;
      if (player && player.onFlag) flagY = Math.min(flagY + (2.2 - game.timer) * 70, (f.ty - 1) * T - cy);
      ctx.drawImage(tiles, 11 * T, 0, T, T, fx, Math.round(flagY), T, T);
    }

    // Монетки и сердечки
    var items = IMG.items;
    coins.forEach(function (cn) {
      var fr = Math.floor(time * 8 + cn.phase * 4) % 4;
      ctx.drawImage(items, fr * 16, 0, 16, 16, Math.round(cn.x - 3 - cx), Math.round(cn.y - 2 - cy), 16, 16);
    });
    hearts.forEach(function (h) {
      var bob = h.still ? Math.round(Math.sin(time * 4) * 1) : 0;
      ctx.drawImage(items, 4 * 16, 0, 16, 16, Math.round(h.x - 1 - cx), Math.round(h.y - 3 - cy + bob), 16, 16);
    });

    // Враги
    enemies.forEach(function (e) {
      var fr, oy = E_OY;
      if (e.state === 'squashed') { fr = 5; oy = E_OY + 3; }
      else if (!e.onGround) fr = 4;
      else fr = Math.floor(e.anim * 8) % 4;
      drawSprite(IMG.enemy, fr, 32, 48, e.x + E_OX - cx, e.y + oy - cy, e.face < 0);
    });

    // Грибок
    if (player && game.mode !== 'respawn') {
      var p = player;
      var blink = p.inv > 0 && !p.dead && Math.floor(p.inv * 12) % 2 === 0;
      if (!blink) {
        var pf;
        if (p.hurtT > 0) pf = 7;
        else if (!p.onGround) pf = 6;
        else if (Math.abs(p.vx) > 8) pf = 2 + Math.floor(p.anim * 10) % 4;
        else pf = Math.floor(p.anim * 2) % 2;
        drawSprite(IMG.player, pf, 32, 32, p.x + P_OX - cx, p.y + P_OY - cy, p.face < 0);
      }
    }

    // Частицы
    particles.forEach(function (q) {
      var x = Math.round(q.x - cx), y = Math.round(q.y - cy);
      if (q.kind === 'brick') {
        ctx.drawImage(tiles, 3 * T + q.sx, q.sy, 8, 8, x, y, 8, 8);
      } else if (q.kind === 'coin') {
        ctx.drawImage(items, (Math.floor(q.t * 16) % 4) * 16, 0, 16, 16, x - 3, y, 16, 16);
      } else if (q.kind === 'spark') {
        var sf = 5 + Math.min(3, Math.floor(q.t / q.life * 4));
        ctx.drawImage(items, sf * 16, 0, 16, 16, x, y, 16, 16);
      } else if (q.kind === 'text') {
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(q.text, x + 1, y + 1);
        ctx.fillStyle = q.color;
        ctx.fillText(q.text, x, y);
      }
    });
  }

  function bumpOffset(tx, ty) {
    for (var i = 0; i < bumps.length; i++) {
      if (bumps[i].tx === tx && bumps[i].ty === ty) return -Math.round(Math.sin(bumps[i].t / 0.16 * Math.PI) * 4);
    }
    return 0;
  }

  function drawSprite(img, frame, fw, fh, x, y, flip) {
    if (!ready(img)) return;
    x = Math.round(x); y = Math.round(y);
    if (flip) {
      ctx.save();
      ctx.translate(x + fw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, fw, fh);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame * fw, 0, fw, fh, x, y, fw, fh);
    }
  }

  // ================= HUD и экраны =================
  var hudCache = {};
  function setText(el, key, value) {
    if (hudCache[key] !== value) { hudCache[key] = value; el.textContent = value; }
  }
  function updateHud() {
    setText(hud.lives, 'l', '♥' + game.lives);
    setText(hud.coins, 'c', '◎' + game.coins);
    setText(hud.score, 's', String(game.score).padStart(6, '0'));
    setText(hud.level, 'v', lvl ? (game.levelIndex + 1) + '-' + lvl.def.name : '');
  }

  function showOverlay(title, text, buttons) {
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovButtons.innerHTML = '';
    buttons.forEach(function (b, i) {
      var el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.secondary) el.className = 'secondary';
      el.addEventListener('click', function () { Sound.unlock(); el.blur(); b.action(); });
      ovButtons.appendChild(el);
      if (i === 0) primaryAction = b.action;
    });
    overlay.classList.remove('hidden');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function hideOverlay() { overlay.classList.add('hidden'); primaryAction = null; }

  function showBanner(text, seconds) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    bannerTimer = seconds;
  }

  function showStart() {
    game.mode = 'start';
    var controls = isTouch
      ? '◀ ▶ — бег\nПРЫЖОК — прыжок (держи дольше — выше)'
      : '← → или A D — бег\nПробел, W или ↑ — прыжок\n(держи дольше — выше)\nP или Esc — пауза';
    showOverlay('МЕСТЬ ГРИБОВ',
      'Герои годами прыгали грибам на головы.\nТеперь твоя очередь: прыгай на героев сверху!\n\n' +
      controls + '\n\nРекорд: ' + game.best,
      [{ label: 'Играть', action: newGame }]);
  }

  // ================= Размер экрана: целый масштаб пикселей =================
  function resize() {
    var aw = Math.max(1, stageEl.clientWidth), ah = Math.max(1, stageEl.clientHeight);
    var scale = Math.max(1, Math.min(4, Math.floor(ah / 160), Math.floor(aw / 176)));
    var vw = Math.min(480, Math.floor(aw / scale));
    var vh = Math.min(240, Math.floor(ah / scale));
    view.w = vw; view.h = vh; view.scale = scale;
    canvas.width = vw; canvas.height = vh;
    screenEl.style.width = (vw * scale) + 'px';
    screenEl.style.height = (vh * scale) + 'px';
    ctx.imageSmoothingEnabled = false;
    if (player) snapCamera();
    render();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 150); });

  // ================= Запуск =================
  var last = 0, acc = 0;
  function frame(now) {
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (game.mode !== 'pause' && game.mode !== 'start' && game.mode !== 'over' && game.mode !== 'win') {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    } else {
      acc = 0;
      if (bannerTimer > 0 && game.mode !== 'pause') { bannerTimer -= dt; if (bannerTimer <= 0) banner.classList.add('hidden'); }
    }
    render();
    requestAnimationFrame(frame);
  }

  // Отладочный доступ из консоли (для проверки уровней): window.mushroomDebug
  window.mushroomDebug = {
    get state() { return { mode: game.mode, level: game.levelIndex, lives: game.lives, score: game.score, coins: game.coins, player: player, enemies: enemies.length, view: view }; },
    goto: function (tx) { if (player) { player.x = tx * T; player.y = 0; player.vy = 0; } },
    level: function (i) { startLevel(i); },
    step: function (seconds) {           // прокрутить игру вперёд без экрана (для автотестов)
      for (var n = Math.round(seconds / STEP); n > 0; n--) update(STEP);
      render();
    },
    input: input,
    enemies: function () { return enemies; },
    lives: function (n) { game.lives = n; updateHud(); }
  };

  updateSoundButton();
  loadImages(function () {
    buildLevel(0);
    player = makePlayer();
    resize();
    snapCamera();
    updateHud();
    showStart();
    requestAnimationFrame(frame);
  });
  resize();
})();
