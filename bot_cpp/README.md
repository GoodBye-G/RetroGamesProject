# bot_cpp — Telegram-бот на C++

Владелец: **Участник 1 (СИ)**. Ветка: `feature/bot`.

## Что делает

На `/start` (или `/games`) бот присылает сообщение со списком игр кнопками:

```text
[        СИ        ]
[ Месть грибов ][ Игра 2 · скоро ]
[        СВ        ]
[ Игра 1 · скоро ][ Игра 2 · скоро ]
[        ША        ]
[ Игра 1 · скоро ][ Игра 2 · скоро ]
```

Кнопка готовой игры — Web App: игра открывается **внутри Telegram**, во встроенном окне.
Кнопка «скоро» отвечает всплывающей подсказкой. Кнопки работают в личном чате с ботом.

## Как добавить игру

Файл [`src/games.hpp`](src/games.hpp): в группе автора поменяйте название, впишите путь к папке игры внутри `webapp/` и поставьте `ready = true`. Пересоберите бота.

```cpp
{"Понг", "games/sv/pong/", true},
```

## Файлы

* `src/main.cpp` — команды, клавиатура, цикл получения сообщений (long polling).
* `src/telegram.cpp`, `src/telegram.hpp` — маленький клиент Bot API на libcurl.
* `src/games.hpp` — список игр.
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

Проверить кнопки без токена и без интернета:

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

`WEBAPP_URL` — адрес папки `webapp` на хостинге. Бот добавляет к нему путь игры: `.../games/si/mushroom/index.html`.

**Токен никогда не коммитим** и никому не пересылаем. Если он утёк — `/revoke` у @BotFather.
