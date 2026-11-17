// Список игр, который бот показывает кнопками.
// Чтобы добавить игру: впишите её в группу своего автора и поставьте ready = true.
// path — путь к папке игры внутри webapp/, со слешем в конце.
#pragma once

#include <string>
#include <vector>

struct Game {
    std::string title;  // текст на кнопке
    std::string path;   // например "games/si/mushroom/"
    bool ready;         // false — кнопка отвечает «скоро»
};

struct Author {
    std::string initials;  // заголовок группы: СИ, СВ, ША
    std::vector<Game> games;
};

inline const std::vector<Author>& allAuthors() {
    static const std::vector<Author> authors = {
        {"СИ", {
            {"Месть грибов", "games/si/mushroom/", true},
            {"Игра 2",       "",                   false},
        }},
        {"СВ", {
            {"Игра 1", "", false},
            {"Игра 2", "", false},
        }},
        {"ША", {
            {"Игра 1", "", false},
            {"Игра 2", "", false},
        }},
    };
    return authors;
}
