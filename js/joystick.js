// Floating joystick: touch anywhere inside the zone and the stick appears
// under your thumb. Releases snap it back to its resting spot.
// Output: x (right +), y (down +), each -1..1, magnitude <= 1.

export class Joystick {
  constructor(zone, base, knob, { radius = 55, deadzone = 0.12, restInset = 110 } = {}) {
    this.zone = zone;
    this.base = base;
    this.knob = knob;
    this.radius = radius;
    this.deadzone = deadzone;
    this.restInset = restInset;
    this.x = 0;
    this.y = 0;
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };

    zone.addEventListener('pointerdown', (e) => this.#start(e));
    zone.addEventListener('pointermove', (e) => this.#move(e));
    zone.addEventListener('pointerup', (e) => this.#end(e));
    zone.addEventListener('pointercancel', (e) => this.#end(e));
    zone.addEventListener('lostpointercapture', (e) => this.#end(e));
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    this.rest();
  }

  // Park the stick near the bottom-left corner.
  rest() {
    const h = this.zone.clientHeight;
    this.#placeBase(this.restInset, h - this.restInset);
    this.knob.style.transform = '';
  }

  #placeBase(x, y) {
    this.origin.x = x;
    this.origin.y = y;
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
  }

  #local(e) {
    const r = this.zone.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  #start(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    const p = this.#local(e);
    this.#placeBase(p.x, p.y);
    this.base.classList.add('active');
  }

  #move(e) {
    if (e.pointerId !== this.pointerId) return;
    const p = this.#local(e);
    let dx = p.x - this.origin.x;
    let dy = p.y - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx *= this.radius / len;
      dy *= this.radius / len;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    const mag = Math.min(len, this.radius) / this.radius;
    if (mag < this.deadzone || len === 0) {
      this.x = 0;
      this.y = 0;
    } else {
      const scaled = (mag - this.deadzone) / (1 - this.deadzone);
      this.x = (dx / Math.hypot(dx, dy)) * scaled;
      this.y = (dy / Math.hypot(dx, dy)) * scaled;
    }
  }

  #end(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.x = 0;
    this.y = 0;
    this.base.classList.remove('active');
    this.rest();
  }
}
