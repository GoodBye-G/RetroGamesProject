#include "telegram.hpp"

#include <curl/curl.h>

#include <stdexcept>
#include <utility>

namespace {

size_t writeToString(char* data, size_t size, size_t count, void* out) {
    static_cast<std::string*>(out)->append(data, size * count);
    return size * count;
}

}  // namespace

Telegram::Telegram(std::string token) : token_(std::move(token)), curl_(curl_easy_init()) {
    if (!curl_) throw std::runtime_error("не удалось инициализировать libcurl");
}

Telegram::~Telegram() {
    curl_easy_cleanup(static_cast<CURL*>(curl_));
}

json Telegram::call(const std::string& method, const json& params, long timeoutSec) {
    CURL* curl = static_cast<CURL*>(curl_);
    const std::string url = "https://api.telegram.org/bot" + token_ + "/" + method;
    const std::string body = params.dump();
    std::string response;

    curl_slist* headers = curl_slist_append(nullptr, "Content-Type: application/json");

    curl_easy_reset(curl);
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeToString);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, timeoutSec);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
#ifdef _WIN32
    // Берём сертификаты из хранилища Windows, а не из файла
    curl_easy_setopt(curl, CURLOPT_SSL_OPTIONS, static_cast<long>(CURLSSLOPT_NATIVE_CA));
#endif

    const CURLcode code = curl_easy_perform(curl);
    curl_slist_free_all(headers);

    if (code != CURLE_OK) {
        // В тексте ошибки нет URL, поэтому токен в лог не попадёт
        throw std::runtime_error(std::string("сеть: ") + curl_easy_strerror(code));
    }

    const json reply = json::parse(response, nullptr, false);
    if (reply.is_discarded()) throw std::runtime_error("Telegram вернул не JSON");
    if (!reply.value("ok", false)) {
        throw std::runtime_error("Telegram: " + reply.value("description", std::string("неизвестная ошибка")));
    }
    return reply.value("result", json());
}
