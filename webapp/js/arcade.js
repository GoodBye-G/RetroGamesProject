/*
  Общий хелпер Retro Arcade. Владелец: Участник 1.
  Подключается в каждой игре ПОСЛЕ telegram-web-app.js:
    <script src="../../../js/arcade.js"></script>
  Не меняйте этот файл в своей ветке — нужны изменения, пишите Участнику 1.
*/
(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  // Вне Telegram объект WebApp тоже есть, но initData пустой
  var isTelegram = !!(tg && tg.initData);

  // Путь до главного меню считаем от адреса этого скрипта: .../webapp/js/arcade.js -> .../webapp/index.html
  var script = document.currentScript;
  var menuUrl = script ? new URL('../index.html', script.src).href : '../../../index.html';
  var isMenu = location.href.split(/[?#]/)[0].replace(/index\.html$/, '') ===
               menuUrl.replace(/index\.html$/, '');

  function call(fn) {
    try { fn(); } catch (e) { /* старые клиенты Telegram поддерживают не всё */ }
  }

  if (tg) {
    call(function () { tg.ready(); });
    call(function () { tg.expand(); });
    // Свайп вниз в игре не должен закрывать приложение
    call(function () { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); });
    call(function () { tg.setHeaderColor('#0d0b1e'); });
    call(function () { tg.setBackgroundColor('#0d0b1e'); });

    if (isTelegram && tg.BackButton) {
      call(function () {
        if (isMenu) {
          tg.BackButton.hide();
        } else {
          tg.BackButton.onClick(goMenu);
          tg.BackButton.show();
        }
      });
    }
  }

  function goMenu() {
    location.href = menuUrl;
  }

  function haptic(kind) {
    if (!isTelegram || !tg.HapticFeedback) return;
    call(function () {
      if (kind === 'error' || kind === 'success' || kind === 'warning') {
        tg.HapticFeedback.notificationOccurred(kind);
      } else {
        tg.HapticFeedback.impactOccurred(kind || 'light');
      }
    });
  }

  // localStorage может быть недоступен (приватный режим) — тогда просто без рекордов
  function getBest(gameId) {
    try { return parseInt(localStorage.getItem('arcade.best.' + gameId), 10) || 0; }
    catch (e) { return 0; }
  }

  function saveBest(gameId, score) {
    var best = getBest(gameId);
    if (score > best) {
      best = score;
      try { localStorage.setItem('arcade.best.' + gameId, String(score)); } catch (e) {}
    }
    return best;
  }

  window.Arcade = {
    tg: tg || null,
    isTelegram: isTelegram,
    menuUrl: menuUrl,
    goMenu: goMenu,
    haptic: haptic,
    getBest: getBest,
    saveBest: saveBest
  };
})();
