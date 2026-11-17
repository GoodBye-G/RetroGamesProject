cmake_minimum_required(VERSION 3.16)
project(retro_arcade_bot LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)
find_package(nlohmann_json 3.2 REQUIRED)

add_executable(retro_arcade_bot
    src/main.cpp
    src/telegram.cpp
)

target_link_libraries(retro_arcade_bot PRIVATE CURL::libcurl nlohmann_json::nlohmann_json)

if(MSVC)
    target_compile_options(retro_arcade_bot PRIVATE /utf-8 /W4)
else()
    target_compile_options(retro_arcade_bot PRIVATE -Wall -Wextra)
endif()
