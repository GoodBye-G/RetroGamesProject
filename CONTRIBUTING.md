# Как мы работаем

## Ветки

* `main` — только рабочая, собранная версия. Напрямую в `main` не пушим, всё через Pull Request, мержит Участник 1.
* Каждая задача — своя ветка от свежего `main`:

| Ветка | Кто | Что |
|---|---|---|
| `feature/bot` | Участник 1 | C++ бот в `bot_cpp/` |
| `feature/dev1-<игра>` | Участник 1 | игры в `webapp/games/dev1_games/` |
| `feature/dev2-<игра>` | Участник 2 | игры в `webapp/games/dev2_games/` |
| `feature/dev3-<игра>` | Участник 3 | игра в `webapp/games/dev3_game/` |
| `feature/theme` | Участник 3 | `webapp/css/theme.css`, `webapp/assets/` |
| `feature/presentation` | Участник 3 | `presentation/` |

```bash
git checkout main
git pull
git checkout -b feature/dev2-pong
# ...работа, коммиты...
git push -u origin feature/dev2-pong
# затем Pull Request в main на GitHub
```

## Папки — кто что трогает

1. Работаете **только в своей папке**. Чужие папки, `webapp/index.html` и `webapp/js/arcade.js` не меняете — если нужно что-то общее, пишите Участнику 1.
2. Хотите переименовать `game_1` в имя своей игры (например, `pong`) — переименовывайте и напишите Участнику 1 новое имя и название игры: он поправит ссылку в меню.
3. Картинки, звуки и скрипты игры лежат внутри её папки и подключаются **относительными путями**: `./game.js`, `./assets/hit.wav`.

## Что должно быть в каждой игре

Всё это уже есть в шаблоне `webapp/games/_template/` — просто не удаляйте:

* в `<head>`: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`;
* общая тема: `<link rel="stylesheet" href="../../../css/theme.css">`;
* общий хелпер: `<script src="../../../js/arcade.js"></script>` — он сам разворачивает приложение на весь экран (`Telegram.WebApp.expand()`), включает кнопку «Назад» Telegram и запрещает закрытие свайпом вниз;
* кнопка возврата: `<a href="../../../index.html" class="back-btn">← В меню</a>` (три уровня вверх — игра лежит в `webapp/games/devX/игра/`);
* экранные кнопки управления для телефона (блок `.touch-controls`);
* игра помещается в экран телефона без горизонтальной прокрутки.

## Хелпер `Arcade` (webapp/js/arcade.js)

```js
Arcade.isTelegram          // true, если открыто внутри Telegram
Arcade.haptic('light')     // виброотклик: 'light' | 'medium' | 'heavy' | 'error' | 'success'
Arcade.getBest('pong')     // рекорд из localStorage (0, если нет)
Arcade.saveBest('pong', 42) // сохраняет, только если больше прежнего; возвращает рекорд
Arcade.goMenu()            // вернуться в меню
```

## Перед Pull Request

* Игра запускается через `python -m http.server 8000 --directory webapp` и открывается из меню.
* Проверили в режиме телефона (DevTools → устройство 375×812): всё видно, кнопки нажимаются.
* Кнопка «← В меню» возвращает в меню.
* В консоли браузера нет ошибок.
