const stage = document.querySelector(".stage");
const orb = document.querySelector(".orb");
const buttons = document.querySelectorAll("button[data-set]");
const caption = document.getElementById("caption");
const input = document.getElementById("question");
const sceneView = document.getElementById("scene-view");
const world = document.getElementById("world");
const playbackControls = document.getElementById("playback-controls");
const pauseButton = document.getElementById("pause-playback");
const beatView = document.getElementById("beat-view");
const beatText = document.getElementById("beat-text");
const beatFlash = document.getElementById("beat-flash");
const diagramView = document.getElementById("diagram-view");
const diagramSvg = document.getElementById("diagram-svg");
const diagramObjects = document.getElementById("diagram-objects");
const diagramSay = document.getElementById("diagram-say");
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
const nextBeatTransition = makePicker(["punch", "drop", "flash"], 2);
const CAMERAS = {
  pan:      { rx: 0,   ry: 0,  dz: 0,    t: 1.3 },
  tilt:     { rx: 14,  ry: 16, dz: 0,    t: 1.3 },
  push:     { rx: 0,   ry: 0,  dz: 160,  t: 1.2 },
  orbit:    { rx: 8,   ry: 26, dz: 60,   t: 1.4 },
  dolly:    { rx: 0,   ry: 6,  dz: 120,  t: 1.1 },
  crane:    { rx: -14, ry: 0,  dz: 40,   t: 1.3 },
  whip:     { rx: 0,   ry: 30, dz: 0,    t: 0.8 },
  drift:    { rx: 3,   ry: 8,  dz: 20,   t: 1.4 },
  pullback: { rx: 4,   ry: 0,  dz: -180, t: 1.3 },
};
const INTENT_CAMERAS = {
  intro: ["push", "crane", "orbit"],
  compare: ["pan", "tilt", "drift"],
  warning: ["whip", "push", "tilt"],
  step: ["pan", "tilt", "dolly", "drift"],
  recap: ["orbit", "crane", "pullback"],
};
const cameraPickers = {};
function nextCameraFor(intent) {
  const key = INTENT_CAMERAS[intent] ? intent : "step";
  if (!cameraPickers[key]) cameraPickers[key] = makePicker(INTENT_CAMERAS[key], 2);
  return cameraPickers[key]();
}

function fitWord(text) {
  const length = text.length;
  const width = length <= 6 ? 18 : length <= 12 ? 13 : length <= 20 ? 9 : 6;
  return `clamp(48px, ${width}vw, 220px)`;
}

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


function moveCamera(pos, first, intent) {
  const name = nextCameraFor(intent);
  const cam = CAMERAS[name];
  const sign = Math.random() < 0.5 ? -1 : 1;
  console.log("camera:", name, intent);
  if (first) {
    world.style.transition = "none";
    world.style.transform =
      `translateZ(-600px) rotateY(25deg) translate3d(${-pos.x + 300}px, ${-pos.y}px, ${-pos.z}px)`;
    void world.offsetWidth; // make the browser apply the start position
  }
  world.style.transition = `transform ${cam.t}s cubic-bezier(0.65, 0, 0.2, 1)`;
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
      moveCamera(pos, i === 0, scenes[i].intent);
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

let chosenVoice = null;

function pickVoice() {
  chosenVoice = null;
  if (!window.speechSynthesis) {
    console.log("voice:", chosenVoice && chosenVoice.name);
    return;
  }
  const voices = speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const preferred = ["Natural", "Google US English", "Google UK English Female", "Aria", "Jenny", "Zira"];
  for (const name of preferred) {
    chosenVoice = voices.find((voice) => voice.name.includes(name));
    if (chosenVoice) break;
  }
  if (!chosenVoice) chosenVoice = voices[0] || null;
  console.log("voice:", chosenVoice && chosenVoice.name);
}

pickVoice();
if (window.speechSynthesis) speechSynthesis.addEventListener("voiceschanged", pickVoice);

function speak(text) {
  const delay = Math.max(1800, text.split(/\s+/).length * 350);
  if (!window.speechSynthesis) return wait(delay);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    if (chosenVoice) u.voice = chosenVoice;
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

async function playBeats(data) {
  if (!data || !Array.isArray(data.beats) || !data.beats.length) return;
  const beats = data.beats
    .filter((beat) => beat.layout === "word" && String(beat.text || "").trim())
    .map((beat) => ({
      ...beat,
      text: String(beat.text).trim().slice(0, 40),
      ms: Math.min(3000, Math.max(300, Number.isFinite(beat.ms) ? beat.ms : 700)),
    }));
  if (!beats.length) return;
  running = true;
  document.body.classList.add("takeover");
  beatView.classList.add("show");
  try {
    await wait(350);
    for (const beat of beats) {
      beatView.classList.toggle("palette", beat.bg === "palette");
      beatText.textContent = beat.text;
      beatText.style.fontSize = fitWord(beat.text);
      beatText.classList.toggle("hl", Boolean(beat.emphasis));
      beatText.classList.remove("punch", "drop");
      beatFlash.classList.remove("go");
      void beatText.offsetWidth;
      const transition = nextBeatTransition();
      beatText.classList.add(transition === "flash" ? "punch" : transition);
      if (transition === "flash") {
        void beatFlash.offsetWidth;
        beatFlash.classList.add("go");
      }

      await wait(beat.ms);
    }
  } finally {
    beatView.classList.remove("show");
    await wait(400);
    beatText.textContent = "";
    document.body.classList.remove("takeover");
    running = false;
  }
}

async function playDiagram(data) {
  if (!data || !Array.isArray(data.objects) || !data.objects.length || !Array.isArray(data.steps)) return;
  const objects = [];
  const objectIds = new Set();
  for (const object of data.objects) {
    if (!object || typeof object.id !== "string" || !["box", "circle", "label"].includes(object.type) ||
        !Number.isFinite(object.x) || !Number.isFinite(object.y) || objectIds.has(object.id)) continue;
    objectIds.add(object.id);
    objects.push({
      ...object,
      x: Math.min(100, Math.max(0, object.x)),
      y: Math.min(100, Math.max(0, object.y)),
      text: String(object.text).slice(0, 40),
    });
  }
  if (!objects.length) return;
  const arrows = [];
  const arrowIds = new Set();
  for (const arrow of Array.isArray(data.arrows) ? data.arrows : []) {
    if (!arrow || typeof arrow.id !== "string" || arrowIds.has(arrow.id) ||
        !objectIds.has(arrow.from) || !objectIds.has(arrow.to)) continue;
    arrowIds.add(arrow.id);
    arrows.push(arrow);
  }
  const elements = new Map();
  running = true;
  stopRequested = false;
  document.body.classList.add("takeover");
  diagramSvg.replaceChildren();
  diagramObjects.replaceChildren();
  try {
    for (const object of objects) {
      const element = document.createElement("div");
      element.className = `obj ${object.type}`;
      element.dataset.id = object.id;
      element.style.left = `${object.x}%`;
      element.style.top = `${object.y}%`;
      element.textContent = object.text;
      diagramObjects.appendChild(element);
      elements.set(object.id, element);
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.id = "diagram-arrow";
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");
    const markerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    markerPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    markerPath.style.fill = "var(--accent)";
    marker.appendChild(markerPath);
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.appendChild(marker);
    diagramSvg.appendChild(defs);
    const overlayRect = diagramView.getBoundingClientRect();
    for (const arrow of arrows) {
      const fromRect = elements.get(arrow.from).getBoundingClientRect();
      const toRect = elements.get(arrow.to).getBoundingClientRect();
      const fromX = fromRect.left - overlayRect.left + fromRect.width / 2;
      const fromY = fromRect.top - overlayRect.top + fromRect.height / 2;
      const toX = toRect.left - overlayRect.left + toRect.width / 2;
      const toY = toRect.top - overlayRect.top + toRect.height / 2;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;
      const startOffset = Math.min(fromRect.width, fromRect.height) / 2;
      const endOffset = Math.min(toRect.width, toRect.height) / 2;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.dataset.id = arrow.id;
      line.setAttribute("x1", fromX + ux * startOffset);
      line.setAttribute("y1", fromY + uy * startOffset);
      line.setAttribute("x2", toX - ux * endOffset);
      line.setAttribute("y2", toY - uy * endOffset);
      line.setAttribute("marker-end", "url(#diagram-arrow)");
      diagramSvg.appendChild(line);
      elements.set(arrow.id, line);
    }
    diagramView.classList.add("show");
    await wait(500);
    for (const step of data.steps.slice(0, 12)) {
      if (stopRequested) break;
      elements.forEach((element) => element.classList.remove("on"));
      for (const id of Array.isArray(step.show) ? step.show : []) {
        if (elements.has(id)) elements.get(id).classList.add("visible");
      }
      for (const id of Array.isArray(step.highlight) ? step.highlight : []) {
        if (elements.has(id)) elements.get(id).classList.add("on");
      }
      const sayText = String(step.say || "").slice(0, 120);
      diagramSay.textContent = sayText;
      const ms = Math.min(4000, Math.max(800, Number.isFinite(step.ms) ? step.ms : 2000));
      await speak(sayText);
      if (stopRequested) break;
      await wait(400);
    }
  } finally {
    if (window.speechSynthesis) speechSynthesis.cancel();
    diagramView.classList.remove("show");
    await wait(500);
    diagramSvg.replaceChildren();
    diagramObjects.replaceChildren();
    diagramSay.textContent = "";
    document.body.classList.remove("takeover");
    running = false;
    stopRequested = false;
  }
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
document.getElementById("demoBeats").addEventListener("click", async () => {
  if (running) return;
  running = true;
  try {
    const response = await fetch("beats-demo.json", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Beats demo request failed: ${response.status}`);
    const data = await response.json();
    await playBeats(data);
  } catch (err) {
    console.error(err);
  } finally {
    running = false;
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && diagramView.classList.contains("show")) {
    stopRequested = true;
    if (window.speechSynthesis) speechSynthesis.cancel();
  }
});
document.getElementById("demoDiagram").addEventListener("click", async () => {
  if (running) return;
  try {
    const response = await fetch("diagram-demo.json", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Diagram demo request failed: ${response.status}`);
    await playDiagram(await response.json());
  } catch (err) {
    console.error(err);
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ask();
});

setState("idle");
applyPalette(DEFAULT_PALETTE);