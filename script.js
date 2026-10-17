const stage = document.querySelector(".stage");
const orb = document.querySelector(".orb");
const buttons = document.querySelectorAll("button[data-set]");
const caption = document.getElementById("caption");
const input = document.getElementById("question");
const sceneView = document.getElementById("scene-view");
const world = document.getElementById("world");
const playbackControls = document.getElementById("playback-controls");
const pauseButton = document.getElementById("pause-playback");
const root = document.documentElement;

const API_URL = "http://127.0.0.1:8000/explain";
const IMAGE_BASE = "http://127.0.0.1:8000/images";
const GAP = 1000; // distance between cards
let rafId = null;
let running = false;
let paused = false;
let skipRequested = false;
let stopRequested = false;
let typingTimer = null;
let tip = null;
let tipTimer = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- variety logic ---------- */

// one font per page load
const FONTS = [
  '"Segoe UI", sans-serif',
  "Georgia, serif",
  '"Trebuchet MS", sans-serif',
  '"Palatino Linotype", serif',
  "Consolas, monospace",
];
const font = pickOne(FONTS);
caption.style.fontFamily = font;
sceneView.style.fontFamily = font;

// same item `runLength` times in a row, then a different random one
function makePicker(items, runLength) {
  let current = null;
  let left = 0;
  return function next() {
    if (left <= 0) {
      current = pickOne(items.filter((i) => i !== current));
      left = runLength;
    }
    left--;
    return current;
  };
}

const nextTextStyle = makePicker(["type", "rise", "blur", "glow"], 5); // once per answer
const CAMERAS = {
  pan:   { rx: 0,  ry: 0,  dz: 0 },
  tilt:  { rx: 14, ry: 16, dz: 0 },
  push:  { rx: 0,  ry: 0,  dz: 160 },
  orbit: { rx: 8,  ry: 26, dz: 60 },
};
const nextCamera = makePicker(Object.keys(CAMERAS), 5); // once per scene

/* ---------- page colors ---------- */

const DEFAULT_PALETTE = {
  base: "#050a1a", c1: "rgba(40, 90, 255, 0.55)", c2: "rgba(0, 210, 255, 0.4)", accent: "#8fdcff",
};
const PALETTES = [
  { base: "#0a0620", c1: "rgba(120, 60, 255, 0.55)", c2: "rgba(255, 80, 200, 0.35)", accent: "#d7a8ff" },
  { base: "#140806", c1: "rgba(255, 110, 40, 0.5)",  c2: "rgba(255, 190, 60, 0.3)",  accent: "#ffc27a" },
  { base: "#04120d", c1: "rgba(20, 200, 140, 0.45)", c2: "rgba(60, 140, 255, 0.3)",  accent: "#8fffd6" },
  DEFAULT_PALETTE,
];
const nextPalette = makePicker(PALETTES, 1); // new palette every scene

function applyPalette(p) {
  root.style.setProperty("--base", p.base);
  root.style.setProperty("--c1", p.c1);
  root.style.setProperty("--c2", p.c2);
  root.style.setProperty("--accent", p.accent);
}

/* ---------- text reveal ---------- */

const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function revealText(el, text, emphasis, style) {
  el.textContent = "";
  const marks = new Set((emphasis || []).join(" ").split(/\s+/).map(norm).filter(Boolean));
  let delay = 0;
  text.split(/\s+/).filter(Boolean).forEach((word) => {
    const span = document.createElement("span");
    span.className = "word";
    if (marks.has(norm(word))) span.classList.add("hl");
    if (style === "type") {
      [...word].forEach((ch) => {
        const c = document.createElement("span");
        c.className = "c";
        c.textContent = ch;
        c.style.animationDelay = delay + "ms";
        delay += 28;
        span.appendChild(c);
      });
      delay += 28;
    } else {
      span.classList.add("w", style);
      span.textContent = word;
      span.style.animationDelay = delay + "ms";
      delay += 90;
    }
    el.appendChild(span);
  });
  return wait(delay + 600);
}

/* ---------- camera and scenes ---------- */

function buildWorld(scenes) {
  world.innerHTML = "";
  const cards = [];
  scenes.forEach((scene, i) => {
    const pos = { x: i * GAP, y: i % 2 === 0 ? -40 : 50, z: -rand(0, 140) };
    const card = document.createElement("div");
    card.className = "card";
    card.style.transform = `translate(-50%, -50%) translate3d(${pos.x}px, ${pos.y}px, ${pos.z}px)`;
    const cells = [];
    let diagram = null;
    if (scene.diagram.type === "array") {
      diagram = document.createElement("div");
      diagram.className = "diagram";
      scene.diagram.items.forEach((item, index) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        const value = document.createElement("span");
        value.className = "val";
        value.textContent = item;
        const idx = document.createElement("span");
        idx.className = "idx";
        idx.textContent = index;
        cell.append(value, idx);
        diagram.appendChild(cell);
        cells.push(cell);
      });
      card.appendChild(diagram);
    }
    const p = document.createElement("p");
    card.appendChild(p);
    world.appendChild(card);
    cards.push({ card, p, pos, cells, diagram: scene.diagram });
  });
  // generic rectangles scattered across the whole space
  const length = scenes.length * GAP;
  for (let i = 0; i < 24; i++) {
    const r = document.createElement("div");
    r.className = "rect";
    r.style.width = rand(80, 320) + "px";
    r.style.height = rand(8, 90) + "px";
    r.style.opacity = rand(0.1, 0.35).toFixed(2);
    r.style.transform =
      `translate(-50%, -50%) translate3d(${rand(-600, length + 400)}px, ${rand(-420, 420)}px, ${rand(-600, 100)}px)`;
    world.appendChild(r);
  }
  return cards;
}


function moveCamera(pos, first) {
  const name = nextCamera();
  const cam = CAMERAS[name];
  const sign = Math.random() < 0.5 ? -1 : 1;
  console.log("camera:", name);
  if (first) {
    world.style.transition = "none";
    world.style.transform =
      `translateZ(-600px) rotateY(25deg) translate3d(${-pos.x + 300}px, ${-pos.y}px, ${-pos.z}px)`;
    void world.offsetWidth; // make the browser apply the start position
  }
  world.style.transition = "transform 1.3s cubic-bezier(0.65, 0, 0.2, 1)";
  world.style.transform =
    `translateZ(${cam.dz}px) rotateX(${cam.rx * sign}deg) rotateY(${cam.ry * sign}deg) ` +
    `translate3d(${-pos.x}px, ${-pos.y}px, ${-pos.z}px)`;
}

async function playScenes(scenes) {
  paused = false;
  skipRequested = false;
  stopRequested = false;
  pauseButton.textContent = "Pause";
  playbackControls.classList.add("show");
  const cards = buildWorld(scenes);
  document.body.classList.add("takeover");           // orb and controls fade out
  try {
    await wait(700);
    sceneView.classList.add("show");                 // scene fills the page
    await wait(500);
    scenesLoop:
    for (let i = 0; i < cards.length; i++) {
      const { card, p, pos, cells, diagram } = cards[i];
      let current = null;
      if (diagram.type === "array") current = [...diagram.items];
      applyPalette(nextPalette());                   // page color shifts
      moveCamera(pos, i === 0);
      await wait(900);
      card.classList.add("active");
      for (const step of scenes[i].steps) {
        while (paused && !stopRequested) await wait(100);
        if (stopRequested) break scenesLoop;
        applyHighlight(cells, step.highlight);
        if (current && step.items.length === current.length && step.items.length) {
          step.items.forEach((item, index) => {
            if (item !== current[index]) {
              const value = cells[index].querySelector(".val");
              cells[index].classList.remove("changed");
              void cells[index].offsetWidth;
              value.textContent = item;
              cells[index].classList.add("changed");
            }
          });
          current = [...step.items];
        }
        showLine(p, step.say);
        await speak(step.say);
        await wait(300);
        if (stopRequested) break scenesLoop;
        skipRequested = false;
      }
      applyHighlight(cells, []);
      await wait(900);                               // voice timing will control this later
      card.classList.remove("active");
      card.classList.add("done");
    }
    await wait(500);
  } finally {                                        // always give the page back
    if (window.speechSynthesis) speechSynthesis.cancel();
    playbackControls.classList.remove("show");
    sceneView.classList.remove("show");
    applyPalette(DEFAULT_PALETTE);
    await wait(800);
    document.body.classList.remove("takeover");      // orb comes back
  }
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  if (window.speechSynthesis) {
    if (paused) speechSynthesis.pause();
    else speechSynthesis.resume();
  }
});
document.getElementById("skip-playback").addEventListener("click", () => {
  skipRequested = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
});
document.getElementById("stop-playback").addEventListener("click", () => {
  stopRequested = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
});

function speak(text) {
  const delay = Math.max(1800, text.split(/\s+/).length * 350);
  if (!window.speechSynthesis) return wait(delay);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    let safetyTimeout;
    const finish = () => {
      clearTimeout(safetyTimeout);
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    safetyTimeout = setTimeout(finish, 20000);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

function showLine(p, text) {
  p.textContent = text;
  p.classList.remove("line");
  void p.offsetWidth;
  p.classList.add("line");
}

function applyHighlight(cells, highlight) {
  if (!cells) return;
  cells.forEach((cell) => cell.classList.remove("on", "dim"));
  if (!highlight.length) return;
  highlight.forEach((index) => {
    if (cells[index]) cells[index].classList.add("on");
  });
  cells.forEach((cell, index) => {
    if (!highlight.includes(index)) cell.classList.add("dim");
  });
}

/* ---------- orb states ---------- */

function setState(state) {
  orb.dataset.state = state;
  cancelAnimationFrame(rafId);
  stage.style.setProperty("--level", 0);
  if (state === "speaking") fakeVoice();
  buttons.forEach((b) => b.classList.toggle("active", b.dataset.set === state));
}

// pretend loudness (0 to 1); later this comes from real audio
function fakeVoice() {
  const t = performance.now() / 1000;
  const level = (Math.sin(t * 7) + Math.sin(t * 3.1) + 2) / 4;
  stage.style.setProperty("--level", level.toFixed(3));
  rafId = requestAnimationFrame(fakeVoice);
}

/* ---------- ask the backend ---------- */

function startThinkingCaptions() {
  const lines = [
    "Reading your question…",
    "Picking an example…",
    "Drawing it out…",
    "Almost there…",
  ];
  let index = 0;
  caption.textContent = lines[index];
  const timer = setInterval(() => {
    if (index < lines.length - 1) {
      index++;
      caption.textContent = lines[index];
    }
  }, 1500);
  return () => clearInterval(timer);
}

async function ask() {
  const question = input.value.trim();
  if (!question || running) return;
  running = true;
  try {
    caption.textContent = "";
    setState("thinking");
    const stopCaptions = startThinkingCaptions();

    let data;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("Server error " + res.status);
      data = await res.json();
    } catch (err) {
      console.error(err);
      data = { spoken: "Could not reach the backend. Is it running?", scenes: [] };
    }

    stopCaptions(); caption.textContent = "";
    setState("speaking");
    if (data.scenes && data.scenes.length) {
      await playScenes(data.scenes);
    } else {
      caption.classList.remove("hidden");
      await revealText(caption, data.spoken || data.text || "", [], nextTextStyle());
    }
    await wait(800);
  } finally {
    setState("idle");
    running = false;
  }
}

buttons.forEach((b) => b.addEventListener("click", () => setState(b.dataset.set)));
orb.addEventListener("click", ask);
document.addEventListener("mousemove", (e) => {
  stage.style.setProperty("--mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
  stage.style.setProperty("--my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
});
orb.addEventListener("click", () => {
  const ripple = document.createElement("div");
  ripple.className = "ripple";
  ripple.addEventListener("animationend", () => ripple.remove());
  stage.appendChild(ripple);
});
input.addEventListener("input", () => {
  orb.classList.add("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => orb.classList.remove("typing"), 400);
});
world.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tip";
    sceneView.appendChild(tip);
  }
  const cells = [...cell.parentElement.querySelectorAll(":scope > .cell")];
  const index = cells.indexOf(cell);
  const value = cell.querySelector(".val").textContent;
  tip.textContent = `Index ${index} holds ${value}`;
  tip.style.left = `${event.clientX}px`;
  tip.style.top = `${event.clientY - 40}px`;
  tip.classList.add("show");
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => tip.classList.remove("show"), 2500);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ask();
});

setState("idle");
applyPalette(DEFAULT_PALETTE);