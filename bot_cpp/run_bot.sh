#!/usr/bin/env bash
# Запуск бота. Выполнять в терминале MSYS2 UCRT64 из папки bot_cpp:  ./run_bot.sh
# Токен спрашивается при запуске и не отображается на экране, в файлы не сохраняется.
cd "$(dirname "$0")" || exit 1

if [ ! -x build/retro_arcade_bot.exe ]; then
    echo "Собираю бота..."
    cmake -S . -B build -G Ninja && cmake --build build || exit 1
fi

if [ -z "$BOT_TOKEN" ]; then
    read -rsp "Вставьте токен от @BotFather (правый клик или Shift+Insert; символы не видны) и нажмите Enter: " BOT_TOKEN
    echo
fi
export BOT_TOKEN
export WEBAPP_URL="${WEBAPP_URL:-https://goodbye-g.github.io/RetroGamesProject/}"

exec ./build/retro_arcade_bot.exe
