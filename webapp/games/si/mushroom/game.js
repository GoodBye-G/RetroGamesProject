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
  var MEGA_TIME = 7;             // сколько секунд длится «Мега Альфа»
  var MEGA_SPEED = 112;          // бег в режиме «Мега Альфа»
  var ITEM_ROLL = 42;            // скорость катящихся сердечек и сфер
  var START_LIVES = 3;

  // Хитбоксы и смещения спрайтов (по реальным границам картинок)
  var PW = 18, PH = 24, P_OX = -7, P_OY = -7;      // грибок 32×32
  var EW = 16, EH = 34, E_OX = -8, E_OY = -8;      // герой 32×48
  var MEGA_K = 3;                                  // «Мега Альфа» — спрайт грибка ×3 (96×96)
  var MW = 50, MH = 72;                            // её хитбокс
  var FLAG_POLE = 6;                               // высота шеста флага, клеток

  var SKY = { meadow: '#1e3a5f', cave: '#1a1016' };

  // Фоновая музыка: файл assets/music.mp3 (необязательный), играет по кругу во время игры
  var MUSIC_FILE = 'assets/music.mp3';
  var MUSIC_VOLUME = 45;     // громкость музыки по умолчанию, 0–100 (игрок меняет ползунком)
  var SFX_VOLUME = 100;      // громкость звуков по умолчанию, 0–100
  var SFX_MAX_GAIN = 0.3;    // насколько громко звучат эффекты при ползунке на 100

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

  // ================= Звуковые эффекты (Web Audio, всё синтезируется) =================
  var Sound = {
    ctx: null, master: null,
    volMusic: load('volMusic', MUSIC_VOLUME), volSfx: load('volSfx', SFX_VOLUME),

    unlock: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { this.ctx = new AC(); } catch (e) { return; }
        this.master = this.ctx.createGain();
        this.master.gain.value = SFX_MAX_GAIN * this.volSfx / 100;
        try {
          var comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
          this.master.connect(comp); comp.connect(this.ctx.destination);
        } catch (e) { this.master.connect(this.ctx.destination); }
      }
      if (this.ctx.state === 'suspended') {
        var p = this.ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    },

    usable: function () { return this.volSfx > 0 && this.ctx && this.ctx.state === 'running'; },

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
          case 'secret': this.notes('triangle', [784, 740, 622, 440, 415, 659, 831, 1047], 0.07, 0.35); break;
          case 'stomp': this.stomp(); break;
          case 'orb': this.tone('triangle', 300, 900, 0.25, 0.35); this.tone('square', 600, 1200, 0.2, 0.12, 0.08); break;
          case 'roar':
            this.tone('sawtooth', 140, 45, 0.7, 0.45); this.tone('square', 90, 40, 0.6, 0.3, 0.05);
            this.noise(0.5, 0.5, 0, 600); this.notes('square', [262, 330, 392, 523], 0.06, 0.15); break;
          case 'shrink': this.tone('square', 600, 150, 0.4, 0.3); this.tone('triangle', 400, 100, 0.4, 0.25, 0.1); break;
          case 'smash': this.noise(0.15, 0.7, 0, 1200); this.tone('square', 200, 50, 0.2, 0.4); break;
          // --- кошмар ---
          case 'scratch': this.tone('sawtooth', 900, 80, 0.35, 0.4); this.noise(0.3, 0.5, 0, 3000); break;
          case 'static': this.noise(0.6, 0.45, 0, 6000); this.noise(0.4, 0.3, 0.3, 4000); break;
          case 'scream':
            this.tone('sawtooth', 1100, 260, 1.0, 0.35); this.tone('square', 760, 190, 1.0, 0.2, 0.03);
            this.tone('sawtooth', 1480, 330, 0.9, 0.15, 0.06); this.noise(1.0, 0.6, 0, 5000); break;
          case 'suck':
            this.tone('sine', 80, 900, 1.2, 0.45); this.tone('sawtooth', 60, 300, 1.2, 0.15);
            this.noise(1.2, 0.35, 0, 1500); break;
          case 'heart': this.tone('sine', 70, 40, 0.12, 0.8); this.tone('sine', 62, 38, 0.12, 0.6, 0.16); break;
          case 'gulp': this.tone('square', 300, 60, 0.12, 0.25); break;
        }
      } catch (e) { /* звук не критичен */ }
    },

    stomp: function () {
      // «Бдыщ» со сплющиванием
      this.noise(0.12, 0.6, 0, 900);
      this.tone('square', 420, 70, 0.18, 0.35);
      this.tone('square', 880, 880, 0.05, 0.15, 0.12);
    },

    // Громкость из ползунков, 0–100
    setVolume: function (kind, value) {
      value = Math.max(0, Math.min(100, Math.round(value)));
      if (kind === 'music') {
        this.volMusic = value; save('volMusic', value);
        Music.applyVolume();
        if (value > 0 && isPlaying()) Music.play(); else if (value === 0) Music.pause();
      } else {
        this.volSfx = value; save('volSfx', value);
        if (this.master) this.master.gain.value = SFX_MAX_GAIN * value / 100;
      }
      updateSoundButton();
    }
  };

  // ================= Фоновая музыка =================
  // Обычный <audio>: его проще ставить на паузу и продолжать. Нет файла — тихо играем без музыки.
  var Music = {
    el: null, broken: false,
    init: function () {
      if (this.el || this.broken) return;
      try {
        var a = new Audio();
        a.loop = true;
        a.preload = 'auto';
        a.volume = Sound.volMusic / 100;
        var self = this;
        a.addEventListener('error', function () { self.broken = true; });
        a.src = MUSIC_FILE;
        this.el = a;
      } catch (e) { this.broken = true; }
    },
    play: function () {
      if (Horror.on && Horror.trackDone) { Horror.synthOn = true; return; }   // кошмар: трек уже отыграл — дальше страшная музыка
      this.init();
      if (!this.el || this.broken || Sound.volMusic <= 0) return;
      var p = this.el.play();
      if (p && p.catch) p.catch(function () { /* браузер ещё не разрешил звук */ });
    },
    pause: function () { if (this.el) this.el.pause(); },
    applyVolume: function () { if (this.el) this.el.volume = Sound.volMusic / 100; },
    restart: function () { this.init(); if (this.el) { try { this.el.currentTime = 0; } catch (e) {} } this.play(); }
  };

  function isPlaying() {
    return game.mode === 'play' || game.mode === 'respawn' || game.mode === 'clear' || game.mode === 'dying';
  }

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

  // Кнопка ♪ открывает панель громкости с двумя ползунками
  var volPanel = $('volume'), volMusic = $('vol-music'), volSfx = $('vol-sfx');
  volMusic.value = Sound.volMusic;
  volSfx.value = Sound.volSfx;
  function showVolume(open) {
    volPanel.classList.toggle('hidden', !open);
    hud.sound.classList.toggle('active', open);
  }
  hud.sound.addEventListener('click', function (e) {
    e.stopPropagation();
    Sound.unlock();
    showVolume(volPanel.classList.contains('hidden'));
    hud.sound.blur();
  });
  volMusic.addEventListener('input', function () { Sound.setVolume('music', +volMusic.value); });
  volSfx.addEventListener('input', function () { Sound.setVolume('sfx', +volSfx.value); });
  volSfx.addEventListener('change', function () { Sound.play('coin'); volSfx.blur(); });   // послушать громкость
  volMusic.addEventListener('change', function () { volMusic.blur(); });
  volPanel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  hud.sound.addEventListener('pointerdown', function (e) { e.stopPropagation(); Sound.unlock(); });
  document.addEventListener('pointerdown', function () { showVolume(false); });
  hud.pause.addEventListener('click', function () { togglePause(); hud.pause.blur(); });

  function updateSoundButton() {
    var silent = Sound.volMusic === 0 && Sound.volSfx === 0;
    hud.sound.classList.toggle('off', silent);
    hud.sound.setAttribute('aria-label', 'Громкость');
  }

  // ================= Состояние игры =================
  var game = {
    mode: 'start',          // start | play | pause | respawn | dying | clear | over | win
    levelIndex: 0,
    score: 0, coins: 0, lives: START_LIVES, secrets: 0,
    cheats: { god: false, alpha: false, moon: false, turbo: false, xray: false },
    cheated: false,           // в этом забеге вводили читы — рекорд не сохраняем
    best: load('best', 0),
    timer: 0
  };
  var lvl = null;           // текущий уровень (сетка и настройки)
  var player = null;
  var enemies = [], coins = [], hearts = [], orbs = [], particles = [], bumps = [];
  var cam = { x: 0, y: 0 };
  var view = { w: 240, h: 208, scale: 2 };
  var time = 0;
  var primaryAction = null;
  var bannerTimer = 0;

  // ================= Уровень =================
  function isSolid(c) { return c === '#' || c === 'v' || c === 'B' || c === 'C' || c === 'X' || c === '?' || c === 'H' || c === 'M' || c === 'I' || c === 'U'; }

  function tileAt(tx, ty) {
    if (tx < 0 || tx >= lvl.w) return 'B';       // невидимые стены по краям
    if (ty < 0 || ty >= lvl.h) return '.';
    return lvl.grid[ty][tx];
  }
  function setTile(tx, ty, c) { lvl.grid[ty][tx] = c; }

  function buildLevel(def) {
    var rows = def.map;
    var h = rows.length;
    var w = 0;
    rows.forEach(function (r) { w = Math.max(w, r.length); });

    lvl = { def: def, w: w, h: h, grid: [], flag: null, secrets: [], checkpointX: null, decor: [], crumble: {},
      sections: [], lateEnemies: [], quietX: null, crashX: null, fakeFlag: null,
      grabs: [], towerChecks: [], arena: null, castle: null, rapper: null, speakers: [], start: { x: 2 * T, y: (h - 3) * T } };
    enemies = []; coins = []; hearts = []; orbs = []; particles = []; bumps = [];

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
          case 'm': orbs.push({ x: x + 4, y: y + 4, w: 8, h: 8, vx: 0, vy: 0, dir: 0, onGround: true, still: true }); c = '.'; break;
          case 'F': lvl.flag = { tx: tx, ty: ty, x: x + 8 }; c = '.'; break;
          case '$': lvl.secrets.push({ x: x, y: y, w: T, h: T }); c = '.'; break;   // невидимый тайник
          case 'K': if (lvl.checkpointX === null) lvl.checkpointX = x; c = '.'; break;  // секретный чекпоинт кошмара
          case 'S': lvl.sections.push(x); c = '.'; break;                                  // начало секции погони
          case 'J': lvl.lateEnemies.push({ x: x + (T - EW) / 2, y: y + T - EH }); c = '.'; break;  // герой внутри погони
          case 'Q': lvl.quietX = x; c = '.'; break;                                        // «пустая» пауза
          case 'Z': lvl.crashX = x; c = '.'; break;                                        // фальшивый вылет
          case 'f': lvl.fakeFlag = { tx: tx, ty: ty, x: x + 8 }; c = '.'; break;           // ложный флаг
          case 'G': lvl.grabs.push({ x: x + 8, y: y + T, done: false }); c = '.'; break;   // рука из земли
          case 'T': lvl.towerChecks.push({ x: x, y: y + T - PH, done: false }); c = '.'; break;  // чекпоинт башни
          case 'W': lvl.arena = { x: x + 8, y: y + T }; c = '.'; break;                    // центр арены луны
          case 'Y': lvl.castle = { x: x + 8, y: y + T }; c = '.'; break;                   // дверь замка за флагом
          case 'R': lvl.rapper = { x: x + 8, y: y + T }; c = '.'; break;                   // рэпер-скелет
          case 'O': lvl.speakers.push({ x: x + 8, y: y + T }); c = '.'; break;             // колонки
          case 'u': case 'b': case 'n': case 'c': case 'q': case 'p': case 'z':
            lvl.decor.push({ type: c, x: x, y: y, seed: (tx * 7 + ty * 13) % 10 }); c = '.'; break;
          case 't': case 'w': case 'k':
            lvl.decor.push({ type: c, x: x, y: y, seed: (tx * 7 + ty * 13) % 10 }); c = '.'; break;   // факел, окно, цепь
          // декор кошмара — проявляется только после превращения
          case 'd': case 'D': case 'x': case 'y':
            lvl.decor.push({ type: c, x: x, y: y, seed: (tx * 7 + ty * 13) % 10 }); c = '.'; break;
          case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
            lvl.decor.push({ type: 'text', x: x, y: y, text: (def.graffiti || {})[c] || '' }); c = '.'; break;
          case '#': case 'B': case 'C': case 'X': case '?': case 'H': case '=': case '^': case 'I': case '!': case 'M': case 'v': break;
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
      isPlayer: true,
      x: lvl.start.x, y: lvl.start.y, w: PW, h: PH, vx: 0, vy: 0, face: 1,
      onGround: false, coyote: 0, buffer: 0, jumping: false,
      inv: 0, hurtT: 0, anim: 0, combo: 0, prevBottom: 0,
      safe: { x: lvl.start.x + PW / 2, y: lvl.start.y + PH }, dead: false, onFlag: false,
      mega: 0, growT: 0
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
      for (tx = tx0; tx <= tx1; tx++) {
        var up = tileAt(tx, ty);
        // «!» — невидимый блок: твёрдый только для головы грибка снизу
        if (isSolid(up) || (up === '!' && b.isPlayer)) hits.push(tx);
      }
      if (hits.length) {
        b.y = (ty + 1) * T; b.vy = 0;
        // ударили головой — выбираем блок ближе к центру тела
        var cx = Math.floor((b.x + b.w / 2) / T);
        var best = hits[0];
        for (i = 0; i < hits.length; i++) if (tileAt(hits[i], ty) === '!') best = hits[i];
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

    // «Мега Альфа» тикает
    if (p.growT > 0) p.growT -= dt;
    if (game.cheats.alpha) {                       // чит ALPHA: Мега Альфа навсегда
      if (p.mega <= 0) setMega(true);
      p.mega = MEGA_TIME;
    } else if (p.mega > 0) {
      p.mega -= dt;
      if (p.mega <= 0) { setMega(false); Sound.play('shrink'); }
    }

    var held = Horror.on && Horror.grabT > 0;                    // рука держит за ногу
    var auto = Horror.on && Horror.inSpeed;                       // погоня на скорости: несёшься сам
    var dir = held ? 0 : auto ? 1 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var maxRun = (p.mega > 0 ? MEGA_SPEED : RUN_SPEED) * (game.cheats.turbo ? 1.6 : 1);
    if (auto) maxRun = 168;
    if (held) { p.vx = 0; input.jumpPressed = false; }
    if (dir !== 0) {
      p.vx += dir * (auto ? 1800 : p.onGround ? ACCEL_GROUND : ACCEL_AIR) * dt;
      if (p.vx > maxRun) p.vx = maxRun;
      if (p.vx < -maxRun) p.vx = -maxRun;
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

    p.vy = Math.min(p.vy + GRAVITY * (game.cheats.moon ? 0.4 : 1) * dt, MAX_FALL);
    p.prevBottom = p.y + p.h;
    var wasInAir = !p.onGround, fallSpeed = p.vy;
    if (p.mega > 0) smashThrough(p, dt);   // Мега Альфа крушит всё на пути
    var res = moveBody(p, dt);
    if (res.bumped) hitBlock(res.bumped.tx, res.bumped.ty);
    if (p.mega > 0 && wasInAir && p.onGround && fallSpeed > 220) shake(3);   // земля трясётся

    if (p.onGround) {
      p.combo = 0;
      rememberSafeSpot(p);
      // осыпающийся пол: наступил — через мгновение провалится
      var fy = Math.floor((p.y + p.h + 1) / T);
      [Math.floor(p.x / T), Math.floor((p.x + p.w - 1) / T)].forEach(function (fx) {
        var key = fx + ',' + fy;
        if (tileAt(fx, fy) === 'v' && !(key in lvl.crumble)) { lvl.crumble[key] = lvl.def.crumbleDelay || 0.35; Sound.play('bump'); }
      });
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
    for (i = orbs.length - 1; i >= 0; i--) {
      if (overlap(p, orbs[i])) { collectOrb(orbs[i]); orbs.splice(i, 1); }
    }

    // Тайники-пасхалки
    for (i = lvl.secrets.length - 1; i >= 0; i--) {
      if (overlap(p, lvl.secrets[i])) { findSecret(lvl.secrets[i]); lvl.secrets.splice(i, 1); }
    }

    // Флаг
    if (lvl.flag && p.x + p.w >= lvl.flag.x - 1 && game.mode === 'play') reachFlag();
  }

  function findSecret(s) {
    game.secrets++;
    addScore(1000, s.x + 8, s.y - 4, true);
    spark(s.x + 8, s.y + 8);
    Sound.play('secret');
    showBanner('СЕКРЕТ НАЙДЕН!\n' + (lvl.def.secret || 'Тайник') + '\n+1000', 2.4);
  }

  function totalSecrets() {
    var n = 0;
    LEVELS.forEach(function (l) { l.map.forEach(function (r) { n += r.split('$').length - 1; }); });
    return n;
  }

  function rememberSafeSpot(p) {
    var feetY = Math.floor((p.y + p.h + 1) / T);
    var l = tileAt(Math.floor(p.x / T), feetY), r = tileAt(Math.floor((p.x + p.w - 1) / T), feetY);
    var ok = (isSolid(l) || l === '=') && (isSolid(r) || r === '=');
    var row = Math.floor((p.y + p.h - 1) / T);
    for (var tx = Math.floor(p.x / T) - 1; tx <= Math.floor((p.x + p.w) / T) + 1; tx++) {
      if (tileAt(tx, row) === '^') ok = false;
    }
    if (ok) { p.safe.x = p.x + p.w / 2; p.safe.y = p.y + p.h; }
  }

  function hurt(fromDir, spikes) {
    var p = player;
    if (p.inv > 0 || p.dead || game.mode !== 'play') return;
    if (Horror.on && !game.cheats.god && p.mega <= 0) {    // в кошмаре жизней нет — есть смерти
      if (Horror.phase === 'chase' || Horror.phase === 'moon' || Horror.phase === 'boss') { Horror.die('hit'); return; }
      Horror.addDeath();
      Sound.play('hurt'); p.inv = 1.2; p.hurtT = 0.35; p.vy = -220; p.vx = fromDir * 120; shake(3);
      return;
    }
    if (game.cheats.god && p.mega <= 0) {          // чит FULLHP: отскок без урона
      p.inv = 0.6;
      p.vy = -220;
      p.vx = fromDir * 120;
      return;
    }
    if (p.mega > 0) {
      setMega(false);
      Sound.play('shrink');
      p.inv = 1.6;
      p.vy = -220;
      p.vx = fromDir * 120;
      shake(3);
      return;
    }
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
    if (Horror.on) {
      if (Horror.phase === 'chase' || Horror.phase === 'moon' || Horror.phase === 'boss') { Horror.die('pit'); return; }
      Horror.addDeath();
      Sound.play('fall'); game.mode = 'respawn'; game.timer = 0.6;
      return;
    }
    if (!game.cheats.god) game.lives--;
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

  function collectOrb(o) {
    var p = player;
    addScore(1000, o.x + 4, o.y - 4, true);
    spark(o.x + 4, o.y + 4);
    if (p.mega <= 0) setMega(true);
    p.mega = MEGA_TIME;
    p.growT = 0.6;
    Sound.play('roar');
    shake(5);
    showBanner('МЕГА АЛЬФА!\nкрушит всё ' + MEGA_TIME + ' сек', 1.8);
  }

  // Меняет размер грибка, не сдвигая ноги
  function setMega(on) {
    var p = player;
    var cx = p.x + p.w / 2, bottom = p.y + p.h;
    p.w = on ? MW : PW;
    p.h = on ? MH : PH;
    p.x = Math.max(0, Math.min(lvl.w * T - p.w, cx - p.w / 2));
    p.y = bottom - p.h;
    if (!on) p.mega = 0;
  }

  // Мега Альфа ломает всё, что задевает телом и куда движется. Землю под ногами не трогает.
  var breakSoundT = 0;
  function smashThrough(p, dt) {
    var x0 = p.x + Math.min(0, p.vx * dt) - 2, x1 = p.x + p.w + Math.max(0, p.vx * dt) + 2;
    var y0 = p.y + Math.min(0, p.vy * dt) - 2, y1 = p.y + p.h - 1;       // ниже ступней не ломаем
    for (var ty = Math.max(0, Math.floor(y0 / T)); ty <= Math.min(lvl.h - 1, Math.floor(y1 / T)); ty++) {
      for (var tx = Math.max(0, Math.floor(x0 / T)); tx <= Math.min(lvl.w - 1, Math.floor(x1 / T)); tx++) {
        var c = tileAt(tx, ty);
        if (c === '?' || c === 'H' || c === 'M') hitBlock(tx, ty);   // сначала отдаёт, что внутри
        else if (isSolid(c) || c === '=' || c === '^') breakTile(tx, ty);
      }
    }
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
    if (c === '?' || c === 'H' || c === '!' || c === 'M') {
      setTile(tx, ty, 'U');
      bumps.push({ tx: tx, ty: ty, t: 0 });
      if (c === '!') spark(x + 8, y + 8);     // невидимый блок проявился
      if (c === '?' || c === '!') {
        game.coins++;
        addScore(10, x + 8, y - 20, false);
        particles.push({ kind: 'coin', x: x + 3, y: y - 14, vy: -150, t: 0, life: 0.45 });
        Sound.play('coin');
      } else {
        // сердечко или сфера выпрыгивают и катятся в сторону от грибка
        var away = (player.x + player.w / 2) < x + 8 ? 1 : -1;
        if (c === 'H') {
          hearts.push({ x: x + 1, y: y - 12, w: 14, h: 12, vy: -160, vx: 0, dir: away, startY: y - 12, onGround: false, still: false });
          Sound.play('life');
        } else {
          orbs.push({ x: x + 4, y: y - 9, w: 8, h: 8, vy: -180, vx: 0, dir: away, onGround: false, still: false });
          Sound.play('orb');
        }
      }
    } else if (c === 'C') {
      breakTile(tx, ty);
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

  // Разбить клетку на 4 осколка
  var SHARD_TILE = { '#': 1, 'v': 1, 'B': 2, 'C': 3, 'X': 4, 'U': 6, '=': 7, '^': 8, 'I': 10 };
  function breakTile(tx, ty) {
    var c = tileAt(tx, ty), x = tx * T, y = ty * T;
    if (tx < 0 || tx >= lvl.w || ty < 0 || ty >= lvl.h) return;
    var idx = SHARD_TILE[c] === undefined ? 3 : SHARD_TILE[c];
    setTile(tx, ty, '.');
    game.score += 10;
    for (var i = 0; i < 4; i++) {
      particles.push({
        kind: 'brick', tile: idx, x: x + (i % 2) * 8, y: y + Math.floor(i / 2) * 8,
        vx: (i % 2 ? 1 : -1) * (40 + Math.random() * 30), vy: -180 - (i < 2 ? 60 : 0),
        sx: (i % 2) * 8, sy: Math.floor(i / 2) * 8, t: 0, life: 1.2
      });
    }
    if (time - breakSoundT > 0.08) { breakSoundT = time; Sound.play('break'); shake(2); }
    updateHud();
  }

  // ================= Враги =================
  function updateEnemies(dt) {
    var speed = lvl.def.enemySpeed || 30;
    var p = player;
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.state === 'sucked') continue;
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
          if (p.mega > 0 && !stomp) {
            smash(e);
          } else if (stomp) {
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

  // Мега Альфа сносит героя с разбега
  function smash(e) {
    e.state = 'squashed';
    e.t = 0.8;
    addScore(200, e.x + e.w / 2, e.y + 6, true);
    spark(e.x + e.w / 2, e.y + e.h / 2);
    spark(e.x + e.w / 2, e.y + 8);
    Sound.play('smash');
    shake(4);
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
    // Сердечко катится, пока не окажется ниже места, где появилось, — там останавливается
    hearts.forEach(function (h) {
      if (h.still) return;
      h.vy = Math.min((h.vy || 0) + GRAVITY * dt, MAX_FALL);
      h.vx = (h.dir || 0) * ITEM_ROLL;
      var r = moveBody(h, dt);
      if (r.wall) h.dir = -r.wall;
      if (h.onGround && (!h.dir || h.y > h.startY + 4)) h.still = true;
    });
    // Сфера катится всё время и отскакивает от стен
    orbs.forEach(function (o) {
      if (o.still) return;
      o.vy = Math.min((o.vy || 0) + GRAVITY * dt, MAX_FALL);
      o.vx = o.dir * ITEM_ROLL * 1.3;
      var r = moveBody(o, dt);
      if (r.wall) o.dir = -r.wall;
    });
    for (var i = hearts.length - 1; i >= 0; i--) if (hearts[i].y > lvl.h * T + 40) hearts.splice(i, 1);
    for (i = orbs.length - 1; i >= 0; i--) if (orbs[i].y > lvl.h * T + 40) orbs.splice(i, 1);

    for (i = particles.length - 1; i >= 0; i--) {
      var q = particles[i];
      q.t += dt;
      if (q.kind === 'brick' || q.kind === 'bone') { q.vy += GRAVITY * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.rot !== undefined) q.rot += dt * 10; }
      else if (q.kind === 'coin') { q.vy += 600 * dt; q.y += q.vy * dt; }
      else if (q.kind === 'text') { q.y -= 22 * dt; }
      if (q.t >= q.life) particles.splice(i, 1);
    }
    for (i = bumps.length - 1; i >= 0; i--) { bumps[i].t += dt; if (bumps[i].t > 0.16) bumps.splice(i, 1); }
    Object.keys(lvl.crumble).forEach(function (key) {
      if (lvl.crumble[key] < 0) return;
      lvl.crumble[key] -= dt;
      if (lvl.crumble[key] <= 0) {
        var xy = key.split(',');
        lvl.crumble[key] = -1;
        if (tileAt(+xy[0], +xy[1]) === 'v') breakTile(+xy[0], +xy[1]);
      }
    });
  }

  function spark(x, y) { particles.push({ kind: 'spark', x: x - 8, y: y - 8, t: 0, life: 0.32 }); }
  function popText(text, x, y, color) { particles.push({ kind: 'text', text: text, x: x, y: y, color: color, t: 0, life: 0.8 }); }

  var shakeT = 0, shakeAmp = 0;
  function shake(a) { shakeT = 0.15; shakeAmp = a; }

  // ================= Флаг и переходы =================
  function reachFlag() {
    var p = player;
    if (Horror.on) { Horror.onFlag(); return; }
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

  function startLevel(index, def) {
    def = def || LEVELS[index];
    game.levelIndex = index;
    buildLevel(def);
    if (def.nightmare) Horror.enter(); else Horror.exit();
    player = makePlayer();
    input.jumpPressed = false;
    snapCamera();
    game.mode = 'play';
    hideOverlay();
    showBanner((def.nightmare ? 'Уровень ?' : 'Уровень ' + (index + 1)) + '\n' + lvl.def.name, 1.6);
    updateHud();
  }

  function newGame() {
    game.score = 0; game.coins = 0; game.lives = START_LIVES; game.secrets = 0;
    // включённые читы остаются, но забег снова «честный», только если читов нет
    game.cheated = activeCheats().length > 0;
    startLevel(0);
    Music.restart();
  }

  function finishRun(won) {
    Music.pause();
    var record = !game.cheated && game.score > game.best;
    if (record) { game.best = game.score; save('best', game.best); }
    var text = 'Счёт: ' + game.score + '\nМонетки: ' + game.coins +
      '\nСекреты: ' + game.secrets + ' из ' + totalSecrets() + '\nРекорд: ' + game.best + (record && game.score > 0 ? '\nНОВЫЙ РЕКОРД!' : '') +
      (game.cheated ? '\n(с читами рекорд не считается)' : '');
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
    if (game.mode === 'play' || game.mode === 'respawn' || game.mode === 'clear' || game.mode === 'dying' || game.mode === 'caught') {
      game.pausedFrom = game.mode;
      game.mode = 'pause';
      Music.pause();
      showOverlay('ПАУЗА', pauseText(),
        [{ label: 'Продолжить', action: resume },
         { label: 'Начать заново', action: newGame, secondary: true }]);
      cheatBox.classList.remove('hidden');
      cheatMsg.textContent = '';
      refreshCheatButtons();
    } else if (game.mode === 'pause') {
      resume();
    }
  }
  function pauseText() {
    var on = activeCheats();
    return 'Уровень ' + (lvl.def.nightmare ? '?' : game.levelIndex + 1) + ': ' + lvl.def.name + '\nСчёт: ' + game.score +
      '\nСекреты: ' + game.secrets + ' из ' + totalSecrets() +
      (on.length ? '\nЧиты: ' + on.join(', ') : '');
  }

  // ================= Чит-коды (вводятся на паузе) =================
  var cheatBox = $('cheat'), cheatMsg = $('cheat-msg');

  // Кнопки читов: [код, надпись, какой переключатель подсвечивать]
  var CHEAT_BUTTONS = [
    ['FULLHP', 'Бессмертие', 'god'], ['ALPHA', 'Вечная Альфа', 'alpha'],
    ['MOON', 'Луна', 'moon'], ['TURBO', 'Турбо', 'turbo'],
    ['XRAY', 'Рентген', 'xray'], ['MEGA', 'Мега Альфа 7с'],
    ['RICH', '+100 монет'], ['LIVES', 'Полные HP'],
    ['NOHEROES', 'Убрать героев'], ['RESET', 'Выключить всё']
  ];
  function makeButton(parent, code, label, extraClass) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-cheat', code);
    if (extraClass) b.className = extraClass;
    b.addEventListener('click', function () { Sound.unlock(); b.blur(); applyCheat(code); refreshCheatButtons(); });
    parent.appendChild(b);
    return b;
  }
  (function buildCheatButtons() {
    var box = $('cheat-buttons'), lv = $('level-buttons');
    CHEAT_BUTTONS.forEach(function (c) { makeButton(box, c[0], c[1]).setAttribute('data-toggle', c[2] || ''); });
    LEVELS.forEach(function (l, i) { makeButton(lv, 'LEVEL' + (i + 1), (i + 1) + ' ' + l.name).setAttribute('data-level', i); });
    if (window.MUSHROOM_NIGHTMARE) makeButton(lv, 'NIGHTMARE', '☠ ???', 'danger').id = 'btn-nightmare';
  })();
  function refreshCheatButtons() {
    var nb = $('btn-nightmare'), nd = load('nightmareDeaths', 0);
    if (nb) nb.textContent = nd > 0 ? '☠ ??? (' + nd + ')' : '☠ ???';
    Array.prototype.forEach.call(cheatBox.querySelectorAll('button'), function (b) {
      var t = b.getAttribute('data-toggle'), l = b.getAttribute('data-level');
      b.classList.toggle('on', !!(t && game.cheats[t]));
      b.classList.toggle('current', l !== null && +l === game.levelIndex && lvl && !lvl.def.nightmare);
    });
  }
  var CHEAT_NAMES = { god: 'бессмертие', alpha: 'вечная Мега Альфа', moon: 'луна', turbo: 'турбо', xray: 'рентген' };

  function activeCheats() {
    return Object.keys(game.cheats).filter(function (k) { return game.cheats[k]; })
      .map(function (k) { return CHEAT_NAMES[k]; });
  }

  function toggleCheat(key) {
    game.cheats[key] = !game.cheats[key];
    return CHEAT_NAMES[key] + (game.cheats[key] ? ': ВКЛ' : ': ВЫКЛ');
  }

  function applyCheat(raw) {
    var code = String(raw || '').toUpperCase().replace(/\s+/g, '');
    var msg = null, ok = true;
    var lv = /^LEVEL(\d+)$/.exec(code);
    if (lv) {
      var n = parseInt(lv[1], 10);
      if (n >= 1 && n <= LEVELS.length) {
        game.cheated = true;
        cheatBox.classList.add('hidden');
        startLevel(n - 1);
        Music.play();
        Sound.play('secret');
        return;
      }
      msg = 'Такого уровня нет. Есть 1–' + LEVELS.length; ok = false;
    } else {
      switch (code) {
        case 'NIGHTMARE':
        case '666':
          game.cheated = true;
          cheatBox.classList.add('hidden');
          startNightmare(false);
          return;
        case 'FULLHP': msg = toggleCheat('god'); break;
        case 'ALPHA':
          msg = toggleCheat('alpha');
          if (!game.cheats.alpha && player.mega > 0) player.mega = 2;   // скоро сдуется
          break;
        case 'MEGA':
          collectOrb({ x: player.x, y: player.y });
          msg = 'Мега Альфа на ' + MEGA_TIME + ' сек'; break;
        case 'MOON': msg = toggleCheat('moon'); break;
        case 'TURBO': msg = toggleCheat('turbo'); break;
        case 'XRAY': msg = toggleCheat('xray'); break;
        case 'RICH': game.coins += 100; msg = '+100 монеток'; break;
        case 'LIVES': game.lives = MAX_LIVES; msg = 'Жизни: ' + MAX_LIVES; break;
        case 'NOHEROES':
          enemies.length = 0; msg = 'Все герои с уровня ушли'; break;
        case 'RESET':
          Object.keys(game.cheats).forEach(function (k) { game.cheats[k] = false; });
          if (player.mega > 0) player.mega = 2;
          msg = 'Все читы выключены'; break;
        default: msg = 'Неизвестный код'; ok = false;
      }
    }
    if (ok) { game.cheated = true; Sound.play('secret'); } else Sound.play('bump');
    cheatMsg.textContent = msg;
    cheatMsg.className = ok ? 'ok' : 'bad';
    ovText.textContent = pauseText();
    updateHud();
  }

  function resume() {
    if (game.mode !== 'pause') return;
    game.mode = game.pausedFrom || 'play';
    hideOverlay();
    Music.play();
    if (Horror.away) { Horror.away = false; Horror.say('НЕ УХОДИ. Я ЖДАЛ.', 2.6); Horror.noiseBand(1.4, 0.12, 2400, 1800, 6, 0); }
    keys.left = keys.right = keys.jump = false; syncInput();
    input.jumpPressed = false;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && Horror.on && Horror.phase === 'chase') Horror.away = true;
    if (document.hidden && game.mode !== 'pause' && (game.mode === 'play' || game.mode === 'respawn' || game.mode === 'clear')) togglePause();
  });

  // ================= КОШМАР: секретный уровень по чит-коду =================
  // Сначала тихий луг с добрым солнышком. На секретном чекпоинте «K» мир краснеет, солнце сходит
  // с неба, засасывает всех героев и гонится за грибком, съедая все блоки позади.

  // Солнце 40×40, рисуется кодом: доброе (creepy=false) и жуткое (с кровью из ушей)
  var SUN_W = 40, SUN_CX = 19.5, SUN_CY = 18.5, SUN_EYES = [[14, 15], [23, 15]];
  function makeSun(frame, creepy) {
    var c = document.createElement('canvas');
    c.width = SUN_W; c.height = SUN_W;
    var g = c.getContext('2d');
    var COL = {
      out: '#7a2e0e', body: '#ffd23a', shade: '#f0a020', hi: '#fff2a0', ray: '#ffb020', rayd: '#d66e14',
      eye: '#fffff8', bag: '#c87828', mouth: '#3a0a0a', teeth: '#faf6e6', gum: '#be2832',
      ear: '#fabe3c', earin: '#d26432', blood: '#b0101a', bloodd: '#6a0008', cute: '#5a1e08'
    };
    function put(x, y, col) { if (x >= 0 && x < SUN_W && y >= 0 && y < SUN_W) { g.fillStyle = COL[col]; g.fillRect(x, y, 1, 1); } }
    var x, y, k, d, CX = SUN_CX, CY = SUN_CY;
    // лучи
    for (k = 0; k < 12; k++) {
      var a = k * Math.PI / 6 + (frame % 2 ? 0.08 : 0);
      for (var r10 = 120; r10 < 175; r10++) {
        var r = r10 / 10, wd = (175 - r10) / 55 * 1.6;
        [-wd, 0, wd].forEach(function (t) {
          put(Math.round(CX + Math.cos(a + t / r) * r), Math.round(CY + Math.sin(a + t / r) * r), r < 15 ? 'ray' : 'rayd');
        });
      }
    }
    // уши
    [[CX - 12, CY + 1], [CX + 12, CY + 1]].forEach(function (e) {
      for (y = 0; y < SUN_W; y++) for (x = 0; x < SUN_W; x++) {
        d = Math.hypot(x - e[0], y - e[1]);
        if (d <= 3.2) put(x, y, 'out');
        if (d <= 2.3) put(x, y, 'ear');
        if (d <= 1.2) put(x, y, 'earin');
      }
    });
    // тело
    for (y = 0; y < SUN_W; y++) for (x = 0; x < SUN_W; x++) {
      d = Math.hypot(x - CX, y - CY);
      if (d <= 11.5) put(x, y, 'out');
      if (d <= 10.5) {
        var col = (x - CX) + (y - CY) > 7 ? 'shade' : 'body';
        if (Math.hypot(x - (CX - 4), y - (CY - 5)) < 2.6) col = 'hi';
        put(x, y, col);
      }
    }
    if (!creepy) {
      // доброе: глаза-точки (зрачки дорисовываются отдельно) и улыбка-дуга
      for (x = Math.floor(CX - 5); x <= Math.floor(CX + 5); x++) {
        var dx = (x - CX) / 5;
        put(x, Math.round(CY + 4 + 2 * (1 - dx * dx)), 'cute');   // уголки выше середины — улыбка
      }
      return c;
    }
    // жуткое: выпученные глаза с мешками
    SUN_EYES.forEach(function (e) {
      var gx = e[0], gy = e[1];
      for (y = gy - 2; y <= gy + 2; y++) for (x = gx - 2; x <= gx + 2; x++) if (Math.abs(x - gx) + Math.abs(y - gy) <= 3) put(x, y, 'eye');
      for (x = gx - 2; x <= gx + 2; x++) { put(x, gy - 3, 'out'); put(x, gy + 3, 'out'); put(x, gy + 4, 'bag'); }
      for (y = gy - 1; y <= gy + 1; y++) { put(gx - 3, y, 'out'); put(gx + 3, y, 'out'); }
    });
    // улыбка до ушей с зубами
    var my = Math.floor(CY + 4);
    for (x = Math.floor(CX - 8); x <= Math.floor(CX + 8); x++) {
      var ddx = (x - CX) / 8;
      var top = my + Math.round(-2 * ddx * ddx) + 1, bot = my + Math.round(3.5 - 1.5 * ddx * ddx) + 1;
      put(x, top - 1, 'out');
      for (y = top; y <= bot; y++) put(x, y, 'mouth');
      if (bot - top >= 2) { put(x, top, x % 2 === 0 ? 'teeth' : 'gum'); put(x, bot, x % 2 ? 'teeth' : 'gum'); }
      put(x, bot + 1, 'out');
    }
    // кровь из ушей
    var drip = 2 + (frame % 3);
    [[-1, Math.floor(CX - 12)], [1, Math.floor(CX + 12) + 1]].forEach(function (sd) {
      var side = sd[0], ex = sd[1], y0 = Math.floor(CY + 3);
      for (y = y0; y < y0 + 9 + drip; y++) {
        var xx = ex + (Math.floor(y / 3) % 2 ? side : 0);
        put(xx, y, 'blood');
        if (y % 4 === 0) put(xx + side, y, 'bloodd');
      }
      var yd = y0 + 9 + drip;
      put(ex, yd, 'bloodd'); put(ex - 1, yd + 1, 'blood'); put(ex, yd + 1, 'blood'); put(ex + 1, yd + 1, 'blood'); put(ex, yd + 2, 'bloodd');
    });
    return c;
  }
  var SUN_CUTE = [makeSun(0, false), makeSun(1, false)];
  var SUN_EVIL = [makeSun(0, true), makeSun(1, true), makeSun(2, true)];
  // Жуткая луна 40×40: бледная, в кратерах, с пустыми глазницами и зубастой ухмылкой
  var MOON_EYES = [[14, 16], [25, 16]];
  function makeMoon(frame) {
    var c = document.createElement('canvas'); c.width = SUN_W; c.height = SUN_W;
    var g = c.getContext('2d');
    var put = function (x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    var CX = 19.5, CY = 19.5, x, y, d;
    for (y = 0; y < SUN_W; y++) for (x = 0; x < SUN_W; x++) {
      d = Math.hypot(x - CX, y - CY);
      if (d <= 17.5) put(x, y, '#2a2440');
      if (d <= 16.5) put(x, y, (x - CX) + (y - CY) > 9 ? '#a8acc8' : '#d8dcf0');
    }
    [[10, 8, 2.5], [28, 26, 3], [12, 29, 2], [30, 10, 1.6], [21, 6, 1.4]].forEach(function (cr) {
      for (y = 0; y < SUN_W; y++) for (x = 0; x < SUN_W; x++) if (Math.hypot(x - cr[0], y - cr[1]) <= cr[2]) put(x, y, '#9094b0');
    });
    MOON_EYES.forEach(function (e) {                         // глазницы
      for (y = e[1] - 3; y <= e[1] + 3; y++) for (x = e[0] - 3; x <= e[0] + 3; x++) {
        var dd = Math.hypot((x - e[0]) * 1.1, y - e[1]);
        if (dd <= 3.4) put(x, y, '#0a0612');
        else if (dd <= 4.1) put(x, y, '#6a1020');
      }
    });
    var j = frame % 2;
    for (x = 9; x <= 30; x++) {                               // кривая ухмылка с острыми зубами
      var t = (x - 19.5) / 10.5, top = Math.round(25 - 3 * t * t + (x % 5 === 0 ? 1 : 0)), bot = Math.round(28 + 2 * (1 - t * t));
      put(x, top - 1, '#2a2440');
      for (y = top; y <= bot; y++) put(x, y, '#0a0612');
      if ((x + j) % 2 === 0) { put(x, top, '#f4f0e0'); put(x, top + 1, '#f4f0e0'); }
      if ((x + j) % 2 === 1) { put(x, bot, '#f4f0e0'); put(x, bot - 1, '#f4f0e0'); }
      put(x, bot + 1, '#2a2440');
    }
    for (y = 30; y < 34 + j * 2; y++) put(16, y, '#0a0612');  // чёрная слюна
    put(16, 34 + j * 2, '#2a2440');
    return c;
  }
  var MOON = [makeMoon(0), makeMoon(1)];
  // Стадии луны: 0 — бледная, 1 — треснула и плачет чёрным, 2 — глазницы горят красным, пасть разорвана
  function makeMoonStage(frame, stage) {
    var c = document.createElement('canvas'); c.width = SUN_W; c.height = SUN_W;
    var g = c.getContext('2d'); g.drawImage(MOON[frame], 0, 0);
    if (stage <= 0) return c;
    var P = function (px, py, col) { g.fillStyle = col; g.fillRect(px, py, 1, 1); }, x, y;
    [[8, 9], [9, 10], [10, 10], [11, 11], [12, 12], [12, 13], [30, 6], [29, 7], [29, 8], [28, 9], [27, 10], [20, 4], [20, 5], [21, 6], [21, 7]].forEach(function (q) { P(q[0], q[1], '#1a1430'); });
    MOON_EYES.forEach(function (e) { for (y = e[1] + 4; y < 31 + frame * 2 + stage * 2; y++) P(e[0] + ((y >> 2) % 2), y, '#0a0612'); });
    if (stage >= 2) {
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(70,0,40,0.28)'; g.fillRect(0, 0, SUN_W, SUN_W); g.globalCompositeOperation = 'source-over';
      MOON_EYES.forEach(function (e) {
        for (y = e[1] - 3; y <= e[1] + 3; y++) for (x = e[0] - 3; x <= e[0] + 3; x++) if (Math.hypot((x - e[0]) * 1.1, y - e[1]) <= 3) P(x, y, '#c0101c');
      });
      for (x = 7; x <= 32; x++) {
        var top = 23 - (x > 14 && x < 25 ? 1 : 0), bot = 32;
        for (y = top; y <= bot; y++) P(x, y, '#3a0010');
        if ((x + frame) % 2 === 0) { P(x, top, '#f4f0e0'); P(x, top + 1, '#f4f0e0'); P(x, top + 2, '#f4f0e0'); }
        else { P(x, bot, '#f4f0e0'); P(x, bot - 1, '#f4f0e0'); }
      }
      [[6, 18], [7, 20], [33, 17], [32, 21], [11, 30], [28, 31]].forEach(function (q) { P(q[0], q[1], '#6a2a7a'); P(q[0] + 1, q[1] + 1, '#6a2a7a'); });
    }
    return c;
  }
  var MOON_STAGES = [0, 1, 2].map(function (st) { return [0, 1].map(function (fr) { return makeMoonStage(fr, st); }); });

  // Стадии солнца: 0 — жуткое, 1 — кровавые слёзы и красные лучи, 2 — трещины и третий глаз, 3 — пустые глазницы и пасть до ушей
  function stageCanvas(src) {
    var c = document.createElement('canvas'); c.width = SUN_W; c.height = SUN_W;
    c.getContext('2d').drawImage(src, 0, 0); return c;
  }
  function makeSunStage(frame, stage) {
    var c = stageCanvas(SUN_EVIL[frame]), g = c.getContext('2d');
    if (stage <= 0) return c;
    var img = g.getImageData(0, 0, SUN_W, SUN_W), d = img.data, x, y;
    for (y = 0; y < SUN_W; y++) for (x = 0; x < SUN_W; x++) {          // лучи краснеют, к 3-й стадии — почти чёрные
      var i = (y * SUN_W + x) * 4;
      if (d[i + 3] && Math.hypot(x - SUN_CX, y - SUN_CY) > 11.6) {
        if (stage >= 3) { d[i] = Math.min(255, d[i] * 0.55 + 20); d[i + 1] *= 0.1; d[i + 2] *= 0.1; }
        else { d[i] = Math.max(d[i], 220); d[i + 1] *= stage >= 2 ? 0.3 : 0.5; d[i + 2] *= 0.3; }
      }
    }
    g.putImageData(img, 0, 0);
    var P = function (px, py, col) { g.fillStyle = col; g.fillRect(px, py, 1, 1); };
    // кровавые слёзы
    [13, 24].forEach(function (tx) { for (y = 19; y < 28 + frame + stage; y++) P(tx + ((y >> 2) % 2), y, '#b0101a'); P(tx, 28 + frame + stage, '#6a0008'); });
    if (stage >= 2) {                                                  // трещины и третий глаз
      [[9, 10], [10, 11], [11, 11], [12, 12], [28, 9], [27, 10], [27, 11], [26, 12], [16, 22], [17, 23]].forEach(function (q) { P(q[0], q[1], '#4a1006'); });
      if (frame !== 2) { P(19, 8, '#fffff8'); P(18, 9, '#fffff8'); P(20, 9, '#fffff8'); P(19, 10, '#fffff8'); P(19, 9, '#d01010'); }
      else { P(18, 9, '#4a1006'); P(19, 9, '#4a1006'); P(20, 9, '#4a1006'); }
    }
    if (stage >= 3) {                                                  // пустые глазницы и пасть до ушей
      SUN_EYES.forEach(function (e) {
        for (y = e[1] - 2; y <= e[1] + 2; y++) for (x = e[0] - 2; x <= e[0] + 2; x++) if (Math.abs(x - e[0]) + Math.abs(y - e[1]) <= 3) P(x, y, '#000000');
      });
      for (x = 7; x <= 32; x++) {
        var top = 23 + (x < 10 || x > 29 ? 1 : 0), bot = 29 + (x > 12 && x < 27 ? 1 : 0);
        for (y = top; y <= bot; y++) P(x, y, '#140000');
        if (x % 2 === 0) { P(x, top, '#f0e8d0'); P(x, top + 1, '#f0e8d0'); }
        else { P(x, bot, '#f0e8d0'); P(x, bot - 1, '#f0e8d0'); }
      }
      for (y = 30; y < 35 + frame; y++) { P(8, y, '#b0101a'); P(31, y, '#b0101a'); }
    }
    return c;
  }
  var SUN_STAGES = [0, 1, 2, 3].map(function (st) { return [0, 1, 2].map(function (fr) { return makeSunStage(fr, st); }); });

  // силуэт: тёмный диск с лучами — глаза и рот дорисовываются поверх
  var SUN_SIL = (function () {
    var c = document.createElement('canvas'); c.width = SUN_W; c.height = SUN_W;
    var g = c.getContext('2d');
    g.drawImage(SUN_EVIL[0], 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#140408'; g.fillRect(0, 0, SUN_W, SUN_W);
    return c;
  })();

  var Horror = {
    on: false, phase: 'calm', t: 0, tint: 0, monster: null, msg: null, staticT: 0, flashT: 0,
    scareT: 0, beatT: 0, drone: null, breakT: 0,
    // для паники
    close: 0, pulseT: 0, pulseN: 0, breathT: 0, breathIn: true, growlT: 3, laughT: 6, subT: 0, subWait: 6,
    lungeT: 0, lungeWait: 7, beatPulse: 0, whisperT: 8, chaseTime: 0, debris: [],
    // v3: секции, смерти, четвёртая стена
    deaths: 0, section: 0, snap: null, secDeaths: 0, windupT: 0, silentT: 0, quietDone: false,
    crashT: 0, crashDone: false, rush: false, fakeT: 0, fakeDone: false, lightT: 0, lightning: 0,
    away: false, peekT: 0, peekDone: false, stepsT: 9, tapeDrop: 0, tapeT: 5, revBuf: null, flashCool: 0, scareKind: 'face',
    oneBit: false, oneBitBuf: null, sunOddT: 0, sunOddWait: 5, title0: null,
    // v4: музыка, руки, плевки трупами, скорость, луна
    trackDone: false, synthOn: false, synthStep: 0, synthNext: 0, musG: null,
    grabT: 0, grabX: 0, grabY: 0, spitWait: 6, spitWind: 0, shots: [], inSpeed: false, wasSpeed: false,
    moonT: 0, flagTaken: false, boss: null, moonTint: 0,
    // v5: замок, вторжение луны, рэпер и бит
    fadeT: 0, introT: 0, beatOn: false, beatStep: 0, beatNext: 0, rapDead: 0, rain: [], waves: [],

    enter: function () {
      this.on = true; this.phase = 'calm'; this.t = 0; this.tint = 0; this.monster = null;
      this.msg = null; this.staticT = 0; this.flashT = 0; this.scareT = 0;
      this.close = 0; this.chaseTime = 0; this.debris = []; this.subT = 0; this.whisperT = 8;
      this.deaths = 0; this.section = 0; this.snap = null; this.secDeaths = 0; this.windupT = 0; this.silentT = 0;
      this.quietDone = false; this.crashT = 0; this.crashDone = false; this.rush = false; this.fakeT = 0; this.fakeDone = false;
      this.lightT = 0; this.lightning = 0; this.away = false; this.peekT = 0; this.peekDone = false; this.stepsT = 9; this.oneBit = false;
      this.trackDone = false; this.synthOn = false; this.grabT = 0; this.spitWait = 6; this.spitWind = 0; this.shots = [];
      this.inSpeed = false; this.wasSpeed = false; this.moonT = 0; this.flagTaken = false; this.boss = null; this.moonTint = 0;
      Music.init();
      if (Music.el) {
        Music.el.loop = false;                 // в кошмаре твой трек звучит один раз…
        var self0 = this;
        if (!Music.el.__mrEnded) {
          Music.el.__mrEnded = true;
          Music.el.addEventListener('ended', function () { if (Horror.on) { Horror.trackDone = true; Horror.synthOn = true; } });
        }
      }
      this.visits = load('nightmareVisits', 0) + 1;
      save('nightmareVisits', this.visits);
      this.musicCreepy(false);
      this.loadReverse();
    },
    exit: function () {
      if (!this.on && !this.drone) return;
      this.on = false;
      this.stopDrone();
      this.musicCreepy(false);
      Music.applyVolume();
      this.oneBit = false;
      this.setTab(false);
      this.synthOn = false; this.trackDone = false;
      if (Music.el) Music.el.loop = true;
      this.beatOn = false; this.rapDead = 0;
    },

    // ---------- …а потом — синтезированная страшная музыка (музыкальная шкатулка на тритонах)
    tickSynth: function () {
      var c = Sound.ctx;
      if (!this.synthOn || !c || Sound.volMusic <= 0) return;
      var playing = game.mode === 'play' || game.mode === 'respawn' || game.mode === 'moonintro';
      if (!playing || this.silentT > 0 || this.fakeT > 0) { this.synthNext = c.currentTime + 0.05; return; }
      if (!this.musG) {
        try { this.musG = c.createGain(); this.musG.connect(c.destination); } catch (e) { return; }
      }
      this.musG.gain.value = Sound.volMusic / 100 * 0.5;
      if (this.synthNext < c.currentTime) this.synthNext = c.currentTime + 0.02;
      var dur = this.phase === 'boss' ? 0.15 : this.rush ? 0.17 : (this.phase === 'chase' || this.phase === 'moon') ? 0.27 - this.close * 0.08 : 0.32;
      while (this.synthNext < c.currentTime + 0.15) { this.synthNote(this.synthStep++, this.synthNext, dur); this.synthNext += dur; }
    },
    // ---------- бит рэпера-скелета: бочка, хлопок, хэты, 808 на тритоне, колокол; и «бормотание» на каждый слог
    LYRICS: [
      'Я скелет с микрофоном, мой бит из костей,',
      'твой грибок не вернётся домой из гостей.',
      'Луна поднимается, щёлкает пастью —',
      'ты прыгаешь выше, а падаешь в пасть ей.',
      'Флаг у неё, а в замке нет дверей,',
      'каждая ступенька — ступень в мир теней.',
      'Солнце сгорело, осталась луна,',
      'ночь бесконечна — и ночь голодна.',
      'Прыгни ей на голову: раз, два и три,',
      'только в глаза ей не смотри изнутри.',
      'Кости стучат, колонки ревут —',
      'здесь никого не спасают. Здесь ждут.'
    ],
    LYRICS2: [
      'Слышишь, как трескается лунный фарфор?',
      'Это не ты победил — это мой приговор.',
      'Сверху падают осколки, снизу катится волна —',
      'прыгай, грибок, если жизнь тебе нужна.',
      'Чёрные слёзы текут по её щекам,',
      'я читаю медленно — по твоим шагам.'
    ],
    LYRICS3: [
      'Сними с неё лицо — под ним ещё одно:',
      'красное, голодное, и у него нет дна.',
      'Бит ускоряется — сердце не успевает,',
      'кто дослушал до конца — тот не просыпается.',
      'Последний куплет. Последний прыжок.',
      'Прыгни ей на голову. Ну же, грибок.'
    ],
    syllables: function (line) { var n = (line.match(/[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/g) || []).length; return Math.max(3, n); },
    tickBeat: function () {
      var c = Sound.ctx, b = this.boss;
      if (!this.beatOn || !b || !c || Sound.volMusic <= 0) return;
      if (game.mode !== 'play' && game.mode !== 'caught') { this.beatNext = c.currentTime + 0.05; return; }
      if (!this.musG) { try { this.musG = c.createGain(); this.musG.connect(c.destination); } catch (e) { return; } }
      this.musG.gain.value = Sound.volMusic / 100 * 0.6;
      if (this.beatNext < c.currentTime) this.beatNext = c.currentTime + 0.02;
      var st = 60 / b.bpm / 4;
      while (this.beatNext < c.currentTime + 0.12) { this.beatHit(this.beatStep++, this.beatNext, st); this.beatNext += st; }
    },
    beatHit: function (step, t, st) {
      var c = Sound.ctx, out = this.musG, i = step % 16, self = this;
      var env = function (node, peak, dur) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + 0.005); node.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
      var noise = function (dur, type, freq, peak) {
        var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (var k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
        var src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; fl.type = type; fl.frequency.value = freq; env(g, peak, dur);
        src.connect(fl); fl.connect(g); g.connect(out); src.start(t);
      };
      var tone = function (type, f0, f1, dur, peak, at) {
        var o = c.createOscillator(), g = c.createGain(), tt = at || t;
        o.type = type; o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), tt + dur);
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(peak, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
        o.connect(g); g.connect(out); o.start(tt); o.stop(tt + dur + 0.02);
      };
      try {
        if (i === 0 || i === 6 || i === 10) tone('sine', 130, 38, 0.22, 0.9);           // бочка
        if (i === 4 || i === 12) { noise(0.16, 'bandpass', 1800, 0.55); tone('triangle', 220, 160, 0.08, 0.2); }   // хлопок
        if (i % 2 === 0) noise(0.03, 'highpass', 7000, 0.12);                             // хэт
        if (i === 14) noise(0.12, 'highpass', 6000, 0.12);
        if (i === 0) tone('sine', 55, 48, st * 7, 0.7);                                   // 808: ля…
        if (i === 8) tone('sine', 77.8, 70, st * 7, 0.6);                                 // …ми-бемоль (тритон)
        if (i === 0 && (Math.floor(step / 16) % 2 === 0)) tone('triangle', 932, 880, 1.2, 0.08);   // колокол
        if (i === 0) {                                                                    // «голос»: писк на каждый слог строки
          var LY = this.curLyrics(), line = LY[Math.floor(step / 16) % LY.length], n = this.syllables(line);
          for (var k = 0; k < n; k++) {
            var at = t + (k / n) * st * 12, fq = 120 + Math.random() * 60;
            tone('square', fq, fq * 0.9, st * 0.8, 0.12, at);
            tone('sawtooth', fq / 2, fq / 2, st * 0.8, 0.06, at);
          }
        }
      } catch (e) {}
    },
    synthNote: function (step, t, dur) {
      var M = [440, 0, 659.3, 0, 523.3, 0, 659.3, 622.3, 440, 0, 698.5, 0, 523.3, 0, 493.9, 0,
               415.3, 0, 659.3, 0, 493.9, 0, 659.3, 622.3, 440, 0, 587.3, 523.3, 493.9, 0, 466.2, 0];
      var c = Sound.ctx, g0 = this.musG, i = step % M.length;
      var warp = 1 + Math.sin(t * 1.7) * 0.006 * (1 + this.close * 4);      // «плывущая» шкатулка
      try {
        if (M[i]) {
          [[M[i] * warp, 'triangle', 0.5], [M[i] * 2 * warp, 'sine', 0.12]].forEach(function (n) {
            var o = c.createOscillator(), g = c.createGain();
            o.type = n[1]; o.frequency.value = n[0];
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(n[2], t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
            o.connect(g); g.connect(g0); o.start(t); o.stop(t + 0.65);
          });
        }
        if (i % 8 === 0) {                                                  // бас: ля — ми-бемоль (тритон)
          var bf = (Math.floor(i / 8) % 2) ? 77.78 : 110;
          var ob = c.createOscillator(), gb = c.createGain();
          ob.type = 'triangle'; ob.frequency.value = bf;
          gb.gain.setValueAtTime(0.0001, t); gb.gain.exponentialRampToValueAtTime(0.6, t + 0.03); gb.gain.exponentialRampToValueAtTime(0.0001, t + dur * 7);
          ob.connect(gb); gb.connect(g0); ob.start(t); ob.stop(t + dur * 7 + 0.05);
        }
        if (i % 16 === 12) {                                                // далёкий вой-пэд
          var op = c.createOscillator(), lp = c.createBiquadFilter(), gp = c.createGain();
          op.type = 'sawtooth'; op.frequency.setValueAtTime(311, t); op.frequency.linearRampToValueAtTime(293, t + dur * 6);
          lp.type = 'lowpass'; lp.frequency.value = 900;
          gp.gain.setValueAtTime(0.0001, t); gp.gain.linearRampToValueAtTime(0.08, t + dur * 2); gp.gain.linearRampToValueAtTime(0.0001, t + dur * 6);
          op.connect(lp); lp.connect(gp); gp.connect(g0); op.start(t); op.stop(t + dur * 6 + 0.05);
        }
      } catch (e) {}
    },

    // ---------- четвёртая стена: заголовок и иконка вкладки
    setTab: function (scary, text) {
      try {
        if (this.title0 === null) this.title0 = document.title;
        var link = document.getElementById('mr-favicon');
        if (!scary) {
          document.title = this.title0;
          if (link) link.parentNode.removeChild(link);
          return;
        }
        document.title = text || 'ОНО ИДЁТ';
        if (!link) {
          var c = document.createElement('canvas'); c.width = 16; c.height = 16;
          var g = c.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, 16, 16);
          g.fillStyle = '#fff4e0'; g.fillRect(3, 5, 10, 6); g.fillRect(5, 4, 6, 8);
          g.fillStyle = '#e8101c'; g.fillRect(6, 6, 4, 4);
          g.fillStyle = '#000'; g.fillRect(7, 7, 2, 2);
          link = document.createElement('link'); link.id = 'mr-favicon'; link.rel = 'icon';
          link.href = c.toDataURL('image/png');
          document.head.appendChild(link);
        }
      } catch (e) {}
    },
    addDeath: function () {
      this.deaths++;
      save('nightmareDeaths', load('nightmareDeaths', 0) + 1);
      hudCache.l = null; updateHud();
    },

    // ---------- твоя музыка задом наперёд (для превращения)
    loadReverse: function () {
      var self = this;
      if (this.revBuf || !Sound.ctx || !window.fetch || location.protocol === 'file:') return;
      fetch(MUSIC_FILE).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (b) {
        if (!b) return null;
        var p = Sound.ctx.decodeAudioData(b);
        return p && p.then ? p : null;
      }).then(function (buf) {
        if (!buf) return;
        var c = Sound.ctx, len = Math.min(buf.length, Math.floor(buf.sampleRate * 4));
        var start = Math.max(0, Math.floor(buf.length / 3));
        var out = c.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
        for (var ch = 0; ch < buf.numberOfChannels; ch++) {
          var src = buf.getChannelData(ch).subarray(start, start + len), dst = out.getChannelData(ch);
          for (var i = 0; i < len; i++) dst[i] = src[len - 1 - i];
        }
        self.revBuf = out;
      }).catch(function () { self.revBuf = null; });
    },
    playReverse: function () {
      if (!this.revBuf || !this.canSound()) return;
      try {
        var c = Sound.ctx, s = c.createBufferSource(), g = c.createGain();
        s.buffer = this.revBuf; s.playbackRate.value = 0.7;
        g.gain.value = 1.6 * Sound.volMusic / 100;
        s.connect(g); g.connect(Sound.master); s.start();
        this.revSrc = s;
      } catch (e) {}
    },

    // ---------- шаги за кадром слева (ложная тревога в затишье)
    offSteps: function () {
      if (!this.canSound()) return;
      try {
        var c = Sound.ctx, pan = c.createStereoPanner(), lp = c.createBiquadFilter();
        pan.pan.value = -0.9; lp.type = 'lowpass'; lp.frequency.value = 600;
        lp.connect(pan); pan.connect(Sound.master);
        for (var i = 0; i < 4; i++) {
          var t = c.currentTime + i * 0.42, o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
          o.connect(g); g.connect(lp); o.start(t); o.stop(t + 0.2);
        }
      } catch (e) {}
    },
    // гром для молний
    thunder: function () { this.noiseBand(1.4, 0.45, 160, 60, 0.7, 0); Sound.tone('sine', 55, 35, 0.8, 0.3); },
    // щелчок «вылета»: звук обрывается
    click: function () { Sound.tone('square', 1800, 1800, 0.012, 0.4); },

    // фоновая музыка замедляется и становится низкой и жуткой
    musicCreepy: function (on) {
      Music.init();
      var a = Music.el;
      if (!a) return;
      try {
        a.preservesPitch = !on; a.mozPreservesPitch = !on; a.webkitPreservesPitch = !on;
        a.playbackRate = on ? 0.6 : 1;
      } catch (e) {}
      if (!on) Music.applyVolume();
    },

    // низкий гул, пока идёт погоня
    startDrone: function () {
      var c = Sound.ctx;
      if (!c || this.drone) return;
      try {
        var g = c.createGain(); g.gain.value = 0;
        var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
        var o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
        o1.type = 'sine'; o1.frequency.value = 55;
        o2.type = 'sine'; o2.frequency.value = 58.3;
        o3.type = 'sawtooth'; o3.frequency.value = 27.5;
        o1.connect(g); o2.connect(g); o3.connect(lp); lp.connect(g); g.connect(Sound.master);
        // «сирена»: высокий воющий звук, поднимается вместе с паникой
        var sir = c.createOscillator(), sirLp = c.createBiquadFilter(), sirG = c.createGain(), vib = c.createOscillator(), vibG = c.createGain();
        sir.type = 'sawtooth'; sir.frequency.value = 220;
        sirLp.type = 'lowpass'; sirLp.frequency.value = 900;
        vib.frequency.value = 5.5; vibG.gain.value = 9;
        vib.connect(vibG); vibG.connect(sir.frequency);
        sirG.gain.value = 0;
        sir.connect(sirLp); sirLp.connect(sirG); sirG.connect(Sound.master);
        // нисходящий тон Шепарда: 7 синусов на октаву друг от друга бесконечно скользят вниз
        var shep = [], shepG = c.createGain(); shepG.gain.value = 0; shepG.connect(Sound.master);
        for (var si = 0; si < 7; si++) {
          var so = c.createOscillator(), sg = c.createGain();
          so.type = 'sine'; sg.gain.value = 0; so.connect(sg); sg.connect(shepG); so.start();
          shep.push({ o: so, g: sg });
        }
        o1.start(); o2.start(); o3.start(); sir.start(); vib.start();
        this.drone = { g: g, osc: [o1, o2, o3, sir, vib].concat(shep.map(function (q) { return q.o; })),
          sir: sir, sirG: sirG, sirLp: sirLp, shep: shep, shepG: shepG };
      } catch (e) { this.drone = null; }
    },
    stopDrone: function () {
      if (!this.drone) return;
      try { this.drone.osc.forEach(function (o) { o.stop(); }); } catch (e) {}
      this.drone = null;
    },
    audioTick: function () {
      if (this.on) this.tickSynth();
      if (this.on) this.tickBeat();
      if (!this.drone) return;
      var loud = this.on && (game.mode === 'play' || game.mode === 'respawn') && Sound.volSfx > 0 && this.silentT <= 0 && this.fakeT <= 0;
      this.drone.g.gain.value = loud ? 0.45 + this.close * 0.35 : 0;
      this.drone.sirG.gain.value = loud && (this.phase === 'chase' || this.phase === 'moon' || this.phase === 'boss') ? 0.015 + this.close * 0.09 : 0;
      // тон Шепарда
      var ph = (time * 0.07) % 1;
      this.drone.shepG.gain.value = loud && (this.phase === 'chase' || this.phase === 'moon' || this.phase === 'boss') ? 0.05 + this.close * 0.06 + (this.rush ? 0.04 : 0) : 0;
      this.drone.shep.forEach(function (q, i) {
        var fr = 40 * Math.pow(2, i + 1 - ph), lg = Math.log(fr / 320) / Math.LN2;
        q.o.frequency.value = fr;
        q.g.gain.value = Math.exp(-(lg * lg) / (2 * 1.1 * 1.1)) * 0.25;
      });
      // «зажёванная кассета»: твоя музыка плывёт и пропадает
      if (Music.el && this.phase === 'chase' && game.mode === 'play' && !this.trackDone) {
        try {
          Music.el.playbackRate = (this.rush ? 0.5 : 0.6) + Math.sin(time * 0.9) * 0.05 + Math.sin(time * 3.1) * 0.015;
          var dropping = this.tapeDrop > 0 || this.silentT > 0 || this.fakeT > 0;
          Music.el.volume = dropping ? 0 : Sound.volMusic / 100 * 0.55;
        } catch (e) {}
      }
      this.drone.sir.frequency.value = 180 + this.close * 260 + Math.sin(time * 0.7) * 20;
      this.drone.sirLp.frequency.value = 500 + this.close * 1800;
    },

    say: function (text, dur) { this.msg = { text: text, t: 0, dur: dur || 2 }; },

    // --- генераторы страшных звуков (всё синтезируется) ---
    canSound: function () { return Sound.usable(); },
    // шум через полосовой фильтр с огибающей: шёпот, дыхание
    noiseBand: function (dur, vol, f0, f1, q, delay) {
      if (!this.canSound()) return;
      try {
        var c = Sound.ctx, t = c.currentTime + (delay || 0), len = Math.floor(c.sampleRate * dur);
        var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        var src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = q || 2;
        bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        src.connect(bp); bp.connect(g); g.connect(Sound.master);
        src.start(t);
      } catch (e) {}
    },
    // рык с дрожью (амплитудная модуляция)
    growl: function (vol) {
      if (!this.canSound()) return;
      try {
        var c = Sound.ctx, t = c.currentTime;
        var o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(48, t + 1.1);
        lp.type = 'lowpass'; lp.frequency.value = 700;
        lfo.frequency.value = 22; lg.gain.value = vol * 0.6;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 1.1);
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(lp); lp.connect(g); g.connect(Sound.master);
        o.start(t); lfo.start(t); o.stop(t + 1.15); lfo.stop(t + 1.15);
      } catch (e) {}
      this.noiseBand(1.0, vol * 0.5, 200, 120, 1, 0);
    },
    // смех: «ха-ха-ха», понижающийся
    laugh: function () {
      if (!this.canSound()) return;
      for (var i = 0; i < 5; i++) {
        Sound.tone('square', 260 - i * 18, 200 - i * 18, 0.1, 0.18, i * 0.13);
        Sound.tone('sawtooth', 131 - i * 9, 100 - i * 9, 0.1, 0.12, i * 0.13);
      }
    },
    // музыка погони: бас-остинато на тритон, темп растёт, когда монстр ближе
    chasePulse: function () {
      if (!this.canSound() || this.silentT > 0 || this.fakeT > 0 || this.phase === 'boss') return;
      var n = this.pulseN++, closeV = this.close;
      var bass = n % 2 ? 58.27 : 41.2;                  // ми и си-бемоль — тритон, «дьявольский» интервал
      Sound.tone('square', bass * 2, bass * 2, 0.12, 0.22 + closeV * 0.15);
      Sound.tone('triangle', bass, bass, 0.16, 0.35);
      if (n % 4 === 0) {                                // резкий диссонанс
        Sound.tone('sawtooth', 466, 466, 0.09, 0.05 + closeV * 0.08);
        Sound.tone('sawtooth', 494, 494, 0.09, 0.05 + closeV * 0.08);
      }
      if (closeV > 0.6 && n % 2 === 0) Sound.tone('square', 1245, 1175, 0.05, 0.06);   // писк паники
    },

    update: function (dt) {
      if (this.msg) { this.msg.t += dt; if (this.msg.t > this.msg.dur) this.msg = null; }
      if (this.staticT > 0) this.staticT -= dt;
      if (this.flashT > 0) this.flashT -= dt;
      var p = player;

      if (game.mode === 'play' && this.phase === 'calm' && lvl.checkpointX !== null && p.x + p.w / 2 >= lvl.checkpointX) {
        this.startTransform();
        return;
      }
      if (game.mode === 'play' && this.phase === 'calm' && lvl.checkpointX !== null) {
        // чем ближе к чекпоинту, тем медленнее и тише музыка — затишье перед бурей
        var left = (lvl.checkpointX - (p.x + p.w / 2)) / T;
        var q = Math.max(0, Math.min(1, 1 - left / 18));
        if (Music.el) {
          try { Music.el.preservesPitch = false; Music.el.mozPreservesPitch = false; Music.el.webkitPreservesPitch = false; } catch (e) {}
          Music.el.playbackRate = 1 - q * 0.3;
          Music.el.volume = (Sound.volMusic / 100) * (1 - q * 0.85);
        }
        // солнце на миг мелькает силуэтом у горизонта — и пропадает
        if (!this.peekDone && p.x > 33 * T) { this.peekDone = true; this.peekT = 0.35; }
        if (this.peekT > 0) this.peekT -= dt;
        // шаги слева за кадром — а там никого
        if (p.x > 20 * T) { this.stepsT -= dt; if (this.stepsT <= 0) { this.offSteps(); this.stepsT = 14 + Math.random() * 8; } }
        // редкий далёкий шёпот: что-то не так
        if (p.x > 14 * T) {
          this.whisperT -= dt;
          if (this.whisperT <= 0) { this.noiseBand(1.6, 0.05 + q * 0.08, 2600, 1900, 6, 0); this.whisperT = 7 + Math.random() * 7 - q * 4; }
        }
      }
      if (game.mode === 'transform') { this.updateTransform(dt); return; }
      if (game.mode === 'caught') {
        this.scareT -= dt;
        if (this.scareT <= 0) this.afterCaught();
        return;
      }
      if (game.mode === 'crash') return;
      if (game.mode === 'moonintro') { this.updateMoonIntro(dt); return; }
      if (game.mode === 'towerintro') { this.updateTowerIntro(dt); return; }
      if (this.phase === 'chase' && game.mode === 'play') this.updateChase(dt);
      if (this.phase === 'moon' && game.mode === 'play') this.updateMoon(dt);
      if (this.phase === 'boss' && game.mode === 'play') this.updateBoss(dt);
      if (this.phase === 'moondead') this.updateMoonDead(dt);
      if (this.phase === 'done' && this.monster) {
        this.monster.dying -= dt;
        if (this.monster.dying <= 0) this.monster = null;
      }
    },

    // ---------- превращение
    startTransform: function () {
      var p = player;
      game.mode = 'transform';
      this.phase = 'transform';
      this.t = 0;
      p.vx = 0;
      Music.pause();
      Sound.play('scratch');
      this.staticT = 0.5;
      shake(4);
      this.monster = {
        x: p.x + p.w / 2 - Math.max(90, Math.min(115, view.w / 2 - 15)), y: p.y + p.h / 2 - 40, r: 50, k: 3, frame: 0, dying: 0,
        sx: view.w - 48 + 20 + cam.x, sy: 4 + 20 + cam.y            // откуда спускается (точка в небе)
      };
      this.sucked = false;
      this.screamed = false;
      this.swelled = false;
      this.makeBlood();
    },
    updateTransform: function (dt) {
      var t = (this.t += dt), m = this.monster;
      this.tint = Math.max(0, Math.min(1, (t - 0.15) / 1.1));
      if (t < 1.3 && Math.random() < 0.08) { this.staticT = 0.12; Sound.play('gulp'); }
      this.flashCool -= dt;
      if (t < 1.3 && Math.random() < 0.04 && this.flashCool <= 0) { this.flashT = 0.08; this.flashCool = 0.34; }
      if (t >= 0.35 && !this.swelled) { this.swelled = true; this.noiseBand(0.95, 0.35, 200, 4000, 1.5, 0); this.playReverse(); }   // вой и музыка задом наперёд
      if (t < 1.3) this.setTab(true, Math.floor(t * 8) % 2 ? 'Месть грибов' : 'ОНО ПРОСНУЛОСЬ');
      if (t >= 1.3 && !this.screamed) { this.screamed = true; Sound.play('roar'); Sound.play('scream'); this.growl(0.5); shake(6); this.flashT = 0.15; }
      if (t >= 1.3 && t < 2.1) shakeT = Math.max(shakeT, 0.05);
      if (t >= 2.1 && !this.sucked) {
        this.sucked = true;
        Sound.play('suck');
        enemies.forEach(function (e) {
          e.state = 'sucked'; e.st = 0; e.delay = Math.random() * 0.45;
          e.ox = e.x + e.w / 2; e.oy = e.y + e.h / 2; e.spin = Math.random() * 6;
        });
      }
      if (this.sucked) this.updateSucked(dt);
      if (t >= 3.5) {
        enemies = enemies.filter(function (e) { return e.state !== 'sucked'; });
        this.phase = 'chase';
        game.mode = 'play';
        this.say(this.visits > 1 ? 'ОПЯТЬ ТЫ. ' + this.visits + '-Й РАЗ' : 'БЕГИ!', 2);
        if (this.visits > 1) { var self2 = this; setTimeout(function () { if (self2.phase === 'chase') self2.say('БЕГИ!', 1.6); }, 2100); }
        this.setTab(true);
        this.spawnLate(-1);
        this.section = 0;
        this.takeSnapshot();
        this.lungeWait = 4;
        this.startDrone();
        this.musicCreepy(true);
        Music.applyVolume();
        if (Music.el) Music.el.volume = Sound.volMusic / 100 * 0.6;    // под музыку погони
        Music.play();
        this.beatT = 0.5;
        lvl.def = Object.assign({}, lvl.def, { name: 'БЕГИ' });
        hudCache.v = null; updateHud();
      }
    },
    updateSucked: function (dt) {
      var m = this.monster, mouthX = m.x, mouthY = m.y + 10;
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        if (e.state !== 'sucked') continue;
        e.st += dt;
        var q = Math.max(0, Math.min(1, (e.st - e.delay) / 0.9));
        var ease = q * q;
        var ang = e.spin + q * 9, rad = (1 - q) * 30;
        e.vxs = e.ox + (mouthX - e.ox) * ease + Math.cos(ang) * rad;
        e.vys = e.oy + (mouthY - e.oy) * ease + Math.sin(ang) * rad;
        e.scale = 1 - q * 0.9;
        if (q >= 1) { enemies.splice(i, 1); Sound.play('gulp'); }
      }
    },

    // ---------- погоня
    // герои внутри погони появляются после превращения (и заново после рестарта секции)
    spawnLate: function (fromX) {
      enemies = enemies.filter(function (e) { return e.state === 'squashed'; });
      lvl.lateEnemies.forEach(function (q) {
        if (q.x <= fromX) return;
        var e = makeEnemy('j', q.x, q.y);
        e.active = false;
        enemies.push(e);
      });
    },
    // снимок карты в начале секции: после смерти мир восстанавливается
    takeSnapshot: function () {
      var cp = function (a) { return a.map(function (o) { return Object.assign({}, o); }); };
      var sx = this.section === 0 ? lvl.checkpointX : lvl.sections[this.section - 1];
      this.snap = { grid: lvl.grid.map(function (r) { return r.slice(); }), coins: cp(coins), hearts: cp(hearts), orbs: cp(orbs), decor: cp(lvl.decor).map(function (d) { delete d.suck; return d; }), x: sx };
      this.secDeaths = 0;
    },
    sectionStartX: function () { return this.snap ? this.snap.x : player.x; },
    restartSection: function () {
      var p = player, sn = this.snap, cp = function (a) { return a.map(function (o) { return Object.assign({}, o); }); };
      this.shots = []; this.rain = []; this.waves = []; this.grabT = 0; this.spitWind = 0; this.spitWait = 4 + Math.random() * 2;
      if (this.phase === 'moon' || this.phase === 'boss') {                 // башня луны: к последнему чекпоинту
        lvl.grid = sn.grid.map(function (r) { return r.slice(); });
        coins = cp(sn.coins);
        lvl.crumble = {}; particles = [];
        setMega(false);
        p.x = sn.pos.x; p.y = sn.pos.y; p.vx = 0; p.vy = 0; p.inv = 0.5; p.hurtT = 0;
        var mm = this.monster;
        if (this.phase === 'moon') { mm.y = p.y + view.h * 0.55 + 50; mm.x = p.x; this.moonClimb = Math.max(0, this.moonClimb - 6); this.restartDelay = 0.8; }
        else { this.boss.state = 'sink'; this.boss.t = 1.6; this.boss.hitT = 0; mm.y = lvl.arena.y + mm.r + 40; }
        snapCamera();
        game.mode = 'play';
        return;
      }
      if (sn && sn.decor) lvl.decor = cp(sn.decor);
      var sx0 = this.sectionStartX();
      lvl.grabs.forEach(function (g) { if (g.x > sx0) g.done = false; });
      this.inSpeed = false; this.wasSpeed = false; if (this.monster) this.monster.k = 3;
      if (sn) {
        lvl.grid = sn.grid.map(function (r) { return r.slice(); });
        coins = cp(sn.coins); hearts = cp(sn.hearts); orbs = cp(sn.orbs);
      }
      lvl.crumble = {};
      particles = [];
      setMega(false);
      if (game.cheats.alpha) setMega(true);
      this.spawnLate(this.sectionStartX() - 1);
      // грибок — на землю в начале секции, монстр — на полэкрана позади
      this.placeOnGround(this.sectionStartX());
      p.inv = 0.5; p.vx = 0; p.vy = 0; p.hurtT = 0; p.onFlag = false;
      var m = this.monster;
      m.x = p.x - Math.max(105, view.w * 0.5); m.y = p.y - 20; m.hidden = false;
      this.lungeT = 0; this.windupT = 0; this.lungeWait = 3.5 + Math.random() * 1.5; this.silentT = 0; this.fakeT = 0;
      this.restartDelay = 0.6;                         // монстр даёт секунду сориентироваться
      if (this.section <= 2) this.quietDone = false;      // «пустая» пауза повторяется вместе со своей секцией
      this.rush = this.section === 3 && this.crashDone;
      this.oneBit = this.rush;
      this.close = 0;
      snapCamera();
      game.mode = 'play';
      Music.play();
    },
    placeOnGround: function (x) {
      var p = player;
      for (var tx = Math.max(1, Math.floor(x / T)); tx < lvl.w - 2; tx++) {
        for (var ty = 2; ty < lvl.h; ty++) {
          if (isSolid(tileAt(tx, ty)) && tileAt(tx, ty) !== 'v' && isSolid(tileAt(tx + 1, ty)) &&
              !isSolid(tileAt(tx, ty - 1)) && !isSolid(tileAt(tx, ty - 2)) && tileAt(tx, ty - 1) !== '^' && tileAt(tx + 1, ty - 1) !== '^') {
            p.x = tx * T + 2; p.y = ty * T - p.h;
            p.safe.x = p.x + p.w / 2; p.safe.y = p.y + p.h;
            return;
          }
        }
      }
    },

    updateChase: function (dt) {
      var p = player, m = this.monster;
      if (!m) return;
      var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      var dist = pcx - m.x;
      this.chaseTime += dt;
      var self = this;

      // рука из земли: внезапно хватает за ногу, грибок застывает на секунду
      if (this.grabT > 0) this.grabT -= dt;
      lvl.grabs.forEach(function (g) {
        if (!g.done && !self.inSpeed && p.onGround && Math.abs(pcx - g.x) < 7) {
          g.done = true;
          self.grabT = 1.0; self.grabX = g.x; self.grabY = p.y + p.h;
          Sound.tone('sawtooth', 900, 120, 0.25, 0.4); Sound.tone('square', 1300, 200, 0.2, 0.25);   // резкий визг
          self.noiseBand(0.35, 0.6, 400, 150, 1, 0);                                                  // хруст земли
          shake(6);
          if (self.flashCool <= 0) { self.flashT = 0.08; self.flashCool = 0.4; }
          for (var i = 0; i < 6; i++) particles.push({ kind: 'brick', tile: 1, x: g.x - 6 + i * 2, y: g.y - 4, vx: (Math.random() - 0.5) * 120, vy: -150 - Math.random() * 100, sx: (i % 2) * 8, sy: 0, t: 0, life: 0.6 });
        }
      });
      this.flashCool -= dt;

      // погоня на скорости: грибок несётся сам, огромное солнце летит рядом
      var sz = lvl.def.speedZone;
      this.inSpeed = !!sz && pcx > sz[0] * T && pcx < sz[1] * T;
      if (this.inSpeed && !this.wasSpeed) { this.say('ГОНИ!', 1.4); this.growl(0.6); Sound.play('scream'); shake(6); m.k = 5; }
      if (!this.inSpeed && this.wasSpeed) { m.k = 3; m.x = p.x - Math.max(110, view.w * 0.5); }
      this.wasSpeed = this.inSpeed;
      if (this.inSpeed) {
        m.x += (p.x - 40 - m.x) * Math.min(1, dt * 4);
        m.y += (p.y - 70 - m.y) * Math.min(1, dt * 4);
        this.close = 0.85;
        if (Math.random() < dt * 2) shake(3);
        this.eatAround(m);
        this.pulseT -= dt; if (this.pulseT <= 0) { this.chasePulse(); this.pulseT = 0.13; }
        this.beatT -= dt; if (this.beatT <= 0) { Sound.play('heart'); this.beatPulse = 1; this.beatT = 0.3; }
        this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
        this.updateCorpses(dt, m);
        return;                                       // на скорости монстр не ловит — убивают только ямы и шипы
      }

      // солнце засасывает трупы по дороге
      this.updateCorpses(dt, m);
      // и швыряет их вперёд, чтобы преградить путь
      this.updateShots(dt, m, p);

      // новая секция?
      var nextX = lvl.sections[this.section];
      if (nextX !== undefined && pcx >= nextX) {
        this.section++;
        this.takeSnapshot();
        if (this.section <= 2) {                                         // новая фаза — солнце страшнее
          this.say(this.section === 1 ? 'ОНО ЗЛИТСЯ' : 'ОНО ГОЛОДНО', 1.6);
          Sound.play('scream'); this.growl(0.7); shake(6);
          if (this.flashCool <= 0) { this.flashT = 0.1; this.flashCool = 0.4; }
        }
        Sound.tone('triangle', 523, 494, 0.5, 0.15); Sound.tone('triangle', 659, 622, 0.5, 0.1, 0.1);   // расстроенный звон «чекпоинта»
      }
      // «пустая» пауза: монстр замолкает на 3 секунды, потом бросается
      if (!this.quietDone && lvl.quietX !== null && pcx >= lvl.quietX) { this.quietDone = true; this.silentT = 3; this.forceLunge = true; }
      if (this.silentT > 0) { this.silentT -= dt; if (this.silentT <= 0 && this.forceLunge) { this.forceLunge = false; this.windupT = 0.45; this.windupSound(); } }
      // фальшивый вылет перед финальным рывком
      if (!this.crashDone && lvl.crashX !== null && pcx >= lvl.crashX) { this.startCrash(); return; }
      // ложная победа
      if (!this.fakeDone && lvl.fakeFlag && pcx >= lvl.fakeFlag.x - 1) { this.startFake(); }
      if (this.fakeT > 0) { this.updateFake(dt); }
      if (this.tapeDrop > 0) this.tapeDrop -= dt;
      this.tapeT -= dt;
      if (this.tapeT <= 0) { this.tapeDrop = 0.25 + Math.random() * 0.3; this.tapeT = 4 + Math.random() * 5; }

      this.close = m.hidden ? 0 : Math.max(0, Math.min(1, 1 - (dist - 60) / 200));
      // скорость: доля от бега грибка по секциям; в финальном рывке — быстрее
      var mult = (lvl.def.sectionSpeed || [0.85, 0.9, 0.95, 1.03])[Math.min(this.section, 3)];
      if (this.rush) mult = Math.max(mult, 1.03);
      var speed = RUN_SPEED * mult;
      if (m.x + m.r < cam.x || dist > view.w * 0.8) speed = RUN_SPEED * 1.3;   // за краем экрана — догоняет
      // рывок с предупреждением: вдох, вспышка глаз, «вжух» — и бросок
      if (this.windupT > 0) {
        this.windupT -= dt;
        speed *= 0.5;                                   // замирает перед броском
        if (this.windupT <= 0) { this.lungeT = 0.45; this.growl(0.45); shake(4); }
      } else if (this.silentT <= 0 && !m.hidden) {
        this.lungeWait -= dt;
        if (this.lungeWait <= 0 && dist > 85) { this.windupT = 0.4; this.windupSound(); this.lungeWait = 4 + Math.random() * 2.5; }
      }
      if (this.lungeT > 0) { this.lungeT -= dt; speed += 70; }
      if (this.grabT > 0) speed = Math.min(speed, RUN_SPEED * 0.45);     // пока держит рука — монстр не спешит, смакует
      if (this.restartDelay > 0) { this.restartDelay -= dt; speed = 0; }
      if (!m.hidden) m.x += speed * dt;

      // музыка погони
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.chasePulse(); this.pulseT = (this.rush ? 0.16 : 0.32) - this.close * (this.rush ? 0.05 : 0.19); }
      // паническое дыхание
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.noiseBand(0.28, 0.12 + this.close * 0.12, this.breathIn ? 700 : 1300, this.breathIn ? 1300 : 600, 1.2, 0);
        this.breathIn = !this.breathIn;
        this.breathT = 0.75 - this.close * 0.45;
      }
      // рык и смех (молчит в «пустой» паузе)
      if (this.silentT <= 0 && !m.hidden) {
        this.growlT -= dt;
        if (this.growlT <= 0) { this.growl(0.25 + this.close * 0.2); this.growlT = 3 + Math.random() * 3; }
        this.laughT -= dt;
        if (this.laughT <= 0 && this.close > 0.4) { this.laugh(); this.laughT = 7 + Math.random() * 5; }
      }
      // кадры-вспышки (не чаще раза в 5 секунд)
      if (this.subT > 0) this.subT -= dt;
      this.subWait -= dt;
      if (this.subWait <= 0 && this.close > 0.35 && this.silentT <= 0) {
        this.subT = 0.07; this.subKind = Math.random() < 0.5 ? 'face' : ['ОНО РЯДОМ', 'ПОЗДНО', 'НЕ ОГЛЯДЫВАЙСЯ', 'ТЫ СЛЕДУЮЩИЙ'][Math.floor(Math.random() * 4)];
        this.subWait = 5 + Math.random() * 5;
        Sound.play('gulp');
      }
      // тьма с молниями
      var dk = lvl.def.dark;
      this.inDark = !!dk && pcx > dk[0] * T && pcx < dk[1] * T;
      if (this.lightning > 0) this.lightning -= dt;
      if (this.inDark) {
        this.lightT -= dt;
        if (this.lightT <= 0) { this.lightning = 0.14; this.lightT = 2 + Math.random(); this.thunder(); }
      }
      // декорации меняются, пока на них не смотришь
      var left = cam.x - 48, right = cam.x + view.w + 48;
      lvl.decor.forEach(function (d) {
        if ((d.x < left || d.x > right) && Math.random() < dt * 0.5) {
          if (d.type === 'D' || d.type === 'd') d.type = d.type === 'd' ? 'D' : 'd';
          d.seed = (d.seed + 1) % 10;
        }
      });
      // обломки сыплются с неба
      if (Math.random() < dt * 3) this.debris.push({ x: cam.x + Math.random() * view.w, y: cam.y - 10, vy: 60 + Math.random() * 80, s: 2 + Math.floor(Math.random() * 3) });
      for (var di = this.debris.length - 1; di >= 0; di--) {
        var dd = this.debris[di]; dd.vy += 300 * dt; dd.y += dd.vy * dt;
        if (dd.y > cam.y + view.h + 10) this.debris.splice(di, 1);
      }
      if (this.close > 0.55 || this.rush) shakeT = Math.max(shakeT, 0.03), shakeAmp = Math.max(1, Math.round(Math.max(this.close, this.rush ? 0.6 : 0) * 3));
      var ty = Math.max(m.r * 0.6, Math.min(lvl.h * T - m.r * 0.4, pcy - 8));
      m.y += (ty - m.y) * Math.min(1, dt * 2.5);
      m.frame += dt;
      if (!m.hidden) this.eatAround(m);
      // сердце бьётся тем чаще, чем ближе монстр
      this.beatT -= dt;
      if (this.beatT <= 0 && this.fakeT <= 0) { Sound.play('heart'); this.beatPulse = 1; this.beatT = Math.max(0.28, Math.min(1.2, dist / 300)); }
      this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
      // поймал?
      if (!m.hidden && !game.cheats.god && Math.hypot(pcx - m.x, pcy - m.y) < m.r * 0.8 && p.inv <= 0) this.die('caught');
    },
    // трупы рядом с монстром отрываются от земли и, кружась, улетают ему в рот
    updateCorpses: function (dt, m) {
      var keep = [];
      for (var i = 0; i < lvl.decor.length; i++) {
        var d = lvl.decor[i];
        if ((d.type === 'd' || d.type === 'D') && !d.suck && Math.hypot(d.x + 8 - m.x, d.y + 8 - m.y) < m.r + 60) {
          d.suck = { t: 0, x0: d.x + 8, y0: d.y + 8 };
          Sound.tone('sine', 120, 500, 0.5, 0.2);
        }
        if (d.suck) {
          d.suck.t += dt;
          if (d.suck.t >= 0.75) { Sound.play('gulp'); m.ate = (m.ate || 0) + 1; continue; }
        }
        keep.push(d);
      }
      lvl.decor = keep;
    },
    // плевок трупом: монстр открывает пасть (предупреждение), труп летит дугой вперёд; на земле — красный крест
    updateShots: function (dt, m, p) {
      var self = this;
      if (this.section === 2 && !m.hidden && this.silentT <= 0 && this.grabT <= 0) {
        if (this.spitWind > 0) {
          this.spitWind -= dt;
          if (this.spitWind <= 0) this.launchShot(m, p);
        } else {
          this.spitWait -= dt;
          if (this.spitWait <= 0) { this.spitWind = 0.45; this.spitWait = 4.5 + Math.random() * 3; Sound.tone('sawtooth', 200, 600, 0.4, 0.2); this.noiseBand(0.4, 0.25, 300, 1400, 1.5, 0); }
        }
      }
      for (var i = this.shots.length - 1; i >= 0; i--) {
        var q = this.shots[i];
        q.vy += 620 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += dt * 9;
        var box = { x: q.x - 7, y: q.y - 6, w: 14, h: 12 };
        if (game.mode === 'play' && p.inv <= 0 && !game.cheats.god && overlap(p, box)) { this.shots.splice(i, 1); this.die('hit'); return; }
        if (q.y >= q.ty) {
          this.shots.splice(i, 1);
          var tx = Math.floor(q.x / T), ty = Math.floor((q.ty + 2) / T);
          if (isSolid(tileAt(tx, ty))) {
            lvl.decor.push({ type: 'D', x: tx * T, y: (ty - 1) * T, seed: Math.floor(Math.random() * 10) });
            Sound.tone('sine', 70, 35, 0.3, 0.5); this.noiseBand(0.25, 0.35, 500, 150, 1, 0); shake(3);
            for (var k = 0; k < 4; k++) particles.push({ kind: 'brick', tile: 1, x: q.x, y: q.ty - 4, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 80, sx: (k % 2) * 8, sy: 0, t: 0, life: 0.6 });
          }
        }
      }
    },
    launchShot: function (m, p) {
      var sx = m.x + 18, sy = m.y + 8;
      var tx = p.x + p.w / 2 + 50 + Math.random() * 50 + p.vx * 0.4;
      var col = Math.floor(tx / T), ty = lvl.h * T + 40;
      for (var r = 0; r < lvl.h; r++) if (isSolid(tileAt(col, r))) { ty = r * T; break; }
      var vy = -260, g = 620, dy = ty - sy;
      var t = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(-40, dy))) / g;
      this.shots.push({ x: sx, y: sy, vx: (tx - sx) / Math.max(0.3, t), vy: vy, ty: ty, tx: tx, rot: 0 });
      Sound.tone('square', 300, 80, 0.2, 0.35); this.noiseBand(0.2, 0.4, 2000, 400, 1, 0);
    },

    // ---------- ЛУНА: забирает флаг, поднимается снизу, бой на вершине башни
    sunStage: function () { return Math.max(0, Math.min(3, this.section)); },
    moonStage: function () { return this.boss ? Math.max(0, Math.min(2, 3 - this.boss.hp)) : 0; },
    curLyrics: function () { var st = this.moonStage(); return st === 0 ? this.LYRICS : st === 1 ? this.LYRICS2 : this.LYRICS3; },
    isMoon: function () { return this.phase === 'moon' || this.phase === 'boss' || this.phase === 'moondead' || (game.mode === 'moonintro' && this.moonT > 1.2); },
    startMoonIntro: function () {
      game.mode = 'moonintro';
      this.moonT = 0;
      this.flagTaken = false;
      this.moonSaid = false; this.moonLaugh = false; this.moonFall = false;
      player.vx = 0;
    },
    updateMoonIntro: function (dt) {
      var t = (this.moonT += dt), p = player, f = lvl.flag;
      if (this.monster && this.monster.dying > 0) { this.monster.dying -= dt; if (this.monster.dying <= 0) this.monster = null; }
      this.moonTint = Math.max(0, Math.min(1, (t - 1.2) / 1.0));
      if (t > 1.2 && !this.moonSaid) { this.moonSaid = true; this.noiseBand(1.2, 0.4, 3000, 200, 1, 0); Sound.tone('sine', 196, 185, 2.5, 0.2); this.setTab(true, 'ЛУНА'); }
      // луна спускается к флагу
      var fx = f.x, fy = (f.ty - FLAG_POLE - 1) * T;
      if (t < 2.4) { this.moonX = fx; this.moonY = cam.y - 70 + (fy - 10 - (cam.y - 70)) * Math.max(0, (t - 1.2) / 1.2); }
      else if (t < 3.4) {
        if (!this.moonLaugh) { this.moonLaugh = true; this.flagTaken = true; this.laugh(); this.growl(0.5); this.say('ЭТО МОЙ ФЛАГ', 1.6); }
        this.moonY = fy - 10 - (t - 2.4) * 160;                 // уносит флаг вверх
      } else if (lvl.castle) {                                  // грибок сам входит в замок за флагом
        if (p.x + p.w / 2 < lvl.castle.x) { p.x += 110 * dt; p.vx = 110; p.face = 1; p.anim += dt; p.onGround = true; }
        else { p.vx = 0; this.fadeT += dt; if (!this.doorSound) { this.doorSound = true; Sound.tone('square', 90, 50, 0.6, 0.4); this.noiseBand(0.6, 0.3, 300, 100, 1, 0); } }
        if (this.fadeT >= 0.7) { this.fadeT = 0; this.doorSound = false; this.startTower(); }
        return;
      } else if (!this.moonFall) {
        this.moonFall = true;                                   // земля проваливается под грибком
        var ptx = Math.floor((p.x + p.w / 2) / T);
        for (var x = ptx - 3; x <= ptx + 3; x++) for (var y = 0; y < lvl.h; y++) if (isSolid(tileAt(x, y))) setTile(x, y, '.');
        Sound.play('fall'); shake(8); this.noiseBand(0.8, 0.5, 300, 80, 1, 0);
      }
      if (this.moonFall) { p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL); p.y += p.vy * dt; }
      if (t >= 4.4) this.startTower();
    },
    startTower: function () {
      var def = window.MUSHROOM_TOWER;
      if (!def) { this.ending(); return; }
      buildLevel(def);
      player = makePlayer();
      this.phase = 'moon';
      this.moonTint = 1;
      this.flagTaken = true;
      this.oneBit = false; this.rush = false; this.inSpeed = false; this.shots = []; this.grabT = 0;
      var p = player;
      this.monster = { x: p.x + p.w / 2, y: p.y + view.h * 0.55 + 50, r: 50, k: 3, moon: true, dying: 0 };
      this.restartDelay = 1.2;
      this.snap = { grid: lvl.grid.map(function (r) { return r.slice(); }), coins: coins.map(function (o) { return Object.assign({}, o); }),
        hearts: [], orbs: [], decor: [], x: p.x, pos: { x: p.x, y: p.y } };
      this.secDeaths = 0;
      this.moonClimb = 0;
      snapCamera();
      // заставка: луна пробивает стену снизу слева и откусывает кусок замка
      game.mode = 'towerintro';
      this.introT = 0; this.bitten = false; this.burst = false;
      this.monster.x = -60; this.monster.y = (lvl.h - 3) * T - 30;
      this.setTab(true, 'ОНА ПОДНИМАЕТСЯ');
      lvl.def = Object.assign({}, lvl.def, { name: 'ВВЕРХ' });
      hudCache.v = null; updateHud();
      this.startDrone();
    },
    updateTowerIntro: function (dt) {
      var t = (this.introT += dt), m = this.monster, p = player, floorY = (lvl.h - 3) * T;
      if (t < 0.5) { shakeT = Math.max(shakeT, 0.05); shakeAmp = 2; if (!this.rumble) { this.rumble = true; this.noiseBand(0.6, 0.4, 120, 60, 0.8, 0); this.say('…', 0.4); } }
      else if (t < 1.1) {                                     // врывается сквозь стену
        if (!this.burst) { this.burst = true; Sound.play('scream'); this.growl(0.7); shake(8); }
        m.x = -60 + (2 * T + 60) * ((t - 0.5) / 0.6);          // только левый нижний угол
        m.y = floorY - 34;
        this.eatAround(m);
      } else if (t < 1.8) {                                   // ХРУМ: откусывает кусок замка
        if (!this.bitten) {
          this.bitten = true;
          var bx = 1.5 * T, by = floorY + 8;
          for (var ty = 0; ty < lvl.h; ty++) for (var tx = 0; tx < lvl.w; tx++) {
            if (Math.hypot(tx * T + 8 - bx, ty * T + 8 - by) < 2.4 * T && lvl.grid[ty][tx] !== '.') {
              setTile(tx, ty, '.');
              particles.push({ kind: 'brick', tile: 2, x: tx * T, y: ty * T, vx: (Math.random() - 0.5) * 220, vy: -200 - Math.random() * 150, sx: 0, sy: 0, t: 0, life: 1.1 });
            }
          }
          Sound.play('smash'); Sound.tone('square', 160, 40, 0.3, 0.5); this.noiseBand(0.4, 0.6, 900, 200, 1, 0); shake(10);
          this.say('ХРУМ!', 1.2);
        }
        m.y = floorY - 34 + Math.sin((t - 1.1) * 30) * 2;   // жуёт
      } else if (t < 2.4) {
        m.y += 260 * dt;                                       // уходит вниз, в откушенную дыру
      } else {
        this.rumble = false;
        m.x = p.x + p.w / 2; m.y = p.y + view.h * 0.55 + 50;
        this.snap = { grid: lvl.grid.map(function (r) { return r.slice(); }), coins: coins.map(function (o) { return Object.assign({}, o); }),
          hearts: [], orbs: [], decor: [], x: p.x, pos: { x: p.x, y: p.y } };
        this.restartDelay = 0.6;
        game.mode = 'play';
        this.say('ВВЕРХ!', 1.8);
      }
    },
    updateMoon: function (dt) {
      var p = player, m = this.monster, self = this;
      if (!m) return;
      var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      this.moonClimb += dt;
      // чекпоинты башни
      lvl.towerChecks.forEach(function (c) {
        if (!c.done && p.y <= c.y + 2 && p.onGround) {
          c.done = true;
          self.snap = { grid: lvl.grid.map(function (r) { return r.slice(); }), coins: coins.map(function (o) { return Object.assign({}, o); }),
            hearts: [], orbs: [], decor: [], x: c.x, pos: { x: c.x + 2, y: c.y } };
          self.secDeaths = 0;
          Sound.tone('triangle', 523, 494, 0.5, 0.15);
        }
      });
      // дошёл до арены — бой
      if (lvl.arena && p.onGround && p.y + p.h <= lvl.arena.y + 1) { this.startBoss(); return; }
      var top = m.y - m.r, gap = top - (p.y + p.h);
      this.close = Math.max(0, Math.min(1, 1 - gap / 170));
      var speed = 20 + Math.min(12, this.moonClimb * 0.3);               // луна поднимается всё быстрее (20 → 32 px/с)
      if (top > cam.y + view.h + 30) speed = 75;                          // отстала за краем — догоняет
      if (this.restartDelay > 0) { this.restartDelay -= dt; speed = 0; }
      m.y -= speed * dt;
      var lw = lvl.w * T;
      m.x += (Math.max(m.r * 0.6, Math.min(lw - m.r * 0.6, pcx)) - m.x) * Math.min(1, dt * 1.5);
      m.frame = (m.frame || 0) + dt;
      this.eatAround(m);
      this.panicAudio(dt, gap + 60);
      if (!game.cheats.god && p.inv <= 0 && (Math.hypot(pcx - m.x, pcy - m.y) < m.r * 0.8 || p.y > m.y)) this.die('caught');
    },
    // общий «панический» звук: сердце, дыхание, рык
    panicAudio: function (dt, dist) {
      this.beatT -= dt;
      if (this.beatT <= 0) { Sound.play('heart'); this.beatPulse = 1; this.beatT = Math.max(0.28, Math.min(1.2, dist / 300)); }
      this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.noiseBand(0.28, 0.12 + this.close * 0.12, this.breathIn ? 700 : 1300, this.breathIn ? 1300 : 600, 1.2, 0);
        this.breathIn = !this.breathIn; this.breathT = 0.75 - this.close * 0.45;
      }
      this.growlT -= dt;
      if (this.growlT <= 0) { this.growl(0.25 + this.close * 0.2); this.growlT = 3 + Math.random() * 3; }
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.chasePulse(); this.pulseT = (this.phase === 'boss' ? 0.18 : 0.3) - this.close * 0.1; }
    },
    startBoss: function () {
      var a = lvl.arena, m = this.monster;
      this.phase = 'boss';
      this.boss = { hp: 3, state: 'sink', t: 1.6, shot: false, hitT: 0, transT: 0, bt: 0, bpm: 92, lastBeat: -1 };
      this.rain = []; this.waves = [];
      this.beatOn = true; this.synthOn = false; this.beatStep = 0; this.beatNext = 0;
      Music.pause();
      m.x = a.x; m.y = a.y + m.r + 40;
      this.snap = { grid: lvl.grid.map(function (r) { return r.slice(); }), coins: [], hearts: [], orbs: [], decor: [], x: player.x, pos: { x: player.x, y: player.y } };
      this.say('ПРЫГАЙ ЕЙ НА ГОЛОВУ!', 2.4);
      this.setTab(true, '♪ БОЙ ♪');
      Sound.play('scream'); shake(5);
    },
    updateBoss: function (dt) {
      var p = player, m = this.monster, b = this.boss, a = lvl.arena, self = this;
      var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      var ph = 4 - b.hp;                                               // фаза 1..3
      if (b.hitT > 0) b.hitT -= dt;
      if (b.transT > 0) b.transT -= dt;
      b.bt += dt;
      var barLen = 4 * 60 / b.bpm, beatLen = barLen / 4, bar = Math.floor(b.bt / barLen), frac = (b.bt % barLen) / barLen;
      var lowY = a.y + m.r + 40, highY = a.y + m.r * 0.25, topY = a.y - 92 - (ph - 1) * 22;
      // фаза 1: высунулась-высунулась-спряталась-прыжок; фаза 2: прыжков больше; фаза 3: два прыжка подряд
      var CYC = [null, ['rise', 'rise', 'sink', 'leap'], ['rise', 'leap', 'sink', 'leap'], ['rise', 'leap', 'leap', 'sink']][ph];
      var cyc = bar % 4, st = CYC[cyc];
      b.state = (b.hitT > 0 || b.transT > 0) ? 'sink' : st;
      if (b.state === 'leap') m.y = lowY - Math.sin(frac * Math.PI) * (lowY - topY);
      else m.y += Math.max(-260 * dt, Math.min(260 * dt, (b.state === 'rise' ? highY : lowY) - m.y));
      // предупреждение перед прыжком
      if (CYC[(cyc + 1) % 4] === 'leap' && st !== 'leap' && frac > 0.7 && b.warnBar !== bar) { b.warnBar = bar; this.growl(0.6); this.say('!', 0.5); }
      // приземление после прыжка: с 2-й фазы по полу бегут ударные волны — перепрыгни
      if (b.state === 'leap' && frac > 0.9 && b.landBar !== bar) {
        b.landBar = bar;
        if (ph >= 2) {
          this.waves.push({ x: a.x - 40, dir: -1 }, { x: a.x + 40, dir: 1 });
          Sound.tone('sine', 60, 30, 0.4, 0.6); this.noiseBand(0.3, 0.4, 400, 120, 1, 0); shake(5);
        }
      }
      // атаки на долях бита
      var beatIdx = Math.floor(b.bt / beatLen);
      if (beatIdx !== b.lastBeat && b.transT <= 0) {
        b.lastBeat = beatIdx;
        if (b.state === 'rise' && (ph === 3 || (ph === 2 && beatIdx % 2 === 1))) {        // веер осколков
          [-1, 0, 1].forEach(function (k) {
            var vy0 = -330 - Math.abs(k) * 20, g0 = 620, sy0 = m.y - m.r, tx0 = pcx + k * 34;
            var t0 = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g0 * Math.max(0, a.y - sy0))) / g0;
            self.shots.push({ x: m.x, y: sy0, vx: (tx0 - m.x) / t0, vy: vy0, ty: a.y, tx: tx0, rot: 0, moon: true });
          });
          Sound.tone('square', 600, 200, 0.15, 0.2);
        }
        if ((ph === 2 && beatIdx % 4 === 0) || ph === 3) {                                 // с потолка падают осколки
          var rx = 2 * T + Math.random() * (lvl.w - 4) * T;
          if (Math.random() < 0.5) rx = pcx + (Math.random() - 0.5) * 30;                  // иногда — прямо над грибком
          this.rain.push({ x: rx, y: T + 2, warn: 0.75, vy: 0 });
        }
      }
      m.x += (a.x - m.x) * Math.min(1, dt * 3);
      m.frame = (m.frame || 0) + dt;
      if (ph === 3) { shakeT = Math.max(shakeT, 0.02); shakeAmp = Math.max(shakeAmp, 1); }

      var hit = function () { return game.mode === 'play' && p.inv <= 0 && !game.cheats.god; };
      // осколки из пасти
      for (var i = this.shots.length - 1; i >= 0; i--) {
        var q = this.shots[i];
        q.vy += 620 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += dt * 9;
        if (hit() && overlap(p, { x: q.x - 6, y: q.y - 6, w: 12, h: 12 })) { this.shots.splice(i, 1); this.die('hit'); return; }
        if (q.y >= q.ty + 40) this.shots.splice(i, 1);
      }
      // осколки с потолка
      for (i = this.rain.length - 1; i >= 0; i--) {
        var rq = this.rain[i];
        if (rq.warn > 0) { rq.warn -= dt; continue; }
        rq.vy += 700 * dt; rq.y += rq.vy * dt;
        if (hit() && overlap(p, { x: rq.x - 5, y: rq.y - 8, w: 10, h: 14 })) { this.rain.splice(i, 1); this.die('hit'); return; }
        if (rq.y > a.y + 4) { this.rain.splice(i, 1); for (var k2 = 0; k2 < 3; k2++) particles.push({ kind: 'brick', tile: 2, x: rq.x, y: a.y - 4, vx: (Math.random() - 0.5) * 120, vy: -100 - Math.random() * 60, sx: 0, sy: 0, t: 0, life: 0.5 }); }
      }
      // ударные волны по полу
      for (i = this.waves.length - 1; i >= 0; i--) {
        var w = this.waves[i];
        w.x += w.dir * (140 + ph * 15) * dt;
        if (hit() && p.y + p.h >= a.y - 2 && Math.abs(pcx - w.x) < 9) { this.waves.splice(i, 1); this.die('hit'); return; }
        if (w.x < T || w.x > (lvl.w - 1) * T) this.waves.splice(i, 1);
      }
      this.panicAudio(dt, Math.hypot(pcx - m.x, pcy - m.y));
      this.close = Math.max(0, Math.min(1, 1 - (Math.hypot(pcx - m.x, pcy - m.y) - 60) / 160));
      // прыжок на голову
      var headY = m.y - m.r * 0.9;
      if (b.state === 'rise' && b.hitT <= 0 && p.vy > 0 && p.prevBottom <= headY + 8 && p.y + p.h >= headY - 6 && Math.abs(pcx - m.x) < m.r * 0.6) {
        b.hp--; b.hitT = 1.2; b.state = 'sink'; b.bpm += 14;
        p.vy = -430; p.jumping = false; p.y = headY - p.h - 2;
        Sound.play('stomp'); Sound.play('scream'); this.growl(0.8); shake(8);
        if (this.flashCool <= 0) { this.flashT = 0.1; this.flashCool = 0.4; }
        this.shots = []; this.rain = []; this.waves = [];
        if (b.hp <= 0) { this.say('ЛУНА ПАЛА', 1.4); this.beatOn = false; this.startMoonDeath(); return; }
        b.transT = 1.6;                                                  // превращение в следующую фазу
        this.say(b.hp === 2 ? 'ЛУНА ТРЕСКАЕТСЯ' : 'НАСТОЯЩЕЕ ЛИЦО', 1.8);
        this.noiseBand(1.4, 0.5, 3000, 150, 1, 0);
      }
      // коснулся сбоку или упал в яму — съела
      if (hit() && b.hitT <= 0 && b.transT <= 0 && (Math.hypot(pcx - m.x, pcy - m.y) < m.r * 0.75 || p.y > a.y + 30)) this.die('caught');
    },
    startMoonDeath: function () {
      this.phase = 'moondead';
      this.moonT = 0;
      this.shots = [];
      this.setTab(false);
    },
    updateMoonDead: function (dt) {
      var t = (this.moonT += dt), m = this.monster;
      if (m && Math.random() < dt * 20) {
        var a = Math.random() * Math.PI * 2;
        particles.push({ kind: 'brick', tile: 2, x: m.x + Math.cos(a) * m.r * 0.6, y: m.y + Math.sin(a) * m.r * 0.6, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 - 100, sx: 0, sy: 0, t: 0, life: 1 });
      }
      if (t > 0.3 && !this.deadScream) { this.deadScream = true; Sound.play('scream'); this.noiseBand(2, 0.5, 4000, 100, 1, 0); }
      shakeT = Math.max(shakeT, 0.05); shakeAmp = 4;
      if (t > 2.4) { this.monster = null; }
      if (t > 2.6 && !this.rapSaid) { this.rapSaid = true; this.say('…ЛАДНО. ТЫ ПОБЕДИЛ.', 1.6); }
      if (t > 4.0 && this.rapDead === 0 && lvl.rapper) {                 // скелет рассыпается на кости
        this.rapDead = 1; Sound.play('break'); Sound.tone('square', 400, 60, 0.6, 0.3);
        for (var bi = 0; bi < 14; bi++) particles.push({ kind: 'bone', x: lvl.rapper.x + (Math.random() - 0.5) * 10, y: lvl.rapper.y - 20 + Math.random() * 16, vx: (Math.random() - 0.5) * 160, vy: -160 - Math.random() * 120, t: 0, life: 1.6, rot: Math.random() * 6 });
      }
      if (t > 5.2) { this.deadScream = false; this.rapSaid = false; this.moonBeaten = true; this.ending(); }
    },

    windupSound: function () {
      this.noiseBand(0.38, 0.3, 300, 1600, 1.2, 0);              // вдох
      this.noiseBand(0.45, 0.35, 400, 5000, 2, 0.12);            // «вжух»
    },

    // фальшивый вылет: окно ошибки внутри игры, звук обрывается щелчком, окно «течёт»
    startCrash: function () {
      this.crashDone = true;
      game.mode = 'crash';
      this.crashT = 3.4;
      this.click();
      Music.pause();
      this.silentT = 3.4;
      this.setTab(true, 'Месть грибов — не отвечает');
    },
    updateCrash: function (dt) {
      this.crashT -= dt;
      if (this.crashT < 0.9 && !this.crashRoar) { this.crashRoar = true; Sound.play('scream'); this.growl(0.6); shake(6); }
      if (this.crashT <= 0) {
        this.crashRoar = false;
        game.mode = 'play';
        this.rush = true;
        this.oneBit = true;
        this.silentT = 0;
        var p = player, m = this.monster;
        m.x = p.x - Math.max(100, view.w * 0.45);
        this.say('ФИНАЛ', 1.2);
        this.setTab(true, 'ОНО ИДЁТ');
        Music.play();
      }
    },
    // ложная победа: «Уровень пройден!» — и через 2.5 секунды надпись сползает
    startFake: function () {
      this.fakeDone = true;
      this.fakeT = 3.2;
      var m = this.monster;
      m.hidden = true;
      Sound.play('flag');
      this.oneBit = false;
      this.setTab(false);
    },
    updateFake: function (dt) {
      this.fakeT -= dt;
      if (this.fakeT < 0.7 && !this.fakeLaugh) { this.fakeLaugh = true; this.laugh(); this.growl(0.5); }
      if (this.fakeT <= 0) {
        this.fakeLaugh = false;
        var p = player, m = this.monster;
        m.hidden = false;
        m.x = p.x - Math.max(100, view.w * 0.45);
        this.oneBit = true;
        this.say('ТЫ ПРАВДА ДУМАЛ?', 1.8);
        this.setTab(true, 'НЕТ');
        shake(6);
      }
    },

    // всё, что внутри круга монстра, исчезает: блоки, земля, монетки
    eatAround: function (m) {
      var r = m.r - 4, r2 = r * r;
      var tx0 = Math.max(0, Math.floor((m.x - r) / T)), tx1 = Math.min(lvl.w - 1, Math.floor((m.x + r) / T));
      var ty0 = Math.max(0, Math.floor((m.y - r) / T)), ty1 = Math.min(lvl.h - 1, Math.floor((m.y + r) / T));
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
        var c = lvl.grid[ty][tx];
        if (c === '.' || c === '!') continue;
        var nx = Math.max(tx * T, Math.min(m.x, tx * T + T)), ny = Math.max(ty * T, Math.min(m.y, ty * T + T));
        if ((nx - m.x) * (nx - m.x) + (ny - m.y) * (ny - m.y) > r2) continue;
        var idx = SHARD_TILE[c] === undefined ? (c === '#' ? 1 : 3) : SHARD_TILE[c];
        if (c === '#' && lvl.def.grass && tileAt(tx, ty - 1) !== '#') idx = 0;
        setTile(tx, ty, '.');
        if (particles.length < 160) {
          for (var i = 0; i < 2; i++) particles.push({
            kind: 'brick', tile: idx, x: tx * T + i * 8, y: ty * T + 4,
            vx: (Math.random() - 0.2) * 120, vy: -120 - Math.random() * 120,
            sx: i * 8, sy: 0, t: 0, life: 0.9
          });
        }
        if (time - this.breakT > 0.12) { this.breakT = time; Sound.play('break'); }
      }
      var near = function (o) { return Math.hypot(o.x + o.w / 2 - m.x, o.y + o.h / 2 - m.y) < r; };
      enemies = enemies.filter(function (o) { return o.state === 'sucked' || !near(o); });
      coins = coins.filter(function (o) { return !near(o); });
      hearts = hearts.filter(function (o) { return !near(o); });
      orbs = orbs.filter(function (o) { return !near(o); });
    },

    // смерть в погоне: поимка — скример, яма и шипы — короткая темнота; потом рестарт секции
    die: function (kind) {
      if (game.mode !== 'play') return;
      this.addDeath();
      this.secDeaths++;
      game.mode = 'caught';
      Music.pause();
      var self = this;
      if (kind !== 'caught') {
        this.scareKind = 'thud';
        this.scareT = 0.45;
        Sound.tone('sine', 60, 30, 0.35, 0.6); this.noiseBand(0.3, 0.3, 300, 120, 1, 0);
        return;
      }
      // скример изнашивается: разные варианты, после 5 смертей в секции — только тишина
      var kinds = ['face', 'eye', 'silent'];
      this.scareKind = this.secDeaths > 5 ? 'quiet' : kinds[Math.floor(Math.random() * kinds.length)];
      this.scareT = this.scareKind === 'quiet' ? 0.9 : 1.15;
      shake(8);
      var delay = 80 + Math.random() * 200;
      if (this.scareKind === 'face') setTimeout(function () { Sound.play('scream'); self.growl(0.6); }, delay);
      else if (this.scareKind === 'eye') setTimeout(function () { self.growl(0.8); Sound.tone('sawtooth', 70, 30, 1.0, 0.4); self.noiseBand(0.9, 0.5, 3000, 600, 1, 0); }, delay);
      else if (this.scareKind === 'silent') setTimeout(function () { Sound.tone('sine', 1000, 1000, 0.9, 0.12); }, 60);   // ровный писк, как остановка сердца
    },
    caught: function () { this.die('caught'); },
    afterCaught: function () { this.restartSection(); },
    // ставит грибка на твёрдую землю правее x (используется после падения в тихой части)
    respawnAhead: function (x) {
      this.placeOnGround(x);
      if (this.monster) { this.monster.x = player.x - Math.max(105, view.w * 0.5); this.monster.y = player.y - 20; }
      snapCamera();
    },
    gameOver: function () {
      this.stopDrone();
      Music.pause();
      game.mode = 'over';
      showOverlay('ОНО ТЕБЯ СЪЕЛО', 'Солнце больше не светит.\nОно смотрит.\n\nСмертей: ' + this.deaths,
        [{ label: 'Ещё раз', action: function () { startNightmare(true); } },
         { label: 'В главное меню', action: showStart, secondary: true }]);
    },
    onFlag: function () {
      if (game.mode !== 'play' || this.phase !== 'chase') return;
      this.phase = 'done';
      if (this.monster) { this.monster.dying = 1.2; this.monster.hidden = false; this.monster.k = 3; }
      this.oneBit = false; this.inSpeed = false; this.shots = [];
      Sound.play('scream');
      this.say('ОНО ОТСТАЛО…', 1.4);
      this.startMoonIntro();
    },
    ending: function () {
      var d = this.deaths;
      this.moonBeaten = !!this.moonBeaten;
      save('nightmareEscapes', load('nightmareEscapes', 0) + 1);
      this.exit();
      Music.pause();
      game.mode = 'win';
      Sound.play('flag');
      var hour = new Date().getHours(), late = hour >= 22 || hour < 5;
      showOverlay(this.moonBeaten ? 'ТЫ ПОБЕДИЛ…' : 'ТЫ СБЕЖАЛ…',
        (this.moonBeaten ? 'Солнце зашло. Луна разбита.\nНо ночь ещё не кончилась.' : 'Солнце зашло.\nНо завтра оно взойдёт снова.') + '\n\nСмертей: ' + d + '\nСчёт: ' + game.score +
        (late ? '\n\nУже ' + String(hour).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0') + '. Тебе давно пора спать.' : ''),
        [{ label: 'Ещё раз', action: function () { startNightmare(true); } },
         { label: 'В главное меню', action: showStart, secondary: true }]);
    },

    // солнышко на обычном лугу: изредка (1 из 64) на миг не то лицо
    drawNormalSun: function (cx, cy) {
      var x = view.w - 48, y = 4;
      this.sunOddWait -= 1 / 60;
      if (this.sunOddWait <= 0) { this.sunOddWait = 5; if (Math.random() < 1 / 64) this.sunOddT = 0.18; }
      if (this.sunOddT > 0) { this.sunOddT -= 1 / 60; ctx.drawImage(SUN_EVIL[0], x, y); return; }
      ctx.drawImage(SUN_CUTE[Math.floor(time * 2) % 2], x, y);
      ctx.fillStyle = '#5a1e08';
      SUN_EYES.forEach(function (e) { ctx.fillRect(x + e[0], y + e[1] - 1, 1, 2); });
    },

    makeBlood: function () {
      lvl.blood = [];
      for (var tx = 0; tx < lvl.w; tx++) {
        if (((tx * 37) % 11) > 4) continue;
        for (var ty = 1; ty < lvl.h; ty++) {
          if (isSolid(tileAt(tx, ty)) && !isSolid(tileAt(tx, ty - 1))) { lvl.blood.push({ tx: tx, ty: ty, len: 2 + (tx * 13) % 6 }); break; }
        }
      }
    },
    revealed: function () { return this.phase === 'chase' || this.phase === 'done' || this.isMoon() || game.mode === 'towerintro' || (this.phase === 'transform' && this.tint > 0.5); },

    // декор: трупы героев, лужи крови, кресты, глаза в темноте, надписи кровью
    drawDecor: function (cx, cy) {
      if (!this.revealed()) return;
      var self = this;
      (lvl.blood || []).forEach(function (b) {
        if (!isSolid(tileAt(b.tx, b.ty))) return;
        var x = b.tx * T - cx, y = b.ty * T - cy;
        if (x < -T || x > view.w + T) return;
        ctx.fillStyle = '#8a0010';
        ctx.fillRect(x + 1, y, T - 2, 2);
        ctx.fillRect(x + 3 + (b.len % 5), y + 2, 2, b.len);                   // потёк
        var drop = (time * 12 + b.tx * 3) % 14;
        ctx.fillStyle = '#c0101c';
        ctx.fillRect(x + 4 + (b.len % 5), y + 2 + b.len + drop, 1, 2);        // капля
      });
      self.drawSpeakers(cx, cy);
      self.drawRapper(cx, cy);
      lvl.decor.forEach(function (d) {
        var x = Math.round(d.x - cx), y = Math.round(d.y - cy);
        if (x < -48 || x > view.w + 48) return;
        if (d.type === 't' || d.type === 'w' || d.type === 'k') { if (y > -60 && y < view.h + 60) self.drawCastleDecor(d, x, y); return; }
        if ('ubncqpz'.indexOf(d.type) >= 0) { if (y > -70 && y < view.h + 40) self.drawMoreDecor(d, x, y); return; }
        if (d.type === 'd' || d.type === 'D') {
          if (d.suck) return;                                                // летит в рот монстру
          if (!isSolid(tileAt(Math.floor(d.x / T), Math.floor(d.y / T) + 1))) return;   // земля съедена
          var alive = d.seed % 3 === 0;                                      // этот ещё шевелится
          if (alive && Math.sin(time * 7 + d.seed) > 0.9) y -= 1;            // дёргается
          ctx.fillStyle = '#6a0008';                                          // лужа крови
          ctx.fillRect(x - 6, y + 14, 28, 2); ctx.fillRect(x - 3, y + 13, 22, 1);
          if (d.type === 'd') {                                               // сплющенный герой
            ctx.drawImage(IMG.enemy, 5 * 32, 30, 32, 18, x - 8, y - 2, 32, 18);
          } else {                                                            // лежит на спине
            ctx.save(); ctx.translate(x + 8, y + 10); ctx.rotate(d.seed % 2 ? Math.PI / 2 : -Math.PI / 2);
            ctx.drawImage(IMG.enemy, 0, 6, 32, 38, -19, -16, 32, 38);
            ctx.restore();
          }
          ctx.fillStyle = 'rgba(40,0,0,0.35)'; ctx.fillRect(x - 8, y - 4, 32, 20);   // темнее
          if (alive) {                                                       // тянет руку вверх, пальцы шевелятся
            var reach = 5 + Math.round((Math.sin(time * 2.3 + d.seed) + 1) * 3);
            var hx = x + 6 + Math.round(Math.sin(time * 3 + d.seed) * 2);
            ctx.fillStyle = '#2a1010'; ctx.fillRect(hx - 1, y + 8 - reach, 5, reach + 1);
            ctx.fillStyle = '#d8c0a0'; ctx.fillRect(hx, y + 8 - reach, 3, reach);
            var fo = Math.floor(time * 6 + d.seed) % 2;
            ctx.fillRect(hx - 1, y + 6 - reach - fo, 1, 2); ctx.fillRect(hx + 1, y + 5 - reach, 1, 2); ctx.fillRect(hx + 3, y + 6 - reach - (1 - fo), 1, 2);
            ctx.fillStyle = '#8a0010'; ctx.fillRect(hx, y + 8 - reach + 2, 3, 1);
          }
        } else if (d.type === 'x') {                                          // крест-могилка
          if (!isSolid(tileAt(Math.floor(d.x / T), Math.floor(d.y / T) + 1))) return;
          ctx.fillStyle = '#3a2a24'; ctx.fillRect(x + 7, y + 2, 3, 14); ctx.fillRect(x + 3, y + 5, 11, 3);
          ctx.fillStyle = '#5a463c'; ctx.fillRect(x + 7, y + 2, 1, 14); ctx.fillRect(x + 3, y + 5, 11, 1);
          ctx.fillStyle = '#2a1a14'; ctx.fillRect(x + 1, y + 15, 15, 1);
        } else if (d.type === 'y') {                                          // глаза в темноте, моргают и следят
          var blink = ((time + d.seed) % 4) < 0.15;
          if (blink) return;
          var px = player.x + player.w / 2 - cx, dir = px > x + 8 ? 1 : 0;
          ctx.fillStyle = 'rgba(255,30,30,0.25)'; ctx.fillRect(x + 1, y + 5, 14, 4);
          ctx.fillStyle = '#ff2828'; ctx.fillRect(x + 3, y + 6, 3, 2); ctx.fillRect(x + 10, y + 6, 3, 2);
          ctx.fillStyle = '#000'; ctx.fillRect(x + 3 + dir * 2, y + 6, 1, 2); ctx.fillRect(x + 10 + dir * 2, y + 6, 1, 2);
        } else if (d.type === 'text' && d.text) {                             // надпись кровью
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000';
          ctx.fillText(d.text, x + 9, y + 13);
          ctx.fillStyle = '#d01828';
          ctx.fillText(d.text, x + 8, y + 12);
          var w2 = ctx.measureText(d.text).width;
          for (var k2 = 0; k2 < d.text.length; k2 += 2) {
            var dx2 = x + 8 - w2 / 2 + k2 * (w2 / d.text.length) + 2;
            ctx.fillRect(Math.round(dx2), y + 13, 1, 2 + ((k2 * 7 + d.seed) % 6));
          }
        }
      });
    },

    // рука из земли: крупно, бледная, поверх красного фильтра — чтобы точно было видно
    drawGrab: function (cx, cy) {
      if (this.grabT <= 0) return;
      var up = Math.min(1, (1 - this.grabT) / 0.08), sink = this.grabT < 0.18 ? (0.18 - this.grabT) / 0.18 : 0;
      var gx = Math.round(this.grabX - cx), gy = Math.round(this.grabY - cy);
      var k = 2, hgt = Math.round(17 * up * (1 - sink));
      var R = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(gx + x * k, gy + y * k, w * k, h * k); };
      if (hgt <= 0) return;
      // предплечье из земли
      R(-4, -hgt - 1, 8, hgt + 1, '#1a0606');
      R(-3, -hgt, 6, hgt, '#e4d0b4');
      R(1, -hgt, 2, hgt, '#b49474');
      R(-3, -Math.round(hgt * 0.6), 6, 1, '#8a0010');                   // кровавая полоса
      if (hgt > 9) {                                                      // кисть сжата вокруг ноги
        R(-6, -hgt - 4, 12, 5, '#1a0606');
        R(-5, -hgt - 3, 10, 4, '#e4d0b4');
        R(-6, -hgt - 7, 2, 5, '#e4d0b4'); R(-3, -hgt - 8, 2, 6, '#e4d0b4'); R(0, -hgt - 8, 2, 6, '#e4d0b4'); R(3, -hgt - 7, 2, 5, '#e4d0b4');
        R(-6, -hgt - 8, 2, 1, '#3a1a1a'); R(-3, -hgt - 9, 2, 1, '#3a1a1a'); R(0, -hgt - 9, 2, 1, '#3a1a1a'); R(3, -hgt - 8, 2, 1, '#3a1a1a');   // ногти
        R(-5, -hgt - 1, 10, 1, '#8a0010');
      }
      R(-7, -1, 14, 2, '#3a1a0a');                                        // разрытая земля
      // «!» над грибком
      if (Math.floor(time * 8) % 2 === 0) {
        ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = '#000'; ctx.fillText('!', gx + 1, gy - 42 + 1);
        ctx.fillStyle = '#ffffff'; ctx.fillText('!', gx, gy - 42);
      }
    },
    drawMoonPupils: function (x, y, k, tx, ty) {
      ctx.fillStyle = '#fff6d0';
      MOON_EYES.forEach(function (e) {
        var ex = x + (e[0] + 0.5) * k, ey = y + (e[1] + 0.5) * k, dx = tx - ex, dy = ty - ey, len = Math.hypot(dx, dy) || 1;
        ctx.fillRect(Math.round(x + (e[0] + Math.round(dx / len)) * k), Math.round(y + (e[1] + Math.round(dy / len)) * k), k, k);
      });
    },

    // замок за флагом: свой, кирпичный, с двумя башнями и тёмной дверью
    drawCastle: function (cx, cy) {
      var cs = lvl.castle;
      if (!cs) return;
      var gx = Math.round(cs.x - cx), gy = Math.round(cs.y - cy), tiles = IMG.tiles;
      if (gx < -160 || gx > view.w + 160) return;
      var brick = function (x, y) { ctx.drawImage(tiles, 2 * T, 0, T, T, x, y, T, T); };
      var tx, ty;
      for (ty = 1; ty <= 5; ty++) for (tx = -4; tx <= 4; tx++) brick(gx - 8 + tx * T, gy - ty * T);        // стена
      for (tx = -4; tx <= 4; tx += 2) brick(gx - 8 + tx * T, gy - 6 * T);                                  // зубцы
      [-6, 6].forEach(function (off) {                                                                     // башни
        for (ty = 1; ty <= 8; ty++) for (var k = -1; k <= 0; k++) brick(gx - 8 + (off + k) * T + (off > 0 ? T : 0), gy - ty * T);
        brick(gx - 8 + (off - 1) * T + (off > 0 ? T : 0), gy - 9 * T); brick(gx - 8 + off * T + (off > 0 ? T : 0), gy - 9 * T);
      });
      ctx.fillStyle = 'rgba(20,6,14,0.35)'; ctx.fillRect(gx - 8 - 7 * T, gy - 9 * T, 15 * T, 9 * T);
      // окна с красным светом
      ctx.fillStyle = Math.floor(time * 2) % 2 ? '#c01020' : '#901018';
      [[-3, 3], [2, 3], [-6, 6], [6, 6]].forEach(function (w) { ctx.fillRect(gx - 8 + w[0] * T + 4, gy - w[1] * T - 2, 8, 10); });
      // дверь-арка
      ctx.fillStyle = '#050206';
      ctx.fillRect(gx - 12, gy - 30, 24, 30); ctx.fillRect(gx - 8, gy - 34, 16, 4);
      ctx.fillStyle = '#ff2a2a'; ctx.fillRect(gx - 5, gy - 20, 2, 2); ctx.fillRect(gx + 3, gy - 20, 2, 2);   // кто-то смотрит из двери
    },
    // рэпер-скелет на сцене: кепка, цепь, микрофон; качает головой под бит, рот — по слогам
    drawRapper: function (cx, cy) {
      var r = lvl.rapper;
      if (!r || this.rapDead) return;
      var b = this.boss, beatLen = b ? 60 / b.bpm : 0.65, bt = b ? b.bt : time;
      var bob = (bt % beatLen) < beatLen * 0.3 ? 1 : 0;
      var LY = this.curLyrics(), barLen = beatLen * 4, frac = (bt % barLen) / barLen, line = LY[Math.floor(bt / barLen) % LY.length];
      var n = this.syllables(line), talking = this.phase === 'boss' && frac < 0.75 && ((frac / 0.75 * n) % 1) < 0.55;
      var x = Math.round(r.x - cx), y = Math.round(r.y - cy), P = function (px, py, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, w, h); };
      var W = '#e8e4d8', D = '#1a1418';
      // ноги и таз
      P(-3, -8, 2, 8, W); P(2, -8, 2, 8, W); P(-4, -10, 8, 2, W);
      // позвоночник и рёбра
      P(0, -20, 1, 10, W);
      for (var k = 0; k < 4; k++) P(-4, -19 + k * 2, 9, 1, W);
      // золотая цепь
      P(-3, -21, 7, 1, '#ffd34d'); P(-1, -20, 3, 2, '#ffd34d');
      // рука с микрофоном у рта и вторая рука качается
      P(4, -19, 4, 1, W); P(7, -24 - bob, 1, 6, W); P(6, -27 - bob, 3, 3, '#3a3a44'); P(7, -24 - bob, 1, 3, '#2a2a30');
      P(-8, -19 + bob, 4, 1, W); P(-9, -22 + bob * 2, 1, 4, W);
      // череп
      var hy = -31 + bob;
      P(-4, hy, 9, 8, W); P(-5, hy + 1, 11, 6, W);
      P(-3, hy + 2, 3, 3, D); P(2, hy + 2, 3, 3, D);
      P(-2, hy + 3, 1, 1, '#ff2020'); P(3, hy + 3, 1, 1, '#ff2020');               // глаза-угольки
      P(0, hy + 5, 1, 1, D);
      var jaw = talking ? 2 : 0;                                                   // челюсть ходит по слогам
      P(-3, hy + 7 + jaw, 7, 2, W); P(-2, hy + 7, 5, jaw, D);
      for (var tt = -2; tt <= 2; tt += 2) P(tt, hy + 7 + jaw, 1, 1, D);
      // фаза 2: глаза горят ярче и красный ореол; фаза 3: огонь из глазниц, треснувший череп, отвисшая челюсть
      var rph = this.moonStage();
      if (rph >= 1) {
        ctx.fillStyle = 'rgba(255,0,0,' + (0.12 + rph * 0.08) + ')'; ctx.beginPath(); ctx.arc(x, y - 24, 16 + rph * 4, 0, Math.PI * 2); ctx.fill();
        P(-3, hy + 2, 2, 2, '#ff2020'); P(2, hy + 2, 2, 2, '#ff2020');
      }
      if (rph >= 2) {
        var fl2 = Math.floor(time * 12) % 2;
        P(-3, hy - 1 - fl2, 2, 3, '#ff7a20'); P(3, hy - 1 - fl2, 2, 3, '#ff7a20'); P(-2, hy - 2 - fl2, 1, 1, '#ffd34d'); P(3, hy - 2 - fl2, 1, 1, '#ffd34d');
        P(1, hy, 1, 4, D); P(2, hy + 3, 1, 2, D);
        P(-3, hy + 10, 7, 1, W);
      }
      // кепка козырьком назад
      P(-5, hy - 2, 11, 3, '#c01020'); P(-8, hy - 1, 4, 2, '#a00c18'); P(-1, hy - 3, 3, 1, '#e8303a');
      // ноты над головой
      if (this.phase === 'boss' && Math.floor(bt / beatLen) % 2 === 0) { ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText('♪', x + 10, y - 36); }
    },
    drawSpeakers: function (cx, cy) {
      var b = this.boss, beatLen = b ? 60 / b.bpm : 0.65, bt = b ? b.bt : time;
      var pulse = this.phase === 'boss' && (bt % beatLen) < beatLen * 0.25 ? 1 : 0;
      lvl.speakers.forEach(function (sp) {
        var x = Math.round(sp.x - cx), y = Math.round(sp.y - cy);
        ctx.fillStyle = '#141018'; ctx.fillRect(x - 7, y - 24, 14, 24);
        ctx.fillStyle = '#3a3040'; ctx.fillRect(x - 7, y - 24, 14, 1); ctx.fillRect(x - 7, y - 24, 1, 24);
        ctx.fillStyle = '#2a2430';
        ctx.beginPath(); ctx.arc(x, y - 7, 4 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y - 18, 2 + pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a5060'; ctx.fillRect(x - 1, y - 8, 2, 2); ctx.fillRect(x - 1, y - 19, 2, 2);
      });
    },
    // кровь на шипах: на остриях, потёки и лужица у основания
    drawSpikeBlood: function (x, y, tx) {
      ctx.fillStyle = '#b0101a';
      [3, 8, 13].forEach(function (sx, i) { if ((tx + i) % 3 !== 2) { ctx.fillRect(x + sx - 1, y + 4, 2, 2); ctx.fillRect(x + sx - (i % 2), y + 6, 1, 3 + ((tx + i) % 3)); } });
      ctx.fillStyle = '#6a0008'; ctx.fillRect(x + 1, y + 14, 14, 2);
      var drop = (time * 10 + tx * 5) % 12;
      ctx.fillStyle = '#c0101c'; ctx.fillRect(x + 7 + (tx % 3), y + 8 + drop * 0.5, 1, 2);
    },
    // ещё декор: деревья с воронами, кости, черепа на кольях, свечи, паутина, портреты, кровь на стенах
    drawMoreDecor: function (d, x, y) {
      var R = function (px, py, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, w, h); };
      var px0 = player.x + player.w / 2 - cam.x;
      if (d.type === 'u') {                                           // мёртвое дерево, на ветке ворон
        R(6, -32, 4, 48, '#140806'); R(5, 10, 6, 6, '#140806');
        R(10, -20, 10, 2, '#140806'); R(18, -24, 2, 5, '#140806'); R(-6, -12, 12, 2, '#140806'); R(-8, -16, 2, 5, '#140806'); R(2, -30, 2, 8, '#140806'); R(10, -34, 2, 6, '#140806');
        var look = px0 > x + 18 ? 1 : 0;
        R(15, -27, 6, 4, '#050305'); R(15 + look * 4, -29, 3, 3, '#050305'); R(16 + look * 5, -28, 1, 1, '#ff2020');
        if (Math.floor(time * 3 + d.seed) % 7 === 0) R(14 - look * 2, -26, 3, 1, '#050305');   // взмах крыла
      } else if (d.type === 'b') {                                    // груда костей с черепом
        R(1, 13, 12, 2, '#d8d0c0'); R(3, 11, 2, 4, '#d8d0c0'); R(9, 12, 6, 1, '#c8c0b0'); R(0, 14, 2, 2, '#d8d0c0'); R(12, 13, 2, 2, '#d8d0c0');
        R(5, 7, 6, 5, '#e8e4d8'); R(6, 9, 1, 1, '#1a1418'); R(9, 9, 1, 1, '#1a1418'); R(6, 11, 4, 1, '#1a1418');
      } else if (d.type === 'n') {                                    // череп на колу
        R(7, -4, 2, 20, '#4a3020');
        R(4, -10, 8, 7, '#e8e4d8'); R(5, -8, 2, 2, '#1a1418'); R(9, -8, 2, 2, '#1a1418'); R(6, -4, 4, 1, '#1a1418');
        R(7, -3, 1, 4 + (Math.floor(time * 2 + d.seed) % 3), '#b0101a');
      } else if (d.type === 'c') {                                    // свечи
        [[2, 6], [7, 9], [11, 5]].forEach(function (q) {
          R(q[0], 16 - q[1], 3, q[1], '#e8e0c8');
          var fl = Math.floor(time * 9 + q[0]) % 2;
          R(q[0] + 1, 13 - q[1] - fl, 1, 2 + fl, '#ffb030'); R(q[0], 14 - q[1], 3, 1, '#ff7020');
        });
        ctx.fillStyle = 'rgba(255,160,60,0.10)'; ctx.beginPath(); ctx.arc(x + 8, y + 8, 12, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'q') {                                    // паутина в углу
        ctx.strokeStyle = 'rgba(220,220,230,0.45)'; ctx.lineWidth = 1;
        var flip = d.x > lvl.w * T / 2 ? -1 : 1, ox = flip > 0 ? x : x + 16;
        ctx.beginPath();
        for (var k = 0; k < 4; k++) { ctx.moveTo(ox, y); ctx.lineTo(ox + flip * (16 - k * 4), y + k * 5 + 4); }
        ctx.moveTo(ox + flip * 5, y); ctx.lineTo(ox, y + 5); ctx.moveTo(ox + flip * 10, y); ctx.lineTo(ox, y + 10);
        ctx.stroke();
      } else if (d.type === 'p') {                                    // портрет, глаза следят за грибком
        R(1, 0, 14, 16, '#5a3a14'); R(2, 1, 12, 14, '#1a0f1a');
        R(5, 4, 6, 8, '#3a2a3a'); R(4, 11, 8, 4, '#2a1a2a');
        var ex = px0 > x + 8 ? 1 : -1, ey = (player.y - cam.y) < y ? -1 : 0;
        R(6 + (ex > 0 ? 1 : 0), 6 + ey + 1, 1, 1, '#ffffff'); R(9 + (ex > 0 ? 1 : 0), 6 + ey + 1, 1, 1, '#ffffff');
      } else if (d.type === 'z') {                                    // кровь на стене
        R(2, 2, 10, 3, '#7a0010'); R(4, 5, 2, 7 + d.seed % 4, '#7a0010'); R(9, 4, 1, 5 + d.seed % 3, '#7a0010'); R(1, 3, 2, 2, '#9a1020');
      }
    },

    // декор замка внутри башни
    drawCastleDecor: function (d, x, y) {
      if (d.type === 't') {                                                        // факел
        ctx.fillStyle = '#4a3020'; ctx.fillRect(x + 6, y + 8, 4, 6); ctx.fillRect(x + 4, y + 7, 8, 2);
        var fl = Math.floor(time * 10 + d.seed) % 3;
        ctx.fillStyle = 'rgba(255,140,40,0.16)'; ctx.beginPath(); ctx.arc(x + 8, y + 4, 14 + fl, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff7a20'; ctx.fillRect(x + 5, y + 1 - fl, 6, 6 + fl);
        ctx.fillStyle = '#ffd34d'; ctx.fillRect(x + 7, y + 3 - fl, 2, 4);
      } else if (d.type === 'w') {                                                 // окно: ночное небо, решётка
        ctx.fillStyle = '#1a0f2a'; ctx.fillRect(x, y + 4, 32, 44); ctx.fillRect(x + 4, y, 24, 4);
        ctx.fillStyle = '#5a2a6a'; ctx.fillRect(x + 20, y + 10, 5, 5);           // далёкая звезда
        ctx.fillStyle = '#3a3050'; ctx.fillRect(x + 10, y, 2, 48); ctx.fillRect(x + 20, y, 2, 48); ctx.fillRect(x, y + 24, 32, 2);
      } else if (d.type === 'k') {                                                 // цепь качается
        var sw = Math.round(Math.sin(time * 1.5 + d.seed) * 2);
        for (var l = 0; l < 6; l++) { ctx.fillStyle = l % 2 ? '#6a6a74' : '#8a8a94'; ctx.fillRect(x + 7 + Math.round(sw * l / 6), y - 30 + l * 6, l % 2 ? 2 : 3, 5); }
        ctx.fillStyle = '#4a4a54'; ctx.fillRect(x + 5 + sw, y + 6, 6, 3);
      }
    },

    // ---------- рисование
    drawPupils: function (x, y, k, eyes, targetX, targetY, col) {
      ctx.fillStyle = col || '#140606';
      eyes.forEach(function (e) {
        var ex = x + (e[0] + 0.5) * k, ey = y + (e[1] + 0.5) * k;
        var dx = targetX - ex, dy = targetY - ey, len = Math.hypot(dx, dy) || 1;
        var ox = Math.round(dx / len), oy = Math.round(dy / len);
        ctx.fillRect(Math.round(x + (e[0] + ox) * k), Math.round(y + (e[1] + oy) * k), k, k);
      });
    },
    // солнышко в небе (до и во время превращения)
    drawSky: function (cx, cy) {
      if (this.phase !== 'calm' && !(this.phase === 'transform' && this.t < 1.3)) return;
      var x = view.w - 48, y = 4, pcx = player.x + player.w / 2 - cx, pcy = player.y + player.h / 2 - cy;
      var evil = this.phase === 'transform' && (this.t > 0.6 || Math.floor(this.t * 14) % 2 === 0);
      if (this.phase === 'transform') { x += Math.round((Math.random() - 0.5) * 6 * this.t); y += Math.round((Math.random() - 0.5) * 4 * this.t); }
      var img = evil ? SUN_EVIL[Math.floor(time * 6) % 3] : SUN_CUTE[Math.floor(time * 2) % 2];
      ctx.drawImage(img, x, y);
      if (this.peekT > 0) {                              // силуэт у горизонта, на миг
        ctx.drawImage(SUN_SIL, Math.round(view.w * 0.3), Math.round(lvl.h * T - cy - 92), 40, 40);
      }
      if (!evil) {                                    // доброе солнышко следит глазами за грибком
        ctx.fillStyle = '#5a1e08';
        var self = this;
        SUN_EYES.forEach(function (e) {
          var dx = pcx - (x + e[0]), dy = pcy - (y + e[1]), len = Math.hypot(dx, dy) || 1;
          ctx.fillRect(x + e[0] + Math.round(dx / len), y + e[1] - 1 + Math.round(dy / len), 1, 2);
        });
      } else {
        this.drawPupils(x, y, 1, SUN_EYES, pcx, pcy);
      }
    },
    drawWorld: function (cx, cy) {
      var m = this.monster, self = this;
      // трупы, улетающие в рот монстру
      if (m) lvl.decor.forEach(function (d) {
        if (!d.suck) return;
        var q = Math.min(1, d.suck.t / 0.75), e = q * q, ang = d.seed + q * 10, rad = (1 - q) * 18;
        var x = d.suck.x0 + (m.x - d.suck.x0) * e + Math.cos(ang) * rad, y = d.suck.y0 + (m.y + 8 - d.suck.y0) * e + Math.sin(ang) * rad;
        var sc = 1 - q * 0.85;
        ctx.save(); ctx.translate(Math.round(x - cx), Math.round(y - cy)); ctx.rotate(q * 12); ctx.scale(sc, sc);
        ctx.drawImage(IMG.enemy, 0, 6, 32, 38, -16, -19, 32, 38);
        ctx.restore();
      });
      // летящие трупы и красный крест там, куда упадут
      this.shots.forEach(function (q) {
        if (!q.moon && Math.floor(time * 8) % 2 === 0) {
          var mx = Math.round(q.tx - cx), my = Math.round(q.ty - cy) - 3;
          ctx.fillStyle = '#ff2030';
          for (var k = -3; k <= 3; k++) { ctx.fillRect(mx + k, my + k, 2, 2); ctx.fillRect(mx + k, my - k, 2, 2); }
        }
        ctx.save(); ctx.translate(Math.round(q.x - cx), Math.round(q.y - cy)); ctx.rotate(q.rot);
        if (q.moon) { ctx.fillStyle = '#c8ccec'; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = '#5a5480'; ctx.fillRect(-2, -2, 4, 4); }
        else ctx.drawImage(IMG.enemy, 0, 6, 32, 38, -11, -13, 22, 26);
        ctx.restore();
      });

      // засасываемые герои
      enemies.forEach(function (e) {
        if (e.state !== 'sucked' || e.vxs === undefined) return;
        var sc = Math.max(0.1, e.scale), w = 32 * sc, h = 48 * sc;
        ctx.save();
        ctx.translate(Math.round(e.vxs - cx), Math.round(e.vys - cy));
        ctx.rotate(e.st * 8);
        ctx.drawImage(IMG.enemy, 4 * 32, 0, 32, 48, -w / 2, -h / 2, w, h);
        ctx.restore();
      });
    },
    drawMonster: function (cx, cy) {
      var m = this.monster;
      // луна во время заставки: спускается и уносит флаг
      if (game.mode === 'moonintro' && this.moonT > 1.2 && this.moonY !== undefined) {
        var mk = 2, ms = SUN_W * mk, mx = Math.round(this.moonX - cx - ms / 2), my = Math.round(this.moonY - cy - ms / 2);
        if (this.flagTaken) {                              // флаг в зубах у луны
          ctx.drawImage(IMG.tiles, 12 * T, 0, T, T, mx + ms / 2 - 8, my + ms - 6, T, T);
          ctx.drawImage(IMG.tiles, 11 * T, 0, T, T, mx + ms / 2 - 8, my + ms - 20, T, T);
        }
        ctx.drawImage(MOON[Math.floor(time * 6) % 2], mx, my, ms, ms);
        this.drawMoonPupils(mx, my, mk, player.x + player.w / 2 - cx, player.y - cy);
      }
      if (!m) return;
      if (m.moon) {                                       // луна в башне и в бою
        var k = m.k, size = SUN_W * k, x = Math.round(m.x - cx - size / 2), y = Math.round(m.y - cy - size / 2);
        ctx.save();
        if (this.phase === 'boss' || this.phase === 'moondead') {   // вылезает из ямы: снизу закрыта полом
          var a = lvl.arena, fy = a.y - cy;
          ctx.beginPath(); ctx.rect(0, 0, view.w, fy); ctx.rect(7 * T - cx, fy, 4 * T, view.h); ctx.clip();
        }
        if (this.phase === 'moondead') { ctx.globalAlpha = Math.max(0, 1 - this.moonT / 2.4); x += Math.round((Math.random() - 0.5) * 8); }
        var mst = this.moonStage();
        if (this.boss && this.boss.transT > 0 && Math.floor(time * 12) % 2) mst = Math.max(0, mst - 1);   // превращение: мигает между лицами
        ctx.drawImage(MOON_STAGES[mst][Math.floor(time * 6) % 2], x, y, size, size);
        if (this.boss && this.boss.hitT > 0 && Math.floor(time * 20) % 2) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(MOON[0], x, y, size, size); }
        ctx.globalCompositeOperation = 'source-over';
        this.drawMoonPupils(x, y, k, player.x + player.w / 2 - cx, player.y + player.h / 2 - cy);
        if (this.boss && this.boss.hp < 3) {             // трещины от ударов
          ctx.fillStyle = '#1a1430';
          for (var c2 = 0; c2 < 3 - this.boss.hp; c2++) { ctx.fillRect(x + (10 + c2 * 9) * k, y + (6 + c2 * 3) * k, k, 8 * k); ctx.fillRect(x + (11 + c2 * 9) * k, y + (13 + c2 * 3) * k, 3 * k, k); }
        }
        ctx.restore();
        return;
      }
      var k = m.k, x, y, pcx = player.x + player.w / 2 - cx, pcy = player.y + player.h / 2 - cy;
      if (game.mode === 'transform' && this.t < 2.1) {
        if (this.t < 1.3) return;                     // ещё висит в небе
        var q = (this.t - 1.3) / 0.8, e2 = q * q * (3 - 2 * q);
        var sx = m.sx - cx, sy = m.sy - cy, tx2 = m.x - cx, ty2 = m.y - cy;
        var kk = 1 + (k - 1) * e2, size = SUN_W * kk;
        x = sx + (tx2 - sx) * e2 - size / 2; y = sy + (ty2 - sy) * e2 - size / 2;
        ctx.drawImage(SUN_EVIL[Math.floor(time * 10) % 3], Math.round(x), Math.round(y), Math.round(size), Math.round(size));
        return;
      }
      var alpha = this.phase === 'done' ? Math.max(0, m.dying / 1.2) : 1;
      var grow = this.phase === 'done' ? 1 + (1 - alpha) * 0.6 : 1;
      var bob = Math.round(Math.sin(time * 3) * 3);
      var size2 = SUN_W * k * grow;
      x = Math.round(m.x - cx - size2 / 2); y = Math.round(m.y - cy - size2 / 2 + bob);
      ctx.globalAlpha = alpha;
      // воронка во время засасывания
      if (game.mode === 'transform') {
        ctx.strokeStyle = 'rgba(255,60,60,0.5)';
        for (var i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(m.x - cx, m.y - cy + 10, 20 + ((time * 60 + i * 15) % 60), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (m.hidden) { ctx.globalAlpha = 1; return; }
      var stg = game.mode === 'transform' ? 0 : this.sunStage();
      ctx.drawImage(SUN_STAGES[stg][Math.floor(time * 8) % 3], x, y, size2, size2);
      if (this.windupT > 0) {
        // светящиеся глаза и полоска рта; перед рывком глаза вспыхивают
        ctx.fillStyle = '#ffffff';                                       // перед рывком глаза вспыхивают белым
        SUN_EYES.forEach(function (e) { ctx.fillRect(x + (e[0] - 1) * k, y + (e[1] - 1) * k, 3 * k, 3 * k); });
      }
      this.drawPupils(x, y, k * grow, SUN_EYES, pcx, pcy, stg >= 3 ? '#ff2020' : null);
      ctx.globalAlpha = 1;
    },
    drawOverlay: function (cx, cy) {
      var vw = view.w, vh = view.h, i;
      // мир краснеет и темнеет
      if (this.tint > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = this.tint;
        ctx.fillStyle = this.isMoon() ? (['#5a52a8', '#5a3a90', '#6a2050'][this.moonStage()]) : (['#9a1828', '#901420', '#80101c', '#700a14'][this.sunStage()]);
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }
      this.drawMonster(cx, cy);
      // финальный рывок — мир в два цвета (1-bit), до затемнения краёв
      if (this.oneBit && this.phase === 'chase') this.applyOneBit(vw, vh);
      // туман стелется по земле
      if (this.phase === 'chase' || this.phase === 'done') {
        for (var fg = 0; fg < 3; fg++) {
          var fy = Math.round(lvl.h * T - cy - 36 - fg * 10), off2 = (time * (12 + fg * 7) + fg * 60) % 120;
          ctx.fillStyle = 'rgba(220,200,210,' + (0.06 - fg * 0.012) + ')';
          for (var fx = -120 + off2; fx < vw; fx += 120) { ctx.fillRect(Math.round(fx), fy, 80, 8); ctx.fillRect(Math.round(fx + 20), fy - 4, 40, 4); }
        }
      }
      // погоня на скорости: белые линии ветра
      if (this.inSpeed && this.phase === 'chase') {
        ctx.fillStyle = 'rgba(255,240,230,0.5)';
        for (var sl = 0; sl < 10; sl++) {
          var ly2 = (sl * 53 + Math.floor(time * 40) * 17) % vh, lx2 = vw - ((time * 900 + sl * 97) % (vw + 60));
          ctx.fillRect(Math.round(lx2), ly2, 24 + (sl % 3) * 10, 1);
        }
      }
      // в погоне — тьма по краям
      if (this.phase === 'chase' || this.phase === 'done') {
        var px = player.x + player.w / 2 - cx, py = player.y + player.h / 2 - cy;
        var inner = 64 - this.beatPulse * 14 - this.close * 40;              // обзор сужается, когда монстр ближе
        var gr = ctx.createRadialGradient(px, py, Math.max(16, inner), px, py, Math.max(vw, vh) * 0.75);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,' + (0.55 + this.close * 0.15 + this.beatPulse * 0.08) + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, vw, vh);
        // участок тьмы: видно только у самых ног и во вспышках молний
        if (this.inDark && this.lightning <= 0) {
          var gd = ctx.createRadialGradient(px, py, 10, px, py, 46);
          gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,0.97)');
          ctx.fillStyle = gd; ctx.fillRect(0, 0, vw, vh);
        }
        if (this.lightning > 0) { ctx.fillStyle = 'rgba(230,230,255,0.35)'; ctx.fillRect(0, 0, vw, vh); }
        // глаза монстра светятся сквозь тьму
        var m = this.monster;
        if (m && this.phase === 'chase' && !m.hidden && (!this.inDark || this.lightning > 0 || this.windupT > 0)) {
          var k = m.k, size = SUN_W * k, mx = Math.round(m.x - cx - size / 2), my = Math.round(m.y - cy - size / 2 + Math.round(Math.sin(time * 3) * 3));
          ctx.fillStyle = 'rgba(255,40,40,0.9)';
          SUN_EYES.forEach(function (e) { ctx.fillRect(mx + (e[0] - 1) * k, my + (e[1] - 1) * k, 3 * k, 3 * k); });
          this.drawPupils(mx, my, k, SUN_EYES, px, py);
        }
      }
      if (this.phase === 'chase') {
        // обломки с неба
        ctx.fillStyle = '#3a0a0e';
        this.debris.forEach(function (dd) { ctx.fillRect(Math.round(dd.x - cx), Math.round(dd.y - cy), dd.s, dd.s); });
        // полосы как на старом телевизоре
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        for (i = (Math.floor(time * 30) % 2); i < vh; i += 2) ctx.fillRect(0, i, vw, 1);
        // двоение картинки, когда монстр рядом
        if (this.close > 0.6) {
          ctx.save();
          ctx.globalAlpha = 0.18 * this.close;
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(canvas, Math.round(2 + Math.random() * 2 * this.close), 0);
          ctx.restore();
        }
        // монстр за краем экрана — мигающее предупреждение
        var mm = this.monster;
        if (mm && mm.x + mm.r < cx && Math.floor(time * 6) % 2 === 0) {
          ctx.fillStyle = '#ff2030';
          var wy = Math.round(Math.max(30, Math.min(vh - 30, mm.y - cy)));
          ctx.beginPath(); ctx.moveTo(4, wy); ctx.lineTo(14, wy - 8); ctx.lineTo(14, wy + 8); ctx.fill();
          ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.fillText('!', 17, wy + 4);
        }
        // шкала «ОНО» внизу экрана
        var bw = Math.min(110, vw - 60), bx = Math.round((vw - bw) / 2), by = vh - 12;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 26, by - 2, bw + 30, 9);
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = '#ff4050'; ctx.fillText('ОНО', bx - 24, by + 6);
        ctx.fillStyle = '#3a0a10'; ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = this.close > 0.7 && Math.floor(time * 6) % 2 ? '#ffffff' : '#ff2030';
        ctx.fillRect(bx, by, Math.round(bw * this.close), 5);
      }
      // помехи
      if (this.staticT > 0) {
        for (i = 0; i < 40; i++) {
          var v = Math.floor(Math.random() * 255);
          ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
          ctx.fillRect(0, Math.floor(Math.random() * vh), vw, 1 + Math.floor(Math.random() * 3));
        }
      }
      if (this.flashT > 0) { ctx.fillStyle = 'rgba(255,0,0,0.45)'; ctx.fillRect(0, 0, vw, vh); }
      // надпись
      if (this.msg) {
        var a = Math.min(1, this.msg.t * 4, (this.msg.dur - this.msg.t) * 2);
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        var jx = Math.round((Math.random() - 0.5) * 3), jy = Math.round((Math.random() - 0.5) * 3);
        ctx.fillStyle = '#000';
        ctx.fillText(this.msg.text, vw / 2 + 2 + jx, vh * 0.38 + 2 + jy);
        ctx.fillStyle = Math.floor(time * 8) % 2 ? '#ff2030' : '#b00010';
        ctx.fillText(this.msg.text, vw / 2 + jx, vh * 0.38 + jy);
        ctx.globalAlpha = 1;
      }
      this.drawGrab(cx, cy);
      // бой: предупреждения и осколки с потолка, ударные волны
      if (this.phase === 'boss') {
        this.rain.forEach(function (rq) {
          var rx = Math.round(rq.x - cx), ry = Math.round(rq.y - cy);
          if (rq.warn > 0) {
            if (Math.floor(time * 10) % 2) { ctx.fillStyle = '#ff2030'; ctx.fillRect(rx - 4, ry, 8, 3); ctx.fillStyle = 'rgba(255,40,40,0.25)'; ctx.fillRect(rx - 1, ry + 3, 2, Math.round(lvl.arena.y - rq.y)); }
          } else { ctx.fillStyle = '#c8ccec'; ctx.fillRect(rx - 3, ry - 8, 6, 12); ctx.fillStyle = '#5a5480'; ctx.fillRect(rx - 1, ry - 8, 2, 12); }
        });
        this.waves.forEach(function (w) {
          var wx = Math.round(w.x - cx), wy = Math.round(lvl.arena.y - cy);
          ctx.fillStyle = 'rgba(200,160,255,0.85)'; ctx.fillRect(wx - 5, wy - 10, 10, 10);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(wx - 2, wy - 13, 4, 13);
          ctx.fillStyle = 'rgba(200,160,255,0.35)'; ctx.fillRect(wx - 12 * w.dir - 4, wy - 6, 8, 6);
        });
      }
      // субтитры страшной песни
      if (this.phase === 'boss' && this.boss) {
        var LYs = this.curLyrics(), b = this.boss, barLen = 4 * 60 / b.bpm, frac = (b.bt % barLen) / barLen, line = LYs[Math.floor(b.bt / barLen) % LYs.length];
        var shown = line.slice(0, Math.ceil(line.length * Math.min(1, frac / 0.75)));
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        var sy2 = vh - 18;                                          // субтитры внизу — сцена с рэпером наверху
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(4, sy2 - 9, vw - 8, 13);
        ctx.fillStyle = '#a01018'; ctx.fillText(shown, vw / 2 + 1, sy2 + 1);
        ctx.fillStyle = '#ffffff'; ctx.fillText(shown, vw / 2, sy2);
      }
      if (this.fadeT > 0) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, this.fadeT / 0.6) + ')'; ctx.fillRect(0, 0, vw, vh); }
      // ложная победа
      if (this.fakeT > 0) {
        var slide = this.fakeT < 0.9 ? (0.9 - this.fakeT) * 160 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, vh * 0.3 - 18, vw, 44);
        ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        var txt = 'УРОВЕНЬ ПРОЙДЕН!';
        for (var li = 0; li < txt.length; li++) {
          var lx = vw / 2 + (li - txt.length / 2 + 0.5) * 10, ly = vh * 0.3 + slide * (0.5 + ((li * 37) % 7) / 6);
          ctx.fillStyle = this.fakeT < 0.9 ? '#c01020' : '#ffd34d';
          ctx.fillText(txt[li], lx, ly);
        }
      }
      // фальшивый вылет
      if (game.mode === 'crash') this.drawCrash(vw, vh);
      // кадр-вспышка
      if (this.subT > 0) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
        if (this.subKind === 'face') {
          var fk = Math.max(2, Math.floor(Math.min(vw, vh) / SUN_W)), fs = SUN_W * fk;
          ctx.drawImage(SUN_STAGES[this.sunStage()][0], Math.round((vw - fs) / 2), Math.round((vh - fs) / 2), fs, fs);
          ctx.fillStyle = 'rgba(255,0,0,0.3)'; ctx.fillRect(0, 0, vw, vh);
        } else {
          ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = '#fff'; ctx.fillText(this.subKind, vw / 2, vh / 2);
        }
      }
      // скример, когда поймали
      if (game.mode === 'caught') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, vw, vh);
        var sk = this.scareKind;
        if (sk === 'thud' || sk === 'quiet' || this.scareT > 1.03) {
          if (sk === 'quiet') {
            ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#a01018';
            ctx.fillText('ЕЩЁ РАЗ?', vw / 2, vh / 2);
          }
          return;
        }
        if (sk === 'silent') {
          ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
          ctx.fillText('ПОЙМАЛ', vw / 2, vh / 2);
          ctx.fillStyle = '#ff2030'; ctx.fillRect(vw * 0.2, vh / 2 + 14, vw * 0.6, 1);
          return;
        }
        var FACE = this.isMoon() ? MOON_STAGES[this.moonStage()] : SUN_STAGES[this.sunStage()];
        var kk = Math.max(2, Math.floor(Math.min(vw, vh) / SUN_W * (sk === 'eye' ? 3.2 : 1.3)));
        var sz = SUN_W * kk;
        var ox = sk === 'eye' ? (SUN_EYES[0][0] + 0.5) * kk - vw / 2 : (sz - vw) / 2;
        var oy = sk === 'eye' ? (SUN_EYES[0][1] + 0.5) * kk - vh / 2 : (sz - vh) / 2;
        var sx = Math.round(-ox + (Math.random() - 0.5) * 10), sy = Math.round(-oy + (Math.random() - 0.5) * 10);
        ctx.drawImage(FACE[Math.floor(time * 20) % FACE.length], sx, sy, sz, sz);
        if (sk === 'eye') {                          // глаз во весь экран + полосы глитча
          ctx.fillStyle = '#140606';
          ctx.fillRect(Math.round(sx + SUN_EYES[0][0] * kk), Math.round(sy + SUN_EYES[0][1] * kk), kk, kk);
          for (var gi = 0; gi < 5; gi++) {
            var gy = Math.floor(Math.random() * vh), gh = 2 + Math.floor(Math.random() * 6);
            ctx.drawImage(canvas, 0, gy, vw, gh, Math.round((Math.random() - 0.5) * 16), gy, vw, gh);
          }
        }
        // ровная красная пелена (без мигания — вспышки не чаще 3 в секунду)
        ctx.fillStyle = 'rgba(255,0,0,' + (0.3 + Math.sin(time * 9) * 0.08) + ')';
        ctx.fillRect(0, 0, vw, vh);
      }
    },

    // 1-bit: каждый пиксель — либо грязно-белый, либо чёрный
    applyOneBit: function (vw, vh) {
      try {
        var img = ctx.getImageData(0, 0, vw, vh), d = img.data;
        for (var i = 0; i < d.length; i += 4) {
          var v = (d[i] * 0.5 + d[i + 1] * 0.3 + d[i + 2] * 0.2);
          var on = v > 30;
          d[i] = on ? 232 : 8; d[i + 1] = on ? 222 : 4; d[i + 2] = on ? 206 : 6;
        }
        ctx.putImageData(img, 0, 0);
      } catch (e) { this.oneBit = false; }
    },

    // нарисованное окно ошибки внутри игры
    drawCrash: function (vw, vh) {
      var t = this.crashT;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, vw, vh);
      var w = Math.min(220, vw - 16), h = 86, x = Math.round((vw - w) / 2), y = Math.round((vh - h) / 2);
      var melt = t < 1.6 ? (1.6 - t) / 1.6 : 0;          // окно «течёт»
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, vw, vh); ctx.clip();
      for (var col = 0; col < w; col += 4) {
        var drip = melt * (20 + ((col * 13) % 40)) * 2;
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(x + col, y + drip, 4, h);
        ctx.fillStyle = '#1a2a8a'; ctx.fillRect(x + col, y + drip, 4, 14);
      }
      if (melt < 0.3) {
        ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
        ctx.fillText('Месть грибов', x + 6, y + 10);
        ctx.fillStyle = '#000';
        ctx.fillText('Ошибка: файл sun.chr повреждён', x + 8, y + 30);
        ctx.fillText('Код: 0x0BAD5UN', x + 8, y + 42);
        ctx.fillText('Игра будет закрыта.', x + 8, y + 54);
        ctx.fillStyle = '#e0e0e8'; ctx.fillRect(x + w - 46, y + h - 22, 38, 14);
        ctx.strokeStyle = '#000'; ctx.strokeRect(x + w - 45.5, y + h - 21.5, 37, 13);
        ctx.fillStyle = '#000'; ctx.fillText('OK', x + w - 33, y + h - 12);
        // маленькая рожица в углу — это всё ещё игра
        ctx.fillStyle = '#c01020'; ctx.fillRect(x + w - 14, y + 3, 8, 8);
        ctx.fillStyle = '#fff'; ctx.fillRect(x + w - 13, y + 5, 2, 2); ctx.fillRect(x + w - 9, y + 5, 2, 2); ctx.fillRect(x + w - 13, y + 9, 6, 1);
      }
      ctx.restore();
      if (melt > 0.4) {                                  // из-под окна смотрит монстр
        var k = Math.max(2, Math.floor(vh / SUN_W)), sz = SUN_W * k;
        ctx.globalAlpha = Math.min(1, (melt - 0.4) * 2);
        ctx.drawImage(SUN_STAGES[3][Math.floor(time * 10) % 3], Math.round((vw - sz) / 2), Math.round(vh - sz * melt * 0.9), sz, sz);
        ctx.globalAlpha = 1;
      }
    }
  };

  function startNightmare(fresh) {
    Horror.moonBeaten = false;
    var def = window.MUSHROOM_NIGHTMARE;
    if (!def) return;
    if (fresh) { game.score = 0; game.coins = 0; game.secrets = 0; }
    if (fresh || game.lives < START_LIVES) game.lives = START_LIVES;
    game.cheated = true;
    startLevel(-1, def);
    Music.restart();
  }

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
        if (Horror.on) Horror.update(dt);
        break;
      case 'towerintro':                      // кошмар: луна врывается в башню
        updateItems(dt);
        Horror.update(dt);
        break;
      case 'moonintro':                       // кошмар: луна забирает флаг
        updateItems(dt);
        Horror.update(dt);
        break;
      case 'crash':                           // кошмар: фальшивый вылет
        Horror.update(dt);
        Horror.updateCrash(dt);
        break;
      case 'transform':                       // кошмар: анимация превращения
      case 'caught':                          // кошмар: монстр поймал
        updateItems(dt);
        Horror.update(dt);
        break;
      case 'clear':
        updatePlayer(dt);
        updateItems(dt);
        if (Horror.on) Horror.update(dt);
        game.timer -= dt;
        if (game.timer <= 0) {
          if (lvl.def.nightmare) Horror.ending();
          else if (game.levelIndex + 1 < LEVELS.length) startLevel(game.levelIndex + 1);
          else finishRun(true);
        }
        break;
      case 'respawn':
        updateItems(dt);
        game.timer -= dt;
        if (game.timer <= 0) {
          setMega(false);
          player.x = player.safe.x - player.w / 2; player.y = player.safe.y - player.h;
          if (Horror.on && Horror.phase === 'chase') Horror.respawnAhead(player.safe.x - 40);
          if (game.cheats.alpha) setMega(true);
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
        if (game.timer <= 0) { if (Horror.on) Horror.gameOver(); else finishRun(false); }
        break;
    }
    if (game.mode !== 'start') updateCamera(dt);
  }

  function updateCamera(dt) {
    if (!player) return;
    var p = player;
    var lw = lvl.w * T, lh = lvl.h * T;
    var tx = p.x + p.w / 2 - view.w / 2 + p.face * (Horror.on && Horror.inSpeed ? 70 : 18);
    cam.x += (tx - cam.x) * Math.min(1, dt * 5);
    cam.x = lw <= view.w ? (lw - view.w) / 2 : Math.max(0, Math.min(lw - view.w, cam.x));
    if (Horror.on && game.mode === 'towerintro') cam.x += (0 - cam.x) * Math.min(1, dt * 6);   // заставка: смотрим на угол, где врывается луна
    if (lh <= view.h) {
      cam.y = lh - view.h;                         // уровень ниже экрана — небо сверху
    } else if (Horror.on && (Horror.phase === 'boss' || Horror.phase === 'moondead') && lvl.arena) {
      var ta = Math.max(0, lvl.arena.y + 24 - view.h);            // в бою видно всю арену и сцену с рэпером
      cam.y += (ta - cam.y) * Math.min(1, dt * 3);
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
  var TILE_INDEX = { 'B': 2, 'C': 3, 'X': 4, '?': 5, 'H': 5, 'M': 5, 'U': 6, '=': 7, '^': 8 };

  function tileIndex(c, tx, ty) {
    if (c === '#' || c === 'v') return lvl.def.grass && !isSolid(tileAt(tx, ty - 1)) ? 0 : 1;
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
    if (Horror.on) Horror.drawSky(cx, cy);
    if (Horror.on) Horror.drawCastle(cx, cy);
    else if (lvl.def.bg === 'meadow' && game.mode !== 'start') Horror.drawNormalSun(cx, cy);

    // Клетки
    var tiles = IMG.tiles;
    var tx0 = Math.floor(cx / T), tx1 = Math.floor((cx + vw) / T);
    var ty0 = Math.max(0, Math.floor(cy / T)), ty1 = Math.min(lvl.h - 1, Math.floor((cy + vh) / T));
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || tx >= lvl.w) continue;
        var c = lvl.grid[ty][tx];
        if (c === '.') continue;
        if (c === '!' && game.cheats.xray) {               // чит XRAY: невидимый блок — полупрозрачный
          ctx.globalAlpha = 0.45;
          ctx.drawImage(tiles, 5 * T, 0, T, T, tx * T - cx, ty * T - cy, T, T);
          ctx.globalAlpha = 1;
          continue;
        }
        var idx = tileIndex(c, tx, ty);
        if (idx === undefined) continue;
        var dy = bumpOffset(tx, ty);
        if (c === 'v' && lvl.crumble[tx + ',' + ty] > 0) dy += Math.round((Math.random() - 0.5) * 3);   // дрожит перед обвалом
        var glow = (c === '?' || c === 'H' || c === 'M');
        ctx.drawImage(tiles, idx * T, 0, T, T, tx * T - cx, ty * T - cy + dy, T, T);
        if (c === '^' && Horror.on && Horror.revealed()) Horror.drawSpikeBlood(tx * T - cx, ty * T - cy, tx);
        if (c === 'v') {                                   // трещины на осыпающемся полу
          ctx.fillStyle = 'rgba(20,8,4,0.75)';
          ctx.fillRect(tx * T - cx + 3, ty * T - cy + dy + 5, 5, 1); ctx.fillRect(tx * T - cx + 7, ty * T - cy + dy + 6, 1, 4);
          ctx.fillRect(tx * T - cx + 8, ty * T - cy + dy + 10, 5, 1); ctx.fillRect(tx * T - cx + 11, ty * T - cy + dy + 3, 1, 3);
        }
        if (glow && Math.floor(time * 3) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,240,170,0.18)';
          ctx.fillRect(tx * T - cx, ty * T - cy + dy, T, T);
        }
      }
    }

    if (game.cheats.xray) {                                // и тайники «$» — мигающая рамка
      ctx.strokeStyle = Math.floor(time * 4) % 2 ? '#ffd34d' : '#ff6b6b';
      lvl.secrets.forEach(function (sc) { ctx.strokeRect(sc.x - cx + 0.5, sc.y - cy + 0.5, T - 1, T - 1); });
    }

    // Флаг
    if (lvl.flag && !(Horror.on && Horror.flagTaken)) {
      var f = lvl.flag, fx = f.tx * T - cx;
      ctx.drawImage(tiles, 13 * T, 0, T, T, fx, f.ty * T - cy, T, T);
      for (var k = 1; k <= FLAG_POLE; k++) ctx.drawImage(tiles, 12 * T, 0, T, T, fx, (f.ty - k) * T - cy, T, T);
      var flagY = (f.ty - FLAG_POLE - 1) * T - cy;
      if (player && player.onFlag) flagY = Math.min(flagY + (2.2 - game.timer) * 70, (f.ty - 1) * T - cy);
      ctx.drawImage(tiles, 11 * T, 0, T, T, fx, Math.round(flagY), T, T);
    }

    if (Horror.on) Horror.drawDecor(cx, cy);

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
    orbs.forEach(function (o) {
      var bob = o.still ? Math.round(Math.sin(time * 5) * 1.5) : 0;
      var ox = Math.round(o.x - cx), oy = Math.round(o.y - cy + bob);
      if (Math.floor(time * 6) % 2 === 0) {          // мерцающее свечение
        ctx.fillStyle = 'rgba(255,80,60,0.35)';
        ctx.fillRect(ox - 2, oy + 1, 12, 6);
        ctx.fillRect(ox + 1, oy - 2, 6, 12);
      }
      ctx.drawImage(ORB, ox, oy);
    });

    // Враги
    enemies.forEach(function (e) {
      if (e.state === 'sucked') return;               // их рисует монстр-воронка
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
        var big = p.mega > 0;
        if (p.growT > 0 && Math.floor(p.growT * 14) % 2 === 0) big = !big;            // мигает при превращении
        if (p.mega > 0 && p.mega < 2 && Math.floor(p.mega * 8) % 2 === 0) big = false;  // скоро сдуется
        var sheet = (p.mega > 0 && MEGA_SHEET) ? MEGA_SHEET : IMG.player;
        var k = big ? MEGA_K : 1;
        var shk = Horror.on && Horror.grabT > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
        if (Horror.on && Horror.grabT > 0) pf = 7;
        drawSprite(sheet, pf, 32, 32, p.x + p.w / 2 - 16 * k - cx + shk, p.y + p.h - 31 * k - cy, p.face < 0, k);
      }
    }

    if (Horror.on) Horror.drawWorld(cx, cy);

    // Частицы
    particles.forEach(function (q) {
      var x = Math.round(q.x - cx), y = Math.round(q.y - cy);
      if (q.kind === 'brick') {
        ctx.drawImage(tiles, (q.tile === undefined ? 3 : q.tile) * T + q.sx, q.sy, 8, 8, x, y, 8, 8);
      } else if (q.kind === 'bone') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot);
        ctx.fillStyle = '#e8e4d8'; ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-5, -2, 2, 4); ctx.fillRect(3, -2, 2, 4);
        ctx.restore();
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
    if (Horror.on) Horror.drawOverlay(cx, cy);
  }

  function bumpOffset(tx, ty) {
    for (var i = 0; i < bumps.length; i++) {
      if (bumps[i].tx === tx && bumps[i].ty === ty) return -Math.round(Math.sin(bumps[i].t / 0.16 * Math.PI) * 4);
    }
    return 0;
  }

  function drawSprite(img, frame, fw, fh, x, y, flip, k) {
    if (!img || (img.tagName === 'IMG' && !ready(img))) return;
    k = k || 1;                                   // целый множитель размера
    x = Math.round(x); y = Math.round(y);
    if (flip) {
      ctx.save();
      ctx.translate(x + fw * k, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, frame * fw, 0, fw, fh, 0, 0, fw * k, fh * k);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame * fw, 0, fw, fh, x, y, fw * k, fh * k);
    }
  }

  // ================= Спрайты, нарисованные кодом =================
  // Сфера-мухомор 8×8: красная с белыми точками
  var ORB = (function () {
    var pat = [
      '..aaaa..',
      '.abbbba.',
      'abwbbbba',
      'abbbbwba',
      'abbwbbba',
      'abwbbbba',
      '.abbbwa.',
      '..aaaa..'
    ];
    var colors = { a: '#5a0c12', b: '#e8303a', w: '#fff4e0' };
    var c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    var g = c.getContext('2d');
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var ch = pat[y][x];
      if (colors[ch]) { g.fillStyle = colors[ch]; g.fillRect(x, y, 1, 1); }
    }
    return c;
  })();

  // «Мега Альфа»: копия листа грибка — шляпка красная (мухомор), глаза красные, брови злые
  var MEGA_SHEET = null;
  function buildMegaSheet() {
    var src = IMG.player;
    if (!ready(src)) return;
    try {
      var c = document.createElement('canvas');
      c.width = src.naturalWidth; c.height = src.naturalHeight;
      var g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      var img = g.getImageData(0, 0, c.width, c.height), d = img.data, W = c.width;
      var at = function (x, y) { return (y * W + x) * 4; };
      var is = function (i, r, gg, b) { return d[i + 3] > 0 && d[i] === r && d[i + 1] === gg && d[i + 2] === b; };
      var dark = function (i) { return d[i + 3] === 0 || is(i, 26, 16, 22); };
      var set = function (i, r, gg, b) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; };
      var CAP = [[252, 160, 72, 232, 44, 44], [224, 116, 56, 186, 28, 34], [168, 84, 36, 122, 16, 24]];
      var frames = Math.floor(W / 32);
      for (var f = 0; f < frames; f++) {
        var ox = f * 32, gy = -1, x, y, i, k;
        // низ шляпки — первая строка с тёмно-коричневой каймой
        for (y = 0; y < 32 && gy < 0; y++) for (x = 0; x < 32; x++) if (is(at(ox + x, y), 112, 91, 70)) { gy = y; break; }
        if (gy < 0) continue;
        for (y = 0; y < gy; y++) for (x = 0; x < 32; x++) {
          i = at(ox + x, y);
          for (k = 0; k < CAP.length; k++) if (is(i, CAP[k][0], CAP[k][1], CAP[k][2])) { set(i, CAP[k][3], CAP[k][4], CAP[k][5]); break; }
        }
        if (f === 7) continue;                         // кадр урона не трогаем
        var eyes = {};
        for (y = gy + 2; y < Math.min(32, gy + 8); y++) for (x = 11; x <= 20; x++) {
          i = at(ox + x, y);
          if (is(i, 26, 16, 22) && !dark(at(ox + x - 1, y)) && !dark(at(ox + x + 1, y))) (eyes[x] = eyes[x] || []).push(y);
        }
        Object.keys(eyes).forEach(function (key) {
          var ex = +key, ys = eyes[key], top = Math.min.apply(null, ys);
          ys.forEach(function (yy) { set(at(ox + ex, yy), 235, 30, 30); });
          var s = ex < 16 ? -1 : 1;                    // бровь: снаружи выше, к центру ниже
          [[ex + 2 * s, top - 2], [ex + s, top - 2], [ex, top - 1], [ex - s, top - 1]].forEach(function (pt) {
            if (pt[0] < 0 || pt[0] > 31 || pt[1] < 0) return;
            var j = at(ox + pt[0], pt[1]);
            if (d[j + 3] > 0) set(j, 30, 6, 6);
          });
        });
      }
      g.putImageData(img, 0, 0);
      MEGA_SHEET = c;
    } catch (e) {
      MEGA_SHEET = null;                               // file:// не даёт читать пиксели — будет обычный грибок
    }
  }

  // ================= HUD и экраны =================
  var hudCache = {};
  function setText(el, key, value) {
    if (hudCache[key] !== value) { hudCache[key] = value; el.textContent = value; }
  }
  function updateHud() {
    // HP: полные и пустые сердечки + число «3/5»
    var nm = lvl && lvl.def.nightmare;
    var lv = Math.max(0, game.lives), key = nm ? 'n' + Horror.deaths : (game.cheats.god ? 'g' : '') + lv;
    if (hudCache.l !== key) {
      hudCache.l = key;
      var html = '<span class="hp-label">HP</span> ';
      if (nm) html = '<span class="hp-label">СМЕРТИ</span> <span class="hp-full">☠</span><span class="hp-num">' + Horror.deaths + '</span>';
      else if (game.cheats.god) html += '<span class="hp-full">♥</span><span class="hp-num">∞</span>';
      else {
        for (var i = 0; i < MAX_LIVES; i++) html += i < lv ? '<span class="hp-full">♥</span>' : '<span class="hp-empty">♥</span>';
        html += '<span class="hp-num">' + lv + '/' + MAX_LIVES + '</span>';
      }
      hud.lives.innerHTML = html;
      hud.lives.classList.remove('hp-flash');
      void hud.lives.offsetWidth;            // перезапуск анимации вспышки
      hud.lives.classList.add('hp-flash');
    }
    setText(hud.coins, 'c', '◎ ' + game.coins);
    setText(hud.score, 's', String(game.score).padStart(6, '0'));
    setText(hud.level, 'v', lvl ? (lvl.def.nightmare ? '?-' : (game.levelIndex + 1) + '-') + lvl.def.name : '');
  }

  function showOverlay(title, text, buttons) {
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovButtons.innerHTML = '';
    cheatBox.classList.add('hidden');
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
  function hideOverlay() { ovTitle.classList.remove('cracked'); overlay.classList.add('hidden'); cheatBox.classList.add('hidden'); primaryAction = null; }

  function showBanner(text, seconds) {
    banner.textContent = text;
    banner.classList.remove('hidden');
    bannerTimer = seconds;
  }

  function showStart() {
    Horror.exit();
    Music.pause();
    if (lvl && lvl.def.nightmare) { buildLevel(LEVELS[0]); player = makePlayer(); snapCamera(); }
    game.mode = 'start';
    var controls = isTouch
      ? '◀ ▶ — бег\nПРЫЖОК — прыжок (держи дольше — выше)'
      : '← → или A D — бег\nПробел, W или ↑ — прыжок\n(держи дольше — выше)\nP или Esc — пауза';
    var seen = load('nightmareVisits', 0);
    showOverlay(seen > 0 ? 'МЕСТЬ ГРИБОВ' : 'МЕСТЬ ГРИБОВ',
      'Герои годами прыгали грибам на головы.\nТеперь твоя очередь: прыгай на героев сверху!\n\n' +
      controls + '\n\nРекорд: ' + game.best,
      [{ label: 'Играть', action: newGame }]);
    ovTitle.classList.toggle('cracked', seen > 0);           // после кошмара на названии трещина
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
    Horror.audioTick();
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
    lives: function (n) { game.lives = n; updateHud(); },
    mega: function () { if (player) collectOrb({ x: player.x, y: player.y }); },
    nightmare: function () { startNightmare(true); },
    horror: function () { return Horror; },
    lvl: function () { return lvl; },
    cam: function () { return cam; },
    items: function () { return { hearts: hearts, orbs: orbs }; },
    tile: function (tx, ty) { return lvl ? tileAt(tx, ty) : null; },
    music: function () { return Music.el ? { paused: Music.el.paused, broken: Music.broken, time: Music.el.currentTime, ready: Music.el.readyState } : null; }
  };

  updateSoundButton();
  loadImages(function () {
    buildMegaSheet();
    buildLevel(LEVELS[0]);
    player = makePlayer();
    resize();
    snapCamera();
    updateHud();
    showStart();
    requestAnimationFrame(frame);
  });
  resize();
})();
