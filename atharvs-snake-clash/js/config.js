/* Atharv's Snake Clash - tunable game settings.
   Everything that changes how the game *feels* lives here. */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};

  SC.CFG = {
    TITLE: "Atharv's Snake Clash",
    CREDIT: 'Made by Atharv Singh, Podar International School, Nerul',
    SCHOOL: 'Podar International School, Nerul',

    // ---- Arena ----
    ARENA_R: 2100,        // arena radius (world units)
    AI_COUNT: 22,         // computer snakes kept in the arena
    EGG_COUNT: 340,       // eggs scattered around
    GOLDEN_MAX: 5,        // golden eggs on the map at once
    GOLD_MASS: 8,         // growth from a golden egg
    GOLD_SHIELD: 5,       // seconds of shield from a golden egg

    // ---- Lives, bonus points, revives ----
    MAX_REVIVES: 29,        // revive limit per match (from the spec)
    BONUS_STAR_VALUE: 25,   // each bonus point adds this much to the final total
    REVIVE_SHIELD: 3.5,     // seconds of safety after reviving
    REVIVE_KEEP_REGULAR: 0.4,  // fraction of size kept after the King/a snake gets you
    REVIVE_KEEP_BOSS: 0.75,    // fraction of size kept after the Boss gets you (easy to retry!)

    // ---- Snake body ----
    START_MASS: 10,
    MAX_RADIUS: 115,
    SPACING: 0.55,          // gap between body segments (x radius)

    // ---- Speed / steering ----
    PLAYER_SPEED: 172,
    AI_SPEED_MIN: 148,
    AI_SPEED_MAX: 162,
    KING_SPEED: 160,        // the King is a bit slower than the player, so you can escape
    TURN_RATE: 4.6,         // radians per second for a small snake

    // Light mechanical meaning for the cosmetic legs choice:
    LEG_SPEED_BONUS: 1.07,      // legged snakes: a bit faster...
    LEG_TURN_BONUS: 1.18,       // ...and turn tighter
    LEGLESS_GROWTH_BONUS: 1.12, // legless snakes: grow a bit more from food

    // ---- Eating ----
    EAT_EFFICIENCY: 0.45,   // share of a snake's size you gain by eating it
    BOSS_EAT_SHARE: 0.12,   // share of a Boss's size you gain for beating it
    EAT_REACH_HEAD: 0.95,   // generous reach when YOU eat something
    EAT_REACH_BODY: 0.8,
    LETHAL_REACH_A: 0.78,   // slightly forgiving reach for things that can hurt you
    LETHAL_REACH_B: 0.72,
    PREY_SCALE: 0.25,       // how much bigger the snakes you meet get as you grow
    AI_MASS_CAP: 260,
    KING_MASS_CAP: 300,

    // ---- King ----
    KING_SWITCH: 1.04,      // a challenger must be 4% bigger to take the crown
    KING_SEED_MASS: [70, 90],
    KING_CHASE_RANGE: 560,

    // ---- Boss ----
    BOSS_GROW_CAP: 1.15,    // the Boss can grow this much bigger by eating snakes
    BOSS_WARN: 3.5,         // seconds of warning before a Boss appears
    BOSS_BONUS: 300,        // bonus score per Boss level defeated
    // trigger: your size that wakes the boss, mass: the boss's size.
    BOSSES: [
      { name: 'Sir Wobbly',    trigger: 70,   mass: 150,  speed: 0.70, turn: 2.3 },
      { name: 'Grumpy Python', trigger: 170,  mass: 300,  speed: 0.73, turn: 2.1 },
      { name: 'Mega Mamba',    trigger: 350,  mass: 560,  speed: 0.76, turn: 1.9 },
      { name: 'Giga Cobra',    trigger: 620,  mass: 950,  speed: 0.79, turn: 1.8 },
      { name: 'Dragon Duper',  trigger: 1000, mass: 1500, speed: 0.82, turn: 1.7 }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
