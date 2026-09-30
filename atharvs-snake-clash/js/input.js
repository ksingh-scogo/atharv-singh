/* Controls: touch (floating joystick), mouse (snake follows the pointer), keyboard (arrows / WASD). */
(function (root) {
  'use strict';
  var SC = root.SC = root.SC || {};

  var I = SC.input = {
    mode: 'none',          // 'touch' | 'mouse' | 'keys'
    joy: null,             // { id, ox, oy, x, y } while a finger is down
    mouse: null,           // { x, y } last mouse position
    keys: {},
    onPause: null,
    onConfirm: null,
    enabled: false,        // only steer while a match is being played

    init: function (canvas) {
      canvas.style.touchAction = 'none';

      // mouse: the snake follows the pointer anywhere on the page (even over the HUD)
      root.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') { I.mode = 'mouse'; I.mouse = { x: e.clientX, y: e.clientY }; }
      });

      canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') { I.mode = 'mouse'; I.mouse = { x: e.clientX, y: e.clientY }; return; }
        I.mode = 'touch';
        if (I.joy) return;
        I.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') return;
        if (I.joy && I.joy.id === e.pointerId) {
          I.joy.x = e.clientX; I.joy.y = e.clientY;
          // the joystick base follows a long drag a little, so you never run out of room
          var dx = I.joy.x - I.joy.ox, dy = I.joy.y - I.joy.oy, d = Math.sqrt(dx * dx + dy * dy), max = 70;
          if (d > max) { I.joy.ox += dx / d * (d - max); I.joy.oy += dy / d * (d - max); }
          e.preventDefault();
        }
      });
      function up(e) {
        if (I.joy && I.joy.id === e.pointerId) I.joy = null;
      }
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      root.addEventListener('keydown', function (e) {
        if (e.target && e.target.tagName === 'INPUT') return;   // typing the name: not a game key
        var k = e.key.toLowerCase();
        if (k === 'escape' || k === 'p') { if (I.onPause) I.onPause(); return; }
        if ((k === 'enter' || k === ' ') && I.onConfirm) { if (I.onConfirm()) { e.preventDefault(); return; } }
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].indexOf(k) >= 0) {
          I.keys[k] = true; I.mode = 'keys';
          if (k.indexOf('arrow') === 0) e.preventDefault();
        }
      });
      root.addEventListener('keyup', function (e) { I.keys[e.key.toLowerCase()] = false; });
      root.addEventListener('blur', function () { I.keys = {}; I.joy = null; });
    },

    // Angle the player wants to go, or null to just keep going. (cx, cy) = where the snake's head is on screen.
    steer: function (cx, cy) {
      if (!I.enabled) return null;
      var dx, dy;
      if (I.mode === 'touch' && I.joy) {
        dx = I.joy.x - I.joy.ox; dy = I.joy.y - I.joy.oy;
        return Math.sqrt(dx * dx + dy * dy) > 8 ? Math.atan2(dy, dx) : null;
      }
      if (I.mode === 'keys' || I.mode === 'none') {
        var k = I.keys;
        dx = ((k.arrowright || k.d) ? 1 : 0) - ((k.arrowleft || k.a) ? 1 : 0);
        dy = ((k.arrowdown || k.s) ? 1 : 0) - ((k.arrowup || k.w) ? 1 : 0);
        if (dx || dy) return Math.atan2(dy, dx);
        return null;
      }
      if (I.mode === 'mouse' && I.mouse) {
        dx = I.mouse.x - cx; dy = I.mouse.y - cy;
        return Math.sqrt(dx * dx + dy * dy) > 26 ? Math.atan2(dy, dx) : null;
      }
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
