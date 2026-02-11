const ROWS = 6;
const COLS = 5;
const STORAGE_KEY = "wordGuessStats";
const HARD_WIN_RATE_THRESHOLD = 0.65;
const MIN_GAMES_FOR_HARD = 8;
const WORD_CHECK_TIMEOUT_MS = 2200;
const FLIP_DURATION_MS = 560;
const FLIP_STAGGER_MS = 140;
const DICTIONARY_ENDPOINTS = [
  "https://freedictionaryapi.com/api/v1/entries/en/",
  "https://api.dictionaryapi.dev/api/v2/entries/en/",
  "https://api.datamuse.com/words?max=1&sp="
];
const MIN_GAMES_FOR_STARTER_MODEL = 4;
const MIN_GUESSES_FOR_PROFILE_MODEL = 10;

const EASY_WORDS = [
  "APPLE", "BRAIN", "CHAIR", "DREAM", "EARTH", "FLAME", "GRAPE", "HOUSE", "INDEX", "JELLY",
  "KNIFE", "LEMON", "MUSIC", "NURSE", "OCEAN", "PIZZA", "QUEEN", "RIVER", "SMILE", "TABLE",
  "UNITY", "VOICE", "WATER", "YEAST", "ZEBRA", "BRICK", "CLOUD", "DANCE", "EAGER", "FAITH",
  "GIANT", "HONEY", "IDEAL", "JUICE", "KOALA", "LIGHT", "MANGO", "NOBLE", "OPERA", "PARTY"
];

const HARD_WORDS = [
  "ABYSS", "CIVIC", "EPOXY", "FJORD", "GLYPH", "JAZZY", "KAYAK", "LYMPH", "NYMPH", "PIXEL",
  "QUARK", "RHYME", "SQUAD", "TOXIC", "VODKA", "WHARF", "XENON", "YACHT", "ZONAL", "WRYLY",
  "QUEUE", "BEEFY", "MUMMY", "FUZZY", "VIXEN", "WALTZ", "CRYPT", "CHYME", "BURLY", "VAPID"
];

const ALL_WORDS = [...new Set([...EASY_WORDS, ...HARD_WORDS])];
const VALID_WORDS = new Set(ALL_WORDS);

let gridEl;
let messageEl;
let statsEl;
let keyboardEl;
let statsModalEl;
let closeStatsBtn;
let playAgainBtn;
let gamesPlayedEl;
let roundsWonEl;
let winRateEl;
let currentStreakEl;
let guessDistributionEl;

let state = {
  answer: "",
  guesses: Array(ROWS).fill(""),
  evaluations: Array(ROWS).fill(null),
  currentRow: 0,
  gameOver: false,
  keyboardState: {},
  isSubmitting: false,
  starter: ""
};
const wordValidationCache = new Map();

function initGame() {
  gridEl = document.getElementById("grid");
  messageEl = document.getElementById("message");
  statsEl = document.getElementById("stats");
  keyboardEl = document.getElementById("keyboard");
  statsModalEl = document.getElementById("stats-modal");
  closeStatsBtn = document.getElementById("close-stats-btn");
  playAgainBtn = document.getElementById("play-again-btn");
  gamesPlayedEl = document.getElementById("games-played");
  roundsWonEl = document.getElementById("rounds-won");
  winRateEl = document.getElementById("win-rate");
  currentStreakEl = document.getElementById("current-streak");
  guessDistributionEl = document.getElementById("guess-distribution");

  const difficultMode = adjustWordSelection();
  state = {
    answer: pickAdaptiveWord(difficultMode ? HARD_WORDS : EASY_WORDS, difficultMode),
    guesses: Array(ROWS).fill(""),
    evaluations: Array(ROWS).fill(null),
    currentRow: 0,
    gameOver: false,
    keyboardState: {},
    isSubmitting: false,
    starter: ""
  };

  renderGridSkeleton();
  renderKeyboard();
  closeStatsModal();
  setMessage("Guess the 5-letter word in 6 tries.");
  renderStats();
}

function evaluateGuess(guess, answer) {
  const result = Array(COLS).fill("absent");
  const answerChars = answer.split("");
  const guessChars = guess.split("");
  const counts = {};

  for (let i = 0; i < COLS; i += 1) {
    const ch = answerChars[i];
    counts[ch] = (counts[ch] || 0) + 1;
  }

  for (let i = 0; i < COLS; i += 1) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = "correct";
      counts[guessChars[i]] -= 1;
    }
  }

  for (let i = 0; i < COLS; i += 1) {
    if (result[i] === "correct") {
      continue;
    }
    const ch = guessChars[i];
    if (counts[ch] > 0) {
      result[i] = "present";
      counts[ch] -= 1;
    }
  }

  return result;
}

function updateGrid(rowIndex, guess, evaluation) {
  const row = gridEl.children[rowIndex];
  if (!row) {
    return;
  }

  for (let i = 0; i < COLS; i += 1) {
    const cell = row.children[i];
    cell.textContent = guess[i] || "";
    cell.classList.remove("correct", "present", "absent", "filled");

    if (guess[i]) {
      cell.classList.add("filled");
    }

    if (evaluation && evaluation[i]) {
      cell.classList.add(evaluation[i]);
      setKeyState(guess[i], evaluation[i]);
    }
  }

  applyKeyboardStyles();
}

async function handleInput(key) {
  if (!key) {
    return;
  }

  if (state.gameOver) {
    if (key === "ENTER") {
      initGame();
    }
    return;
  }

  const rowIndex = state.currentRow;
  let currentGuess = state.guesses[rowIndex];

  if (/^[A-Z]$/.test(key)) {
    if (currentGuess.length < COLS) {
      currentGuess += key;
      state.guesses[rowIndex] = currentGuess;
      updateGrid(rowIndex, currentGuess, null);
    }
    return;
  }

  if (key === "BACKSPACE") {
    if (currentGuess.length > 0) {
      currentGuess = currentGuess.slice(0, -1);
      state.guesses[rowIndex] = currentGuess;
      updateGrid(rowIndex, currentGuess, null);
    }
    return;
  }

  if (key === "ENTER") {
    if (state.isSubmitting) {
      return;
    }

    if (currentGuess.length !== COLS) {
      setMessage("Word must be 5 letters.");
      return;
    }

    state.isSubmitting = true;
    setMessage("Checking dictionary...");
    const isValidWord = await validateWordWithApis(currentGuess);

    if (!isValidWord) {
      state.isSubmitting = false;
      setMessage("Not in dictionary.");
      return;
    }

    const evaluation = evaluateGuess(currentGuess, state.answer);
    state.evaluations[rowIndex] = evaluation;
    updateGrid(rowIndex, currentGuess, null);
    await revealRowEvaluation(rowIndex, currentGuess, evaluation);
    state.isSubmitting = false;
    if (!state.starter) {
      state.starter = currentGuess;
    }

    const win = evaluation.every((status) => status === "correct");

    if (win) {
      state.gameOver = true;
      setMessage(`You won in ${rowIndex + 1} guess${rowIndex === 0 ? "" : "es"}! Press Enter for a new game.`);
      recordGame({
        won: true,
        attempts: rowIndex + 1,
        answer: state.answer,
        guesses: state.guesses.slice(0, rowIndex + 1),
        starter: state.starter || currentGuess
      });
      renderStats();
      openStatsModal();
      return;
    }

    state.currentRow += 1;

    if (state.currentRow >= ROWS) {
      state.gameOver = true;
      setMessage(`Out of tries. The word was ${state.answer}. Press Enter for a new game.`);
      recordGame({
        won: false,
        attempts: ROWS,
        answer: state.answer,
        guesses: state.guesses.slice(0, ROWS),
        starter: state.starter || state.guesses[0] || ""
      });
      renderStats();
      openStatsModal();
    } else {
      setMessage("Keep going.");
    }
  }
}

async function revealRowEvaluation(rowIndex, guess, evaluation) {
  const row = gridEl.children[rowIndex];
  if (!row) {
    return;
  }

  for (let i = 0; i < COLS; i += 1) {
    const cell = row.children[i];
    cell.classList.remove("correct", "present", "absent", "flip");
    cell.style.animationDelay = `${i * FLIP_STAGGER_MS}ms`;
    cell.classList.add("flip");

    const revealAt = i * FLIP_STAGGER_MS + Math.floor(FLIP_DURATION_MS / 2);
    setTimeout(() => {
      cell.classList.add(evaluation[i]);
      setKeyState(guess[i], evaluation[i]);
      applyKeyboardStyles();
    }, revealAt);

    const cleanupAt = i * FLIP_STAGGER_MS + FLIP_DURATION_MS;
    setTimeout(() => {
      cell.classList.remove("flip");
      cell.style.animationDelay = "";
    }, cleanupAt);
  }

  await delay(FLIP_STAGGER_MS * (COLS - 1) + FLIP_DURATION_MS + 20);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateWordWithApis(word) {
  if (VALID_WORDS.has(word)) {
    return true;
  }

  if (wordValidationCache.has(word)) {
    return wordValidationCache.get(word);
  }

  for (const baseUrl of DICTIONARY_ENDPOINTS) {
    try {
      const valid = await checkDictionaryEndpoint(baseUrl, word);
      if (valid) {
        wordValidationCache.set(word, true);
        return true;
      }
    } catch (err) {
      // Try the next provider.
    }
  }

  wordValidationCache.set(word, false);
  return false;
}

async function checkDictionaryEndpoint(baseUrl, word) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORD_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${word.toLowerCase()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    if (baseUrl.includes("freedictionaryapi.com")) {
      return Boolean(data && Array.isArray(data.entries) && data.entries.length > 0);
    }

    if (baseUrl.includes("dictionaryapi.dev")) {
      return Array.isArray(data) && data.length > 0 && !data.title;
    }

    if (baseUrl.includes("datamuse.com")) {
      return Array.isArray(data) && data.some((entry) => entry.word && entry.word.toLowerCase() === word.toLowerCase());
    }

    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function renderGridSkeleton() {
  gridEl.innerHTML = "";

  for (let r = 0; r < ROWS; r += 1) {
    const row = document.createElement("div");
    row.className = "grid-row";

    for (let c = 0; c < COLS; c += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      row.appendChild(cell);
    }

    gridEl.appendChild(row);
  }
}

function renderKeyboard() {
  const row1 = document.getElementById("row-1");
  const row2 = document.getElementById("row-2");
  const row3 = document.getElementById("row-3");

  row1.innerHTML = "";
  row2.innerHTML = "";
  row3.innerHTML = "";

  addKeyRow(row1, "QWERTYUIOP");
  addKeyRow(row2, "ASDFGHJKL");
  addKey(row3, "ENTER", true);
  addKeyRow(row3, "ZXCVBNM");
  addKey(row3, "BACKSPACE", true, "DEL");
}

function addKeyRow(container, letters) {
  for (const letter of letters) {
    addKey(container, letter);
  }
}

function addKey(container, value, wide = false, labelOverride = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `key${wide ? " wide" : ""}`;
  button.dataset.key = value;
  button.textContent = labelOverride || value;
  button.addEventListener("click", () => handleInput(value));
  container.appendChild(button);
}

function setKeyState(letter, incomingStatus) {
  const priority = { absent: 1, present: 2, correct: 3 };
  const current = state.keyboardState[letter] || "";
  if (!current || priority[incomingStatus] > priority[current]) {
    state.keyboardState[letter] = incomingStatus;
  }
}

function applyKeyboardStyles() {
  const keys = keyboardEl.querySelectorAll(".key");
  keys.forEach((keyEl) => {
    const key = keyEl.dataset.key;
    if (!/^[A-Z]$/.test(key)) {
      return;
    }

    keyEl.classList.remove("correct", "present", "absent");
    const status = state.keyboardState[key];
    if (status) {
      keyEl.classList.add(status);
    }
  });
}

function setMessage(text) {
  messageEl.textContent = text;
}

function getRandomWord(wordBank) {
  const idx = Math.floor(Math.random() * wordBank.length);
  return wordBank[idx];
}

function pickAdaptiveWord(wordBank, difficultMode) {
  const stats = loadStats();
  const profile = buildGuessProfile(stats.games);
  const starter = getMostFrequentStarter(stats);
  const hasEnoughStarterData = starter && stats.games.length >= MIN_GAMES_FOR_STARTER_MODEL;
  const hasEnoughProfileData = profile.totalGuesses >= MIN_GUESSES_FOR_PROFILE_MODEL;

  if (!hasEnoughStarterData && !hasEnoughProfileData) {
    return getRandomWord(wordBank);
  }

  const scored = wordBank.map((word) => ({
    word,
    score: scoreWordForPlayerProfile(word, starter, profile, difficultMode)
  }));

  scored.sort((a, b) => b.score - a.score);
  const topSlice = scored.slice(0, Math.min(difficultMode ? 4 : 10, scored.length));
  return topSlice[Math.floor(Math.random() * topSlice.length)].word;
}

function getMostFrequentStarter(stats) {
  if (!stats || !Array.isArray(stats.games) || stats.games.length === 0) {
    return "";
  }

  const counts = {};
  for (const game of stats.games) {
    const starter = (game && typeof game.starter === "string" ? game.starter : "").toUpperCase();
    if (starter.length === COLS) {
      counts[starter] = (counts[starter] || 0) + 1;
    }
  }

  let bestWord = "";
  let bestCount = 0;
  for (const [word, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestWord = word;
      bestCount = count;
    }
  }

  return bestWord;
}

function scoreWordForPlayerProfile(word, starter, profile, difficultMode) {
  const uniqueStarter = new Set(starter.split(""));
  const shared = new Set(word.split("").filter((ch) => uniqueStarter.has(ch))).size;
  const uniqueLetters = new Set(word.split("")).size;
  const hasDuplicate = uniqueLetters < COLS ? 1 : 0;
  const letters = word.split("");
  let letterAffinity = 0;
  let positionAffinity = 0;

  for (let i = 0; i < COLS; i += 1) {
    const ch = letters[i];
    letterAffinity += profile.letterCounts[ch] || 0;
    positionAffinity += profile.positionCounts[i][ch] || 0;
  }

  if (!difficultMode) {
    // Normal mode leans into the player's learned tendencies.
    return shared * 6 + letterAffinity * 1.2 + positionAffinity * 2.2 + uniqueLetters;
  }

  // Hard mode counters the player's tendencies and raises ambiguity.
  return (
    (COLS - shared) * 7 +
    (profile.totalGuesses * 0.35 - letterAffinity) * 1.3 +
    (profile.totalGuesses * 0.2 - positionAffinity) * 1.8 +
    hasDuplicate * 3 +
    (COLS - uniqueLetters)
  );
}

function buildGuessProfile(games) {
  const profile = {
    letterCounts: {},
    positionCounts: Array.from({ length: COLS }, () => ({})),
    totalGuesses: 0
  };

  if (!Array.isArray(games)) {
    return profile;
  }

  for (const game of games) {
    if (!game || !Array.isArray(game.guesses)) {
      continue;
    }

    for (const guess of game.guesses) {
      if (typeof guess !== "string" || guess.length !== COLS) {
        continue;
      }

      const upper = guess.toUpperCase();
      for (let i = 0; i < COLS; i += 1) {
        const ch = upper[i];
        profile.letterCounts[ch] = (profile.letterCounts[ch] || 0) + 1;
        profile.positionCounts[i][ch] = (profile.positionCounts[i][ch] || 0) + 1;
      }
      profile.totalGuesses += 1;
    }
  }

  return profile;
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { games: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.games)) {
      return { games: [] };
    }
    return parsed;
  } catch (err) {
    return { games: [] };
  }
}

function saveStats(stats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function recordGame(game) {
  const stats = loadStats();
  stats.games.push({
    date: new Date().toISOString(),
    won: game.won,
    attempts: game.attempts,
    answer: game.answer,
    guesses: game.guesses,
    starter: game.starter || ""
  });

  if (stats.games.length > 250) {
    stats.games = stats.games.slice(-250);
  }

  saveStats(stats);
}

function getWinRate() {
  const stats = loadStats();
  if (stats.games.length === 0) {
    return 0;
  }
  const wins = stats.games.filter((g) => g.won).length;
  return wins / stats.games.length;
}

function adjustWordSelection() {
  const stats = loadStats();
  const totalGames = stats.games.length;
  if (totalGames < MIN_GAMES_FOR_HARD) {
    return false;
  }
  const winRate = getWinRate();
  return winRate > HARD_WIN_RATE_THRESHOLD;
}

function renderStats() {
  const stats = loadStats();
  const gamesPlayed = stats.games.length;
  const wins = stats.games.filter((g) => g.won).length;
  const winRate = gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0;
  const difficultMode = adjustWordSelection();
  const starter = getMostFrequentStarter(stats) || "-";
  const profile = buildGuessProfile(stats.games);
  const learningState = profile.totalGuesses >= MIN_GUESSES_FOR_PROFILE_MODEL ? "On" : "Building";

  statsEl.textContent = `Games: ${gamesPlayed} | Win rate: ${winRate}% | Mode: ${difficultMode ? "Hard" : "Normal"} | Learn: ${learningState} (${profile.totalGuesses}) | Starter: ${starter}`;
}

function openStatsModal() {
  const stats = loadStats();
  const gamesPlayed = stats.games.length;
  const wins = stats.games.filter((g) => g.won).length;
  const winRate = gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0;
  const currentStreak = getCurrentWinStreak(stats.games);
  const distribution = getWinDistributionByRow(stats.games);

  gamesPlayedEl.textContent = String(gamesPlayed);
  roundsWonEl.textContent = String(wins);
  winRateEl.textContent = `${winRate}%`;
  currentStreakEl.textContent = String(currentStreak);
  renderGuessDistribution(distribution);

  statsModalEl.classList.remove("hidden");
  statsModalEl.setAttribute("aria-hidden", "false");
}

function closeStatsModal() {
  if (!statsModalEl) {
    return;
  }
  statsModalEl.classList.add("hidden");
  statsModalEl.setAttribute("aria-hidden", "true");
}

function getCurrentWinStreak(games) {
  let streak = 0;
  for (let i = games.length - 1; i >= 0; i -= 1) {
    if (games[i] && games[i].won) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function getWinDistributionByRow(games) {
  const totals = Array(ROWS).fill(0);
  for (const game of games) {
    if (game && game.won && Number.isInteger(game.attempts) && game.attempts >= 1 && game.attempts <= ROWS) {
      totals[game.attempts - 1] += 1;
    }
  }
  return totals;
}

function renderGuessDistribution(distribution) {
  if (!guessDistributionEl) {
    return;
  }

  guessDistributionEl.innerHTML = "";
  const maxCount = Math.max(1, ...distribution);

  for (let i = 0; i < ROWS; i += 1) {
    const row = document.createElement("div");
    row.className = "distribution-row";

    const label = document.createElement("span");
    label.className = "distribution-label";
    label.textContent = String(i + 1);

    const bar = document.createElement("div");
    bar.className = "distribution-bar";
    bar.textContent = String(distribution[i]);
    const widthPercent = Math.max(12, Math.round((distribution[i] / maxCount) * 100));
    bar.style.width = `${widthPercent}%`;
    if (distribution[i] > 0) {
      bar.style.background = "#538d4e";
    }

    row.appendChild(label);
    row.appendChild(bar);
    guessDistributionEl.appendChild(row);
  }
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();

  if (key === "ENTER") {
    event.preventDefault();
    handleInput("ENTER");
    return;
  }

  if (key === "BACKSPACE") {
    event.preventDefault();
    handleInput("BACKSPACE");
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    handleInput(key);
  }
});

document.getElementById("new-game-btn").addEventListener("click", initGame);
document.getElementById("close-stats-btn").addEventListener("click", closeStatsModal);
document.getElementById("play-again-btn").addEventListener("click", initGame);

initGame();
