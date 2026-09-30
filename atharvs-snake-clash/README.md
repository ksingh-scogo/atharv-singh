# Atharv's Snake Clash

**Made by Atharv Singh, Podar International School, Nerul**

A colorful snake arena game. Gobble eggs and small snakes, stay away from the crowned **King**, and grow big enough to beat the giant **Bosses**.
It runs in any modern browser on a phone, tablet, Chromebook or computer. There is nothing to install.

## How to run it

**Easiest:** double-click `index.html` (or open it in Chrome, Edge, Safari or Firefox).

**To share it on a phone or tablet** (same Wi-Fi), start a tiny web server in this folder and open the address it prints:

```bash
cd atharvs-snake-clash
python3 -m http.server 8000      # then visit http://<your-computer-ip>:8000
```

Any static web host works too (GitHub Pages, Netlify, a school server, ...). It is just files: HTML, CSS and plain JavaScript. No build step, no frameworks, no internet needed.

## How to play

| Device | Steer |
|---|---|
| Phone / tablet | Touch and drag anywhere. A little joystick appears under your finger. |
| Mouse | Move the mouse. The snake follows the pointer. |
| Keyboard | Arrow keys or W A S D. `Esc` or `P` pauses. |

Your snake always moves forward on its own.

- 🥚 **Eggs** make you grow. **Golden eggs** give a lot of growth *and* a bubble shield.
- 🐍 **Bump any ordinary snake to eat it.** It gets swallowed from whichever end you touched (head-end or tail-end).
- 👑 **The King** is the biggest snake. It can eat *you*. A gold arrow shows where it is, and the screen glows red when it gets close.
- 👹 **The Boss** wakes up when you reach a certain size. Get **bigger than (or equal to) the Boss**, then bump it to win a score multiplier. A bar at the top shows "You / Boss" sizes. When you are big enough the bar turns green and the Boss looks scared!
- ❤️ **29 revives.** When you get eaten you earn a ⭐ bonus point and can revive. After the 29th revive is used, the next time you get eaten the run ends (and no bonus point is given).

### The rules Atharv asked for, and where they live

| Rule from the spec | How the game does it |
|---|---|
| Many AI snakes in an open arena | 22 computer snakes, always topped up |
| Bump a regular snake = you eat it (from head or tail end) | `World.beginEat` / `processEaten` in `js/world.js`. The snake is swallowed from the end nearest to where you touched it |
| Eggs grow you; rare golden eggs | `CFG.EGG_COUNT`, `CFG.GOLD_MASS`, `CFG.GOLD_SHIELD` |
| One King. If the King eats you, you die | The **biggest snake wears the crown** (see "Design choices"). Touching the King = you are eaten |
| Death gives a bonus point, revive up to 29 times, then no more | `World.killPlayer` / `World.revive`, `CFG.MAX_REVIVES = 29`. HUD shows "Revives left: 12/29" |
| Different colors, shiny/fancy skins, legs that crawl vs. smooth slithering | 24 skins in `js/skins.js` (Colors, Shiny ✨, Fancy 🌈). Legged snakes have legs that really swing as they crawl |
| Boss with levels, can get very big, must out-grow it | 5 Boss levels in `CFG.BOSSES` (size 150 → 1500). You need size ≥ the Boss's current size |
| Beating the Boss gives the multiplier bonus | +1 to the score multiplier (x2, x3, ...) plus a big point bonus |
| Multiplier is **lost** if an ordinary snake (or the King) eats you, but **kept** if the Boss eats you | `World.killPlayer`. The death screen tells you which happened |

### Scoring

- Every egg and every bit of snake you eat adds points, multiplied by your current multiplier.
- Beating a Boss: multiplier goes up by 1 and you get 300 × boss level bonus points.
- **Total score** = score + 25 × ⭐ bonus points (`CFG.BONUS_STAR_VALUE`).
- Your best score, biggest size and most Bosses beaten are saved on the device (localStorage).

## Branding

- Title screen: *Atharv Singh presents* **Atharv's Snake Clash**, plus the credit line "Made by Atharv Singh, Podar International School, Nerul".
- The same credit line is on the pause menu and on the shareable score card.
- A small "Podar International School, Nerul" badge sits in the corner during play.
- **About** screen credits Atharv as the game designer and creator.
- At the end of a run there is a **score card picture** ("Atharv scored 1,234") with **Share** (phone share sheet) and **Save picture** buttons.

The school badge is plain text on purpose. It does not use any school logo or official artwork.

## Design choices

The spec left a few things open, so here is what was decided. Everything is easy to change in `js/config.js`.

- **Dynamic King.** Whoever is currently the biggest snake (including you!) wears the crown, as suggested in the spec. A challenger must be 4% bigger to steal it, so the crown doesn't flicker. When *you* are the biggest, you are the King and nothing ordinary can hurt you.
- **Friendly King.** The King is slightly slower than you, only chases for a few seconds at a time, then takes a break.
- **Easy vs. Brave.** The spec says ordinary snakes don't kill you "by default", and also says an ordinary snake eating you loses the multiplier. So there is a **Brave** switch on the *My Snake* screen: in Brave mode, ordinary snakes that are 1.5× your size (or more) can eat you too (glowing red so you can see them). Easy mode is the default, where only the King and Bosses are dangerous.
- **Reviving.** You come back with a few seconds of bubble shield at a safe spot, keeping 40% of your size (75% if the Boss got you, so Boss fights are easy to retry).
- **Boss behaviour.** Bosses chase you only while you are too small, and relax after catching you. Once you are big enough they get scared and run away. A Boss can grow up to 15% bigger by eating snakes, so its size is a moving target.
- **Legs vs. no legs** has a light effect: legged snakes are a bit faster and turn tighter, legless snakes grow a bit more from food.
- **Soft walls.** The arena wall never hurts; you just slide along it.
- **Kid-friendly basics.** Short picture tutorial on first play (also under *How to Play*), big buttons, no text-heavy screens, and sound/music buttons everywhere.

## Files

```
index.html          the page (all menus and the in-game display)
css/style.css       look and feel, phone/tablet layout
js/config.js        all the numbers you can tweak (arena size, speeds, boss levels, 29 revives, ...)
js/util.js          small helpers + saved settings
js/skins.js         the snake colors and rarity tiers
js/world.js         the game rules: snakes, eggs, AI, King, Boss, eating, dying, reviving
js/art.js           how snakes, eggs, crown and shield are drawn
js/fx.js            sparkles, confetti and floating text
js/audio.js         sound effects and music, made with WebAudio (no sound files)
js/input.js         touch joystick, mouse and keyboard
js/render.js        camera, arena, minimap, arrows to the King and Boss
js/ui.js            menus, scoreboard, tutorial, share card
js/main.js          the game loop that ties it all together
tests/sim.js        rules test, runs in Node with no browser
tests/e2e.js        full click-through test in a real headless browser
```

## Tests (optional, for developers)

```bash
node tests/sim.js                                        # game rules, plays a bot for 3 x 9 minutes
NODE_PATH=$(npm root -g) node tests/e2e.js               # needs Playwright; clicks through every screen
```

`sim.js` checks the important rules: eating from head or tail end, the King eating you, the 29-revive limit and bonus points, Boss win conditions, and the multiplier being kept or lost.

## Credits

Game designer and creator: **Atharv Singh** (Class 2, Podar International School, Nerul).
The code was written with help from Claude, an AI assistant.
