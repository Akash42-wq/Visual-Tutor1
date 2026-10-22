(() => {
  const VOCAB = {
    layouts: ["word", "stack", "term", "split", "stat", "lines"],
    enters: ["slam", "punch", "drop", "rise", "words", "blur", "scale", "slide", "countup", "lines", "fade", "wipe", "flip", "swing", "glitch", "bounce", "drift"],
    exits: ["cut", "fade"],
    transitions: ["cut", "flash", "fade"],
    bgs: ["black", "palette"],
  };
  const waitLocal = typeof wait === "function"
    ? wait
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const speakLocal = typeof speak === "function"
    ? speak
    : () => Promise.resolve();
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const valid = (group, value, fallback) => VOCAB[group].includes(value) ? value : fallback;

  function sanitize(data) {
    if (!data || !Array.isArray(data.beats) || !data.beats.length) return null;
    const beats = [];
    for (const raw of data.beats) {
      if (!raw || typeof raw !== "object") continue;
      const say = String(raw.say || "").slice(0, 240);
      const text = String(raw.text || "").slice(0, 60);
      const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
      const lines = rawLines.map((line) => String(line).slice(0, 60)).slice(0, 4);
      if (!lines.length && text) lines.push(text);
      if (!lines.length) continue;
      const emphasis = Array.isArray(raw.emphasis)
        ? raw.emphasis.filter((item) => typeof item === "string").slice(0, 1)
        : [];
      beats.push({
        say,
        text,
        lines,
        role: raw.role,
        layout: valid("layouts", raw.layout, "word"),
        emphasis,
        enter: valid("enters", raw.enter, "fade"),
        exit: valid("exits", raw.exit, "fade"),
        ms: Math.min(10000, Math.max(600, Number.isFinite(raw.ms) ? raw.ms : 2000)),
        transition: valid("transitions", raw.transition, "cut"),
        bg: valid("bgs", raw.bg, "black"),
      });
    }
    return beats.length ? beats : null;
  }

  const fitSize = (text) => {
    const length = text.length;
    const size = length <= 12 ? 8 : length <= 24 ? 6 : length <= 40 ? 4.5 : 3;
    return `clamp(28px, ${size}vw, 120px)`;
  };

  function words(text, emphasis) {
    return String(text).split(/\s+/).filter(Boolean).map((word, index) => {
      const span = document.createElement("span");
      span.className = "tw";
      span.style.setProperty("--i", index);
      span.textContent = word;
      if (emphasis && norm(word) === norm(emphasis)) span.classList.add("hl");
      return span;
    });
  }

  function lineElement(text, className, emphasis, index) {
    const line = document.createElement("div");
    line.className = className;
    if (index !== undefined) line.style.setProperty("--i", index);
    words(text, emphasis).forEach((word) => line.appendChild(word));
    return line;
  }

  function render(beat) {
    const root = document.createElement("div");
    root.className = `tb l-${beat.layout}`;
    root.dataset.enter = beat.enter;
    root.style.fontSize = fitSize(beat.text);
    const emphasis = beat.emphasis[0] || "";
    if (beat.layout === "word") {
      root.appendChild(lineElement(beat.lines[0], "tl", emphasis));
    } else if (beat.layout === "stack") {
      beat.lines.forEach((line, index) => root.appendChild(lineElement(line, "tl", emphasis, index)));
    } else if (beat.layout === "term") {
      root.appendChild(lineElement(beat.lines[0], "tl term-main", emphasis));
      if (beat.lines[1]) root.appendChild(lineElement(beat.lines[1], "tl term-sub", emphasis));
    } else if (beat.layout === "split") {
      root.appendChild(lineElement(beat.lines[0], "half left", emphasis));
      const divider = document.createElement("div");
      divider.className = "divider";
      root.appendChild(divider);
      root.appendChild(lineElement(beat.lines[1] || "", "half right", emphasis));
    } else if (beat.layout === "stat") {
      root.appendChild(lineElement(beat.lines[0], "stat-num", emphasis));
      if (beat.lines[1]) root.appendChild(lineElement(beat.lines[1], "stat-label", emphasis));
    } else if (beat.layout === "lines") {
      beat.lines.forEach((line, index) => root.appendChild(lineElement(line, "tl", emphasis, index)));
    }
    return root;
  }

  function countUp(root, finalText, rafs) {
    if (!root || !root.classList.contains("l-stat")) return;
    const number = root.querySelector(".stat-num");
    if (!number || root.dataset.enter !== "countup") return;
    const match = /^(\D*)(\d[\d,\.]*)(.*)$/.exec(finalText);
    if (!match) return;
    const value = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(value)) return;
    const started = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      number.textContent = `${match[1]}${(value * eased).toFixed(match[2].includes(".") ? match[2].split(".")[1].length : 0)}${match[3]}`;
      if (progress < 1) rafs.push(requestAnimationFrame(frame));
      else number.textContent = finalText;
    };
    number.textContent = `${match[1]}0${match[3]}`;
    rafs.push(requestAnimationFrame(frame));
  }

  async function playText(data, opts) {
    const clean = sanitize(data);
    if (!clean || (running && !(opts && opts.keep))) return;
    running = true;
    if (!(opts && opts.keep)) stopRequested = false;
    document.body.classList.add("takeover");
    const view = document.getElementById("text-view");
    const flash = document.getElementById("text-flash");
    const stage = document.getElementById("text-stage");
    stage.replaceChildren();
    view.classList.add("show");
    const rafs = [];
    let current = null;
    try {
      await waitLocal(400);
      if (stopRequested) return;
      for (const beat of clean) {
        if (stopRequested) break;
        if (current) {
          if (current.beat.exit === "fade") {
            current.node.classList.add("out");
            await waitLocal(250);
            if (stopRequested) break;
          }
          if (current.node.parentNode) current.node.remove();
        }
        view.classList.toggle("pal", beat.bg === "palette");
        if (beat.bg === "palette" && typeof applyPalette === "function" && typeof nextPalette === "function") {
          applyPalette(nextPalette());
        }
        if (beat.transition === "flash") {
          flash.classList.remove("go");
          void flash.offsetWidth;
          flash.classList.add("go");
        }
        const node = render(beat);
        if (beat.transition === "fade") node.classList.add("xfade");
        stage.appendChild(node);
        current = { beat, node };
        countUp(node, beat.lines[0], rafs);
        const talk = speakLocal(beat.say);
        await Promise.all([talk, waitLocal(beat.ms)]);
        if (stopRequested) break;
        if (beat === clean[clean.length - 1] && beat.exit === "fade") {
          node.classList.add("out");
          await waitLocal(250);
        }
        if (stopRequested) break;
      }
    } finally {
      if (window.speechSynthesis) speechSynthesis.cancel();
      rafs.forEach((id) => cancelAnimationFrame(id));
      view.classList.remove("show");
      await waitLocal(500);
      stage.replaceChildren();
      view.classList.remove("pal");
      if (!(opts && opts.keep) && typeof applyPalette === "function" && typeof DEFAULT_PALETTE !== "undefined") {
        applyPalette(DEFAULT_PALETTE);
      }
      if (!(opts && opts.keep)) {
        document.body.classList.remove("takeover");
        running = false;
        stopRequested = false;
      }
    }
  }

  document.addEventListener("keydown", (event) => {
    const view = document.getElementById("text-view");
    if (event.key === "Escape" && view.classList.contains("show")) {
      stopRequested = true;
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
  });
  document.getElementById("demoText").addEventListener("click", async () => {
    if (running) return;
    try {
      const response = await fetch("text-demo.json", { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Text demo request failed: ${response.status}`);
      await playText(await response.json());
    } catch (err) {
      console.error(err);
    }
  });
  window.playText = playText;
})();
