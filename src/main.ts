// Fishing Rush — a tiny arcade fishing game.
// Everything on screen is drawn with Canvas 2D in this file: no image or audio assets.

type Phase = "ready" | "casting" | "waiting" | "hooked" | "reeling" | "caught" | "over";
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

interface FishKind {
  name: string;
  rarity: Rarity;
  points: number;
  body: string;
  belly: string;
  size: number;      // body length in px
  zoneWidth: number; // sweet-spot width on the tension bar, in bar units (0-100)
  zoneSpeed: number; // how fast the sweet spot sweeps back and forth
  pull: number;      // downward drag the fish applies to the marker
  weight: number;    // spawn probability weight
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string;
}

interface FloatText {
  x: number; y: number;
  text: string; color: string;
  life: number;
}

const W = 880;
const H = 540;
const WATER_Y = 296;
const ROUND_TIME = 60;
const INK = "#1c1c1c";

const FISH_KINDS: FishKind[] = [
  { name: "Sardine",       rarity: "Common",    points: 10,  body: "#9fb7c9", belly: "#e8f1f7", size: 34, zoneWidth: 34, zoneSpeed: 0.55, pull: 6,  weight: 40 },
  { name: "River Bass",    rarity: "Common",    points: 25,  body: "#6aa84f", belly: "#dcebc8", size: 46, zoneWidth: 30, zoneSpeed: 0.8,  pull: 9,  weight: 28 },
  { name: "Blue Catfish",  rarity: "Uncommon",  points: 45,  body: "#4a7fb5", belly: "#cfe2f2", size: 54, zoneWidth: 26, zoneSpeed: 1.05, pull: 12, weight: 16 },
  { name: "Koi",           rarity: "Rare",      points: 90,  body: "#ff8c42", belly: "#fff3e2", size: 52, zoneWidth: 22, zoneSpeed: 1.35, pull: 15, weight: 9 },
  { name: "Golden Carp",   rarity: "Epic",      points: 180, body: "#f5b921", belly: "#ffedb0", size: 58, zoneWidth: 18, zoneSpeed: 1.7,  pull: 19, weight: 5 },
  { name: "Rainbow Trout", rarity: "Legendary", points: 350, body: "#e56399", belly: "#ffe3ef", size: 62, zoneWidth: 15, zoneSpeed: 2.1,  pull: 24, weight: 2 },
];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function pickFish(): FishKind {
  const total = FISH_KINDS.reduce((sum, f) => sum + f.weight, 0);
  let roll = Math.random() * total;
  for (const f of FISH_KINDS) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return FISH_KINDS[0];
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

class FishingRush {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scoreEl: HTMLElement;
  private timeEl: HTMLElement;
  private timeChip: HTMLElement;
  private catchEl: HTMLElement;
  private messageEl: HTMLElement;
  private overlayEl: HTMLElement;
  private overlayTitle: HTMLElement;
  private overlayText: HTMLElement;
  private overlayBtn: HTMLButtonElement;
  private catchCard: HTMLElement;
  private catchName: HTMLElement;
  private catchMeta: HTMLElement;
  private catchLog: HTMLElement;

  private started = false;
  private phase: Phase = "ready";
  private t = 0;          // global clock, drives waves/clouds/wiggles
  private phaseT = 0;     // time spent in the current phase
  private timeLeft = ROUND_TIME;
  private score = 0;
  private catches = 0;
  private best = 0;

  private holding = false;
  private fish: FishKind = FISH_KINDS[0];
  private bobberX = 0;
  private bobberTargetX = 0;
  private shadowX = 0;    // underwater shadow sneaking up on the bobber
  private biteIn = 0;
  private hookWindow = 0;

  // Reel-in minigame state. The marker lives on a 0-100 bar; the player
  // holds to raise it and releases to let it sink while the fish drags it down.
  private marker = 50;
  private markerVel = 0;
  private zonePhase = 0;
  private progress = 0;
  private strain = 0;
  private surgeIn = 1;

  private particles: Particle[] = [];
  private floaters: FloatText[] = [];
  private lastHud = "";

  constructor() {
    this.canvas = el<HTMLCanvasElement>("game");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not supported in this browser");
    this.ctx = ctx;

    this.scoreEl = el("scoreVal");
    this.timeEl = el("timeVal");
    this.timeChip = el("timeChip");
    this.catchEl = el("catchVal");
    this.messageEl = el("message");
    this.overlayEl = el("overlay");
    this.overlayTitle = el("overlayTitle");
    this.overlayText = el("overlayText");
    this.overlayBtn = el<HTMLButtonElement>("overlayBtn");
    this.catchCard = el("catchCard");
    this.catchName = el("catchName");
    this.catchMeta = el("catchMeta");
    this.catchLog = el("catchLog");

    try {
      this.best = Number(localStorage.getItem("fishingRushBest") ?? 0) || 0;
    } catch {
      this.best = 0;
    }

    this.bindInput();
    this.showOverlay("FISHING RUSH", "Cast, wait for the bite, then keep the marker in the green while you reel. You have 60 seconds — how many points can you land?", "Start fishing");
    this.setMessage("Press Start, then click the water (or hold Space) to cast.");

    requestAnimationFrame((ts) => this.loop(ts));
  }

  // ---------- setup / input ----------

  private bindInput(): void {
    const stage = el("stage");
    stage.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.press();
    });
    window.addEventListener("pointerup", () => this.release());
    window.addEventListener("pointercancel", () => this.release());

    const actionBtn = el<HTMLButtonElement>("actionBtn");
    actionBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.press();
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        this.press();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.release();
    });

    this.overlayBtn.addEventListener("click", () => this.startRound());
    el<HTMLButtonElement>("restartBtn").addEventListener("click", () => this.startRound());
  }

  private press(): void {
    if (!this.started || this.phase === "over") return;
    if (this.phase === "ready") {
      this.cast();
    } else if (this.phase === "hooked") {
      this.beginReel();
      this.holding = true;
    } else if (this.phase === "reeling") {
      this.holding = true;
    }
  }

  private release(): void {
    this.holding = false;
  }

  // ---------- round / phase flow ----------

  private startRound(): void {
    this.started = true;
    this.score = 0;
    this.catches = 0;
    this.timeLeft = ROUND_TIME;
    this.phase = "ready";
    this.phaseT = 0;
    this.particles = [];
    this.floaters = [];
    this.catchLog.innerHTML = "";
    this.catchCard.classList.add("hidden");
    this.overlayEl.classList.add("hidden");
    this.setMessage("Click the water, tap, or press Space to cast your line!");
  }

  private cast(): void {
    this.phase = "casting";
    this.phaseT = 0;
    this.bobberTargetX = rand(470, 800);
    this.bobberX = this.rodTip().x;
    this.setMessage("Nice cast… now wait for a bite.");
  }

  private beginReel(): void {
    this.phase = "reeling";
    this.phaseT = 0;
    this.marker = 50;
    this.markerVel = 0;
    this.zonePhase = rand(0, Math.PI * 2);
    this.progress = 0;
    this.strain = 0;
    this.surgeIn = rand(0.6, 1.1);
    this.setMessage("Got it! HOLD to reel — keep the marker inside the green zone!");
  }

  private landFish(): void {
    this.phase = "caught";
    this.phaseT = 0;
    this.score += this.fish.points;
    this.catches += 1;
    this.splash(this.fishX(), WATER_Y, 16, "#ffffff");
    this.floaters.push({ x: this.fishX(), y: WATER_Y - 60, text: `+${this.fish.points}`, color: "#1c1c1c", life: 1.2 });
    this.catchName.textContent = this.fish.name;
    this.catchMeta.textContent = `${this.fish.rarity} · +${this.fish.points} pts`;
    this.catchCard.dataset.rarity = this.fish.rarity;
    this.catchCard.classList.remove("hidden");
    const li = document.createElement("li");
    li.textContent = `${this.fish.name} — ${this.fish.rarity} · +${this.fish.points}`;
    li.dataset.rarity = this.fish.rarity;
    this.catchLog.prepend(li);
    while (this.catchLog.children.length > 6) this.catchLog.lastElementChild?.remove();
    this.setMessage(`Caught a ${this.fish.name}! Cast again, quick!`);
  }

  private loseFish(text: string): void {
    this.phase = "ready";
    this.phaseT = 0;
    this.holding = false;
    this.setMessage(text);
  }

  private gameOver(): void {
    this.phase = "over";
    this.holding = false;
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem("fishingRushBest", String(this.best));
      } catch {
        // private mode etc. — best score just won't persist
      }
    }
    this.showOverlay("TIME'S UP!", `Final score: ${this.score} pts · ${this.catches} fish caught · Best: ${this.best} pts`, "Play again");
  }

  private showOverlay(title: string, text: string, btn: string): void {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlayBtn.textContent = btn;
    this.overlayEl.classList.remove("hidden");
  }

  private setMessage(text: string): void {
    this.messageEl.textContent = text;
  }

  // ---------- helpers ----------

  private rodTip(): { x: number; y: number } {
    // The rod bends down a little while a fish is fighting on the line.
    return this.phase === "reeling" || this.phase === "hooked"
      ? { x: 340, y: 178 }
      : { x: 356, y: 148 };
  }

  private fishX(): number {
    // The fish is pulled toward the boat as reel progress grows.
    const start = this.bobberX;
    const near = 330;
    return start + (near - start) * (this.progress / 100);
  }

  private zoneCenter(): number {
    const range = 46 - this.fish.zoneWidth / 2 - 4;
    return 50 + Math.sin(this.t * this.fish.zoneSpeed + this.zonePhase) * range;
  }

  private splash(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const life = rand(0.35, 0.8);
      this.particles.push({
        x: x + rand(-8, 8),
        y,
        vx: rand(-70, 70),
        vy: rand(-190, -60),
        life,
        maxLife: life,
        size: rand(2, 4.5),
        color,
      });
    }
  }

  // ---------- main loop ----------

  private loop(ts: number): void {
    const dt = Math.min(0.033, (ts - (this.lastTs || ts)) / 1000);
    this.lastTs = ts;
    this.t += dt;
    if (this.started && this.phase !== "over") this.update(dt);
    this.updateFx(dt);
    this.render();
    this.syncHud();
    requestAnimationFrame((next) => this.loop(next));
  }

  private lastTs = 0;

  private update(dt: number): void {
    this.phaseT += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.gameOver();
      return;
    }

    switch (this.phase) {
      case "casting": {
        const p = clamp(this.phaseT / 0.55, 0, 1);
        const tip = this.rodTip();
        this.bobberX = tip.x + (this.bobberTargetX - tip.x) * p;
        if (p >= 1) {
          this.phase = "waiting";
          this.phaseT = 0;
          this.fish = pickFish();
          this.biteIn = rand(1.3, 3.6);
          this.shadowX = this.bobberX + (Math.random() < 0.5 ? -260 : 260);
          this.splash(this.bobberX, WATER_Y, 8, "#ffffff");
        }
        break;
      }
      case "waiting": {
        // The shadow fish circles in and lines up under the bobber.
        const drift = (this.bobberX - this.shadowX) * 0.9 * dt;
        this.shadowX += drift + Math.sin(this.t * 2.2) * 14 * dt;
        this.biteIn -= dt;
        if (this.biteIn <= 0) {
          this.phase = "hooked";
          this.phaseT = 0;
          this.hookWindow = 0.8;
          this.splash(this.bobberX, WATER_Y, 12, "#ffffff");
          this.setMessage("BITE! Click / tap / Space NOW!");
        }
        break;
      }
      case "hooked": {
        this.hookWindow -= dt;
        if (this.hookWindow <= 0) this.loseFish("Too slow — it got away. Cast again!");
        break;
      }
      case "reeling":
        this.updateReel(dt);
        break;
      case "caught": {
        if (this.phaseT >= 1.5) {
          this.catchCard.classList.add("hidden");
          this.phase = "ready";
          this.phaseT = 0;
          this.setMessage("Click the water, tap, or press Space to cast again!");
        }
        break;
      }
      default:
        break;
    }
  }

  private updateReel(dt: number): void {
    const f = this.fish;

    // Random surges: the fish yanks the line and the sweet spot jumps.
    this.surgeIn -= dt;
    if (this.surgeIn <= 0) {
      this.surgeIn = rand(0.7, 1.3);
      this.markerVel -= rand(50, 110) * (0.6 + f.pull / 30);
      this.zonePhase += rand(-0.8, 0.8);
      this.splash(this.fishX(), WATER_Y, 7, "#dff2ff");
    }

    if (this.holding) this.markerVel += 165 * dt;
    else this.markerVel -= 130 * dt;
    this.markerVel -= f.pull * 2.0 * dt;
    this.markerVel *= Math.exp(-2.6 * dt);
    this.marker = clamp(this.marker + this.markerVel * dt, 0, 100);
    if (this.marker === 0 || this.marker === 100) this.markerVel = 0;

    const center = this.zoneCenter();
    const half = f.zoneWidth / 2;
    const inZone = Math.abs(this.marker - center) <= half;

    if (inZone) {
      this.progress += 30 * dt;
      this.strain = Math.max(0, this.strain - 40 * dt);
    } else if (this.marker > 88 || this.marker < 6) {
      // Pinned at either end: the line is about to snap or go fully slack.
      this.strain += 46 * dt;
      if (this.marker < 6) this.progress = Math.max(0, this.progress - 8 * dt);
    } else {
      this.progress += 4 * dt;
      this.strain = Math.max(0, this.strain - 14 * dt);
    }
    this.progress = clamp(this.progress, 0, 100);

    if (this.strain >= 100) {
      this.loseFish("SNAP! The line broke. Cast again!");
    } else if (this.progress >= 100) {
      this.landFish();
    }
  }

  private updateFx(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 34 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private syncHud(): void {
    const key = `${this.score}|${Math.ceil(this.timeLeft)}|${this.catches}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.scoreEl.textContent = String(this.score);
    this.timeEl.textContent = String(Math.ceil(this.timeLeft));
    this.catchEl.textContent = String(this.catches);
    this.timeChip.classList.toggle("urgent", this.timeLeft <= 10 && this.started && this.phase !== "over");
  }

  // ---------- rendering ----------

  private render(): void {
    const c = this.ctx;
    this.drawSky(c);
    this.drawWater(c);
    if (this.phase === "waiting" || this.phase === "hooked") this.drawShadowFish(c);
    this.drawBoat(c);
    this.drawLineAndBobber(c);
    if (this.phase === "reeling") {
      this.drawFish(c, this.fishX(), WATER_Y + 4 + Math.sin(this.t * 13) * 3, this.fish, this.t * 14);
      this.drawTensionUi(c);
    }
    if (this.phase === "caught") {
      const jump = Math.sin(clamp(this.phaseT / 1.5, 0, 1) * Math.PI) * 90;
      this.drawFish(c, 330, WATER_Y - 26 - jump, this.fish, this.t * 10);
    }
    if (this.phase === "hooked") this.drawBiteMark(c);
    this.drawParticles(c);
    this.drawFloaters(c);
  }

  private drawSky(c: CanvasRenderingContext2D): void {
    const sky = c.createLinearGradient(0, 0, 0, WATER_Y);
    sky.addColorStop(0, "#aee3ff");
    sky.addColorStop(1, "#e8f7ff");
    c.fillStyle = sky;
    c.fillRect(0, 0, W, WATER_Y);

    // Sun
    c.beginPath();
    c.arc(776, 76, 34, 0, Math.PI * 2);
    c.fillStyle = "#ffd23f";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();

    // Clouds drifting slowly
    this.cloud(c, ((this.t * 7) % (W + 260)) - 130, 66, 1);
    this.cloud(c, ((this.t * 5 + 420) % (W + 260)) - 130, 118, 0.7);

    // Hills on the horizon
    c.beginPath();
    c.ellipse(120, WATER_Y + 6, 260, 52, 0, Math.PI, Math.PI * 2);
    c.ellipse(700, WATER_Y + 6, 330, 64, 0, Math.PI, Math.PI * 2);
    c.fillStyle = "#8fd694";
    c.fill();
  }

  private cloud(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.beginPath();
    c.arc(0, 0, 22, 0, Math.PI * 2);
    c.arc(24, -8, 28, 0, Math.PI * 2);
    c.arc(52, 0, 20, 0, Math.PI * 2);
    c.fillStyle = "#ffffff";
    c.fill();
    c.restore();
  }

  private drawWater(c: CanvasRenderingContext2D): void {
    const water = c.createLinearGradient(0, WATER_Y, 0, H);
    water.addColorStop(0, "#7ab8ff");
    water.addColorStop(1, "#3f83cc");
    c.fillStyle = water;
    c.fillRect(0, WATER_Y, W, H - WATER_Y);

    c.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      const y = WATER_Y + 26 + row * 52;
      c.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin(x * 0.03 + this.t * 2 + row * 1.7) * 4;
        if (x === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.strokeStyle = `rgba(255,255,255,${0.35 - row * 0.06})`;
      c.stroke();
    }
  }

  private drawBoat(c: CanvasRenderingContext2D): void {
    // Hull
    c.beginPath();
    c.moveTo(88, WATER_Y + 4);
    c.lineTo(336, WATER_Y + 4);
    c.lineTo(302, WATER_Y + 48);
    c.lineTo(122, WATER_Y + 48);
    c.closePath();
    c.fillStyle = "#b5651d";
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
    c.beginPath();
    c.moveTo(104, WATER_Y + 26);
    c.lineTo(318, WATER_Y + 26);
    c.lineWidth = 2;
    c.stroke();

    // Fisherman: flat shapes, dark outline, sitting and facing right.
    const ink = INK;
    // legs
    c.beginPath();
    c.moveTo(196, 282);
    c.lineTo(258, 288);
    c.lineTo(262, 302);
    c.lineTo(200, 300);
    c.closePath();
    c.fillStyle = "#2b3a55";
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.stroke();
    // torso (pink shirt)
    c.beginPath();
    c.moveTo(186, 232);
    c.lineTo(218, 232);
    c.lineTo(224, 284);
    c.lineTo(182, 284);
    c.closePath();
    c.fillStyle = "#ff90e8";
    c.fill();
    c.stroke();
    // head
    c.beginPath();
    c.arc(202, 216, 15, 0, Math.PI * 2);
    c.fillStyle = "#f2c29b";
    c.fill();
    c.stroke();
    // cap
    c.beginPath();
    c.arc(202, 210, 15, Math.PI, Math.PI * 2);
    c.fillStyle = "#ffd23f";
    c.fill();
    c.stroke();
    c.fillRect(214, 206, 16, 5);
    c.strokeRect(214, 206, 16, 5);
    // arm to the rod handle
    c.beginPath();
    c.moveTo(214, 244);
    c.lineTo(238, 252);
    c.lineWidth = 7;
    c.strokeStyle = "#f2c29b";
    c.stroke();
    // rod
    const tip = this.rodTip();
    c.beginPath();
    c.moveTo(232, 254);
    c.quadraticCurveTo(300, 210, tip.x, tip.y);
    c.lineWidth = 4;
    c.strokeStyle = ink;
    c.stroke();
  }

  private drawLineAndBobber(c: CanvasRenderingContext2D): void {
    if (this.phase === "ready" || this.phase === "over") return;
    const tip = this.rodTip();

    let endX = this.bobberX;
    let endY = WATER_Y + Math.sin(this.t * 2 + this.bobberX) * 2;
    if (this.phase === "casting") {
      const p = clamp(this.phaseT / 0.55, 0, 1);
      endY = tip.y + (WATER_Y - tip.y) * p - Math.sin(p * Math.PI) * 90;
    } else if (this.phase === "reeling" || this.phase === "caught") {
      endX = this.fishX();
      endY = WATER_Y + 2;
    }

    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.quadraticCurveTo((tip.x + endX) / 2, Math.min(tip.y, endY) + 46, endX, endY);
    c.lineWidth = 1.6;
    c.strokeStyle = "rgba(28,28,28,0.75)";
    c.stroke();

    if (this.phase === "waiting" || this.phase === "hooked") {
      // Bobber: red top, white bottom, dark outline.
      c.beginPath();
      c.arc(endX, endY, 8, Math.PI, Math.PI * 2);
      c.fillStyle = "#ff5a5a";
      c.fill();
      c.beginPath();
      c.arc(endX, endY, 8, 0, Math.PI);
      c.fillStyle = "#ffffff";
      c.fill();
      c.beginPath();
      c.arc(endX, endY, 8, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.strokeStyle = INK;
      c.stroke();
      // ripples
      c.beginPath();
      c.ellipse(endX, WATER_Y + 3, 16 + Math.sin(this.t * 3) * 3, 4, 0, 0, Math.PI * 2);
      c.strokeStyle = "rgba(255,255,255,0.65)";
      c.stroke();
    }
  }

  private drawShadowFish(c: CanvasRenderingContext2D): void {
    const y = WATER_Y + 74 + Math.sin(this.t * 2.6) * 6;
    this.drawFishShape(c, this.shadowX, y, this.fish, this.t * 6, "rgba(18,48,79,0.35)", "rgba(18,48,79,0.35)", false);
  }

  private drawFish(c: CanvasRenderingContext2D, x: number, y: number, kind: FishKind, wiggle: number): void {
    this.drawFishShape(c, x, y, kind, wiggle, kind.body, kind.belly, true);
  }

  private drawFishShape(
    c: CanvasRenderingContext2D,
    x: number, y: number,
    kind: FishKind,
    wiggle: number,
    bodyColor: string,
    bellyColor: string,
    detailed: boolean,
  ): void {
    const len = kind.size;
    const hgt = len * 0.34;
    const tailWave = Math.sin(wiggle) * (len * 0.14);
    c.save();
    c.translate(x, y);

    // tail
    c.beginPath();
    c.moveTo(-len / 2 + 4, 0);
    c.lineTo(-len / 2 - len * 0.26, -hgt * 0.62 + tailWave);
    c.lineTo(-len / 2 - len * 0.26, hgt * 0.62 + tailWave);
    c.closePath();
    c.fillStyle = bodyColor;
    c.fill();
    if (detailed) {
      c.lineWidth = 2;
      c.strokeStyle = INK;
      c.stroke();
    }

    // body
    c.beginPath();
    c.ellipse(0, 0, len / 2, hgt / 2, 0, 0, Math.PI * 2);
    c.fillStyle = bodyColor;
    c.fill();
    if (detailed) {
      c.save();
      c.clip();
      // belly
      c.beginPath();
      c.ellipse(2, hgt * 0.26, len / 2.2, hgt / 3.4, 0, 0, Math.PI * 2);
      c.fillStyle = bellyColor;
      c.fill();
      if (kind.rarity === "Legendary") {
        const bands = ["#ffd23f", "#7ab8ff", "#4ade80"];
        bands.forEach((band, i) => {
          c.fillStyle = band;
          c.fillRect(-len * 0.08 + i * 9 - 9, -hgt / 2, 6, hgt);
        });
      }
      c.restore();
      c.beginPath();
      c.ellipse(0, 0, len / 2, hgt / 2, 0, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.strokeStyle = INK;
      c.stroke();
      // fin
      c.beginPath();
      c.moveTo(-4, -hgt / 2 + 2);
      c.lineTo(8, -hgt / 2 - 8);
      c.lineTo(14, -hgt / 2 + 3);
      c.closePath();
      c.fillStyle = bodyColor;
      c.fill();
      c.stroke();
      // eye
      c.beginPath();
      c.arc(len * 0.3, -hgt * 0.1, 3.6, 0, Math.PI * 2);
      c.fillStyle = "#ffffff";
      c.fill();
      c.fillStyle = INK;
      c.beginPath();
      c.arc(len * 0.32, -hgt * 0.1, 1.9, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawBiteMark(c: CanvasRenderingContext2D): void {
    const bounce = Math.abs(Math.sin(this.t * 10)) * 8;
    c.save();
    c.translate(this.bobberX, WATER_Y - 52 - bounce);
    c.rotate(-0.06);
    c.fillStyle = "#ffd23f";
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    const w = 30;
    const h = 40;
    c.beginPath();
    c.roundRect(-w / 2, -h / 2, w, h, 8);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.font = "700 26px 'Space Grotesk', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("!", 0, 2);
    c.restore();
  }

  private drawTensionUi(c: CanvasRenderingContext2D): void {
    const x0 = 372;
    const x1 = 848;
    const width = x1 - x0;
    const toX = (v: number) => x0 + (v / 100) * width;

    // panel
    c.save();
    c.beginPath();
    c.roundRect(x0 - 14, H - 118, width + 28, 106, 12);
    c.fillStyle = "rgba(255,248,236,0.92)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = INK;
    c.stroke();

    c.fillStyle = INK;
    c.font = "700 12px 'Space Mono', monospace";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";

    // reel progress
    c.fillText("REEL PROGRESS", x0, H - 92);
    c.beginPath();
    c.roundRect(x0, H - 86, width, 12, 6);
    c.fillStyle = "#ffffff";
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.stroke();
    if (this.progress > 0) {
      c.beginPath();
      c.roundRect(x0, H - 86, (this.progress / 100) * width, 12, 6);
      c.fillStyle = "#ffd23f";
      c.fill();
    }

    // tension bar: green sweet spot, red danger ends, marker
    const barY = H - 62;
    const barH = 20;
    c.beginPath();
    c.roundRect(x0, barY, width, barH, 8);
    c.fillStyle = "#ffffff";
    c.fill();
    c.stroke();
    const center = this.zoneCenter();
    const half = this.fish.zoneWidth / 2;
    c.save();
    c.beginPath();
    c.roundRect(x0, barY, width, barH, 8);
    c.clip();
    c.fillStyle = "rgba(255,90,90,0.5)";
    c.fillRect(x0, barY, toX(6) - x0, barH);
    c.fillRect(toX(88), barY, x1 - toX(88), barH);
    c.fillStyle = "#4ade80";
    c.fillRect(toX(center - half), barY, toX(center + half) - toX(center - half), barH);
    c.restore();
    c.beginPath();
    c.roundRect(x0, barY, width, barH, 8);
    c.stroke();

    const mx = toX(this.marker);
    c.beginPath();
    c.moveTo(mx, barY - 7);
    c.lineTo(mx - 7, barY - 16);
    c.lineTo(mx + 7, barY - 16);
    c.closePath();
    c.fillStyle = "#ff90e8";
    c.fill();
    c.stroke();
    c.fillRect(mx - 2, barY - 4, 4, barH + 8);
    c.strokeRect(mx - 2, barY - 4, 4, barH + 8);

    // strain
    c.fillText("LINE STRAIN", x0, H - 26);
    c.beginPath();
    c.roundRect(x0 + 108, H - 34, width - 108, 10, 5);
    c.fillStyle = "#ffffff";
    c.fill();
    c.stroke();
    if (this.strain > 0) {
      c.beginPath();
      c.roundRect(x0 + 108, H - 34, (this.strain / 100) * (width - 108), 10, 5);
      c.fillStyle = this.strain > 60 ? "#ff3b30" : "#ff9f43";
      c.fill();
    }
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      c.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fillStyle = p.color;
      c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawFloaters(c: CanvasRenderingContext2D): void {
    c.save();
    c.font = "700 24px 'Space Grotesk', sans-serif";
    c.textAlign = "center";
    for (const f of this.floaters) {
      c.globalAlpha = clamp(f.life, 0, 1);
      c.lineWidth = 4;
      c.strokeStyle = "#fff8ec";
      c.strokeText(f.text, f.x, f.y);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
    }
    c.restore();
    c.globalAlpha = 1;
  }
}

new FishingRush();
