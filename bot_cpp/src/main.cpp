// Telegram-бот Retro Arcade.
// /start присылает кнопку «Открыть аркаду»: она открывает Mini App со списком игр
// (меню webapp/index.html), там игрок выбирает игру. Та же кнопка ставится в меню чата.
//
// Настройки — переменные окружения:
//   BOT_TOKEN   токен от @BotFather
//   WEBAPP_URL  адрес папки webapp на хостинге, https и слеш в конце,
//               например https://goodbye-g.github.io/RetroGamesProject/

#include "telegram.hpp"

#include <curl/curl.h>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>

#ifdef _WIN32
#include <windows.h>
#endif

namespace {

std::string env(const char* name) {
    const char* value = std::getenv(name);
    return value ? value : "";
}

// Одна кнопка Web App — открывает меню аркады внутри Telegram.
json buildKeyboard(const std::string& baseUrl) {
    return {{"inline_keyboard", json::array({
        json::array({ {{"text", "Открыть аркаду"}, {"web_app", {{"url", baseUrl}}}} }),
    })}};
}

void sendMenu(Telegram& tg, long long chatId, const std::string& baseUrl) {
    tg.call("sendMessage", {
        {"chat_id", chatId},
        {"text", "Ретро-аркада: 6 игр от трёх авторов.\n\nНажми кнопку — откроется список игр."},
        {"reply_markup", buildKeyboard(baseUrl)},
    });
}

void handleUpdate(Telegram& tg, const json& update, const std::string& baseUrl) {
    if (!update.contains("message")) return;

    const json& msg = update["message"];
    const std::string text = msg.value("text", std::string());
    const long long chatId = msg["chat"].value("id", 0LL);

    if (text.rfind("/start", 0) == 0 || text.rfind("/games", 0) == 0) {
        if (msg["chat"].value("type", std::string()) != "private") {
            // Кнопки Web App в сообщениях работают только в личном чате с ботом
            tg.call("sendMessage", {{"chat_id", chatId}, {"text", "Аркада открывается в личном чате с ботом."}});
            return;
        }
        sendMenu(tg, chatId, baseUrl);
    }
}

}  // namespace

int main(int argc, char** argv) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif

    const std::string token = env("BOT_TOKEN");
    std::string baseUrl = env("WEBAPP_URL");

    // --dry-run: напечатать клавиатуру и выйти, без токена и без сети
    if (argc > 1 && std::string(argv[1]) == "--dry-run") {
        if (baseUrl.empty()) baseUrl = "https://example.github.io/RetroGamesProject/";
        if (baseUrl.back() != '/') baseUrl += '/';
        std::cout << buildKeyboard(baseUrl).dump(2) << "\n";
        return 0;
    }

    if (token.empty() || baseUrl.empty()) {
        std::cerr << "Задайте переменные окружения BOT_TOKEN и WEBAPP_URL (см. bot_cpp/README.md)\n";
        return 1;
    }
    if (baseUrl.rfind("https://", 0) != 0) {
        std::cerr << "WEBAPP_URL должен начинаться с https:// — иначе Telegram не откроет игру\n";
        return 1;
    }
    if (baseUrl.back() != '/') baseUrl += '/';

    curl_global_init(CURL_GLOBAL_DEFAULT);
    int exitCode = 0;
    try {
        Telegram tg(token);

        const json me = tg.call("getMe");
        std::cout << "Бот @" << me.value("username", std::string("?")) << " запущен. Ctrl+C — остановить.\n";

        // Команды в меню «/» у пользователя
        tg.call("setMyCommands", {{"commands", json::array({
            {{"command", "start"}, {"description", "Открыть аркаду"}},
            {{"command", "games"}, {"description", "Открыть аркаду"}},
        })}});

        // Кнопка «Аркада» слева от поля ввода — открывает Mini App без команды
        tg.call("setChatMenuButton", {{"menu_button", {
            {"type", "web_app"}, {"text", "Аркада"}, {"web_app", {{"url", baseUrl}}},
        }}});

        long long offset = 0;
        while (true) {
            try {
                // Long polling: Telegram держит запрос до 30 секунд, пока не придёт событие
                const json updates = tg.call("getUpdates", {
                    {"offset", offset},
                    {"timeout", 30},
                    {"allowed_updates", json::array({"message"})},
                }, 40);

                for (const json& update : updates) {
                    offset = update.value("update_id", 0LL) + 1;
                    try {
                        handleUpdate(tg, update, baseUrl);
                    } catch (const std::exception& e) {
                        std::cerr << "Ошибка обработки сообщения: " << e.what() << "\n";
                    }
                }
            } catch (const std::exception& e) {
                std::cerr << "Ошибка связи: " << e.what() << ". Повтор через 5 с\n";
                std::this_thread::sleep_for(std::chrono::seconds(5));
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "Не удалось запустить бота: " << e.what() << "\n";
        exitCode = 1;
    }
    curl_global_cleanup();
    return exitCode;
}
