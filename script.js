const orb = document.querySelector(".orb");
const buttons = document.querySelectorAll("button[data-set]");
let rafId = null;

function setState(state) {
  orb.dataset.state = state;
  cancelAnimationFrame(rafId);
  orb.style.setProperty("--level", 0);
  if (state === "speaking") fakeVoice();
}

// pretend loudness (0 to 1); later this will come from real audio
function fakeVoice() {
  const t = performance.now() / 1000;
  const level = (Math.sin(t * 7) + Math.sin(t * 3.1) + 2) / 4;
  orb.style.setProperty("--level", level.toFixed(3));
  rafId = requestAnimationFrame(fakeVoice);
}

buttons.forEach((b) => {
  b.addEventListener("click", () => setState(b.dataset.set));
});

setState("idle");
const stage = document.querySelector(".stage");
const orb = document.querySelector(".orb");
const buttons = document.querySelectorAll("button[data-set]");
let rafId = null;

function setState(state) {
  orb.dataset.state = state;
  cancelAnimationFrame(rafId);
  stage.style.setProperty("--level", 0);
  if (state === "speaking") fakeVoice();
}

function fakeVoice() {
  const t = performance.now() / 1000;
  const level = (Math.sin(t * 7) + Math.sin(t * 3.1) + 2) / 4;
  stage.style.setProperty("--level", level.toFixed(3));
  rafId = requestAnimationFrame(fakeVoice);
}

buttons.forEach((b) => {
  b.addEventListener("click", () => setState(b.dataset.set));
});

setState("idle");