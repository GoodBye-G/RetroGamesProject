// Минимальный клиент Telegram Bot API поверх libcurl.
#pragma once

#include <nlohmann/json.hpp>
#include <string>

using json = nlohmann::json;

class Telegram {
public:
    explicit Telegram(std::string token);
    ~Telegram();

    Telegram(const Telegram&) = delete;
    Telegram& operator=(const Telegram&) = delete;

    // Вызывает метод Bot API. Возвращает поле "result" или бросает std::runtime_error.
    json call(const std::string& method, const json& params = json::object(), long timeoutSec = 15);

private:
    std::string token_;
    void* curl_;  // CURL*, чтобы не тащить curl.h в заголовок
};
