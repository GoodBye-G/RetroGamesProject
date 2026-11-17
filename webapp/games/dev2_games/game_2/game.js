/*
  Шаблон игры. Это заглушка: по полю ходит квадрат.
  Замените логику на свою, но оставьте общий каркас: GAME_ID, рекорд, оверлей, управление.
*/
(function () {
  'use strict';

  // Уникальный id игры — Участник 1 укажет его же в меню (webapp/index.html)
  var GAME_ID = 'dev2-game2';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayText = document.getElementById('overlay-text');
  var startBtn = document.getElementById('start-btn');

  var CELL = 20;
  var player, score, running;

  bestEl.textContent = Arcade.getBest(GAME_ID);

  function start() {
    player = { x: 7, y: 7 };
    score = 0;
    running = true;
    scoreEl.textContent = score;
    overlay.hidden = true;
    draw();
  }

  function finish() {
    running = false;
    bestEl.textContent = Arcade.saveBest(GAME_ID, score);
    Arcade.haptic('error');
    overlayTitle.textContent = 'ИГРА ОКОНЧЕНА';
    overlayText.textContent = 'Счёт: ' + score;
    startBtn.textContent = 'ЕЩЁ РАЗ';
    overlay.hidden = false;
  }

  // Единая точка управления: клавиатура и экранные кнопки вызывают одно и то же
  function onInput(dir) {
    if (!running) return;
    if (dir === 'up') player.y--;
    if (dir === 'down') player.y++;
    if (dir === 'left') player.x--;
    if (dir === 'right') player.x++;

    var max = canvas.width / CELL - 1;
    if (player.x < 0 || player.y < 0 || player.x > max || player.y > max) {
      finish();
      return;
    }
    score++;
    scoreEl.textContent = score;
    Arcade.haptic('light');
    draw();
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(player.x * CELL, player.y * CELL, CELL, CELL);
  }

  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
               KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

  document.addEventListener('keydown', function (e) {
    if (KEYS[e.code]) {
      e.preventDefault();
      onInput(KEYS[e.code]);
    }
  });

  document.querySelectorAll('.touch-controls [data-dir]').forEach(function (btn) {
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      onInput(btn.dataset.dir);
    });
  });

  startBtn.addEventListener('click', start);
})();
