/*
  Общая настройка Telegram Mini App для меню и плеера:
  разворачивает окно, включает тёмную тему, если она в Telegram, красит шапку.
  Вне Telegram всё работает как обычная страница.
*/
(function () {
  'use strict';
  var tg = window.Telegram && window.Telegram.WebApp;
  var inTelegram = !!(tg && tg.initData);

  function call(fn) { try { fn(); } catch (e) { /* старые клиенты Telegram поддерживают не всё */ } }

  function applyTheme() {
    var dark;
    if (inTelegram) {
      dark = tg.colorScheme === 'dark';
    } else {
      dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (inTelegram) {
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      call(function () { tg.setHeaderColor(bg); });
      call(function () { tg.setBackgroundColor(bg); });
      call(function () { tg.setBottomBarColor(bg); });
    }
  }

  if (tg) {
    call(function () { tg.ready(); });
    call(function () { tg.expand(); });
    call(function () { tg.disableVerticalSwipes(); });
    call(function () { tg.onEvent('themeChanged', applyTheme); });
  }
  applyTheme();

  window.Arcade = {
    tg: inTelegram ? tg : null,
    // Новые функции Telegram (полный экран, ориентация) есть с версии 8.0
    tgAtLeast: function (v) { return inTelegram && tg.isVersionAtLeast && tg.isVersionAtLeast(v); },
    call: call
  };
})();
