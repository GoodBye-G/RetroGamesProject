function initTouch(ci) {
  // 1) Касания экрана больше не доходят до игры (иначе любой тап = выстрел)
  const dos = document.getElementById('dos');
  if (dos) dos.style.pointerEvents = 'none';
  // Клик или тап по игре возвращает ей клавиатуру (на компьютере)
  document.addEventListener('pointerdown', () => window.focus(), true);

  // 2) Запрет выделения текста и контекстного меню при долгом нажатии
  const st = document.createElement('style');
  st.textContent = '.tc{position:fixed;z-index:10;touch-action:none;user-select:none;' +
    '-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}' +
    '.tb{border-radius:50%;background:#fff3;border:2px solid #fff5;color:#fff;font:bold 12px monospace;' +
    'display:flex;align-items:center;justify-content:center;text-align:center}' +
    '.tb.on{background:#fff7}' +
    '.ts{width:110px;height:110px;border-radius:50%;background:#fff2;border:2px solid #fff4}' +
    '.tk{position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:#fff7;pointer-events:none}';
  document.head.appendChild(st);
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Коды клавиш js-dos: стрелки, Ctrl, пробел, Enter, запятая/точка, цифры
  const K = { up: 265, down: 264, left: 263, right: 262, fire: 341, use: 32, enter: 257, sl: 44, sr: 46 };
  const held = {};
  const key = (code, on) => { if (!!held[code] === on) return; held[code] = on; ci.sendKeyEvent(code, on); };

  function button(text, css, code) {
    const b = document.createElement('div');
    b.className = 'tc tb'; b.textContent = text; b.style.cssText = css;
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); key(code, true); });
    const up = e => { e.preventDefault(); b.classList.remove('on'); key(code, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    document.body.appendChild(b);
  }

  // Смена оружия по кругу: 1 -> 2 -> 3 -> 4 -> 5 -> 1 ...
  // В Doom нет команды "следующее оружие", поэтому шлём цифру клавиши.
  // Если такого оружия ещё нет, ничего не произойдёт: нажмите кнопку ещё раз.
  const WEAPONS = 5; // в shareware-версии оружие 1-5
  let w = 1;         // какую цифру отправим при следующем нажатии
  const wb = document.createElement('div');
  wb.className = 'tc tb';
  wb.style.cssText = 'right:16px;bottom:140px;width:52px;height:52px';
  const label = () => { wb.innerHTML = 'ОРУЖ<br>▶' + w; };
  label();
  wb.addEventListener('pointerdown', e => {
    e.preventDefault(); wb.classList.add('on');
    const c = 48 + w; // код цифры
    ci.sendKeyEvent(c, true); setTimeout(() => ci.sendKeyEvent(c, false), 80);
    w = w % WEAPONS + 1; label();
  });
  const wup = () => wb.classList.remove('on');
  wb.addEventListener('pointerup', wup); wb.addEventListener('pointercancel', wup);
  document.body.appendChild(wb);

  // Виртуальный джойстик; map решает, какие клавиши включаются
  function stick(pos, map) {
    const s = document.createElement('div');
    s.className = 'tc ts'; s.style.cssText = pos;
    const k = document.createElement('div'); k.className = 'tk'; s.appendChild(k);
    let id = null;
    const move = e => {
      const r = s.getBoundingClientRect();
      let dx = (e.clientX - r.left - 55) / 55, dy = (e.clientY - r.top - 55) / 55;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      k.style.left = 35 + dx * 35 + 'px'; k.style.top = 35 + dy * 35 + 'px';
      map(dx, dy);
    };
    const end = () => { id = null; k.style.left = k.style.top = '35px'; map(0, 0); };
    s.addEventListener('pointerdown', e => { e.preventDefault(); id = e.pointerId; s.setPointerCapture(id); move(e); });
    s.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
    document.body.appendChild(s);
  }
  const T = 0.35; // мёртвая зона
  // Левый стик: вперёд/назад и боковые шаги
  stick('left:16px;bottom:16px', (dx, dy) => {
    key(K.up, dy < -T); key(K.down, dy > T); key(K.sl, dx < -T); key(K.sr, dx > T);
  });
  // Правый стик: повороты
  stick('right:16px;bottom:16px', (dx) => {
    key(K.left, dx < -T); key(K.right, dx > T);
  });

  button('ОГОНЬ', 'right:140px;bottom:24px;width:72px;height:72px', K.fire);
  button('ОТКР', 'right:140px;bottom:106px;width:56px;height:56px', K.use);
  button('ENTER', 'left:16px;bottom:140px;width:52px;height:52px', K.enter);
}
