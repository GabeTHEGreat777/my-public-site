Original prompt: Generate a browser-based Wordle-style game in HTML/CSS/JS with 5x6 grid, word list array, keyboard + on-screen input, color feedback, responsive layout, required functions, localStorage scoring history, and adaptive difficulty based on win rate.

- Initialized task and loaded develop-web-game skill.
- Implemented index.html, style.css, and script.js with required functions and adaptive difficulty.
- Added localStorage game history with win-rate based word-bank switching.
- Updated word validation to use freedictionaryapi.com first, then dictionaryapi.dev and Datamuse fallbacks.
- Added async guess submission guard and request timeout/cache for dictionary lookups.
- Added starter-learning model: records each game's opening guess and detects most frequent starter.
- Word selection now adapts using starter model (normal mode leans into starter letters; hard mode counters that pattern).
- Stats line now shows starter model word.
- Restyled UI to dark Wordle-like layout.
- Added staggered tile flip reveal animation per guess with input lock during reveal.
- Added per-row streak counters in status panel.
- Each row chip now shows total wins on that row (T) and current consecutive streak for that row (S).
- Reorganized UI: moved endgame stats into a modal.
- Streak now appears only in endgame modal with games played, rounds won, win rate, and row distribution graph.
- Strengthened adaptive difficulty: now builds profile from all historical guesses (letters + positions) and counters those patterns in hard mode.
- Added learning status in top stats line: Learn: Building/On with guess count.
