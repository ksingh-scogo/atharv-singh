# Atharv's Snake Clash

**Made by Atharv Singh, Podar International School, Nerul**

A colorful snake arena game. Gobble eggs and small snakes, open **mystery boxes**, stay away from the crowned **King**, and grow big enough to beat the giant **Bosses**. Play on your own, or **with friends in the same arena**.

It runs in any modern browser on a phone, tablet, Chromebook or computer.

## What's new in version 2

- **Play with friends.** Everyone who opens the game link is asked for their name, then joins the same arena. Friends have blue names, and there is **no limit** on how many can join.
- **Mystery boxes.** Purple gift boxes pop up and disappear every few seconds. Any snake can open one and gets one of 8 surprises: 4 power-ups and 4 power-downs.
- **Name box.** The game always starts with "What's your name?"

## Three ways to play

| | How | Friends? |
|---|---|---|
| **On your own** | Double-click `index.html`. Nothing to install. | No |
| **With friends, same Wi-Fi** | `npm install` once, then `npm start`. Open the address it prints (it prints one for this computer and one for phones on the same Wi-Fi). | Yes |
| **With friends, anywhere** | Run the game server somewhere on the internet (see [Putting it online](#putting-it-online)) and share its link. | Yes |

Friends need the **game server** because the arena has to live in one place that everybody connects to. A plain web page (or a file) can only play solo. The game notices on its own: if it finds the game server it offers **PLAY WITH FRIENDS**, otherwise it says it is playing on your own.

```bash
cd atharvs-snake-clash
npm install
npm start
#  On this computer:    http://localhost:3000
#  On the same Wi-Fi:   http://192.168.x.x:3000     <- friends on the same network open this
```

## How to play

| Device | Steer |
|---|---|
| Phone / tablet | Touch and drag anywhere. A little joystick appears under your finger. |
| Mouse | Move the mouse. The snake follows the pointer. |
| Keyboard | Arrow keys or W A S D. `Esc` or `P` opens the menu. |

Your snake always moves forward on its own.

- 🥚 **Eggs** make you grow. **Golden eggs** give a lot of growth *and* a bubble shield.
- 🐍 **Bump any ordinary computer snake to eat it.** It gets swallowed from whichever end you touched (head-end or tail-end).
- 🎁 **Mystery boxes** give a surprise (below).
- 👑 **The King** is the biggest snake. It can eat *you*. A gold arrow shows where it is, and the screen glows red when it gets close.
- 👹 **The Boss** wakes up when a player reaches a certain size. Get **bigger than (or equal to) the Boss**, then bump it to win a score multiplier.
- ❤️ **29 revives.** When you get eaten you earn a ⭐ bonus point and can revive. After the 29th revive is used, the next time you get eaten the run ends (and no bonus point is given).

### Mystery boxes

A new box appears about every 5 seconds (up to 8 at once, often near a player) and vanishes after 30 seconds if nobody opens it. It blinks when it is about to go. Snakes open a box by driving into it, **computer snakes included**, and you can see everybody's effects (little icons next to the name). Bosses cannot open boxes. Each box gives one of these at random:

| | Effect | What happens |
|---|---|---|
| ⚡ good | **Speed Boost** | 40% faster for 10 seconds |
| ✨ good | **Super Shine** | Your snake sparkles, and eggs are pulled in from twice as far, for 15 seconds |
| 🦶 good | **Crawly Legs** | Grows legs for 20 seconds: a bit faster and tighter turns |
| 🌱 good | **Mega Grow** | +20% size right away |
| 🐌 bad | **Slowpoke** | 45% slower for 8 seconds |
| ✂️ bad | **Length Reducer** | Lose 25% of your size (the lost part drops as eggs for anyone) |
| 💥 bad | **Blast!** | BOOM: lose 35% of your size, eggs fly everywhere, and you are stunned for a moment |
| 😵 bad | **Dizzy** | Steering is flipped for 6 seconds |

Speed Boost and Slowpoke cancel each other. A snake never shrinks below the starting size. Everything is in `CFG.BOX_EFFECTS` and the `FX_*` settings in `js/config.js`.

### Playing with friends: the rules

- **Everyone shares one arena**: the same eggs, computer snakes, King, mystery boxes and Boss. More friends bring a few more eggs and computer snakes.
- **Names.** Two friends who type the same name become "Ava" and "Ava 2", so snakes can always be told apart. Names are cleaned up (no `<` `>` or invisible characters, 12 letters at most).
- **Friends slide past each other**, with one exception: **the King can eat anyone, including friends.** Whoever is biggest wears the crown, so grow big and take it, and watch out for a friend who has it.
- **Each player has their own score, bonus points, 29 revives and multiplier.** Beating the Boss gives the multiplier to the player who bumped it. The Boss level is shared: once one player beats Boss 1, everybody faces Boss 2 next.
- **The menu is safe.** Opening the menu in an online game leaves your snake standing still inside a bubble while friends keep playing. (After 5 minutes away, or 90 seconds with no signal, the game lets the snake go.)
- **Brave mode** is a personal setting: it only makes very big *computer* snakes dangerous to the player who chose it.
- **If the connection drops** you get a "Lost the connection" screen with *Try again*, *Play on my own* and *Home*.

#### How many players?

There is no limit in the game. The real limit is how much computer and network the host has. Measured on the test machine with **80 players at once** (plus the computer snakes): the server needs about **2 milliseconds of every 33 millisecond tick**, and each player downloads about **30 KB per second**. Each player is only told about what is near them, and far-away snakes are updated less often, so the cost grows slowly with the crowd. `GET /stats` shows the live numbers.

## Putting it online

The game server is one small Node.js program (`server/server.js`, one dependency: `ws`). It serves the game page and the WebSocket on the same port, uses the `PORT` environment variable, and has a health check at `/healthz`. It only ever serves `index.html`, `css/` and `js/` (never server code, tests or settings files).

The quickest options:

- **A link right now, from your own computer:** run `npm start`, then in a second window `npx localtunnel --port 3000` (or `cloudflared tunnel --url http://localhost:3000`). It prints a public `https://...` link to share. The game works only while your computer and that window stay on.
- **A hosting service** (a link that stays up): create a *Web Service* from this repository on Render, Railway, or similar.
  - Root directory: `atharvs-snake-clash`
  - Build command: `npm install`
  - Start command: `npm start`
  - Health check path: `/healthz`
- **Docker** (Fly.io, Cloud Run, any server): there is a `Dockerfile` in this folder. `docker build -t snake-clash . && docker run -p 3000:3000 snake-clash`. The game is a single always-on process holding the arena in memory, so choose a plan that keeps one instance running (not one that scales to zero).
- **Static page somewhere else + the server elsewhere:** open the page with `?server=your-server-host` (for example `https://friends.example.com/?server=wss://snake.example.com/ws`).

### The solo single-file version

`node scripts/build-single-file.js` writes `dist/atharvs-snake-clash.html`: the whole game in one file with no server needed (solo play only). Add `--artifact` for the version used on claude.ai.

## Scoring

- Every egg and every bit of snake you eat adds points, multiplied by your current multiplier.
- Beating a Boss: multiplier goes up by 1 and you get 300 × boss level bonus points.
- **Total score** = score + 25 × ⭐ bonus points (`CFG.BONUS_STAR_VALUE`).
- Your best score, biggest size and most Bosses beaten are saved on the device.

## The rules Atharv asked for, and where they live

| Rule from the spec | How the game does it |
|---|---|
| Many AI snakes in an open arena | 22+ computer snakes, always topped up |
| Bump a regular snake = you eat it (from head or tail end) | `World.beginEat` / `processEaten` in `js/world.js` |
| Eggs grow you; rare golden eggs | `CFG.EGG_COUNT`, `CFG.GOLD_MASS`, `CFG.GOLD_SHIELD` |
| One King. If the King eats you, you die | The **biggest snake wears the crown**, a computer snake or a friend |
| Death gives a bonus point, revive up to 29 times, then no more | `World.killPlayer` / `World.revive`, `CFG.MAX_REVIVES = 29` |
| Different colors, shiny/fancy skins, legs that crawl vs. smooth slithering | 24 skins in `js/skins.js`; legs really swing as the snake crawls |
| Boss with levels, can get very big, must out-grow it | 5 Boss levels in `CFG.BOSSES` (size 150 → 1500) |
| Beating the Boss gives the multiplier bonus | +1 to the score multiplier (x2, x3, ...) plus a big point bonus |
| Multiplier is **lost** if an ordinary snake (or the King) eats you, but **kept** if the Boss eats you | `World.killPlayer` |
| Mystery boxes: 4 power-ups and 4 power-downs | `World.openBox` / `applyEffect`, `CFG.BOX_EFFECTS` |
| Friends join with a name; no limit | `server/`, `js/net.js`, `js/mirror.js` |

## Other choices worth knowing

- **Reviving:** you come back with a few seconds of bubble shield at a safe spot, keeping 40% of your size (75% if the Boss got you).
- **Easy vs. Brave.** Easy (default): only the King and Bosses are dangerous. Brave: ordinary computer snakes 1.5× your size (or more) can eat you too (glowing red).
- **Legs vs. no legs:** legged snakes are a bit faster and turn tighter, legless snakes grow a bit more from food. A Crawly Legs box gives a legless snake the legged bonuses for a while.
- **Soft walls.** The arena wall never hurts; you just slide along it.
- **Branding.** Title: *Atharv Singh presents Atharv's Snake Clash* and the credit line, also on the pause menu and the share card. A small "Podar International School, Nerul" text badge (no logo) sits in the corner. The **About** screen credits Atharv.

## Files

```
index.html          the page (all menus and the in-game display)
css/style.css       look and feel, phone/tablet layout
js/config.js        every number you can tweak (arena, speeds, Boss levels, 29 revives, mystery boxes, multiplayer)
js/util.js          small helpers, name cleaning, saved settings
js/skins.js         the snake colors and rarity tiers
js/world.js         the game rules: snakes, eggs, boxes, AI, King, Boss, eating, dying, reviving (many players)
js/art.js           how snakes, eggs, boxes, crown and effects are drawn
js/fx.js            sparkles, confetti and floating text
js/audio.js         sound effects and music, made with WebAudio (no sound files)
js/input.js         touch joystick, mouse and keyboard
js/mirror.js        online: the player's smoothed copy of the arena
js/net.js           online: the connection to the game server
js/render.js        camera, arena, minimap, arrows to the King and Boss
js/ui.js            menus, name box, scoreboard, tutorial, share card
js/main.js          the game loop that ties it all together (solo and online)
server/arena.js     the shared arena: join, input, ticks, per-player updates (no sockets inside)
server/server.js    web server + WebSocket
scripts/            build-single-file.js
tests/              sim.js, net.js, e2e.js, e2e-online.js
Dockerfile          to run the server in a container
```

## Tests (optional, for developers)

```bash
npm test                                                   # the rules (sim.js) and the real server with real clients (net.js); no browser needed
NODE_PATH=$(npm root -g) node tests/e2e.js                 # clicks through every screen in a real browser (needs Playwright)
NODE_PATH=$(npm root -g) node tests/e2e-online.js          # a desktop and a phone browser playing together on the real server
```

`sim.js` checks the rules: eating from the head or tail end, the King (and a friend King) eating you, the 29-revive limit, Boss win conditions, the multiplier being kept or lost, 150 players in one world, and each of the 8 mystery box effects. `net.js` starts the real server and connects clients: names, seeing friends, privacy of events, boxes and eggs over the wire, dying and reviving, leaving, bad messages, 80 players at once.

## Credits

Game designer and creator: **Atharv Singh** (Class 2, Podar International School, Nerul).
The code was written with help from Claude, an AI assistant.
