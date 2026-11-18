// Экранные кнопки для телефона. Коды клавиш — как в js-dos (GLFW): стрелки, Ctrl — огонь, пробел — открыть, Enter.
function initTouch(ci) {
  // На компьютере с мышью кнопки не нужны — там клавиатура
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  if (!touch) return;

  const btns = [
    ['▲',265,'left:70px;bottom:120px'], ['▼',264,'left:70px;bottom:20px'],
    ['◀',263,'left:10px;bottom:70px'],  ['▶',262,'left:130px;bottom:70px'],
    ['ОГОНЬ',341,'right:20px;bottom:90px'], ['ОТКР',32,'right:20px;bottom:20px'],
    ['ENTER',257,'right:90px;bottom:20px']
  ];
  btns.forEach(([text, key, pos]) => {
    const b = document.createElement('div');
    b.textContent = text;
    b.style.cssText = 'position:fixed;z-index:10;width:56px;height:56px;border-radius:50%;' +
      'background:#fff3;color:#fff;font:12px monospace;display:flex;align-items:center;' +
      'justify-content:center;touch-action:none;user-select:none;' + pos;
    let pressed = false;
    const down = e => {
      e.preventDefault();
      if (pressed) return;
      pressed = true;
      b.setPointerCapture?.(e.pointerId);
      ci.sendKeyEvent(key, true);
    };
    const up = e => {
      e.preventDefault();
      if (!pressed) return;
      pressed = false;
      ci.sendKeyEvent(key, false);
    };
    // pointer-события: работают и для пальца, и для мыши, и с несколькими пальцами сразу
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    document.body.appendChild(b);
  });
}
