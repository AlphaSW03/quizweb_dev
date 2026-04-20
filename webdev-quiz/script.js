/* ═══════════════════════════════════════════════════════
   WebDev Quiz — script.js
   LocalStorage Keys:
     wdq_history   → Array of attempt objects
     wdq_player    → Last used player name (string)
   ═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════
   LOCALSTORAGE BACKEND
   ══════════════════════════════════ */
const DB = {
  KEY_HISTORY: 'wdq_history',
  KEY_PLAYER:  'wdq_player',

  /* Get full history array */
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY_HISTORY)) || [];
    } catch { return []; }
  },

  /* Save a new attempt */
  saveAttempt(attempt) {
    const history = this.getHistory();
    history.unshift(attempt);                      // newest first
    if (history.length > 50) history.length = 50; // max 50 records
    localStorage.setItem(this.KEY_HISTORY, JSON.stringify(history));
  },

  /* Get computed stats from history */
  getStats() {
    const history = this.getHistory();
    if (!history.length) return null;
    const maxPts  = QUESTIONS.reduce((a, q) => a + q.points, 0);
    const scores  = history.map(h => h.score);
    const pcts    = history.map(h => Math.round((h.score / maxPts) * 100));
    return {
      gamesPlayed : history.length,
      highscore   : Math.max(...scores),
      avgPercent  : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      totalCorrect: history.reduce((a, h) => a + h.correct, 0),
    };
  },

  /* Clear everything */
  clearHistory() {
    localStorage.removeItem(this.KEY_HISTORY);
  },

  /* Player name persistence */
  getPlayer()         { return localStorage.getItem(this.KEY_PLAYER) || ''; },
  savePlayer(name)    { localStorage.setItem(this.KEY_PLAYER, name.trim()); },
};

/* ══════════════════════════════════
   PARTICLE BACKGROUND
   ══════════════════════════════════ */
(function () {
  const canvas = document.getElementById('particles');
  const ctx    = canvas.getContext('2d');
  let pts = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function createParticles() {
    pts = [];
    const count = Math.floor((canvas.width * canvas.height) / 18000);
    for (let i = 0; i < count; i++) {
      pts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        o: Math.random() * 0.5 + 0.1,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;  if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,255,${p.o})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); createParticles(); });
  resize(); createParticles(); draw();
})();

/* ══════════════════════════════════
   QUIZ STATE
   ══════════════════════════════════ */
let currentQ  = 0;
let score     = 0;
let correct   = 0;
let wrong     = 0;
let answered  = false;
let timerID   = null;
let timeLeft  = 30;
let playerName = '';
const CIRC    = 176;   // stroke-dasharray for timer ring (2π × 28)
const SC_CIRC = 327;   // stroke-dasharray for score circle (2π × 52)
const MAX_PTS = QUESTIONS.reduce((a, q) => a + q.points, 0);

/* ══════════════════════════════════
   DOM REFS
   ══════════════════════════════════ */
const $ = id => document.getElementById(id);
const screens       = document.querySelectorAll('.screen');
const startBtn      = $('startBtn');
const nextBtn       = $('nextBtn');
const restartBtn    = $('restartBtn');
const backBtn       = $('backBtn');
const viewHistoryBtn  = $('viewHistoryBtn');
const viewHistoryBtn2 = $('viewHistoryBtn2');
const historyToggleBtn = $('historyToggleBtn');
const clearHistoryBtn  = $('clearHistoryBtn');
const playerNameInput  = $('playerName');
const savedStatsEl     = $('savedStats');
const questionText     = $('questionText');
const optionsEl        = $('options');
const qCounter         = $('qCounter');
const qPoints          = $('qPoints');
const progressFill     = $('progressFill');
const timerNum         = $('timerNum');
const ringFill         = $('ringFill');
const scoreDisplay     = $('scoreDisplay');
const headerScore      = $('headerScore');
const liveScore        = $('liveScore');
const resultEmoji      = $('resultEmoji');
const resultTitle      = $('resultTitle');
const resultMsg        = $('resultMsg');
const finalScore       = $('finalScore');
const rCorrect         = $('rCorrect');
const rWrong           = $('rWrong');
const rPercent         = $('rPercent');
const highscoreLine    = $('highscoreLine');
const scoreCircle      = $('scoreCircleFill');
const historySub       = $('historySub');
const historySummary   = $('historySummary');
const historyList      = $('historyList');

/* ══════════════════════════════════
   SCREEN NAVIGATION
   ══════════════════════════════════ */
function showScreen(id) {
  screens.forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ══════════════════════════════════
   START SCREEN — LOAD SAVED DATA
   ══════════════════════════════════ */
function initStartScreen() {
  /* Restore player name */
  const saved = DB.getPlayer();
  if (saved) playerNameInput.value = saved;

  /* Show stats if history exists */
  const stats = DB.getStats();
  if (stats) {
    savedStatsEl.style.display = 'flex';
    $('ssHighscore').textContent = stats.highscore + ' pts';
    $('ssGames').textContent     = stats.gamesPlayed;
    $('ssAvg').textContent       = stats.avgPercent + '%';
  } else {
    savedStatsEl.style.display = 'none';
  }
}

/* ══════════════════════════════════
   TIMER
   ══════════════════════════════════ */
function startTimer() {
  clearInterval(timerID);
  timeLeft = 30;
  updateRing();
  timerID = setInterval(() => {
    timeLeft--;
    updateRing();
    if (timeLeft <= 0) { clearInterval(timerID); timeExpired(); }
  }, 1000);
}

function updateRing() {
  const offset = CIRC * (1 - timeLeft / 30);
  ringFill.style.strokeDashoffset = offset;
  timerNum.textContent = timeLeft;
  const urgent = timeLeft <= 10;
  ringFill.classList.toggle('urgent', urgent);
  timerNum.classList.toggle('urgent', urgent);
}

function stopTimer() { clearInterval(timerID); }

function timeExpired() {
  if (answered) return;
  answered = true;
  wrong++;
  revealAnswer(-1);
  nextBtn.style.display = 'inline-block';
}

/* ══════════════════════════════════
   QUESTION RENDER
   ══════════════════════════════════ */
function renderQuestion() {
  answered = false;
  nextBtn.style.display = 'none';

  const q = QUESTIONS[currentQ];
  const pct = (currentQ / QUESTIONS.length) * 100;
  progressFill.style.width = pct + '%';
  qCounter.textContent = `Q ${currentQ + 1} / ${QUESTIONS.length}`;
  qPoints.textContent  = q.points + ' pts';
  questionText.textContent = q.question;

  optionsEl.innerHTML = '';
  const letters = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span> ${opt}`;
    btn.addEventListener('click', () => handleAnswer(i, btn));
    optionsEl.appendChild(btn);
  });

  startTimer();
}

/* ══════════════════════════════════
   ANSWER HANDLING
   ══════════════════════════════════ */
function handleAnswer(selected, btn) {
  if (answered) return;
  answered = true;
  stopTimer();

  const q = QUESTIONS[currentQ];
  if (selected === q.correct) {
    score += q.points;
    correct++;
    scoreDisplay.textContent = score;
    liveScore.textContent    = score;
  } else {
    wrong++;
    btn.classList.add('shake');
  }

  revealAnswer(selected);
  nextBtn.style.display = 'inline-block';
}

function revealAnswer(selected) {
  const q = QUESTIONS[currentQ];
  optionsEl.querySelectorAll('.option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct)     btn.classList.add('correct');
    else if (i === selected) btn.classList.add('wrong');
  });
}

/* ══════════════════════════════════
   NEXT QUESTION
   ══════════════════════════════════ */
nextBtn.addEventListener('click', () => {
  currentQ++;
  if (currentQ < QUESTIONS.length) renderQuestion();
  else showResult();
});

/* ══════════════════════════════════
   SHOW RESULT + SAVE TO LOCALSTORAGE
   ══════════════════════════════════ */
function showResult() {
  stopTimer();
  showScreen('resultScreen');
  headerScore.style.display = 'none';

  const pct = Math.round((score / MAX_PTS) * 100);

  /* ── Save attempt to localStorage ── */
  const attempt = {
    id       : Date.now(),
    name     : playerName || 'Anonymous',
    score    : score,
    correct  : correct,
    wrong    : wrong,
    percent  : pct,
    date     : new Date().toLocaleString('en-PK', {
                 dateStyle:'medium', timeStyle:'short'
               }),
  };
  DB.saveAttempt(attempt);

  /* ── Emoji & message ── */
  let emoji, title, msg;
  if (pct === 100) { emoji='🏆'; title='Perfect Score!';    msg="Unbelievable — you got everything right!"; }
  else if (pct>=80){ emoji='🎉'; title='Excellent!';        msg="You really know your web dev stuff!"; }
  else if (pct>=60){ emoji='😊'; title='Good Job!';         msg="Solid performance! Keep practicing."; }
  else if (pct>=40){ emoji='🤔'; title='Not Bad!';          msg="You're getting there — keep studying!"; }
  else             { emoji='📚'; title='Keep Learning!';    msg="Web dev takes practice — don't give up!"; }

  resultEmoji.textContent = emoji;
  resultTitle.textContent = title;
  resultMsg.textContent   = msg;
  finalScore.textContent  = score;
  rCorrect.textContent    = correct;
  rWrong.textContent      = wrong;
  rPercent.textContent    = pct + '%';

  /* Score circle animation */
  setTimeout(() => {
    scoreCircle.style.strokeDashoffset = SC_CIRC * (1 - pct / 100);
  }, 200);

  /* Highscore check */
  const stats = DB.getStats();
  if (stats && score === stats.highscore && stats.gamesPlayed > 1) {
    highscoreLine.textContent = '⭐ New High Score!';
  } else if (stats && stats.highscore > 0) {
    highscoreLine.textContent = `Best Score: ${stats.highscore} pts`;
  }
}

/* ══════════════════════════════════
   HISTORY SCREEN
   ══════════════════════════════════ */
function renderHistory() {
  showScreen('historyScreen');

  const history = DB.getHistory();
  const stats   = DB.getStats();

  /* Sub heading */
  historySub.textContent = history.length
    ? `${history.length} attempt${history.length > 1 ? 's' : ''} saved in your browser`
    : 'No attempts yet — play your first quiz!';

  /* ── Summary cards ── */
  if (stats) {
    historySummary.innerHTML = `
      <div class="hs-card gold">
        <div class="hs-val">${stats.highscore}</div>
        <div class="hs-label">🏆 Best Score</div>
      </div>
      <div class="hs-card purple">
        <div class="hs-val">${stats.gamesPlayed}</div>
        <div class="hs-label">🎮 Games Played</div>
      </div>
      <div class="hs-card green">
        <div class="hs-val">${stats.avgPercent}%</div>
        <div class="hs-label">📊 Avg Score</div>
      </div>
      <div class="hs-card cyan">
        <div class="hs-val">${stats.totalCorrect}</div>
        <div class="hs-label">✅ Total Correct</div>
      </div>
    `;
  } else {
    historySummary.innerHTML = '';
  }

  /* ── Attempt list ── */
  if (!history.length) {
    historyList.innerHTML = `<div class="no-history">No quiz attempts yet.<br/>Play your first quiz! 🚀</div>`;
    return;
  }

  /* Sort by score desc for rank display */
  const ranked = [...history].sort((a, b) => b.score - a.score);
  const rankMap = {};
  ranked.forEach((h, i) => { if (!rankMap[h.id]) rankMap[h.id] = i + 1; });

  historyList.innerHTML = history.map((h, idx) => {
    const rank    = rankMap[h.id];
    const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const rankLbl = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const cardCls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
    const pctCls  = h.percent >= 80 ? 'pct-s' : h.percent >= 60 ? 'pct-m' : h.percent >= 40 ? 'pct-l' : 'pct-f';

    return `
      <div class="attempt-card ${cardCls}" style="animation-delay:${idx * 0.05}s">
        <div class="attempt-left">
          <div class="attempt-rank ${rankCls}">${rankLbl}</div>
          <div class="attempt-info">
            <div class="attempt-name">${escHtml(h.name)}</div>
            <div class="attempt-date">${h.date}</div>
            <div class="attempt-detail">
              <span class="ck">✅ ${h.correct} correct</span>
              <span class="wk">❌ ${h.wrong} wrong</span>
            </div>
          </div>
        </div>
        <div class="attempt-right">
          <div class="attempt-score" style="color:var(--neon)">${h.score} <small style="font-size:.6rem;color:var(--text2)">pts</small></div>
          <div class="attempt-pct ${pctCls}">${h.percent}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ══════════════════════════════════
   START QUIZ
   ══════════════════════════════════ */
function startQuiz() {
  /* Save player name */
  playerName = playerNameInput.value.trim() || 'Anonymous';
  DB.savePlayer(playerName);

  /* Reset state */
  currentQ = 0; score = 0; correct = 0; wrong = 0; answered = false;
  scoreDisplay.textContent = '0';
  liveScore.textContent    = '0';
  highscoreLine.textContent = '';
  scoreCircle.style.strokeDashoffset = SC_CIRC;
  progressFill.style.width = '0%';

  headerScore.style.display = 'flex';
  showScreen('quizScreen');
  renderQuestion();
}

/* ══════════════════════════════════
   EVENT LISTENERS
   ══════════════════════════════════ */
startBtn.addEventListener('click', startQuiz);

/* Press Enter in name field to start */
playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') startQuiz();
});

nextBtn.addEventListener('click', () => {
  currentQ++;
  if (currentQ < QUESTIONS.length) renderQuestion();
  else showResult();
});

restartBtn.addEventListener('click', () => {
  showScreen('startScreen');
  initStartScreen();
});

viewHistoryBtn.addEventListener('click',  renderHistory);
viewHistoryBtn2.addEventListener('click', renderHistory);
historyToggleBtn.addEventListener('click', renderHistory);

backBtn.addEventListener('click', () => {
  showScreen('startScreen');
  initStartScreen();
});

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all quiz history? This cannot be undone.')) {
    DB.clearHistory();
    renderHistory();   // re-render empty state
    initStartScreen(); // update start screen stats
  }
});

/* ══════════════════════════════════
   INIT ON PAGE LOAD
   ══════════════════════════════════ */
initStartScreen();
