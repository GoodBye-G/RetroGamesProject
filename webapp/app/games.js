/*
  Список игр аркады. Его читают меню (index.html) и плеер (play.html).
  Чтобы добавить игру: впишите её в группу своего автора и поставьте ready: true.
    id    — уникальный, латиницей: <инициалы>-<игра>
    path  — папка игры внутри webapp/games/, со слешем в конце; в ней должен быть index.html
    icon  — необязательно: картинка-спрайт для карточки { src, frames } (берётся первый кадр)
*/
window.ARCADE_GAMES = [
  {
    initials: 'СИ',
    games: [
      {
        id: 'si-mushroom',
        title: 'Месть грибов',
        about: 'Платформер наоборот: грибок прыгает на героев',
        path: 'si/mushroom/',
        icon: { src: 'games/si/mushroom/assets/player.png', frames: 8 },
        ready: true
      },
      { id: 'si-game2', title: 'Игра 2', about: 'В разработке', ready: false }
    ]
  },
  {
    initials: 'СВ',
    games: [
      { id: 'sv-game1', title: 'Игра 1', about: 'В разработке', ready: false },
      { id: 'sv-game2', title: 'Игра 2', about: 'В разработке', ready: false }
    ]
  },
  {
    initials: 'ША',
    games: [
      {
        id: 'sha-doom',
        title: 'DOOM',
        about: 'Легендарный шутер от первого лица',
        path: 'sha/doom/',
        ready: true
      },
      { id: 'sha-game2', title: 'Игра 2', about: 'В разработке', ready: false }
    ]
  }
];

window.findArcadeGame = function (id) {
  for (var i = 0; i < window.ARCADE_GAMES.length; i++) {
    var group = window.ARCADE_GAMES[i];
    for (var j = 0; j < group.games.length; j++) {
      if (group.games[j].id === id) return { game: group.games[j], initials: group.initials };
    }
  }
  return null;
};
