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

const arrowAnims = new Map();
function growArrow(line, geo, ms) {
  const prefersReduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced || Math.hypot(geo.x2 - geo.x1, geo.y2 - geo.y1) < 2) {
    line.setAttribute("x2", geo.x2);
    line.setAttribute("y2", geo.y2);
    return;
  }
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    line.setAttribute("x2", geo.x1 + (geo.x2 - geo.x1) * e);
    line.setAttribute("y2", geo.y1 + (geo.y2 - geo.y1) * e);
    if (t < 1) arrowAnims.set(line, requestAnimationFrame(frame));
    else arrowAnims.delete(line);
  };
  arrowAnims.set(line, requestAnimationFrame(frame));
}

async function playDiagram(data) {
  const arrowGeo = new Map();
  if (!data || !Array.isArray(data.objects) || !data.objects.length || !Array.isArray(data.steps)) return;
  const objects = [];
  const objectIds = new Set();
  for (const object of data.objects) {
    if (!object || typeof object.id !== "string" || !["box", "circle", "label", "code"].includes(object.type) ||
        !Number.isFinite(object.x) || !Number.isFinite(object.y) || objectIds.has(object.id)) continue;
    if (object.type === "code") {
      if (!Array.isArray(object.lines)) continue;
      const lines = object.lines
        .filter((line) => String(line).trim())
        .slice(0, 12)
        .map((line) => String(line).slice(0, 60));
      if (!lines.length) continue;
      objectIds.add(object.id);
      objects.push({
        ...object,
        lines,
        x: Math.min(100, Math.max(0, object.x)),
        y: Math.min(100, Math.max(0, object.y)),
      });
      continue;
    }
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
  const codeLines = new Map();
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
      if (object.type === "code") {
        const lines = [];
        for (const [index, line] of object.lines.entries()) {
          const codeline = document.createElement("div");
          codeline.className = "codeline";
          const number = document.createElement("span");
          number.className = "ln";
          number.textContent = String(index + 1);
          const source = document.createElement("span");
          source.className = "src";
          source.textContent = line;
          codeline.append(number, source);
          element.appendChild(codeline);
          lines.push(codeline);
        }
        codeLines.set(object.id, lines);
      } else {
        element.textContent = object.text;
      }
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
      const x1 = fromX + ux * startOffset;
      const y1 = fromY + uy * startOffset;
      const x2 = toX - ux * endOffset;
      const y2 = toY - uy * endOffset;
      arrowGeo.set(arrow.id, { x1, y1, x2, y2 });
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x1);
      line.setAttribute("y2", y1);
      line.setAttribute("marker-end", "url(#diagram-arrow)");
      diagramSvg.appendChild(line);
      elements.set(arrow.id, line);
    }
    diagramView.classList.add("show");
    await wait(500);
    for (const step of data.steps.slice(0, 12)) {
      if (stopRequested) break;
      elements.forEach((element) => element.classList.remove("on"));
      codeLines.forEach((lines) => lines.forEach((line) => line.classList.remove("hot")));
      for (const id of Array.isArray(step.show) ? step.show : []) {
        if (arrowGeo.has(id)) {
          const line = elements.get(id);
          if (line && !line.classList.contains("visible")) {
            line.classList.add("visible");
            growArrow(line, arrowGeo.get(id), 600);
          }
        } else if (elements.has(id)) {
          elements.get(id).classList.add("visible");
        }
      }
      for (const id of Array.isArray(step.highlight) ? step.highlight : []) {
        if (elements.has(id)) elements.get(id).classList.add("on");
      }
      if (step.codeLines && typeof step.codeLines === "object") {
        for (const [id, indexes] of Object.entries(step.codeLines)) {
          if (!codeLines.has(id) || !Array.isArray(indexes)) continue;
          for (const index of indexes) {
            if (codeLines.get(id)[index]) codeLines.get(id)[index].classList.add("hot");
          }
        }
      }
      const sayText = String(step.say || "").slice(0, 120);
      diagramSay.textContent = sayText;
      const ms = Math.min(4000, Math.max(800, Number.isFinite(step.ms) ? step.ms : 2000));
      await speak(sayText);
      if (stopRequested) break;
      await wait(400);
    }
  } finally {
    arrowAnims.forEach((rafId) => cancelAnimationFrame(rafId)); arrowAnims.clear();
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

const SMALL_TALK = [
  {
    phrases: ["hi", "hey", "hello", "yo", "sup", "hiya", "heyy", "helo", "hey there", "hi there", "hello there", "good morning", "good afternoon", "good evening", "howdy", "greetings", "hey orb", "hi orb", "hello orb", "hey orbe"],
    replies: ["Hi. What would you like to learn?", "Hello. Ask me a programming question.", "Hey. I am ready when you are."],
  },
  {
    phrases: ["how are you", "how are you doing", "how you doing", "hows it going", "how is it going", "how is your day", "whats up", "wassup", "how have you been", "you good", "hru", "how are things", "how are things going", "how are you today", "are you doing okay", "everything good"],
    replies: ["I am doing well and ready to help.", "I am good. What should we explore?", "All systems are ready for your question."],
  },
  {
    phrases: ["thanks", "thank you", "thx", "ty", "thanks a lot", "thank you so much", "cheers", "appreciate it", "much appreciated", "thanks orb", "thank you orb", "many thanks", "thanks a bunch", "thank you very much", "i appreciate it"],
    replies: ["You are welcome.", "Glad I could help.", "Anytime. Ask another question when you like."],
  },
  {
    phrases: ["bye", "goodbye", "see you", "see ya", "cya", "later", "good night", "gn", "take care", "talk later", "bye orb", "goodbye orb", "see you later", "catch you later", "i am leaving", "have a good night"],
    replies: ["Goodbye. Come back whenever you have another question.", "See you later.", "Take care."],
  },
  {
    phrases: ["who are you", "what are you", "whats your name", "what is your name", "are you a bot", "are you ai", "are you real", "who made you", "who built you", "what should i call you", "tell me about yourself", "are you artificial intelligence", "are you a robot", "is this a bot", "what kind of bot are you"],
    replies: ["I am Orb, a programming tutor.", "I am an AI tutor that explains programming ideas.", "I am Orb. I turn programming questions into clear explanations."],
  },
  {
    phrases: ["what can you do", "what do you do", "help", "help me", "how do you work", "what can i ask", "what should i ask", "how does this work", "what topics do you know", "what are you able to do", "can you help", "can you teach me", "what can i learn", "what do you know", "how can you help me"],
    replies: ["I explain programming ideas with diagrams. Try asking, \"explain arrays.\"", "I teach programming concepts with visual examples. You could ask, \"what is a loop?\"", "I can explain code and data structures step by step. Try, \"explain variables.\""],
  },
  {
    phrases: ["ok", "okay", "k", "cool", "nice", "great", "awesome", "got it", "i see", "makes sense", "alright", "sure", "fine", "good", "perfect", "wow", "understood", "that helps", "sounds good", "neat"],
    replies: ["Great. What would you like to ask next?", "Nice. Send me another programming question.", "Glad that makes sense."],
  },
  {
    phrases: ["sorry", "my bad", "oops", "sorry orb", "i apologize", "my mistake", "oops sorry", "forgive me", "sorry about that", "i made a mistake"],
    replies: ["No problem.", "That is okay.", "No worries. We can try again."],
  },
  {
    phrases: ["lol", "haha", "hahaha", "lmao", "hehe", "rofl", "that is funny", "thats funny", "funny", "ha", "hehehe", "lol orb"],
    replies: ["Glad that was amusing.", "A little humor helps.", "Heh. Ready for another question?"],
  },
  {
    phrases: ["are you there", "you there", "hello are you there", "test", "testing", "anyone there", "are you online", "is anyone there", "orb are you there", "can you hear me", "did you get that", "are you awake", "hello orb are you there", "is this working", "does this work"],
    replies: ["I am here.", "Yes, I am ready.", "I am online and listening."],
  },
];

function normalizeChat(text) {
  const words = String(text).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const mapped = words.map((word) => ({
    u: "you", r: "are", ur: "your", thx: "thanks", pls: "please", hru: "how are you", wassup: "whats up",
  }[word] || word)).join(" ");
  if (SMALL_TALK.some((category) => category.phrases.some((phrase) => phrase === mapped))) return mapped;
  const fillers = ["bro", "man", "dude", "claude", "orb", "please", "there"];
  const normalizedWords = mapped.split(" ");
  if (normalizedWords.some((word) => fillers.indexOf(word) === -1)) {
    return normalizedWords.filter((word) => fillers.indexOf(word) === -1).join(" ");
  }
  return mapped;
}

function localReply(question) {
  const n = normalizeChat(question);
  if (!n || n.split(" ").length > 8) return null;
  const category = SMALL_TALK.find((item) => item.phrases.some((phrase) => phrase === n));
  return category ? pickOne(category.replies) : null;
}

function isChatReply(scenes) {
  if (!Array.isArray(scenes) || scenes.length !== 1) return false;
  const sc = scenes[0];
  const noDiagram = !sc.diagram || sc.diagram.type === "none";
  return noDiagram && Array.isArray(sc.steps) && sc.steps.length === 1;
}

const USE_DIAGRAM = false;
const DIAGRAM_URL = "http://127.0.0.1:8000/diagram";
async function fetchVisual(question) {
  try {
    const res = await fetch(DIAGRAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: typeof chatHistory !== "undefined" ? chatHistory : [] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.data) return null;
    if (json.kind === "array" && Array.isArray(json.data.steps) && json.data.steps.length) return json;
    if (json.kind === "diagram" && Array.isArray(json.data.objects) && json.data.objects.length && Array.isArray(json.data.steps)) return json;
    return null;
  } catch (err) {
    console.warn("visual request failed, using the old flow:", err);
    return null;
  }
}

const USE_TEXT = true;
const TEXT_URL = "http://127.0.0.1:8000/text";
async function fetchText(question) {
  try {
    const res = await fetch(TEXT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: typeof chatHistory !== "undefined" ? chatHistory : [] }),
      signal: AbortSignal.timeout(45000),
    });
    if (res.status === 429) return { error: "quota" };
    if (!res.ok) return { error: "failed" };
    const json = await res.json();
    if (json && json.kind === "text" && json.data && Array.isArray(json.data.beats) && json.data.beats.length) return { data: json.data };
    return { error: "failed" };
  } catch (err) {
    console.warn("text request failed:", err);
    return { error: "failed" };
  }
}

async function ask() {
  const question = input.value.trim();
  if (!question || running) return;
  running = true;
  try {
    const local = localReply(question);
    if (local) {
      caption.textContent = "";
      setState("speaking");
      caption.classList.remove("hidden");
      await Promise.all([revealText(caption, local, [], nextTextStyle()), speak(local)]);
      await wait(800);
      return;
    }
    caption.textContent = "";
    setState("thinking");
    const stopCaptions = startThinkingCaptions();
    const text = USE_TEXT && typeof window.playText === "function" ? await fetchText(question) : null;
    if (text && text.error) {
      stopCaptions();
      caption.textContent = "";
      caption.classList.remove("hidden");
      const msg = text.error === "quota"
        ? "Too many questions at once. Wait a minute and try again."
        : "Sorry, I couldn’t get an answer. Check your internet and try again.";
      await Promise.all([revealText(caption, msg, [], nextTextStyle()), speak(msg)]);
      await wait(800);
      return;
    }
    if (text && text.data) {
      stopCaptions();
      caption.textContent = "";
      setState("speaking");
      running = false;
      await window.playText(text.data);
      return;
    }
    const visual = USE_DIAGRAM ? await fetchVisual(question) : null;
    if (visual) {
      stopCaptions();
      caption.textContent = "";
      setState("speaking");
      running = false;
      if (visual.kind === "array") await playArray(visual.data);
      else await playDiagram(visual.data);
      return;
    }

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
    if (data.scenes && data.scenes.length && !isChatReply(data.scenes)) {
      await playScenes(data.scenes);
    } else {
      caption.classList.remove("hidden");
      const chatText = (data.scenes && data.scenes.length && isChatReply(data.scenes))
        ? String(data.scenes[0].steps[0].say || "")
        : (data.spoken || data.text || "");
      await Promise.all([revealText(caption, chatText, [], nextTextStyle()), chatText ? speak(chatText) : Promise.resolve()]);
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

const micBtn = document.getElementById("micBtn");
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let micOn = false;
let listening = false;
let heard = "";
let wasBusy = false;
let startTimer = null;
let startTimerPending = false;
let micWatch = null;
let micStream = null;
let micCtx = null;
let micAnalyser = null;
let micRaf = null;
let micLevel = 0;
let recognition = null;

if (!SR) {
  micBtn.disabled = true;
  micBtn.title = "Speech recognition needs Chrome or Edge";
} else {
  recognition = new SR();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  function startRec() {
    if (!micOn || running || listening) return;
    try {
      recognition.start();
    } catch (e) {
      console.warn(e);
    }
  }

  function stopMic() {
    micOn = false;
    heard = "";
    clearInterval(micWatch);
    micWatch = null;
    clearTimeout(startTimer);
    startTimer = null;
    startTimerPending = false;
    cancelAnimationFrame(micRaf);
    micRaf = null;
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    if (micCtx) micCtx.close();
    micStream = micCtx = micAnalyser = null;
    micLevel = 0;
    micBtn.style.setProperty("--lvl", 0);
    micBtn.classList.remove("on", "busy");
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.setAttribute("aria-label", "Turn microphone on");
    micBtn.title = "Microphone off";
    if (listening) recognition.abort();
    if (!running) {
      stage.style.setProperty("--level", 0);
      setState("idle");
    }
  }

  async function startMeter() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micCtx = new AudioContext();
      micAnalyser = micCtx.createAnalyser();
      micAnalyser.fftSize = 256;
      micCtx.createMediaStreamSource(micStream).connect(micAnalyser);
      const loop = () => {
        if (!micOn) return;
        if (!running && micAnalyser) {
          const buf = new Uint8Array(micAnalyser.fftSize);
          micAnalyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) {
            const d = (v - 128) / 128;
            sum += d * d;
          }
          const target = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          micLevel = micLevel * 0.8 + target * 0.2;
          stage.style.setProperty("--level", micLevel.toFixed(3));
          micBtn.style.setProperty("--lvl", micLevel.toFixed(3));
        } else {
          micLevel = 0;
          micBtn.style.setProperty("--lvl", 0);
        }
        micRaf = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      console.warn(err);
    }
  }

  function startMic() {
    micOn = true;
    micBtn.classList.add("on");
    micBtn.setAttribute("aria-pressed", "true");
    micBtn.setAttribute("aria-label", "Turn microphone off");
    micBtn.title = "Microphone on";
    startMeter();
    micWatch = setInterval(() => {
      if (running) {
        wasBusy = true;
        micBtn.classList.add("busy");
        if (listening) {
          heard = "";
          recognition.abort();
        }
      } else {
        micBtn.classList.remove("busy");
        if (wasBusy) {
          wasBusy = false;
          clearTimeout(startTimer);
          startTimerPending = true;
          startTimer = setTimeout(() => {
            startTimerPending = false;
            startTimer = null;
            startRec();
          }, 600);
        } else if (!listening && !startTimerPending) {
          startRec();
        }
      }
    }, 250);
    startRec();
  }

  recognition.onstart = () => {
    listening = true;
    if (!running) setState("listening");
  };

  recognition.onresult = (event) => {
    if (running) return;
    heard = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join("");
    input.value = heard;
  };

  recognition.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (!running) {
      const messages = {
        "not-allowed": "Mic is blocked. Allow it in the address bar.",
        "service-not-allowed": "Mic is blocked. Allow it in the address bar.",
        network: "Speech recognition needs internet.",
        "audio-capture": "No microphone found.",
      };
      const message = messages[event.error] || "Mic error.";
      caption.textContent = message;
      setTimeout(() => {
        if (caption.textContent === message) caption.textContent = "";
      }, 2500);
    }
    if (event.error === "not-allowed" || event.error === "service-not-allowed" ||
        event.error === "network" || event.error === "audio-capture") {
      stopMic();
    }
  };

  recognition.onend = () => {
    listening = false;
    const text = heard.trim();
    heard = "";
    if (text && micOn && !running) {
      input.value = text;
      ask();
      input.value = "";
    }
  };

  micBtn.addEventListener("click", () => {
    micOn ? stopMic() : startMic();
  });
}

const arrayView = document.getElementById("array-view");
const arrayTitle = document.getElementById("array-title");
const arrayStage = document.getElementById("array-stage");
const arraySay = document.getElementById("array-say");
const SFX_VOLUME = 0.35;
let sfxOn = true;
let sfxCtx = null;
let sfxMaster = null;
let sfxNoise = null;
let buildStep = 0;
let lastBuild = 0;
function sfxInit() {
  try {
    if (sfxCtx) {
      if (sfxCtx.state === "suspended") sfxCtx.resume();
      return true;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    sfxCtx = new AudioContextClass();
    const compressor = sfxCtx.createDynamicsCompressor();
    sfxMaster = sfxCtx.createGain();
    sfxMaster.gain.value = SFX_VOLUME;
    sfxMaster.connect(compressor);
    compressor.connect(sfxCtx.destination);
    sfxNoise = sfxCtx.createBuffer(1, sfxCtx.sampleRate, sfxCtx.sampleRate);
    const noiseData = sfxNoise.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = Math.random() * 2 - 1;
    return true;
  } catch (err) {
    sfxCtx = null;
    sfxMaster = null;
    sfxNoise = null;
    return false;
  }
}
function tone(freq, start, dur, vol, type = "sine", endFreq) {
  const oscillator = sfxCtx.createOscillator();
  const gain = sfxCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, start);
  if (endFreq !== undefined) oscillator.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  oscillator.connect(gain);
  gain.connect(sfxMaster);
  oscillator.start(start);
  oscillator.stop(start + dur + 0.05);
}
function whoosh(start, dur, vol) {
  const source = sfxCtx.createBufferSource();
  const filter = sfxCtx.createBiquadFilter();
  const gain = sfxCtx.createGain();
  source.buffer = sfxNoise;
  source.loop = true;
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(400, start);
  filter.frequency.exponentialRampToValueAtTime(1600, start + dur * 0.6);
  filter.frequency.exponentialRampToValueAtTime(500, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(vol, start + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxMaster);
  source.start(start);
  source.stop(start + dur + 0.05);
}
function sfx(name) {
  if (!sfxOn || !sfxInit()) return;
  const t = sfxCtx.currentTime;
  if (name === "build") {
    const now = performance.now();
    if (now - lastBuild > 700) buildStep = 0;
    lastBuild = now;
    const semitones = [0, 2, 4, 7, 9, 12, 14, 16];
    const semitone = semitones[Math.min(buildStep, semitones.length - 1)];
    const freq = 440 * Math.pow(2, semitone / 12);
    tone(freq, t, 0.22, 0.5, "sine");
    tone(freq * 2, t, 0.1, 0.12, "sine");
    buildStep += 1;
  } else if (name === "focus") {
    tone(880, t, 0.35, 0.28, "sine");
    tone(1320, t + 0.06, 0.3, 0.18, "sine");
  } else if (name === "pointer") {
    tone(300, t, 0.45, 0.16, "sine", 430);
  } else if (name === "set") {
    tone(660, t, 0.1, 0.25, "triangle");
    tone(880, t + 0.1, 0.14, 0.22, "triangle");
  } else if (name === "swap") {
    whoosh(t, 0.8, 0.3);
    tone(110, t + 0.7, 0.18, 0.3, "sine");
  }
}
const sfxBtn = document.getElementById("sfxBtn");
sfxBtn.addEventListener("click", () => {
  sfxOn = !sfxOn;
  sfxBtn.textContent = sfxOn ? "Sound: on" : "Sound: off";
  if (sfxOn) {
    sfxInit();
    sfx("focus");
  }
});
document.addEventListener("keydown", (event) => {
  const active = document.activeElement;
  if ((event.key === "m" || event.key === "M") &&
      active && active.tagName !== "INPUT" && active.tagName !== "TEXTAREA" && active.id !== "question") {
    sfxOn = !sfxOn;
    sfxBtn.textContent = sfxOn ? "Sound: on" : "Sound: off";
  }
});
const AEASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const ASPRING = "cubic-bezier(0.2, 1.25, 0.4, 1)";

async function playArray(data) {
  if (!data || !Array.isArray(data.steps)) return;
  const steps = data.steps.slice(0, 15).map((rawStep) => {
    const say = String(rawStep && rawStep.say || "").slice(0, 120);
    const ops = [];
    let buildSeen = false;
    for (const rawOp of rawStep && Array.isArray(rawStep.do) ? rawStep.do : []) {
      if (!rawOp || typeof rawOp !== "object" || typeof rawOp.op !== "string") continue;
      if (rawOp.op === "build") {
        if (buildSeen || !Array.isArray(rawOp.values) || rawOp.values.length < 2 || rawOp.values.length > 8) continue;
        buildSeen = true;
        ops.push({ op: "build", values: rawOp.values.map((value) => String(value).slice(0, 6)) });
      } else if (rawOp.op === "focus" && Array.isArray(rawOp.at) && rawOp.at.every(Number.isInteger)) {
        ops.push({ op: "focus", at: rawOp.at.slice() });
      } else if (rawOp.op === "pointer" && typeof rawOp.name === "string" && Number.isInteger(rawOp.to)) {
        ops.push({ op: "pointer", name: rawOp.name, to: rawOp.to });
      } else if (rawOp.op === "set" && Number.isInteger(rawOp.at)) {
        ops.push({ op: "set", at: rawOp.at, value: String(rawOp.value).slice(0, 6) });
      } else if (rawOp.op === "swap" && Number.isInteger(rawOp.a) && Number.isInteger(rawOp.b) && rawOp.a !== rawOp.b) {
        ops.push({ op: "swap", a: rawOp.a, b: rawOp.b });
      }
    }
    return { say, ops };
  });
  if (running) return;
  running = true;
  stopRequested = false;
  document.body.classList.add("takeover");
  arrayStage.replaceChildren();
  arrayTitle.textContent = String(data.title || "").slice(0, 120);
  arraySay.textContent = "";
  arrayView.classList.add("show");
  await wait(600);
  let n = 0;
  let cw = 0;
  let step = 0;
  let slots = [];
  let cells = [];
  const pointers = new Map();
  let lit = [];
  const x = (i) => (i - (n - 1) / 2) * step;
  const place = (element, index) => {
    element.style.translate = `${x(index)}px 0px`;
  };
  const finish = async (animation) => {
    try {
      await animation.finished;
    } catch (err) {
      if (!stopRequested) throw err;
    }
  };
  try {
    let built = false;
    for (const { say, ops } of steps) {
      if (stopRequested) break;
      cells.forEach((cell) => cell.classList.remove("lit", "soft"));
      arraySay.textContent = say;
      const talk = speak(say);
      for (const op of ops) {
        if (op.op === "build") {
          if (built) continue;
          built = true;
          n = op.values.length;
          cw = Math.min(110, Math.floor((window.innerWidth * 0.86) / (n * 1.2)));
          step = cw * 1.2;
          arrayStage.style.setProperty("--cw", `${cw}px`);
          slots = [];
          cells = [];
          lit = [];
          for (let i = 0; i < n; i += 1) {
            const slot = document.createElement("div");
            slot.className = "slot";
            const index = document.createElement("span");
            index.textContent = String(i);
            slot.appendChild(index);
            place(slot, i);
            arrayStage.appendChild(slot);
            slots.push(slot);
            await wait(60);
            slot.style.opacity = "1";
          }
          for (let i = 0; i < n; i += 1) {
            const cell = document.createElement("div");
            cell.className = "acell";
            cell.textContent = op.values[i];
            place(cell, i);
            arrayStage.appendChild(cell);
            cells.push(cell);
            const animation = cell.animate([
              { opacity: 0, translate: `${x(i)}px -60px`, scale: 0.85 },
              { opacity: 1, translate: `${x(i)}px 0px`, scale: 1 },
            ], { duration: 520, easing: ASPRING, fill: "forwards" });
            sfx("build");
            await finish(animation);
            cell.style.opacity = "1";
            cell.style.translate = `${x(i)}px 0px`;
            animation.cancel();
          }
        } else if (!built) {
          continue;
        } else if (op.op === "focus") {
          cells.forEach((cell) => cell.classList.remove("lit", "soft"));
          lit = op.at.filter((index) => index >= 0 && index < n);
          if (lit.length) {
            cells.forEach((cell, index) => cell.classList.toggle("lit", lit.includes(index)));
            cells.forEach((cell, index) => cell.classList.toggle("soft", !lit.includes(index)));
          }
          sfx("focus");
        } else if (op.op === "pointer" && op.to >= 0 && op.to < n) {
          let pointer = pointers.get(op.name);
          if (!pointer) {
            pointer = document.createElement("div");
            pointer.className = "aptr";
            pointer.textContent = op.name;
            place(pointer, op.to);
            arrayStage.appendChild(pointer);
            pointers.set(op.name, pointer);
            requestAnimationFrame(() => { pointer.style.opacity = "1"; });
          } else {
            place(pointer, op.to);
          }
          sfx("pointer");
          await wait(600);
        } else if (op.op === "set" && op.at >= 0 && op.at < n) {
          const cell = cells[op.at];
          const out = cell.animate([
            { transform: "perspective(500px) rotateX(0deg)" },
            { transform: "perspective(500px) rotateX(90deg)" },
          ], { duration: 160, easing: AEASE, fill: "forwards" });
          await finish(out);
          cell.textContent = op.value;
          out.cancel();
          const inAnimation = cell.animate([
            { transform: "perspective(500px) rotateX(-90deg)" },
            { transform: "perspective(500px) rotateX(0deg)" },
          ], { duration: 220, easing: AEASE, fill: "forwards" });
          sfx("set");
          await finish(inAnimation);
          inAnimation.cancel();
        } else if (op.op === "swap" && op.a >= 0 && op.a < n && op.b >= 0 && op.b < n) {
          const ca = cells[op.a];
          const cb = cells[op.b];
          const dx = x(op.b) - x(op.a);
          const lift = cw * 0.55;
          const first = ca.animate([
            { translate: `${x(op.a)}px 0px`, scale: 1 },
            { translate: `${x(op.a) + dx / 2}px ${-lift}px`, scale: 1.08 },
            { translate: `${x(op.b)}px 0px`, scale: 1 },
          ], { duration: 800, easing: "ease-in-out", fill: "forwards" });
          const second = cb.animate([
            { translate: `${x(op.b)}px 0px` },
            { translate: `${x(op.b) - dx / 2}px ${lift}px` },
            { translate: `${x(op.a)}px 0px` },
          ], { duration: 800, easing: "ease-in-out", fill: "forwards" });
          sfx("swap");
          await Promise.all([finish(first), finish(second)]);
          ca.style.translate = `${x(op.b)}px 0px`;
          cb.style.translate = `${x(op.a)}px 0px`;
          first.cancel();
          second.cancel();
          cells[op.a] = cb;
          cells[op.b] = ca;
        }
        if (stopRequested) break;
      }
      for (const pointer of pointers.values()) pointer.style.opacity = "1";
      await talk;
      if (stopRequested) break;
      await wait(350);
    }
  } finally {
    if (window.speechSynthesis) speechSynthesis.cancel();
    arrayView.classList.remove("show");
    await wait(600);
    arrayStage.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    arrayStage.replaceChildren();
    arraySay.textContent = "";
    arrayTitle.textContent = "";
    document.body.classList.remove("takeover");
    running = false;
    stopRequested = false;
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && arrayView.classList.contains("show")) {
    stopRequested = true;
    if (window.speechSynthesis) speechSynthesis.cancel();
  }
});
document.getElementById("demoArray").addEventListener("click", async () => {
  if (running) return;
  try {
    const response = await fetch("array-demo.json", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Array demo request failed: ${response.status}`);
    await playArray(await response.json());
  } catch (err) {
    console.error(err);
  }
});

setState("idle");
applyPalette(DEFAULT_PALETTE);