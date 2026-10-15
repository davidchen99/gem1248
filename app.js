(() => {
  'use strict';
  const E = window.GemEngine;
  const $ = id => document.getElementById(id);
  const ART = [
    ['01-encore', '紫色安可'], ['02-jersey', '蓝色球衣'],
    ['03-denim', '丹宁少女'], ['04-rock', '白色摇滚'],
    ['05-camo', '迷彩酷野'], ['06-duchess', '白色女爵'],
    ['07-glory', '黑金荣耀'], ['09-tianjin-crystal', '流光闪钻'],
    ['06-duchess', '白金返场'], ['10-red-regalia', '红焰权杖'],
    ['11-gilded-phoenix', '涅槃鎏金'], ['08-bride', '终极 GLORIA']
  ];
  const ENCOURAGEMENT = {
    128: ['YOUR FIRST LITTLE GLORY', '你已经点亮了第一束荣耀。\n每一次小小的坚持，都在让你更闪耀。'],
    256: ['A BRIGHTER GLORIA', '你把微光，合成了更亮的自己。\n勇敢再往前一步，荣耀正在靠近。'],
    512: ['THE STAGE IS YOURS', '舞台上的光，已经为你亮起。\n坚持到这里的你，值得一场掌声。'],
    1024: ['ONE STEP TO GLORIA', '只差一步，就能点亮整座舞台。\n慢慢想，稳稳走，你的荣耀就在眼前。'],
    2048: ['I AM GLORIA', '你点亮了属于自己的 GLORIA！\n每一份坚持，都在这一刻闪耀。']
  };
  const STORAGE = 'gem1248-v1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tileLayer = $('tile-layer');
  const MOVE_MS = 100;
  const inputQueue = [];
  let tiles = new Map(), boardGeometry, animationFrame, finishActiveMove, uiTimer;
  let state, best = 0, discovered = 1, previous = null;
  let sound = false, audio, moving = false, pendingMilestone = null, gesture = null, toastTimer;
  const source = level => 'assets/' + ART[Math.min(level, 11)][0] + '.webp';
  const levelOf = value => Math.min(11, Math.round(Math.log2(value)));
  const maximum = board => Math.max(1, ...board);
  const validBoard = board => Array.isArray(board) && board.length === 16 && board.every(
    value => Number.isSafeInteger(value) && value >= 0 && (value === 0 || (Math.log2(value) % 1 === 0 && value <= 2 ** 30))
  );
  const validSnapshot = snapshot => snapshot && validBoard(snapshot.board) && snapshot.board.some(Boolean)
    && Number.isSafeInteger(snapshot.score) && snapshot.score >= 0
    && Number.isSafeInteger(snapshot.moves) && snapshot.moves >= 0;
  const validMilestone = value => Number.isSafeInteger(value) && value >= 128 && Math.log2(value) % 1 === 0;
  const uniqueMilestones = values => [...new Set(values.filter(validMilestone))].sort((a, b) => a - b);
  function restoreSnapshot(saved) {
    const { celebrated128, ...rest } = saved;
    let celebratedValues;
    if (Array.isArray(saved.celebratedValues)) {
      celebratedValues = uniqueMilestones(saved.celebratedValues);
    } else {
      // Older saves resume with already-reached tiers acknowledged, never replaying
      // celebrations on load. The old flag also survives a pre-128 undo snapshot.
      celebratedValues = [];
      for (let value = 128; value <= maximum(saved.board); value *= 2) celebratedValues.push(value);
      if (celebrated128 === true) celebratedValues.push(128);
      celebratedValues = uniqueMilestones(celebratedValues);
    }
    return { ...rest, board: saved.board.slice(), won: saved.won === true, celebratedValues };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE));
      if (!saved) return;
      if (Number.isSafeInteger(saved.best) && saved.best >= 0) best = saved.best;
      if (Number.isSafeInteger(saved.discovered) && saved.discovered > 0) discovered = saved.discovered;
      sound = saved.sound === true;
      if (validSnapshot(saved.state)) {
        state = restoreSnapshot(saved.state);
        if (validSnapshot(saved.previous)) previous = restoreSnapshot(saved.previous);
      }
    } catch { /* A browser may disable storage. The game still works. */ }
  }
  function save() {
    // Persist the move immediately, even while the score display waits for the
    // first animation frame. Reloading or backgrounding never loses a swipe.
    try { localStorage.setItem(STORAGE, JSON.stringify({ state, best: Math.max(best, state.score), discovered: Math.max(discovered, maximum(state.board)), previous, sound })); }
    catch { /* Storage is optional. */ }
  }
  function snapshot() { return { ...state, board: state.board.slice(), celebratedValues: state.celebratedValues.slice() }; }
  function announce(text) { $('announcer').textContent = text; }
  function toast(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 1900);
  }
  function openDialog(id) {
    flushInput();
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }
  function flushInput() { inputQueue.length = 0; gesture = null; }
  function blocked() { return document.hidden || pendingMilestone || !$('overlay').hidden || !!document.querySelector('dialog[open]'); }
  function showPendingMilestone() {
    if (!pendingMilestone || moving || document.hidden || !$('overlay').hidden || document.querySelector('dialog[open]')) return false;
    const { values, win } = pendingMilestone;
    const value = values[values.length - 1], next = value * 2, level = levelOf(value);
    const [kicker, copy] = ENCOURAGEMENT[value] || ['BEYOND THE GLORY', '你又突破了自己的小小纪录。\n荣耀没有终点，继续闪耀吧！'];
    $('milestone-dialog').dataset.value = value;
    $('milestone-image').src = source(level);
    $('milestone-image').alt = `邓紫棋 I AM GLORIA ${ART[level][1]} Q 版造型`;
    $('milestone-number').textContent = value;
    $('milestone-number').classList.toggle('large-number', value >= 16384);
    $('milestone-kicker').textContent = win ? 'I AM GLORIA' : kicker;
    $('milestone-title').textContent = win ? `${value} 荣耀通关！` : `已合成 ${value}！`;
    $('milestone-copy').textContent = win && value !== 2048 ? `2048 荣耀已点亮！\n${copy}` : copy;
    $('milestone-values').textContent = '首次点亮 ' + values.join(' · ');
    $('milestone-values').hidden = values.length < 2;
    $('milestone-next').textContent = win ? `整座舞台因你闪耀，再向 ${next} 出发！` : `小紫棋陪你，继续向 ${next} 出发！`;
    $('milestone-continue').textContent = win ? `继续挑战 ${next}` : `继续闪耀，向 ${next} 出发`;
    pendingMilestone = null;
    openDialog('milestone-dialog');
    $('milestone-continue').focus({ preventScroll: true });
    announce(`首次合成${values.join('、')}！${copy.replace(/\n/g, '')}继续向${next}出发！`);
    return true;
  }

  function measureBoard(width, height) {
    // Geometry changes on resize/orientation, never during the swipe loop.
    const gap = parseFloat(getComputedStyle(tileLayer).getPropertyValue('--gap')) || 0;
    boardGeometry = { x: (width + gap) / 4, y: (height + gap) / 4 };
    for (const tile of tiles.values()) positionTile(tile, tile.positionIndex);
  }
  function positionTile(tile, index) {
    const x = (index % 4) * boardGeometry.x, y = Math.floor(index / 4) * boardGeometry.y;
    tile.positionIndex = index;
    if (tile.positionX !== x || tile.positionY !== y) {
      tile.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      tile.positionX = x; tile.positionY = y;
    }
  }
  function updateTile(tile, value, index) {
    const level = levelOf(value);
    const valueChanged = tile.dataset.value !== String(value);
    const indexChanged = tile.dataset.index !== String(index);
    if (valueChanged) {
      tile.dataset.level = level;
      tile.dataset.value = value;
      tile.firstElementChild.src = source(level);
      tile.lastElementChild.textContent = value;
    }
    if (indexChanged) tile.dataset.index = index;
    if (valueChanged || indexChanged) tile.setAttribute('aria-label', `${value}，${ART[level][1]}，第 ${Math.floor(index / 4) + 1} 行第 ${index % 4 + 1} 列`);
    positionTile(tile, index);
  }
  function createTile(value, index) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('role', 'gridcell');
    const img = document.createElement('img');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.width = 512; img.height = 512;
    const number = document.createElement('span');
    number.className = 'tile-value';
    tile.append(img, number);
    updateTile(tile, value, index);
    return tile;
  }
  function resetTileAnimation(tile) {
    if (tile.className !== 'tile') tile.className = 'tile';
    if (tile.style.zIndex) tile.style.zIndex = '';
  }
  function renderBoard() {
    const nextTiles = new Map();
    state.board.forEach((value, index) => {
      if (!value) return;
      let tile = tiles.get(index);
      if (tile) { resetTileAnimation(tile); updateTile(tile, value, index); }
      else { tile = createTile(value, index); tileLayer.append(tile); }
      nextTiles.set(index, tile);
    });
    for (const [index, tile] of tiles) if (!nextTiles.has(index)) tile.remove();
    tiles = nextTiles;
  }
  function settleBoard(result, spawned) {
    const nextTiles = new Map();
    for (const step of result.moves) {
      const tile = tiles.get(step.from);
      resetTileAnimation(tile);
      if (nextTiles.has(step.to)) { tile.remove(); continue; }
      updateTile(tile, result.board[step.to], step.to);
      nextTiles.set(step.to, tile);
    }
    if (spawned.index >= 0) {
      const tile = createTile(spawned.value, spawned.index);
      tileLayer.append(tile);
      nextTiles.set(spawned.index, tile);
    }
    tiles = nextTiles;
  }
  function lookCard(level, full) {
    const value = 2 ** level;
    const card = document.createElement(full ? 'div' : 'button');
    if (!full) { card.type = 'button'; card.addEventListener('click', () => openDialog('collection-dialog')); }
    const unlocked = value <= discovered;
    card.className = 'look-card' + (unlocked ? ' unlocked' : ' locked');
    card.dataset.level = level;
    card.setAttribute('aria-label', `${value} ${ART[level][1]}${unlocked ? '，已解锁' : '，尚未解锁'}`);
    const img = document.createElement('img');
    img.src = source(level); img.alt = ''; img.loading = 'lazy'; img.draggable = false;
    const number = document.createElement('strong'); number.textContent = value;
    const name = document.createElement('small'); name.textContent = ART[level][1];
    const badge = document.createElement('span'); badge.className = 'look-status'; badge.textContent = unlocked ? '✦' : '·';
    card.append(img, number, name, badge);
    return card;
  }
  function renderCollection() {
    if (!$('lookbook').childElementCount) $('lookbook').append(...ART.slice(0, 8).map((_, i) => lookCard(i, false)));
    if (!$('collection-grid').childElementCount) $('collection-grid').append(...ART.map((_, i) => lookCard(i, true)));
    for (const card of document.querySelectorAll('.look-card')) {
      const level = Number(card.dataset.level), unlocked = 2 ** level <= discovered;
      if (card.classList.contains('unlocked') === unlocked) continue;
      card.classList.toggle('unlocked', unlocked); card.classList.toggle('locked', !unlocked);
      card.setAttribute('aria-label', `${2 ** level} ${ART[level][1]}${unlocked ? '，已解锁' : '，尚未解锁'}`);
      card.querySelector('.look-status').textContent = unlocked ? '✦' : '·';
    }
    const count = $('collection-count');
    if (count) count.textContent = `${Math.min(12, Math.floor(Math.log2(discovered)) + 1)} / 12`;
  }
  function updateUI() {
    best = Math.max(best, state.score);
    const top = maximum(state.board);
    const newDiscovery = top > discovered;
    discovered = Math.max(discovered, top);
    $('score').textContent = state.score;
    $('best').textContent = best;
    $('moves').textContent = state.moves;
    $('highest').textContent = top;
    $('progress-fill').style.width = Math.min(100, Math.log2(top) / 11 * 100) + '%';
    const currentSource = source(levelOf(top));
    if ($('current-look').getAttribute('src') !== currentSource) {
      $('current-look').src = currentSource;
    }
    const currentName = ART[levelOf(top)][1];
    if ($('current-look-name').textContent !== currentName) {
      $('current-look').alt = currentName + ' Q 版造型';
      $('current-look-name').textContent = currentName;
    }
    $('undo-btn').disabled = !previous || moving;
    $('sound-btn').setAttribute('aria-pressed', String(sound));
    $('sound-btn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
    $('sound-btn').classList.toggle('active', sound);
    if ($('sound-path')) $('sound-path').setAttribute('d', sound ? 'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
    $('board').setAttribute('aria-label', `GEM1248 合成棋盘，得分 ${state.score}，最大方块 ${top}。滑动或方向键移动。`);
    if (newDiscovery) renderCollection();
  }
  function playTone(value, merged) {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ||= new Audio();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const osc = audio.createOscillator(), gain = audio.createGain();
      const time = audio.currentTime;
      const note = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66][levelOf(value)];
      osc.type = 'sine'; osc.frequency.setValueAtTime(merged ? note : 220, time);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.08, time + .015);
      gain.gain.exponentialRampToValueAtTime(.001, time + (merged ? .21 : .07));
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(time); osc.stop(time + .23);
    } catch { /* Sound cannot prevent a move. */ }
  }
  function overlay(kind) {
    flushInput();
    const win = kind === 'win';
    $('overlay').dataset.kind = kind;
    $('overlay-title').textContent = win ? '你的 GLORIA 时刻 ✦' : '这一场，也很闪耀';
    $('overlay-copy').textContent = win ? '成功合成 2048！终极造型已解锁。' : '棋盘满了，已经没有可以合成的方块。';
    $('overlay-score').textContent = state.score;
    $('overlay-primary').textContent = win ? '继续挑战' : '再开一场';
    $('overlay-secondary').textContent = win ? '再开一场' : '撤回一步';
    $('overlay-secondary').hidden = !win && !previous;
    $('overlay').hidden = false;
    $('overlay-primary').focus({ preventScroll: true });
    announce(win ? '恭喜！合成2048，可继续挑战。' : `本场结束，得分${state.score}。`);
  }
  function checkEnd() {
    if (E.isWon(state.board) && !state.won) {
      state.won = true; save(); overlay('win');
    } else if (!E.canMove(state.board)) overlay('over');
  }
  function move(direction) {
    if (blocked()) return;
    if (moving) {
      // Two intentional quick swipes can wait for the current transition. A
      // bounded queue stays responsive without a long chain of automatic moves.
      if (inputQueue.length < 2) inputQueue.push(direction);
      return;
    }
    const result = E.move(state.board, direction);
    if (!result.changed) return;
    previous = snapshot();
    const spawned = E.addRandomTile(result.board);
    const newValues = uniqueMilestones(result.merged.map(index => result.board[index]))
      .filter(value => !state.celebratedValues.includes(value));
    const firstWin = !state.won && newValues.includes(2048);
    state = {
      board: spawned.board, score: state.score + result.score, moves: state.moves + 1, won: state.won || firstWin,
      celebratedValues: uniqueMilestones([...state.celebratedValues, ...newValues])
    };
    pendingMilestone = newValues.length ? { values: newValues, win: firstWin } : null;
    moving = true;
    $('undo-btn').disabled = true;
    save();
    const finish = () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(uiTimer);
      finishActiveMove = null;
      settleBoard(result, spawned);
      moving = false; updateUI();
      if (result.score > 0) announce(`合成得分加${result.score}，当前得分${state.score}，最大方块${maximum(state.board)}。`);
      // Finish the encouragement before presenting a win or a full-board ending.
      // A help/lookbook dialog opened during animation takes priority until closed.
      if (document.hidden) { flushInput(); return; }
      if (pendingMilestone) { flushInput(); showPendingMilestone(); return; }
      checkEnd();
      while (inputQueue.length && !moving && !blocked()) move(inputQueue.shift());
    };
    finishActiveMove = finish;
    if (reduced) { playTone(result.score ? maximum(result.board) : 1, result.score > 0); finish(); return; }
    for (const step of result.moves) {
      const tile = tiles.get(step.from);
      resetTileAnimation(tile);
      if (step.from !== step.to) tile.classList.add('sliding');
      if (step.merged) tile.style.zIndex = '3';
    }
    animationFrame = requestAnimationFrame(start => {
      for (const step of result.moves) positionTile(tiles.get(step.from), step.to);
      // Submit transforms before changing the surrounding score/lookbook UI.
      uiTimer = setTimeout(() => {
        updateUI();
        playTone(result.score ? maximum(result.board) : 1, result.score > 0);
      }, 0);
      const tick = time => {
        if (time - start >= MOVE_MS + 12) finish();
        else animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    });
  }
  function undo() {
    flushInput();
    if (!previous || moving || pendingMilestone || document.querySelector('dialog[open]')) return;
    const celebratedValues = uniqueMilestones([...state.celebratedValues, ...previous.celebratedValues]);
    const won = state.won || previous.won;
    state = { ...previous, board: previous.board.slice(), celebratedValues, won }; previous = null;
    $('overlay').hidden = true;
    renderBoard(); updateUI(); save();
    $('board').focus({ preventScroll: true });
    toast('已撤回一步'); announce('已撤回一步，当前得分' + state.score);
  }
  function newGame() {
    flushInput();
    if (moving) return;
    pendingMilestone = null;
    state = { board: E.startBoard(), score: 0, moves: 0, won: false, celebratedValues: [] };
    previous = null; $('overlay').hidden = true;
    renderBoard(); updateUI(); save();
    $('board').focus({ preventScroll: true });
    announce('新的一场演出开始。');
  }

  load();
  if (!state) state = { board: E.startBoard(), score: 0, moves: 0, won: false, celebratedValues: [] };
  discovered = Math.max(discovered, maximum(state.board));
  const initialRect = tileLayer.getBoundingClientRect();
  measureBoard(initialRect.width, initialRect.height);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      measureBoard(width, height);
    }).observe(tileLayer);
  } else window.addEventListener('resize', () => {
    const { width, height } = tileLayer.getBoundingClientRect();
    measureBoard(width, height);
  }, { passive: true });
  renderCollection(); renderBoard(); updateUI(); save();
  checkEnd();
  // Warm every distinct costume (including late-game tiers) once. Predecoded
  // assets are reused by surviving tiles instead of replacing all their images.
  const preloadImages = [...new Set(ART.map((_, i) => source(i)))].map(src => {
    const image = new Image(); image.decoding = 'async'; image.src = src;
    if (image.decode) image.decode().catch(() => {});
    return image;
  });

  $('new-game-btn').addEventListener('click', () => {
    flushInput();
    if (moving) return;
    if (state.moves > 0) openDialog('restart-dialog'); else newGame();
  });
  $('confirm-restart').addEventListener('click', () => { $('restart-dialog').close(); newGame(); });
  $('undo-btn').addEventListener('click', undo);
  $('help-btn').addEventListener('click', () => openDialog('help-dialog'));
  $('collection-btn').addEventListener('click', () => openDialog('collection-dialog'));
  $('sound-btn').addEventListener('click', () => {
    sound = !sound; updateUI(); save(); playTone(4, true);
    toast(sound ? '合成音效已开启' : '合成音效已关闭');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    } });
    dialog.addEventListener('close', () => {
      flushInput();
      // Closing a restart confirmation can immediately start a new game. Wait
      // for its click handler to reset the pending milestone before reopening.
      setTimeout(() => {
        if (pendingMilestone) { showPendingMilestone(); return; }
        if (dialog.id === 'milestone-dialog') {
          $('board').focus({ preventScroll: true });
          checkEnd();
        }
      }, 0);
    });
  });
  $('overlay-primary').addEventListener('click', () => {
    if ($('overlay').dataset.kind === 'win') {
      $('overlay').hidden = true; $('board').focus({ preventScroll: true }); checkEnd();
    } else newGame();
  });
  $('overlay-secondary').addEventListener('click', () => $('overlay').dataset.kind === 'win' ? newGame() : undo());

  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const direction = keys[event.key] || keys[event.key.toLowerCase()];
    if (!direction || blocked()) return;
    event.preventDefault(); move(direction);
  });
  $('board').addEventListener('pointerdown', event => {
    // A second finger cancels the active gesture, so a pinch or stray touch
    // cannot accidentally turn into a game move when the first finger lifts.
    if (gesture || event.isPrimary === false) { gesture = null; return; }
    if (blocked() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    $('board').setPointerCapture(event.pointerId);
    $('board').focus({ preventScroll: true });
  });
  $('board').addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
  });
  ['pointercancel', 'lostpointercapture'].forEach(type => $('board').addEventListener(type, () => { gesture = null; }));
  document.addEventListener('visibilitychange', () => {
    flushInput();
    if (document.hidden) { if (finishActiveMove) finishActiveMove(); save(); }
    else if (pendingMilestone) showPendingMilestone();
    else if (!document.querySelector('dialog[open]') && $('overlay').hidden) checkEnd();
  });
  document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => move(button.dataset.direction)));
})();
