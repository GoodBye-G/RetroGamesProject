# bot_cpp — Telegram-бот на C++

Владелец: **Участник 1 (СИ)**. Ветка: `feature/bot`.

## Что делает

На `/start` (или `/games`) бот присылает кнопку **«Открыть аркаду»**. Та же кнопка «Аркада» стоит в меню чата слева от поля ввода.
Кнопка открывает Mini App внутри Telegram: там меню игр по авторам (СИ, СВ, ША), игрок выбирает игру, и она запускается.
Кнопки Web App работают в личном чате с ботом.

Список игр живёт не в боте, а в [`webapp/app/games.js`](../webapp/app/games.js) — после добавления игры бота пересобирать не нужно.

## Файлы

* `src/main.cpp` — команды, кнопка Mini App, цикл получения сообщений (long polling).
* `src/telegram.cpp`, `src/telegram.hpp` — маленький клиент Bot API на libcurl.
* `CMakeLists.txt` — сборка.

Библиотеки: **libcurl** (HTTP) и **nlohmann/json** (JSON).

## Сборка на Windows (MSYS2)

1. Установить MSYS2 с https://www.msys2.org и открыть терминал **MSYS2 UCRT64**.
2. Поставить компилятор и библиотеки:

```bash
pacman -S --needed mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-curl mingw-w64-ucrt-x86_64-nlohmann-json
```

3. Собрать (из папки `bot_cpp`):

```bash
cmake -S . -B build -G Ninja
cmake --build build
```

Получится `build/retro_arcade_bot.exe`. Папка `build/` в git не попадает.
Запускайте его из терминала MSYS2 UCRT64 — там лежат нужные библиотеки (DLL).

Проверить кнопку без токена и без интернета:

```bash
./build/retro_arcade_bot.exe --dry-run
```

## Запуск

1. Создать бота у @BotFather (`/newbot`) и получить токен.
2. Веб-часть (`webapp/`) должна лежать на хостинге с **https** — например, GitHub Pages.
3. Задать переменные и запустить (терминал MSYS2):

```bash
export BOT_TOKEN="токен_от_BotFather"
export WEBAPP_URL="https://goodbye-g.github.io/RetroGamesProject/"
./build/retro_arcade_bot.exe
```

`WEBAPP_URL` — адрес папки `webapp` на хостинге: по нему открывается меню аркады (`webapp/index.html`).

**Токен никогда не коммитим** и никому не пересылаем. Если он утёк — `/revoke` у @BotFather.
