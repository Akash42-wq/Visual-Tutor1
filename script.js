const stage = document.querySelector(".stage");
const orb = document.querySelector(".orb");
const buttons = document.querySelectorAll("button[data-set]");
const caption = document.getElementById("caption");
const input = document.getElementById("question");

const API_URL = "http://127.0.0.1:8000/explain";
let rafId = null;
let typeTimer = null;
let running = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- variety logic ---------- */

// one font per page load (system fonts, nothing to download)
const FONTS = [
  '"Segoe UI", sans-serif',
  'Georgia, serif',
  '"Trebuchet MS", sans-serif',
  '"Palatino Linotype", serif',
  'Consolas, monospace',
];
caption.style.fontFamily = FONTS[Math.floor(Math.random() * FONTS.length)];

// each style is used 5 times in a row, then a random different one
const STYLES = ["typewriter", "rise", "blur", "glow"];
let currentStyle = null;
let usesLeft = 0;

function pickStyle() {
  if (usesLeft <= 0) {
    const others = STYLES.filter((s) => s !== currentStyle);
    currentStyle = others[Math.floor(Math.random() * others.length)];
    usesLeft = 5;
  }
  usesLeft--;
  return currentStyle;
}

/* ---------- text animations ---------- */

// letter by letter
function typeText(text, speed = 30) {
  return new Promise((resolve) => {
    clearInterval(typeTimer);
    caption.textContent = "";
    let i = 0;
    typeTimer = setInterval(() => {
      caption.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(typeTimer);
        resolve();
      }
    }, speed);
  });
}

// word by word; CSS does the actual animation (rise / blur / glow)
function wordAnimate(text, style, step = 90) {
  return new Promise((resolve) => {
    clearInterval(typeTimer);
    caption.textContent = "";
    const words = text.split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      const span = document.createElement("span");
      span.className = "w " + style;
      span.textContent = word;                      // textContent = safe, no HTML injection
      span.style.animationDelay = i * step + "ms";
      caption.appendChild(span);
    });
    setTimeout(resolve, words.length * step + 600);
  });
}

// later, voice will set `step` so words land in time with the audio
function animateText(text) {
  const style = pickStyle();
  console.log("animation style:", style, "| uses left:", usesLeft);
  if (style === "typewriter") return typeText(text);
  return wordAnimate(text, style);
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

async function ask() {
  const question = input.value.trim();
  if (!question || running) return;
  running = true;
  caption.textContent = "";
  setState("thinking");

  let reply;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error("Server error " + res.status);
    const data = await res.json();
    reply = data.text;
  } catch (err) {
    console.error(err);
    reply = "Could not reach the backend. Is it running?";
  }

  setState("speaking");
  await animateText(reply);
  await wait(800);
  setState("idle");
  running = false;
}

buttons.forEach((b) => b.addEventListener("click", () => setState(b.dataset.set)));
orb.addEventListener("click", ask);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ask();
});

setState("idle");