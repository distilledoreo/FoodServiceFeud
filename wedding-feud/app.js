const QUESTIONS = window.WEDDING_FEUD_QUESTIONS;
const STORAGE_KEY = "WEDDING_FEUD_STATE_V1";
const CHANNEL_NAME = "wedding-feud-sync";
const isProjector = new URLSearchParams(location.search).get("projector") === "1";

const defaultMultiplier = (roundIndex) => roundIndex < 5 ? 1 : roundIndex < 10 ? 2 : 3;

const blankState = () => ({
  roundIndex: 0,
  revealed: Array(8).fill(false),
  strikes: 0,
  team1Name: "Team Bride",
  team2Name: "Team Groom",
  team1Score: 0,
  team2Score: 0,
  multiplier: 1
});

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") return blankState();
    return {
      ...blankState(),
      ...parsed,
      roundIndex: Math.max(0, Math.min(QUESTIONS.length - 1, Number(parsed.roundIndex) || 0)),
      revealed: Array.from({length: 8}, (_, i) => Boolean(parsed.revealed && parsed.revealed[i])),
      strikes: Math.max(0, Math.min(3, Number(parsed.strikes) || 0)),
      multiplier: [1,2,3].includes(Number(parsed.multiplier)) ? Number(parsed.multiplier) : 1
    };
  } catch {
    return blankState();
  }
}

let state = loadState();
let strikeTimer = null;
let channel = null;

try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === "state") {
      state = msg.state;
      render();
    } else if (msg.type === "strikeFlash") {
      flashStrike(msg.count);
    }
  };
} catch {}

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try {
      state = JSON.parse(event.newValue);
      render();
    } catch {}
  }
});

function persist({broadcast = true} = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (broadcast && channel) channel.postMessage({type:"state", state});
}

function setState(patch, options) {
  state = {...state, ...patch};
  persist(options);
  render();
}

function currentRound() {
  return QUESTIONS[state.roundIndex];
}

function rawBank() {
  return currentRound().answers.reduce((sum, answer, index) => sum + (state.revealed[index] ? answer.score : 0), 0);
}

function roundBank() {
  return rawBank() * state.multiplier;
}

const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, duration=.25, type="sine", volume=.12, delay=0) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },
  ding() {
    this.tone(740,.55,"sine",.16);
    this.tone(1110,.45,"sine",.11,.04);
  },
  buzz() {
    this.tone(145,.72,"sawtooth",.19);
    this.tone(136,.72,"square",.10);
  },
  win() {
    [523,659,784,1047].forEach((f,i) => this.tone(f,.5,"triangle",.12,i*.09));
  }
};

function reveal(index) {
  const round = currentRound();
  if (!round.answers[index] || state.revealed[index]) return;
  const revealed = [...state.revealed];
  revealed[index] = true;
  state = {...state, revealed};
  persist();
  AudioFX.ding();
  render();
}

function strike() {
  const strikes = Math.min(3, state.strikes + 1);
  state = {...state, strikes};
  persist();
  AudioFX.buzz();
  if (channel) channel.postMessage({type:"strikeFlash", count:strikes});
  if (isProjector) flashStrike(strikes);
  render();
}

function clearStrikes() { setState({strikes:0}); }
function resetRound() { setState({revealed:Array(8).fill(false), strikes:0}); }

function setRound(index) {
  const safeIndex = Math.max(0, Math.min(QUESTIONS.length - 1, index));
  state = {
    ...state,
    roundIndex: safeIndex,
    revealed: Array(8).fill(false),
    strikes: 0,
    multiplier: defaultMultiplier(safeIndex)
  };
  persist();
  render();
}

function changeRound(delta) { setRound(state.roundIndex + delta); }

function revealAll() {
  const revealed = Array.from({length:8}, (_,i) => Boolean(currentRound().answers[i]));
  setState({revealed});
}

function award(team) {
  const bank = roundBank();
  if (!bank) return;
  if (team === 1) state = {...state, team1Score: state.team1Score + bank};
  else state = {...state, team2Score: state.team2Score + bank};
  persist();
  AudioFX.win();
  render();
}

function newGame() {
  if (!confirm("Start a new game? This resets both scores and returns to Round 1.")) return;
  const names = {team1Name:state.team1Name, team2Name:state.team2Name};
  state = {...blankState(), ...names};
  persist();
  render();
}

function launchProjector() {
  AudioFX.init();
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("projector","1");
  const win = window.open(url.toString(),"WeddingFeudProjector","width=1400,height=850,left=120,top=80");
  if (!win) alert("Popup blocked. Allow popups for this page, then try Launch Projector again.");
}

function flashStrike(count) {
  const existing = document.getElementById("strike-flash");
  if (existing) existing.remove();
  if (!count) return;
  const overlay = document.createElement("div");
  overlay.id = "strike-flash";
  overlay.className = "strike-flash";
  overlay.innerHTML = Array.from({length:count},()=>"<span>×</span>").join("");
  document.body.appendChild(overlay);
  clearTimeout(strikeTimer);
  strikeTimer = setTimeout(()=>overlay.remove(), 1150);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function hostHtml() {
  const round = currentRound();
  const options = QUESTIONS.map((q,i) => `<option value="${i}" ${i===state.roundIndex?"selected":""}>${i+1}. ${escapeHtml(q.question)}</option>`).join("");
  const answers = round.answers.map((a,i) => `
    <button class="answer-control ${state.revealed[i]?"revealed":""}" data-action="reveal" data-index="${i}">
      <span class="answer-num">${i+1}</span>
      <span class="answer-text">${escapeHtml(a.text)}</span>
      <span class="answer-score mono">${a.score}</span>
    </button>`).join("");

  const strikeBoxes = [1,2,3].map(i => `<div class="strike-box ${state.strikes>=i?"on":""}">×</div>`).join("");

  return `
    <main class="host-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">💍</div>
          <div>
            <h1>Wedding Feud</h1>
            <p>Host controls · ${QUESTIONS.length} built-in survey-style wedding rounds</p>
          </div>
        </div>
        <div class="toolbar">
          <button class="btn gold" data-action="projector">Launch Projector</button>
          <button class="btn ghost" data-action="reset-round">Reset Round</button>
          <button class="btn ghost" data-action="new-game">New Game</button>
        </div>
      </header>

      <section class="host-grid">
        <section class="panel question-panel">
          <div class="round-nav">
            <button class="btn small" data-action="prev" ${state.roundIndex===0?"disabled":""}>◀</button>
            <select id="round-select" aria-label="Choose round">${options}</select>
            <button class="btn small" data-action="next" ${state.roundIndex===QUESTIONS.length-1?"disabled":""}>▶</button>
          </div>

          <div class="question-box">
            <div class="eyebrow">Round ${state.roundIndex+1} of ${QUESTIONS.length} · ${state.multiplier}× points</div>
            <h2>${escapeHtml(round.question)}</h2>
          </div>

          <div class="answer-list">${answers}</div>
        </section>

        <aside class="control-stack">
          <section class="panel card">
            <div class="eyebrow">Scoreboard</div>
            <div class="score-setup">
              <div class="score-team">
                <input id="team1-name" type="text" value="${escapeHtml(state.team1Name)}" aria-label="Team 1 name" />
                <div class="score mono">${state.team1Score}</div>
                <button class="btn green wide" data-action="award1">Award ${roundBank()}</button>
              </div>
              <div class="score-team">
                <input id="team2-name" type="text" value="${escapeHtml(state.team2Name)}" aria-label="Team 2 name" />
                <div class="score mono">${state.team2Score}</div>
                <button class="btn green wide" data-action="award2">Award ${roundBank()}</button>
              </div>
            </div>

            <div class="round-bank">
              <div>
                <div class="eyebrow">Round Bank</div>
                <div style="color:#c5cddd;font-size:.84rem">${rawBank()} raw × ${state.multiplier}</div>
              </div>
              <div class="bank-value mono">${roundBank()}</div>
            </div>

            <div class="eyebrow">Point Multiplier</div>
            <div class="multiplier">
              ${[1,2,3].map(m=>`<button class="btn small ${state.multiplier===m?"active":""}" data-action="multiplier" data-value="${m}">${m}×</button>`).join("")}
            </div>
          </section>

          <section class="panel card">
            <div class="eyebrow">Strikes</div>
            <div class="strike-row">${strikeBoxes}</div>
            <div class="button-grid">
              <button class="btn red" data-action="strike">Strike</button>
              <button class="btn ghost" data-action="clear-strikes">Clear</button>
              <button class="btn ghost" data-action="reveal-all">Reveal All</button>
              <button class="btn ghost" data-action="reset-round">Hide All</button>
            </div>
          </section>

          <section class="panel card help">
            <div class="eyebrow">Keyboard shortcuts</div>
            <p><kbd>1</kbd>–<kbd>8</kbd> reveal answers · <kbd>X</kbd> strike · <kbd>C</kbd> clear strikes · <kbd>←</kbd>/<kbd>→</kbd> change round.</p>
            <p><kbd>A</kbd> awards ${escapeHtml(state.team1Name)} · <kbd>B</kbd> awards ${escapeHtml(state.team2Name)} · <kbd>M</kbd> cycles 1×/2×/3× · <kbd>P</kbd> opens the projector.</p>
            <p>The answers are <strong>survey-style game data</strong> written for this wedding edition; they are not results of an actual 100-person survey.</p>
          </section>
        </aside>
      </section>
    </main>`;
}

function projectorAnswer(answer,index) {
  if (!answer) return `<div class="projector-answer empty"><div class="flip"><div class="face front"></div></div></div>`;
  return `
    <div class="projector-answer ${state.revealed[index]?"revealed":""}">
      <div class="flip">
        <div class="face front"><div class="slot">${index+1}</div></div>
        <div class="face back">
          <div class="projector-answer-text">${escapeHtml(answer.text)}</div>
          <div class="projector-answer-score mono">${answer.score}</div>
        </div>
      </div>
    </div>`;
}

function projectorHtml() {
  const round = currentRound();
  const slots = Array.from({length:8},(_,i)=>projectorAnswer(round.answers[i],i)).join("");
  const strikes = Array.from({length:state.strikes},()=>"<span>×</span>").join("");
  return `
    <main class="projector-shell">
      <header class="projector-header">
        <div class="projector-team">
          <div class="name">${escapeHtml(state.team1Name)}</div>
          <div class="score mono">${state.team1Score}</div>
        </div>
        <div class="projector-logo">
          <div class="rings">💍</div>
          <h1>Wedding Feud</h1>
          <div class="bankline">Bank ${roundBank()} · ${state.multiplier}×</div>
        </div>
        <div class="projector-team">
          <div class="name">${escapeHtml(state.team2Name)}</div>
          <div class="score mono">${state.team2Score}</div>
        </div>
      </header>

      <section class="projector-main">
        <div class="projector-question"><h2>${escapeHtml(round.question)}</h2></div>
        <div class="projector-answers">${slots}</div>
      </section>

      <div class="strike-mini">${strikes}</div>
      <div class="projector-hint">Round ${state.roundIndex+1} / ${QUESTIONS.length}</div>
    </main>`;
}

function render() {
  document.getElementById("app").innerHTML = isProjector ? projectorHtml() : hostHtml();
  document.title = isProjector ? "Wedding Feud — Projector" : "Wedding Feud — Host";
  if (!isProjector) bindHostEvents();
}

function bindHostEvents() {
  document.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      AudioFX.init();
      const action = el.dataset.action;
      if (action === "reveal") reveal(Number(el.dataset.index));
      else if (action === "strike") strike();
      else if (action === "clear-strikes") clearStrikes();
      else if (action === "reset-round") resetRound();
      else if (action === "reveal-all") revealAll();
      else if (action === "prev") changeRound(-1);
      else if (action === "next") changeRound(1);
      else if (action === "award1") award(1);
      else if (action === "award2") award(2);
      else if (action === "projector") launchProjector();
      else if (action === "new-game") newGame();
      else if (action === "multiplier") setState({multiplier:Number(el.dataset.value)});
    });
  });

  document.getElementById("round-select")?.addEventListener("change", e => setRound(Number(e.target.value)));
  document.getElementById("team1-name")?.addEventListener("change", e => setState({team1Name:e.target.value.trim() || "Team 1"}));
  document.getElementById("team2-name")?.addEventListener("change", e => setState({team2Name:e.target.value.trim() || "Team 2"}));
}

window.addEventListener("keydown", (event) => {
  if (isProjector) return;
  if (["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName)) return;

  const key = event.key.toLowerCase();
  if (/^[1-8]$/.test(key)) reveal(Number(key)-1);
  else if (key === "x") strike();
  else if (key === "c") clearStrikes();
  else if (event.key === "ArrowRight") changeRound(1);
  else if (event.key === "ArrowLeft") changeRound(-1);
  else if (key === "a") award(1);
  else if (key === "b") award(2);
  else if (key === "m") setState({multiplier: state.multiplier === 3 ? 1 : state.multiplier + 1});
  else if (key === "p") launchProjector();
  else return;
  event.preventDefault();
});

window.addEventListener("click", () => AudioFX.init(), {once:true});
persist({broadcast:false});
render();
