# Как мы работаем

## Папки

Каждый работает **только в своей папке**, чужие не трогает:

| Папка | Кто |
|---|---|
| `webapp/games/si/` | Участник 1 — СИ |
| `webapp/games/sv/` | Участник 2 — СВ |
| `webapp/games/sha/` | Участник 3 — ША |

Внутри своей папки делаете по подпапке на игру, например `webapp/games/sv/pong/`.
Картинки, звуки и скрипты игры лежат внутри её подпапки и подключаются относительными путями: `./game.js`, `./assets/hit.wav`.

## Ветки

* `main` — только проверенная версия. Напрямую в `main` не пушим, всё через Pull Request, мержит Участник 1 (СИ).
* Под каждую игру — своя ветка от свежего `main`: `feature/<инициалы>-<игра>`, например `feature/sv-pong`.

```bash
git checkout main
git pull
git checkout -b feature/sv-pong
# ...работа, коммиты...
git push -u origin feature/sv-pong
# затем Pull Request в main на GitHub
```
