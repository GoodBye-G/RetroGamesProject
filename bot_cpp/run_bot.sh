#!/usr/bin/env bash
# Запуск бота. Выполнять в терминале MSYS2 UCRT64 из папки bot_cpp:  ./run_bot.sh
# Токен берётся из файла bot_cpp/.env (строка BOT_TOKEN=...). Этот файл в git не попадает.
# Если файла нет — токен спрашивается при запуске (ввод скрыт).
cd "$(dirname "$0")" || exit 1

if [ ! -x build/retro_arcade_bot.exe ]; then
    echo "Собираю бота..."
    cmake -S . -B build -G Ninja && cmake --build build || exit 1
fi

if [ -f .env ]; then
    # Убираем возможные \r от Блокнота и пробелы по краям
    BOT_TOKEN="$(grep -m1 '^BOT_TOKEN=' .env | cut -d= -f2- | tr -d '\r[:space:]')"
fi

if [ -z "$BOT_TOKEN" ]; then
    read -rsp "Вставьте токен от @BotFather (символы не видны) и нажмите Enter: " BOT_TOKEN
    echo
fi

if [ -z "$BOT_TOKEN" ]; then
    echo "Токен не задан: впишите его в bot_cpp/.env после BOT_TOKEN="
    exit 1
fi

export BOT_TOKEN
export WEBAPP_URL="${WEBAPP_URL:-https://goodbye-g.github.io/RetroGamesProject/}"

exec ./build/retro_arcade_bot.exe
