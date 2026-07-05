// =====================================================================
// Bärchen-Pflege – script.js
// Enthält: Zustand & Speicherung, Bär-Rendering, Pflege-Aktionen,
// Sprechblasen, sowie drei Minispiele (Sternenfang, Seifenblasen, Hüpf-Lauf)
// =====================================================================

// Build-Kennung zur Cache-Diagnose: taucht oben rechts in der App auf.
// Wenn du nach einem Update immer noch eine ALTE Nummer siehst, wurde die
// neue Version noch nicht geladen (Cache-Problem) statt eines echten Bugs.
const BUILD_ID = "build-15";

/* ---------------------------------------------------------------------
   0) GLOBALER FEHLER-FÄNGER (Diagnose)
   Zeigt JavaScript-Fehler direkt als Toast an, damit man Probleme auch
   ohne Entwicklertools (z. B. auf dem Handy) sehen und melden kann.
--------------------------------------------------------------------- */
window.addEventListener("error", (e) => {
  console.error("Globaler Fehler:", e.error || e.message);
  showFatalToast("JS-Fehler: " + (e.message || "unbekannt") + " (Zeile " + e.lineno + ")");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unbehandelte Promise-Ablehnung:", e.reason);
  showFatalToast("Promise-Fehler: " + (e.reason && e.reason.message ? e.reason.message : e.reason));
});
function showFatalToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return alert(msg); // Falls Toast-Element selbst fehlt
  t.textContent = "⚠️ " + msg;
  t.classList.add("show");
  t.style.background = "#B5504A";
  // Fehler-Toast bleibt länger stehen als normale Hinweise
  clearTimeout(window.__fatalToastTimeout);
  window.__fatalToastTimeout = setTimeout(() => {
    t.classList.remove("show");
    t.style.background = "";
  }, 8000);
}

/* ---------------------------------------------------------------------
   1) ZUSTAND & KONSTANTEN
--------------------------------------------------------------------- */
const STORAGE_KEY = "baerchenState_v1";

// Wie schnell die Werte pro Sekunde sinken (Vollausschlag -> 0 in X Minuten)
// Deutlich beschleunigt gegenüber vorher, damit sich Pflege spürbar lohnt.
const DECAY = {
  hunger: 100 / (20 * 60), // 20 Minuten - langsamer, damit er nicht mehr so schnell ohnmächtig wird
  clean:  100 / (20 * 60), // 20 Minuten - langsamer, damit er nach dem Waschen nicht gefühlt sofort wieder dreckig wird
  fun:    100 / (20 * 60), // 20 Minuten - gleiches Tempo wie Hunger/Sauberkeit
};

const MAX_CATCHUP_SECONDS = 3 * 60 * 60; // max. 3h "Abwesenheits-Verfall" nachholen
const REVIVE_COST = 10; // so viele 🍓 werden zum Wiederbeleben gebraucht

// ===== LEVEL- & ALTERSSYSTEM (konfigurierbar) =====
// Pflege-Punkte pro Aktion (frei anpassbar):
const CARE_POINTS = {
  feed: 1,
  drink: 0.5,
  wash: 0.5,
  comfort: 0.5, // Kuss geben / An ihm riechen
  play: 2, // Minispiel abgeschlossen
  tv: 0.8, // Fernsehen erlaubt
};
// Level-Schwellen: bei Erreichen der jeweiligen Gesamtpunktzahl steigt das Level.
const LEVEL_THRESHOLDS = [10, 30, 60, 100, 150, 220, 300, 400, 520, 650];
// Alter = GesamtpflegePunkte * ALTER_FAKTOR (vierstellig formatiert)
const AGE_FACTOR = 0.0001;

let state = {
  hunger: 80,
  clean: 80,
  fun: 80,
  love: 80,
  strawberries: 0,
  coins: 0,
  toys: { piglet: 0, cowboy: 0, plush: 0, ball: 0, kite: 0, yoyo: 0, blocks: 0 }, // gekauftes Spielzeug-Inventar
  clothes: { bow: 0, scarf: 0, glasses: 0, hat: 0, cap: 0, flower: 0 }, // gekaufte Kleidung/Accessoires
  equipped: { neck: null, eyes: null, head: null, ear: null }, // aktuell getragene Kleidung je Slot
  carePoints: 0, // Basis für Level & Alter
  isDead: false,
  isTorn: false, // Naht aufgerissen -> muss genäht werden
  isSick: false, // krank -> braucht Medizin
  stats: {
    feeds: 0,
    washes: 0,
    worksDone: 0,
    gamesPlayed: 0,
    toysBought: 0,
    clothesBought: 0,
    strawberriesLifetime: 0,
  },
  dailyStreak: { count: 0, best: 0, lastClaim: null },
  achievementsClaimed: {},
  cards: {}, // gesammelte Sammelkarten: id -> Anzahl
  wheel: { lastSpin: null }, // Datum des letzten Glücksrad-Drehs
  // Zeitlich befristete Boni durch Spezial-Artikel aus dem Shop (Timestamps,
  // bis zu denen der jeweilige Effekt noch aktiv ist).
  effects: { cleanBoostUntil: 0, hungerBoostUntil: 0, wakeBoostUntil: 0, sickImmuneUntil: 0, luckyClover: false },
  lastSave: Date.now(),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
      if (!state.toys) state.toys = { piglet: 0, cowboy: 0, plush: 0 };
      for (const key of ["piglet", "cowboy", "plush", "ball", "kite", "yoyo", "blocks"]) {
        if (typeof state.toys[key] !== "number") state.toys[key] = 0;
      }
      if (!state.clothes) state.clothes = {};
      for (const key of ["bow", "scarf", "glasses", "hat", "cap", "flower"]) {
        if (typeof state.clothes[key] !== "number") state.clothes[key] = 0;
      }
      if (!state.equipped) state.equipped = { neck: null, eyes: null, head: null, ear: null };
      for (const slot of ["neck", "eyes", "head", "ear"]) {
        if (state.equipped[slot] === undefined) state.equipped[slot] = null;
      }
      if (!state.stats) state.stats = {};
      for (const key of ["feeds", "washes", "worksDone", "gamesPlayed", "toysBought", "clothesBought", "strawberriesLifetime"]) {
        if (typeof state.stats[key] !== "number") state.stats[key] = 0;
      }
      if (!state.dailyStreak) state.dailyStreak = { count: 0, best: 0, lastClaim: null };
      if (typeof state.dailyStreak.count !== "number") state.dailyStreak.count = 0;
      if (typeof state.dailyStreak.best !== "number") state.dailyStreak.best = 0;
      if (!state.achievementsClaimed) state.achievementsClaimed = {};
      if (!state.cards) state.cards = {};
      if (!state.wheel) state.wheel = { lastSpin: null };
      if (!state.effects) state.effects = {};
      for (const key of ["cleanBoostUntil", "hungerBoostUntil", "wakeBoostUntil", "sickImmuneUntil"]) {
        if (typeof state.effects[key] !== "number") state.effects[key] = 0;
      }
      if (typeof state.effects.luckyClover !== "boolean") state.effects.luckyClover = false;
      // Verfall seit letztem Besuch nachholen (nur wenn Summi noch lebt)
      if (!state.isDead) {
        const elapsedSec = Math.min(
          (Date.now() - (state.lastSave || Date.now())) / 1000,
          MAX_CATCHUP_SECONDS
        );
        if (elapsedSec > 1) applyDecay(elapsedSec);
      }
    }
  } catch (e) {
    console.warn("Konnte Speicherstand nicht laden:", e);
  }
}

function saveState() {
  state.lastSave = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Konnte nicht speichern:", e);
  }
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

// Kurzes haptisches Feedback auf Geräten, die es unterstützen (no-op sonst).
function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* egal, rein kosmetisch */
  }
}

// Erdbeeren hinzufügen UND für Erfolge mitzählen (Lebenszeit-Gesamtsumme).
function addStrawberries(n) {
  if (!n) return;
  state.strawberries += n;
  state.stats.strawberriesLifetime += n;
}

/* ---------------------------------------------------------------------
   2) DOM-REFERENZEN
--------------------------------------------------------------------- */
const el = {
  bearWrap: document.getElementById("bearWrap"),
  bearSvg: document.getElementById("bearSvg"),
  eyeLeft: document.getElementById("eyeLeft"),
  eyeRight: document.getElementById("eyeRight"),
  mouth: document.getElementById("mouth"),
  tear: document.getElementById("tear"),
  tear2: document.getElementById("tear2"),
  dirtSpots: document.getElementById("dirtSpots"),
  flies: document.getElementById("flies"),
  stinkClouds: document.getElementById("stinkClouds"),
  particles: document.getElementById("particles"),
  washFx: document.getElementById("washFx"),
  speechBubble: document.getElementById("speechBubble"),
  speechText: document.getElementById("speechText"),
  toast: document.getElementById("toast"),
  strawberryCount: document.getElementById("strawberryCount"),
  coinCount: document.getElementById("coinCount"),
  deathOverlay: document.getElementById("deathOverlay"),
  deathStrawberryText: document.getElementById("deathStrawberryText"),
  reviveBtn: document.getElementById("reviveBtn"),
  actionButtons: document.querySelectorAll(".action-btn"),
  sleepBtnLabel: document.getElementById("sleepBtnLabel"),
  comfortButtons: document.getElementById("comfortButtons"),
  workBanner: document.getElementById("workBanner"),
  workFill: document.getElementById("workFill"),
  heldToy: document.getElementById("heldToy"),
  toyPlayBanner: document.getElementById("toyPlayBanner"),
  toyPlayLabel: document.getElementById("toyPlayLabel"),
  toyPlayFill: document.getElementById("toyPlayFill"),
  fills: {
    hunger: document.getElementById("fill-hunger"),
    clean: document.getElementById("fill-clean"),
    fun: document.getElementById("fill-fun"),
    love: document.getElementById("fill-love"),
  },
};

/* ---------------------------------------------------------------------
   3) RENDERING: Balken, Stimmung, Schmutz, Fliegen
--------------------------------------------------------------------- */
function renderBars() {
  for (const key of ["hunger", "clean", "fun", "love"]) {
    const fill = el.fills[key];
    fill.style.width = clamp(state[key]) + "%";
    fill.classList.toggle("low", state[key] < 25);
  }
}

const EYES = {
  happy:
    '<path d="M -12 0 Q 0 -10 12 0" stroke="#5A3F34" stroke-width="4" fill="none" stroke-linecap="round"/>',
  neutral: '<circle cx="0" cy="0" r="6" fill="#4A3730"/>',
  sad: '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -8 Q 0 -13 9 -8" stroke="#4A3730" stroke-width="3" fill="none" stroke-linecap="round"/>',
  verySad:
    '<path d="M -9 -3 Q 0 4 9 -3" stroke="#4A3730" stroke-width="4" fill="none" stroke-linecap="round"/>',
  crying:
    '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -9 Q 0 -14 9 -9" stroke="#4A3730" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  sleeping:
    '<path d="M -11 0 Q 0 4 11 0" stroke="#5A3F34" stroke-width="4" fill="none" stroke-linecap="round"/>',
  dead:
    '<path d="M -10 -8 L 10 8 M 10 -8 L -10 8" stroke="#4A3730" stroke-width="4" fill="none" stroke-linecap="round"/>',
  torn:
    '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -9 Q 0 -14 9 -9" stroke="#4A3730" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  sick:
    '<path d="M -9 -1 Q 0 3 9 -1" stroke="#4A3730" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
};

const MOUTHS = {
  happy: "M 128 152 Q 150 175 172 152",
  neutral: "M 134 160 L 166 160",
  sad: "M 130 168 Q 150 150 170 168",
  verySad: "M 128 165 Q 150 145 172 165",
  crying: "M 132 170 Q 150 148 168 170",
  sleeping: "", // Schlafmund wird separat als offenes Oval + Sabbertropfen angezeigt
  dead: "M 136 162 Q 150 156 164 162 Q 150 168 136 162",
  torn: "M 132 170 Q 150 148 168 170",
  sick: "M 134 166 Q 150 158 166 166",
};

// WEINEN: wenn Hunger ODER Spaß unter die kritische Schwelle fallen.
const CRY_THRESHOLD = 20;

function computeMood() {
  if (state.isDead) return "dead";
  if (state.isTorn) return "torn";
  if (state.isSick) return "sick";
  if (isSleeping) return "sleeping";
  if (forcedCrying) return "crying"; // hat "Nein" beim Fernsehen gehört
  if (isWatchingTV) return "happy";
  if (state.hunger < CRY_THRESHOLD || state.fun < CRY_THRESHOLD) return "crying";
  const careAvg = (state.hunger + state.clean + state.fun) / 3;
  if (state.love <= 15 || careAvg <= 15) return "verySad";
  if (careAvg < 35) return "sad";
  if (careAvg >= 70 && state.love >= 60) return "happy";
  return "neutral";
}

let lastMood = null;
function renderMood() {
  const mood = computeMood();
  el.bearWrap.classList.toggle("fainted", mood === "dead");
  el.bearWrap.classList.toggle("crying", mood === "crying" || mood === "torn");
  el.bearWrap.classList.toggle("torn", mood === "torn");
  el.bearWrap.classList.toggle("sick", mood === "sick");
  el.bearWrap.classList.toggle("mood-happy", mood === "happy");
  el.comfortButtons.classList.toggle("show", mood === "crying");
  document.getElementById("sewButtonWrap").classList.toggle("show", mood === "torn");
  if (mood === lastMood) return; // nur bei Änderung neu zeichnen
  lastMood = mood;

  el.eyeLeft.setAttribute("transform", "translate(120,110)");
  el.eyeRight.setAttribute("transform", "translate(180,110)");
  el.eyeLeft.innerHTML = EYES[mood];
  el.eyeRight.innerHTML = EYES[mood];
  el.mouth.setAttribute("d", MOUTHS[mood]);
  const showTear = mood === "verySad" || mood === "crying" || mood === "torn";
  el.tear.style.opacity = showTear ? "1" : "0";
  el.tear.setAttribute("d", "M 118 118 q -4 10 0 16 q 4 -6 0 -16 Z");
  el.tear2.style.opacity = mood === "crying" || mood === "torn" ? "1" : "0";
}

// Feste "zufällige" Positionen für Schmutzflecken (bleiben stabil beim Rendern)
const DIRT_SPOTS = [
  { cx: 110, cy: 175, r: 7 },
  { cx: 185, cy: 195, r: 6 },
  { cx: 150, cy: 205, r: 8 },
  { cx: 95, cy: 230, r: 6 },
  { cx: 205, cy: 240, r: 7 },
  { cx: 160, cy: 100, r: 5 },
];

function renderDirt() {
  const dirtiness = clamp(100 - state.clean); // 0 = sauber, 100 = sehr dreckig
  el.bearWrap.classList.toggle("dirty", dirtiness > 40);

  const visibleCount = Math.round((dirtiness / 100) * DIRT_SPOTS.length);
  el.dirtSpots.innerHTML = DIRT_SPOTS.slice(0, visibleCount)
    .map(
      (s) =>
        `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="#8A6B4C" opacity="0.55"/>`
    )
    .join("");

  // Fliegen: je dreckiger, desto mehr
  let flyCount = 0;
  if (state.clean < 60) flyCount = 1;
  if (state.clean < 35) flyCount = 3;
  if (state.clean < 15) flyCount = 5;

  if (el.flies.childElementCount !== flyCount) {
    el.flies.innerHTML = "";
    for (let i = 0; i < flyCount; i++) {
      const fly = document.createElement("div");
      fly.className = "fly";
      fly.textContent = "🦩";
      fly.style.left = 20 + Math.random() * 60 + "%";
      fly.style.top = 5 + Math.random() * 55 + "%";
      fly.style.animationDelay = Math.random() * 2 + "s";
      el.flies.appendChild(fly);
    }
  }

  // Gestank-Wolken: erscheinen ab mittlerer Verschmutzung über dem Kopf
  let stinkCount = 0;
  if (state.clean < 50) stinkCount = 1;
  if (state.clean < 25) stinkCount = 2;

  if (el.stinkClouds.childElementCount !== stinkCount) {
    el.stinkClouds.innerHTML = "";
    for (let i = 0; i < stinkCount; i++) {
      const cloud = document.createElement("div");
      cloud.className = "stink-cloud";
      cloud.textContent = "💨";
      cloud.style.left = 35 + Math.random() * 30 + "%";
      cloud.style.top = -2 + Math.random() * 10 + "%";
      cloud.style.animationDelay = Math.random() * 2 + "s";
      el.stinkClouds.appendChild(cloud);
    }
  }
}

function renderStrawberries() {
  el.strawberryCount.textContent = state.strawberries;
  el.coinCount.textContent = state.coins;
  el.deathStrawberryText.textContent = state.strawberries + " / " + REVIVE_COST + " 🍓";
  el.reviveBtn.disabled = state.strawberries < REVIVE_COST;
}

function renderActionLock() {
  // Während Summi schläft oder arbeitet, sind die meisten Aktionen gesperrt.
  // Der Schlaf-Knopf selbst bleibt aktiv (außer bei Ohnmacht/Arbeit), damit
  // man ihn jederzeit aufwecken kann.
  const lockMost = state.isDead || isSleeping || isWorking || !!toyPlayState;
  el.actionButtons.forEach((btn) => {
    if (btn.id === "btnSleep") {
      btn.classList.toggle("disabled", state.isDead || isWorking);
    } else {
      btn.classList.toggle("disabled", lockMost);
    }
  });
  if (el.sleepBtnLabel) {
    el.sleepBtnLabel.textContent = isSleeping ? "Aufwecken" : "Ins Bett";
  }
}

function showDeathOverlay() {
  el.deathOverlay.classList.remove("hidden");
  renderActionLock();
}

// ===== LEVEL & ALTER =====
function computeLevel(points) {
  let lvl = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (points >= threshold) lvl++;
    else break;
  }
  return lvl;
}

function computeAge(points) {
  return (points * AGE_FACTOR).toFixed(4);
}

function renderLevelAge() {
  const el2 = document.getElementById("levelAgeText");
  if (!el2) return;
  const lvl = computeLevel(state.carePoints || 0);
  const age = computeAge(state.carePoints || 0);
  el2.textContent = "Lvl " + lvl + " • Alter " + age;
}

// Wird bei jeder Pflege-Aktion aufgerufen, um Level & Alter zu erhöhen.
function addCarePoints(points) {
  const prevLevel = computeLevel(state.carePoints || 0);
  state.carePoints = (state.carePoints || 0) + points;
  const newLevel = computeLevel(state.carePoints);
  renderLevelAge();
  if (newLevel > prevLevel) {
    showToast("🎉 Level Up! Summi ist jetzt Level " + newLevel + "!");
  }
}

function hideDeathOverlay() {
  el.deathOverlay.classList.add("hidden");
  renderActionLock();
}

function renderAll() {
  renderBars();
  renderMood();
  renderDirt();
  renderStrawberries();
  renderActionLock();
  renderLevelAge();
}

/* ---------------------------------------------------------------------
   4) SPRECHBLASEN
--------------------------------------------------------------------- */
const PHRASES = [
  "Spielen wir? 🎮",
  "Mama, wann gehen wir ins Kino? 🎬",
  "Darf ich was anschauen? 📺",
  "Ich hab Hunger! 🍓",
  "Kuscheln wir? 🤗",
  "Lass uns nach draußen gehen! 🌳",
  "Ich langweile mich ein bisschen...",
  "Du bist der/die Beste! 💗",
  "Wasch mich, ich glitzer dann! 🧼",
  "Erzähl mir eine Geschichte! 📖",
  "Wann kommt Papa? Wir wollten doch zusammen ein Erdbeermarmeladebrot essen! 🍓🍞",
  "Darf ich mit Scruffy spielen, meinem besten Freund? 🧸",
  "Wo ist mein Cowboy-Freund? Ich vermisse ihn! 🤠",
];

// "Shuffle-Bag": jeder Satz kommt genau einmal dran, bevor sich das Bag neu
// mischt. So wiederholt sich nie derselbe Satz mehrfach hintereinander,
// und alle Sätze (auch die zuerst gewünschten) kommen garantiert vor.
let phraseBag = [];
function nextPhrase() {
  if (phraseBag.length === 0) {
    phraseBag = [...PHRASES];
    // Fisher-Yates-Shuffle
    for (let i = phraseBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [phraseBag[i], phraseBag[j]] = [phraseBag[j], phraseBag[i]];
    }
  }
  return phraseBag.pop();
}

let speechTimeout = null;
function scheduleSpeech(initial = false) {
  clearTimeout(speechTimeout);
  // Beim allerersten Mal etwas früher, damit man es nicht ewig verpasst
  const delay = initial
    ? 6000 + Math.random() * 6000 // 6-12s
    : 15000 + Math.random() * 20000; // 15-35s
  speechTimeout = setTimeout(showRandomSpeech, delay);
}

function showRandomSpeech() {
  if (!document.getElementById("gameOverlay").classList.contains("hidden")) {
    scheduleSpeech(); // während eines Minispiels nicht stören
    return;
  }
  // Schläft er oder ist ohnmächtig, sagt er gerade nichts.
  if (isSleeping || state.isDead) {
    scheduleSpeech();
    return;
  }

  let phrase;
  if (!isWorking && Math.random() < 0.12) {
    // Seltene, zufällige Frage, ob er arbeiten gehen darf
    phrase = "Darf ich heute etwas arbeiten gehen? Ich verdien auch gern mal Coins! 💼";
  } else if (state.hunger > 70 && state.fun > 70 && Math.random() < 0.35) {
    // Nach viel Spielen und vollem Bauch fragt er von sich aus nach Schlaf
    phrase = "Ich hab so viel gespielt und bin richtig satt... darf ich schlafen gehen? 😴";
  } else {
    phrase = nextPhrase();
  }

  el.speechText.textContent = phrase;
  el.speechBubble.classList.add("show");
  setTimeout(() => el.speechBubble.classList.remove("show"), 3500);
  scheduleSpeech();
}

/* ---------------------------------------------------------------------
   5) TOAST-HINWEIS
--------------------------------------------------------------------- */
let toastTimeout = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove("show"), 1800);
}

/* ---------------------------------------------------------------------
   6) PARTIKEL (Herzen beim Streicheln)
--------------------------------------------------------------------- */
function spawnParticles(emoji, count = 5) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.textContent = emoji;
    p.style.left = 35 + Math.random() * 30 + "%";
    p.style.top = 30 + Math.random() * 20 + "%";
    p.style.animationDelay = i * 0.08 + "s";
    el.particles.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}

/* ---------------------------------------------------------------------
   7) PFLEGE-AKTIONEN
--------------------------------------------------------------------- */
// Gemeinsame Sperre: viele Aktionen dürfen nicht ausgeführt werden, während
// Summi tot, am Schlafen oder am Arbeiten ist.
function actionsBlocked() {
  if (state.isDead) {
    showToast("😵 Summi ist ohnmächtig – erst wiederbeleben!");
    return true;
  }
  if (isSleeping) {
    showToast("😴 Summi schläft gerade – erst aufwecken!");
    return true;
  }
  if (isWorking) {
    showToast("💼 Summi arbeitet gerade und darf nicht gestört werden!");
    return true;
  }
  if (toyPlayState) {
    showToast("🧸 Summi spielt gerade – lass ihn kurz fertig spielen!");
    return true;
  }
  return false;
}

function feed() {
  if (actionsBlocked()) return;
  if (state.strawberries < 1) {
    showToast("🍓 Keine Erdbeeren mehr! Sammle welche in der Erdbeer-Jagd.");
    return;
  }
  state.strawberries -= 1;
  state.hunger = clamp(state.hunger + 30);
  state.love = clamp(state.love + 3);
  addCarePoints(CARE_POINTS.feed);
  state.stats.feeds++;
  showToast("🍓🍞 Lecker, Toast mit Erdbeermarmelade!");
  spawnParticles("🍓", 4);
  wiggleBear();
  vibrate(15);
  registerInteraction();
  renderAll();
  saveState();
  checkAchievements();
}

function drink() {
  if (actionsBlocked()) return;
  state.hunger = clamp(state.hunger + 15);
  state.love = clamp(state.love + 5);
  addCarePoints(CARE_POINTS.drink);
  showToast("☕ Mmh, heiße Schokolade!");
  spawnParticles("☕", 3);
  wiggleBear();
  registerInteraction();
  renderAll();
  saveState();
}

const FRESH_SHINE_MS = 15000; // wie lange der "frisch geduscht"-Glanz sichtbar bleibt
let freshShineTimeout = null;

function wash() {
  if (actionsBlocked()) return;
  el.bearWrap.classList.add("washing");
  el.washFx.innerHTML = "";
  for (let i = 0; i < 10; i++) {
    const b = document.createElement("div");
    b.className = "bubble-fx";
    b.style.left = 10 + Math.random() * 80 + "%";
    b.style.animationDelay = Math.random() * 0.6 + "s";
    el.washFx.appendChild(b);
  }
  showToast("🧴 Schrubb schrubb – sauber und frisch!");
  state.clean = 100;
  state.love = clamp(state.love + 5);
  addCarePoints(CARE_POINTS.wash);
  state.stats.washes++;
  registerInteraction();
  renderAll();
  saveState();
  checkAchievements();

  // Länger anhaltender Glanz-Effekt, nicht nur die kurze Seifenblasen-Animation.
  clearTimeout(freshShineTimeout);
  el.bearWrap.classList.add("freshly-washed");
  freshShineTimeout = setTimeout(() => {
    el.bearWrap.classList.remove("freshly-washed");
  }, FRESH_SHINE_MS);

  setTimeout(() => {
    el.bearWrap.classList.remove("washing");
    el.washFx.innerHTML = "";
  }, 1400);
}

function petBear() {
  if (state.isDead) return showToast("😵 Summi ist ohnmächtig – sammle 🍓 zum Wiederbeleben!");
  if (isWorking) return showToast("💼 Summi arbeitet gerade und darf nicht gestört werden!");
  if (isSleeping) {
    // Antippen weckt einen schlafenden Bären, statt ihn zu streicheln
    registerInteraction();
    renderAll();
    saveState();
    return;
  }
  state.love = clamp(state.love + 2);
  state.fun = clamp(state.fun + 1);
  spawnParticles("💗", 3);
  wiggleBear();
  registerInteraction();
  renderAll();
  saveState();
}

function wiggleBear() {
  el.bearWrap.classList.remove("tapped");
  void el.bearWrap.offsetWidth; // Reflow erzwingen, damit Animation neu startet
  el.bearWrap.classList.add("tapped");
}

/* ---------------------------------------------------------------------
   7b) SCHLAFEN & SABBERN
   Nach dem Spielen wird Summi müde und schläft bald ein. Wird er länger
   gar nicht beachtet, döst er auch so weg. Jede Pflege-Aktion weckt ihn.
--------------------------------------------------------------------- */
let isSleeping = false;
let sleepTimer = null;

const IDLE_SLEEP_MS = 90 * 1000; // nach 90s allgemeiner Untätigkeit
const TIRED_SLEEP_MS = 12 * 1000; // nach einem Minispiel geht's schneller

function scheduleSleep(delay) {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(fallAsleep, delay);
}

function fallAsleep() {
  if (isSleeping) return;
  if (!overlay.classList.contains("hidden") || isWorking || isWatchingTV || toyPlayState) {
    // Während eines Minispiels, der Arbeit, einer laufenden Sendung oder
    // während Summi gerade mit einem Spielzeug spielt, nicht einschlafen,
    // aber später erneut prüfen.
    scheduleSleep(5000);
    return;
  }
  if (Date.now() < state.effects.wakeBoostUntil) {
    // Energy-Drink-Effekt: hält ihn wach, später erneut prüfen.
    scheduleSleep(5000);
    return;
  }
  // Ein offen stehender "Darf ich fernsehen?"-Dialog darf nicht einfach
  // weiter herumstehen, während Summi eigentlich schon schläft - er kann
  // ja im Schlaf nicht mehr antworten.
  if (tvPromptOpen) {
    tvPromptOpen = false;
    document.getElementById("tvPrompt").classList.add("hidden");
    scheduleTV();
  }
  isSleeping = true;
  el.bearWrap.classList.add("sleeping");
  showToast("😴 Summi ist eingeschlafen...");
  renderAll();
}

function wakeUp(silent) {
  const wasSleeping = isSleeping;
  isSleeping = false;
  el.bearWrap.classList.remove("sleeping");
  if (wasSleeping && !silent) showToast("🥱 Summi ist aufgewacht!");
  renderAll();
}

// Nach jeder Interaktion Timer neu starten. tired=true (z.B. nach Minispiel)
// lässt Summi schneller wieder einschlafen, weil er müde vom Spielen ist.
function registerInteraction(tired = false) {
  wakeUp(true);
  scheduleSleep(tired ? TIRED_SLEEP_MS : IDLE_SLEEP_MS);
}

// MANUELLER SCHLAF-BUTTON: "Ins Bett bringen" <-> "Aufwecken"
function toggleManualSleep() {
  if (state.isDead) return showToast("😵 Summi ist ohnmächtig – erst wiederbeleben!");
  if (isWorking) return showToast("💼 Erst wenn er mit der Arbeit fertig ist!");
  if (state.isTorn) return showToast("🪡 Erst die Naht flicken, dann kann Summi schlafen!");
  if (isWatchingTV) return showToast("📺 Erst wenn die Sendung zu Ende ist!");
  if (isSleeping) {
    wakeUp();
    scheduleSleep(IDLE_SLEEP_MS);
  } else {
    clearTimeout(sleepTimer);
    fallAsleep();
  }
  saveState();
}

/* ---------------------------------------------------------------------
   7c) TRÖSTEN (bei "Weinen")
--------------------------------------------------------------------- */
function giveKiss() {
  if (actionsBlocked()) return;
  state.love = clamp(state.love + 10);
  state.hunger = clamp(state.hunger + 8);
  addCarePoints(CARE_POINTS.comfort);
  spawnParticles("💋", 3);
  wiggleBear();
  registerInteraction();
  if (forcedCrying) {
    // Extra Dankes-Animation, wenn er wegen des Fernseh-"Nein" geweint hat
    forcedCrying = false;
    showToast("😘 Danke für den Kuss! Summi hüpft glücklich herum.");
    spawnParticles("✨", 3);
  } else {
    showToast("😘 Ein dicker Kuss – gleich geht's ihm besser!");
  }
  renderAll();
  saveState();
}

function sniffBear() {
  if (actionsBlocked()) return;
  state.love = clamp(state.love + 5);
  state.fun = clamp(state.fun + 12);
  addCarePoints(CARE_POINTS.comfort);
  spawnParticles("👃", 3);
  wiggleBear();
  registerInteraction();
  if (forcedCrying) {
    forcedCrying = false;
    showToast("👃 Das riecht so vertraut! Summi bedankt sich freudig.");
    spawnParticles("✨", 3);
  } else {
    showToast("👃 Riecht nach Kuscheltier – das beruhigt!");
  }
  renderAll();
  saveState();
}

/* ---------------------------------------------------------------------
   7ca) FERNSEHEN
   Summi fragt gelegentlich, ob er fernsehen darf. "Ja" -> kurze
   Fernseh-Animation. "Nein" -> er weint (erzwungen), bis man ihn tröstet.
--------------------------------------------------------------------- */
let isWatchingTV = false;
let forcedCrying = false;
let tvPromptOpen = false;
let tvTimeout = null;
const TV_MIN_WATCH_MS = 10000;
const TV_MAX_WATCH_MS = 20000;

function scheduleTV() {
  clearTimeout(tvTimeout);
  // Zufälliger Abstand, damit die Frage nicht zu oft auftaucht
  const delay = 45000 + Math.random() * 60000; // 45–105s
  tvTimeout = setTimeout(maybeAskTV, delay);
}

function maybeAskTV() {
  const blocked =
    state.isDead ||
    state.isTorn ||
    state.isSick ||
    isSleeping ||
    isWorking ||
    isWatchingTV ||
    tvPromptOpen ||
    forcedCrying ||
    !overlay.classList.contains("hidden");
  if (blocked) {
    scheduleTV(); // später erneut versuchen
    return;
  }
  tvPromptOpen = true;
  document.getElementById("tvPrompt").classList.remove("hidden");
}

function answerTV(yes) {
  tvPromptOpen = false;
  document.getElementById("tvPrompt").classList.add("hidden");

  if (yes) {
    isWatchingTV = true;
    el.bearWrap.classList.add("watching-tv");
    addCarePoints(CARE_POINTS.tv);
    showToast("📺 Summi schaut gespannt seine Lieblingsserie!");
    renderAll();
    const watchDuration = TV_MIN_WATCH_MS + Math.random() * (TV_MAX_WATCH_MS - TV_MIN_WATCH_MS);
    setTimeout(() => {
      isWatchingTV = false;
      el.bearWrap.classList.remove("watching-tv");
      showToast("📺 Die Serie ist zu Ende – Summi ist zufrieden!");
      renderAll();
      saveState();
    }, watchDuration);
  } else {
    forcedCrying = true;
    showToast("😢 Summi ist traurig, dass er nicht fernsehen darf...");
    renderAll();
  }
  saveState();
  scheduleTV();
}

document.getElementById("tvYesBtn").addEventListener("click", () => answerTV(true));
document.getElementById("tvNoBtn").addEventListener("click", () => answerTV(false));

/* ---------------------------------------------------------------------
   7d) ARBEITEN & COINS
--------------------------------------------------------------------- */
let isWorking = false;
let workInterval = null;
const WORK_MIN_MS = 15000;
const WORK_MAX_MS = 20000;

function startWork() {
  if (actionsBlocked()) return;
  if (state.isTorn) return showToast("🪡 Erst die Naht flicken, dann kann Summi wieder arbeiten!");
  if (state.isSick) return showToast("🤒 Summi ist krank – erst Medizin geben!");
  isWorking = true;
  el.bearWrap.classList.add("working");
  // Zeigt das Spielzeug, mit dem Summi während der Arbeit "schaukelt" –
  // nimmt ein besessenes Spielzeug, sonst den generischen Teddy-Platzhalter.
  const ownedToy = TOYS.find((t) => state.toys[t.id] > 0);
  document.getElementById("workToyIcon").textContent = ownedToy ? ownedToy.emoji : "🧸";
  const duration = WORK_MIN_MS + Math.random() * (WORK_MAX_MS - WORK_MIN_MS);
  const startTime = performance.now();
  el.workBanner.classList.remove("hidden");
  el.workFill.style.width = "0%";
  renderAll();
  saveState();

  clearInterval(workInterval);
  workInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const pct = Math.min(100, (elapsed / duration) * 100);
    el.workFill.style.width = pct + "%";
    if (elapsed >= duration) finishWork();
  }, 100);
}

function finishWork() {
  clearInterval(workInterval);
  isWorking = false;
  el.bearWrap.classList.remove("working");
  el.workBanner.classList.add("hidden");
  const earned = Math.floor(10 + Math.random() * 21); // 10-30 Coins
  state.coins += earned;
  state.stats.worksDone++;
  // Logische Folge: Arbeiten kostet Kraft - danach ist er hungriger und
  // müder, statt einfach unverändert weiterzumachen wie zuvor.
  state.hunger = clamp(state.hunger - 15);
  state.fun = clamp(state.fun - 5);
  showToast("💼 Feierabend! +" + earned + " Coins verdient! Er hat jetzt Hunger und ist müde.");
  vibrate(20);
  registerInteraction(true); // müde von der Arbeit -> schläft bald ein, wie nach dem Spielen
  renderAll();
  saveState();
  checkAchievements();
}

/* ---------------------------------------------------------------------
   7e) NAHT-RISS & NÄHEN
   Selten reißt eine Naht auf. Der Bär "weint" (wie beim Weinen), bis man
   sie zunäht. Danach ist er noch etwas geschwächt und möchte trosten
   werden - über Essen oder Fernsehen (natürliche Folge, weil Hunger/Spaß
   nach dem Nähen etwas absinken und die bestehende Sprech-/Cry-Logik das
   von selbst aufgreift).
--------------------------------------------------------------------- */
let afflictionTimeout = null;
const AFFLICTION_CHECK_MIN_MS = 5 * 60 * 1000; // alle 5-15 Minuten einmal prüfen
const AFFLICTION_CHECK_MAX_MS = 15 * 60 * 1000;
const TEAR_CHANCE = 0.12; // Wahrscheinlichkeit pro Prüfung
const SICK_CHANCE = 0.08;

function scheduleAfflictionCheck() {
  clearTimeout(afflictionTimeout);
  const delay = AFFLICTION_CHECK_MIN_MS + Math.random() * (AFFLICTION_CHECK_MAX_MS - AFFLICTION_CHECK_MIN_MS);
  afflictionTimeout = setTimeout(rollAffliction, delay);
}

function rollAffliction() {
  const blocked =
    state.isDead || state.isTorn || state.isSick || isSleeping || isWorking ||
    !overlay.classList.contains("hidden");
  if (!blocked) {
    const r = Math.random();
    if (r < TEAR_CHANCE) {
      state.isTorn = true;
      showToast("😢 Autsch! Eine Naht ist aufgerissen!");
      registerInteraction();
      renderAll();
      saveState();
    } else if (r < TEAR_CHANCE + SICK_CHANCE && Date.now() >= state.effects.sickImmuneUntil) {
      state.isSick = true;
      showToast("🤒 Summi fühlt sich plötzlich nicht gut...");
      registerInteraction();
      renderAll();
      saveState();
      document.getElementById("sickPrompt").classList.remove("hidden");
    }
  }
  scheduleAfflictionCheck();
}

function sewBear() {
  if (!state.isTorn) return;
  state.isTorn = false;
  state.love = clamp(state.love + 6);
  // Nach dem Nähen etwas geschwächt - er hat noch Hunger und möchte Trost.
  state.hunger = clamp(state.hunger - 15);
  state.fun = clamp(state.fun - 10);
  showToast("🪡 Fertig genäht! Summi hätte jetzt gern etwas zu essen oder Fernsehen...");
  spawnParticles("🧵", 3);
  vibrate(20);
  registerInteraction();
  renderAll();
  saveState();
}

function giveMedicine() {
  if (!state.isSick) return;
  if (state.coins < 20) {
    showToast("Noch nicht genug 🪙 Coins für Medizin! Geh dafür arbeiten.");
    return;
  }
  state.coins -= 20;
  state.isSick = false;
  state.love = clamp(state.love + 8);
  state.hunger = clamp(state.hunger + 5);
  document.getElementById("sickPrompt").classList.add("hidden");
  showToast("🌡️ Medizin gegeben – Summi geht es gleich besser!");
  spawnParticles("💊", 3);
  vibrate(20);
  registerInteraction();
  renderAll();
  saveState();
}

document.getElementById("btnSew").addEventListener("click", sewBear);
document.getElementById("btnGiveMedicine").addEventListener("click", giveMedicine);

/* ---------------------------------------------------------------------
   8) VERFALL ÜBER ZEIT
--------------------------------------------------------------------- */
function applyDecay(seconds) {
  if (state.isDead) return; // im "ohnmächtigen" Zustand sinkt nichts mehr weiter

  // Spezial-Artikel wie Erdbeerkuchen/Weichspüler pausieren den jeweiligen
  // Verfall, solange ihr Effekt noch aktiv ist (state.effects.*Until).
  const now = Date.now();
  if (now >= state.effects.hungerBoostUntil) {
    state.hunger = clamp(state.hunger - DECAY.hunger * seconds);
  }
  if (now >= state.effects.cleanBoostUntil) {
    state.clean = clamp(state.clean - DECAY.clean * seconds);
  }
  // Läuft jetzt gleichmäßig wie Hunger/Sauberkeit ab (auch im Schlaf), damit
  // sich kein Wert gegenüber den anderen "verzögert" anfühlt.
  state.fun = clamp(state.fun - DECAY.fun * seconds);

  const careAvg = (state.hunger + state.clean + state.fun) / 3;
  let loveRate;
  if (careAvg > 60) loveRate = 0.4; // steigt bei guter Pflege
  else if (careAvg < 30) loveRate = -1.3; // sinkt schnell bei Vernachlässigung
  else loveRate = -0.2;
  state.love = clamp(state.love + loveRate * seconds);

  checkDeath();
}

// Wenn wirklich ALLE Werte bei 0 sind, fällt Summi in Ohnmacht. Er wacht erst
// wieder auf, wenn genug 🍓 Erdbeeren gesammelt und für die Wiederbelebung
// eingesetzt wurden.
function checkDeath() {
  if (state.isDead) return;
  if (state.hunger <= 0 && state.clean <= 0 && state.fun <= 0 && state.love <= 0) {
    state.isDead = true;
    if (typeof stopGameLoop === "function") stopGameLoop();
    if (typeof overlay !== "undefined" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
    }
    showToast("😵 Summi ist ohnmächtig geworden...");
    showDeathOverlay();
  }
}

function reviveSummi() {
  if (state.strawberries < REVIVE_COST) return;
  state.strawberries -= REVIVE_COST;
  state.isDead = false;
  state.hunger = 50;
  state.clean = 50;
  state.fun = 50;
  state.love = 50;
  hideDeathOverlay();
  showToast("🎉 Summi ist wieder wach! Pass gut auf ihn auf.");
  registerInteraction();
  renderAll();
  saveState();
}

/* ---------------------------------------------------------------------
   7e) SPIELZEUG- & KLEIDUNG-SHOP (mit Coins) & INVENTAR
--------------------------------------------------------------------- */
// Generische Spielzeuge (bewusst KEINE geschützten Marken/Figuren verwendet).
const TOYS = [
  { id: "piglet", emoji: "🐷", name: "Kuscheltier-Ferkel", desc: "Süßes kleines Ferkel zum Kuscheln", cost: 30, funGain: 15 },
  { id: "cowboy", emoji: "🤠", name: "Cowboy-Figur", desc: "Mutige Spielzeug-Figur für Abenteuer", cost: 60, funGain: 25 },
  { id: "plush", emoji: "🧸", name: "XXL-Kuscheltier", desc: "Riesiges, flauschiges Kuscheltier", cost: 120, funGain: 40 },
  { id: "ball", emoji: "⚽", name: "Spielball", desc: "Zum Kicken und Werfen", cost: 25, funGain: 12 },
  { id: "yoyo", emoji: "🪀", name: "Jo-Jo", desc: "Für flinke Tricks", cost: 20, funGain: 10 },
  { id: "kite", emoji: "🪁", name: "Drachen", desc: "Steigt hoch in den Wind", cost: 55, funGain: 22 },
  { id: "blocks", emoji: "🧩", name: "Bauklotze", desc: "Zum Türme bauen und Knobeln", cost: 45, funGain: 18 },
  { id: "duck", emoji: "🦆", name: "Quietsche-Ente", desc: "Süße Ente zum Quietschen", cost: 20, funGain: 10 },
  { id: "doll", emoji: "🪆", name: "Puppe", desc: "Zum Herzen und Wiegen", cost: 65, funGain: 26 },
  { id: "dollcar", emoji: "🚗", name: "Puppenauto", desc: "Zum Herumfahren und Schieben", cost: 50, funGain: 20 },
];

// Anziehbare Kleidung/Accessoires. "slot" bestimmt, welches SVG-Overlay
// getauscht wird (nur ein Teil pro Slot gleichzeitig sichtbar).
const CLOTHES = [
  { id: "bow", slot: "neck", groupId: "accessoryBow", emoji: "🎀", name: "Fliege", desc: "Schick für besondere Anlässe", cost: 40, loveGain: 8 },
  { id: "scarf", slot: "neck", groupId: "accessoryScarf", emoji: "🧣", name: "Schal", desc: "Kuschelig warm", cost: 35, loveGain: 6 },
  { id: "glasses", slot: "eyes", groupId: "accessoryGlasses", emoji: "🕶️", name: "Brille", desc: "Cool und lässig", cost: 45, loveGain: 8 },
  { id: "hat", slot: "head", groupId: "accessoryHat", emoji: "🎩", name: "Zylinder", desc: "Edel und vornehm", cost: 70, loveGain: 12 },
  { id: "cap", slot: "head", groupId: "accessoryCap", emoji: "🧢", name: "Basecap", desc: "Sportlich-lässig", cost: 50, loveGain: 10 },
  { id: "flower", slot: "ear", groupId: "accessoryFlower", emoji: "🌸", name: "Blümchen", desc: "Süß hinterm Ohr", cost: 25, loveGain: 5 },
];

// Spezial-Artikel: Verbrauchsgüter mit zeitlich befristeten Extra-Effekten
// (werden beim Kauf sofort angewendet, statt ins Inventar zu wandern).
const SPECIAL_ITEM_DURATION = 20 * 60 * 1000; // 20 Minuten für die meisten Effekte
const SPECIAL_ITEMS = [
  {
    id: "weichspueler",
    emoji: "🧴✨",
    name: "Weichspüler",
    desc: "Hält Summi 20 Minuten lang länger sauber",
    cost: 35,
    currency: "coins",
    effect: "clean",
  },
  {
    id: "erdbeerkuchen",
    emoji: "🍓🍰",
    name: "Erdbeerkuchen",
    desc: "Hält Summi 20 Minuten lang länger satt",
    cost: 30,
    currency: "coins",
    effect: "hunger",
  },
  {
    id: "energydrink",
    emoji: "⚡🥤",
    name: "Energy-Drink",
    desc: "Hält Summi 15 Minuten lang länger wach",
    cost: 25,
    currency: "coins",
    effect: "wake",
  },
  {
    id: "vitamintropfen",
    emoji: "💧💪",
    name: "Vitamintropfen",
    desc: "Schützt 30 Minuten lang vor Krankheit",
    cost: 40,
    currency: "coins",
    effect: "sickImmune",
  },
  {
    id: "gluecksklee",
    emoji: "🍀",
    name: "Glücksklee",
    desc: "Das nächste Booster-Pack enthält garantiert eine seltene Karte",
    cost: 15,
    currency: "strawberries",
    effect: "luckyClover",
  },
];

// Zeigt im Shop exakt dieselbe Zeichnung wie am Bären selbst (statt eines
// Emojis, das optisch anders aussieht als das tatsächliche SVG-Accessoire).
// Die Pfade sind 1:1 aus den #accessory*-Gruppen im HTML kopiert, nur mit
// einem engeren viewBox-Ausschnitt fürs kleine Vorschaubild.
const CLOTHES_PREVIEW = {
  bow: {
    viewBox: "115 165 70 42",
    inner: `
      <path d="M 150 186 L 128 172 Q 122 186 128 200 Z" fill="#7FB3B8"/>
      <path d="M 150 186 L 172 172 Q 178 186 172 200 Z" fill="#5FA3A8"/>
      <circle cx="150" cy="186" r="7" fill="#5C4A42"/>`,
  },
  scarf: {
    viewBox: "90 172 120 68",
    inner: `
      <path d="M 96 178 Q 150 200 204 178 L 204 192 Q 150 214 96 192 Z" fill="#E2564F"/>
      <path d="M 140 205 L 132 236 L 150 226 Z" fill="#C23F3F"/>
      <path d="M 160 205 L 168 232 L 150 224 Z" fill="#E2564F"/>`,
  },
  glasses: {
    viewBox: "85 88 130 48",
    inner: `
      <circle cx="120" cy="112" r="19" fill="none" stroke="#4A3730" stroke-width="4"/>
      <circle cx="180" cy="112" r="19" fill="none" stroke="#4A3730" stroke-width="4"/>
      <path d="M 139 112 L 161 112" stroke="#4A3730" stroke-width="4"/>
      <path d="M 101 108 L 90 100" stroke="#4A3730" stroke-width="4" stroke-linecap="round"/>
      <path d="M 199 108 L 210 100" stroke="#4A3730" stroke-width="4" stroke-linecap="round"/>`,
  },
  hat: {
    viewBox: "95 10 110 70",
    inner: `
      <ellipse cx="150" cy="62" rx="52" ry="12" fill="#5C4A42"/>
      <path d="M 112 64 Q 112 18 150 18 Q 188 18 188 64 Z" fill="#6B5850"/>
      <ellipse cx="150" cy="64" rx="38" ry="9" fill="#7A6660"/>`,
  },
  cap: {
    viewBox: "95 28 130 62",
    inner: `
      <path d="M 100 78 Q 108 32 150 32 Q 192 32 200 78 Q 150 68 100 78 Z" fill="#7FB3B8"/>
      <path d="M 186 70 Q 214 70 218 82 Q 196 84 184 78 Z" fill="#5FA3A8"/>`,
  },
  flower: {
    viewBox: "61 34 34 30",
    inner: `
      <circle cx="75" cy="50" r="5" fill="#F26D9B"/>
      <circle cx="83" cy="44" r="5" fill="#FFA6C1"/>
      <circle cx="85" cy="54" r="5" fill="#FFA6C1"/>
      <circle cx="79" cy="50" r="4" fill="#FFD97D"/>`,
  },
};

const shopOverlay = document.getElementById("shopOverlay");
const shopList = document.getElementById("shopList");
const inventoryList = document.getElementById("inventoryList");
const inventoryTitle = document.getElementById("inventoryTitle");
const shopTabHint = document.getElementById("shopTabHint");
let shopActiveTab = "toys";

function openShop() {
  shopOverlay.classList.remove("hidden");
  renderShop();
}

function closeShop() {
  shopOverlay.classList.add("hidden");
}

function setShopTab(tab) {
  shopActiveTab = tab;
  document.getElementById("shopTabToys").classList.toggle("active", tab === "toys");
  document.getElementById("shopTabClothes").classList.toggle("active", tab === "clothes");
  document.getElementById("shopTabCards").classList.toggle("active", tab === "cards");
  document.getElementById("shopTabSpecial").classList.toggle("active", tab === "special");
  shopTabHint.textContent =
    tab === "toys"
      ? "Kaufe Spielzeug für mehr Spaß! Coins bekommst du fürs Arbeiten und in Minispielen."
      : tab === "clothes"
      ? "Kleide Summi ein! Getragene Sachen sieht man direkt am Bären."
      : tab === "special"
      ? "Besondere Artikel mit praktischen Extra-Effekten!"
      : "Öffne Booster-Packs und sammle alle Karten!";
  inventoryTitle.textContent =
    tab === "toys" ? "🎒 Spielzeug-Inventar" : tab === "clothes" ? "🎒 Kleiderschrank" : tab === "special" ? "✨ Aktive Effekte" : "🎴 Deine Karten";
  renderShop();
}

function renderShop() {
  if (shopActiveTab === "clothes") {
    renderClothesShop();
  } else if (shopActiveTab === "special") {
    renderSpecialShop();
  } else if (shopActiveTab === "cards") {
    renderCardsShop();
  } else {
    renderToyShop();
  }
}

function renderToyShop() {
  shopList.className = "shop-list";
  shopList.innerHTML = TOYS.map(
    (toy) => `
    <div class="shop-item">
      <div class="shop-item-emoji">${toy.emoji}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${toy.name}</div>
        <div class="shop-item-desc">${toy.desc} · +${toy.funGain} 🎈 Spaß</div>
      </div>
      <button class="shop-buy-btn" data-toy="${toy.id}" ${state.coins < toy.cost ? "disabled" : ""}>
        ${toy.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">
      </button>
    </div>`
  ).join("");

  shopList.querySelectorAll(".shop-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyToy(btn.dataset.toy));
  });

  renderToyInventory();
}

function renderToyInventory() {
  const owned = TOYS.filter((t) => state.toys[t.id] > 0);
  if (owned.length === 0) {
    inventoryList.innerHTML = '<span class="inventory-empty">Noch kein Spielzeug gekauft.</span>';
    return;
  }
  inventoryList.innerHTML = owned
    .map(
      (t) => `
      <span class="inventory-item">
        ${t.emoji} ${t.name} ×${state.toys[t.id]}
        <button class="inventory-play-btn" data-toy="${t.id}" title="Zusammen mit Summi spielen!">▶️</button>
      </span>`
    )
    .join("");
  inventoryList.querySelectorAll(".inventory-play-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeShop();
      startToyPlay(btn.dataset.toy);
    });
  });
}

function renderClothesShop() {
  shopList.className = "shop-list";
  shopList.innerHTML = CLOTHES.map((item) => {
    const preview = CLOTHES_PREVIEW[item.id];
    const previewHtml = preview
      ? `<svg viewBox="${preview.viewBox}">${preview.inner}</svg>`
      : item.emoji;
    return `
    <div class="shop-item">
      <div class="shop-item-emoji clothes-preview">${previewHtml}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc} · +${item.loveGain} 💗 Liebe</div>
      </div>
      <button class="shop-buy-btn" data-clothes="${item.id}" ${state.coins < item.cost ? "disabled" : ""}>
        ${item.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">
      </button>
    </div>`;
  }).join("");

  shopList.querySelectorAll(".shop-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyClothing(btn.dataset.clothes));
  });

  renderClothesInventory();
}

function renderClothesInventory() {
  const owned = CLOTHES.filter((c) => state.clothes[c.id] > 0);
  if (owned.length === 0) {
    inventoryList.innerHTML = '<span class="inventory-empty">Noch keine Kleidung gekauft.</span>';
    return;
  }
  inventoryList.innerHTML = owned
    .map((c) => {
      const worn = state.equipped[c.slot] === c.id;
      return `
      <span class="inventory-item">
        ${c.emoji} ${c.name}
        <button class="inventory-play-btn shop-equip-btn ${worn ? "is-worn" : ""}" data-clothes="${c.id}">
          ${worn ? "Ausziehen" : "Anziehen"}
        </button>
      </span>`;
    })
    .join("");
  inventoryList.querySelectorAll(".shop-equip-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleEquip(btn.dataset.clothes));
  });
}

function buyToy(id) {
  const toy = TOYS.find((t) => t.id === id);
  if (!toy) return;
  if (state.coins < toy.cost) {
    showToast("Noch nicht genug 🪙 Coins! Geh dafür arbeiten.");
    return;
  }
  state.coins -= toy.cost;
  state.toys[id] = (state.toys[id] || 0) + 1;
  state.fun = clamp(state.fun + toy.funGain);
  state.love = clamp(state.love + 5);
  state.stats.toysBought++;
  showToast(toy.emoji + " " + toy.name + " gekauft – Summi freut sich!");
  vibrate(15);
  renderAll();
  saveState();
  renderShop();
  checkAchievements();
}

function buyClothing(id) {
  const item = CLOTHES.find((c) => c.id === id);
  if (!item) return;
  if (state.coins < item.cost) {
    showToast("Noch nicht genug 🪙 Coins! Geh dafür arbeiten.");
    return;
  }
  state.coins -= item.cost;
  state.clothes[id] = (state.clothes[id] || 0) + 1;
  state.love = clamp(state.love + item.loveGain);
  state.stats.clothesBought++;
  // Direkt anziehen, damit man den Kauf sofort am Bären sieht.
  state.equipped[item.slot] = id;
  showToast(item.emoji + " " + item.name + " gekauft – Summi trägt es direkt!");
  vibrate(15);
  renderAccessories();
  renderAll();
  saveState();
  renderShop();
  checkAchievements();
}

function toggleEquip(id) {
  const item = CLOTHES.find((c) => c.id === id);
  if (!item || !state.clothes[id]) return;
  state.equipped[item.slot] = state.equipped[item.slot] === id ? null : id;
  renderAccessories();
  renderShop();
  saveState();
}

// Blendet die passenden SVG-Overlays für aktuell getragene Kleidung ein/aus.
function renderAccessories() {
  CLOTHES.forEach((c) => {
    const g = document.getElementById(c.groupId);
    if (!g) return;
    g.classList.toggle("hidden-acc", state.equipped[c.slot] !== c.id);
  });
}

function renderSpecialShop() {
  shopList.className = "shop-list";
  shopList.innerHTML = SPECIAL_ITEMS.map((item) => {
    const balance = item.currency === "coins" ? state.coins : state.strawberries;
    const costLabel = item.currency === "coins" ? `${item.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">` : `${item.cost} 🍓`;
    return `
    <div class="shop-item">
      <div class="shop-item-emoji">${item.emoji}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
      </div>
      <button class="shop-buy-btn" data-special="${item.id}" ${balance < item.cost ? "disabled" : ""}>
        ${costLabel}
      </button>
    </div>`;
  }).join("");

  shopList.querySelectorAll(".shop-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => buySpecialItem(btn.dataset.special));
  });

  renderActiveEffects();
}

// Zeigt an, welche Spezial-Effekte gerade noch laufen (statt eines
// klassischen Inventars, da Verbrauchsgüter sofort wirken).
function renderActiveEffects() {
  const now = Date.now();
  const active = [];
  if (state.effects.cleanBoostUntil > now) active.push({ emoji: "🧴✨", label: "Weichspüler", until: state.effects.cleanBoostUntil });
  if (state.effects.hungerBoostUntil > now) active.push({ emoji: "🍓🍰", label: "Erdbeerkuchen", until: state.effects.hungerBoostUntil });
  if (state.effects.wakeBoostUntil > now) active.push({ emoji: "⚡🥤", label: "Energy-Drink", until: state.effects.wakeBoostUntil });
  if (state.effects.sickImmuneUntil > now) active.push({ emoji: "💧💪", label: "Vitamintropfen", until: state.effects.sickImmuneUntil });
  if (state.effects.luckyClover) active.push({ emoji: "🍀", label: "Glücksklee (nächstes Pack)", until: null });

  if (active.length === 0) {
    inventoryList.innerHTML = '<span class="inventory-empty">Gerade kein aktiver Effekt.</span>';
    return;
  }
  inventoryList.innerHTML = active
    .map((a) => {
      const remaining = a.until ? Math.max(0, Math.round((a.until - now) / 60000)) + " Min." : "bis zum nächsten Pack";
      return `<span class="inventory-item">${a.emoji} ${a.label} · noch ${remaining}</span>`;
    })
    .join("");
}

function buySpecialItem(id) {
  const item = SPECIAL_ITEMS.find((s) => s.id === id);
  if (!item) return;
  const balance = item.currency === "coins" ? state.coins : state.strawberries;
  if (balance < item.cost) {
    showToast("Noch nicht genug " + (item.currency === "coins" ? "🪙 Coins" : "🍓 Erdbeeren") + "!");
    return;
  }
  if (item.currency === "coins") state.coins -= item.cost;
  else state.strawberries -= item.cost;

  const now = Date.now();
  if (item.effect === "clean") {
    state.effects.cleanBoostUntil = Math.max(state.effects.cleanBoostUntil, now) + SPECIAL_ITEM_DURATION;
    state.clean = clamp(state.clean + 20);
    showToast("🧴✨ Weichspüler benutzt – Summi bleibt jetzt länger sauber!");
  } else if (item.effect === "hunger") {
    state.effects.hungerBoostUntil = Math.max(state.effects.hungerBoostUntil, now) + SPECIAL_ITEM_DURATION;
    state.hunger = clamp(state.hunger + 30);
    showToast("🍓🍰 Lecker! Erdbeerkuchen hält Summi jetzt länger satt!");
  } else if (item.effect === "wake") {
    state.effects.wakeBoostUntil = Math.max(state.effects.wakeBoostUntil, now) + (15 * 60 * 1000);
    showToast("⚡🥤 Energy-Drink! Summi bleibt jetzt länger wach!");
  } else if (item.effect === "sickImmune") {
    state.effects.sickImmuneUntil = Math.max(state.effects.sickImmuneUntil, now) + (30 * 60 * 1000);
    showToast("💧💪 Vitamintropfen genommen – erstmal keine Krankheit!");
  } else if (item.effect === "luckyClover") {
    state.effects.luckyClover = true;
    showToast("🍀 Glücksklee aktiv – das nächste Booster-Pack wird besonders!");
  }

  spawnParticles("✨", 4);
  vibrate(15);
  registerInteraction();
  renderAll();
  saveState();
  renderShop();
}

document.getElementById("shopBtn").addEventListener("click", openShop);
document.getElementById("shopClose").addEventListener("click", closeShop);
document.getElementById("shopTabToys").addEventListener("click", () => setShopTab("toys"));
document.getElementById("shopTabClothes").addEventListener("click", () => setShopTab("clothes"));
document.getElementById("shopTabSpecial").addEventListener("click", () => setShopTab("special"));
