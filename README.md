# 🕹️ Retro Arcade — Telegram Mini App

Ретро-аркада из 5 браузерных игр, которая открывается внутри Telegram через Web App.
Бот написан на C++, веб-часть — чистые HTML5 / CSS / JS, хостинг — GitHub Pages.

Полный план — [PROJECT_PLAN.md](PROJECT_PLAN.md). Правила работы с ветками и папками — [CONTRIBUTING.md](CONTRIBUTING.md).

## Структура

```text
bot_cpp/                     Telegram-бот на C++ (Участник 1, ветка feature/bot)
webapp/
  index.html                 Главное меню на 5 игр (меняет только Участник 1)
  css/theme.css              Общая ретро-тема (Участник 3)
  js/arcade.js               Общий хелпер: Telegram, кнопка «Назад», рекорды
  assets/                    Общие шрифты и звуки (Участник 3)
  games/
    _template/               Шаблон пустой игры — копируйте отсюда
    dev1_games/game_1, game_2   Участник 1
    dev2_games/game_1, game_2   Участник 2
    dev3_game/game_1            Участник 3
presentation/                Презентация к защите (Участник 3)
```

## Запуск веб-части локально

Нужен любой статический сервер (открывать `index.html` двойным кликом нельзя — часть браузеров блокирует скрипты с `file://`).

```bash
python -m http.server 8000 --directory webapp
```

Затем откройте http://localhost:8000. Вне Telegram всё работает так же, просто без кнопки «Назад» в шапке Telegram.

## Бот

Код бота появится в ветке `feature/bot`. Токен от @BotFather хранится только локально, в переменной окружения `BOT_TOKEN`, и в репозиторий не попадает.
