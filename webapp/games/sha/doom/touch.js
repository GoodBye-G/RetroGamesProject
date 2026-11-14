function initTouch(ci) {
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
    const down = e => { e.preventDefault(); ci.sendKeyEvent(key, true); };
    const up = e => { e.preventDefault(); ci.sendKeyEvent(key, false); };
    b.addEventListener('touchstart', down, {passive:false});
    b.addEventListener('touchend', up);
    b.addEventListener('touchcancel', up);
    document.body.appendChild(b);
  });
}
