(function (root, factory) {
  "use strict";
  var engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  if (root) root.GemEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SIZE = 4;
  var CELL_COUNT = SIZE * SIZE;
  var DIRECTIONS = ["left", "right", "up", "down"];

  function checkBoard(board) {
    if (!Array.isArray(board) || board.length !== CELL_COUNT) {
      throw new TypeError("Board must be an array of 16 nonnegative integers.");
    }
    for (var i = 0; i < CELL_COUNT; i += 1) {
      if (!Number.isSafeInteger(board[i]) || board[i] < 0) {
        throw new TypeError("Board must be an array of 16 nonnegative integers.");
      }
    }
  }

  // Indices run from the destination edge toward the opposite edge.
  function lineIndices(direction, line) {
    var indices = [];
    for (var offset = 0; offset < SIZE; offset += 1) {
      if (direction === "left") indices.push(line * SIZE + offset);
      if (direction === "right") indices.push(line * SIZE + SIZE - 1 - offset);
      if (direction === "up") indices.push(offset * SIZE + line);
      if (direction === "down") indices.push((SIZE - 1 - offset) * SIZE + line);
    }
    return indices;
  }

  function move(board, direction) {
    checkBoard(board);
    if (DIRECTIONS.indexOf(direction) === -1) {
      throw new RangeError("Direction must be left, right, up, or down.");
    }
    var nextBoard = new Array(CELL_COUNT).fill(0);
    var score = 0;
    var merged = [];
    var moves = [];

    for (var line = 0; line < SIZE; line += 1) {
      var indices = lineIndices(direction, line);
      var tiles = [];
      for (var position = 0; position < SIZE; position += 1) {
        var source = indices[position];
        if (board[source] !== 0) tiles.push({ from: source, value: board[source] });
      }

      var destination = 0;
      for (var tile = 0; tile < tiles.length; tile += 1) {
        var first = tiles[tile];
        var target = indices[destination];
        var second = tiles[tile + 1];
        var combines = Boolean(second && second.value === first.value);
        nextBoard[target] = combines ? first.value * 2 : first.value;
        moves.push({ from: first.from, to: target, value: first.value, merged: combines });
        if (combines) {
          moves.push({ from: second.from, to: target, value: second.value, merged: true });
          merged.push(target);
          score += nextBoard[target];
          tile += 1;
        }
        destination += 1;
      }
    }

    var changed = nextBoard.some(function (value, index) { return value !== board[index]; });
    return { board: nextBoard, changed: changed, score: score, merged: merged, moves: moves };
  }

  function canMove(board) {
    checkBoard(board);
    for (var i = 0; i < CELL_COUNT; i += 1) {
      if (board[i] === 0) return true;
      var column = i % SIZE;
      var row = Math.floor(i / SIZE);
      if (column < SIZE - 1 && board[i] === board[i + 1]) return true;
      if (row < SIZE - 1 && board[i] === board[i + SIZE]) return true;
    }
    return false;
  }

  function randomUnit(rng) {
    var value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Random function must return a number from 0 inclusive to 1 exclusive.");
    }
    return value;
  }

  function addRandomTile(board, rng) {
    checkBoard(board);
    rng = rng || Math.random;
    var nextBoard = board.slice();
    var empty = [];
    for (var i = 0; i < CELL_COUNT; i += 1) {
      if (nextBoard[i] === 0) empty.push(i);
    }
    if (empty.length === 0) return { board: nextBoard, index: -1, value: 0 };
    var index = empty[Math.floor(randomUnit(rng) * empty.length)];
    var value = randomUnit(rng) < 0.9 ? 1 : 2;
    nextBoard[index] = value;
    return { board: nextBoard, index: index, value: value };
  }

  function startBoard(rng) {
    var empty = new Array(CELL_COUNT).fill(0);
    return addRandomTile(addRandomTile(empty, rng).board, rng).board;
  }

  function isWon(board) {
    checkBoard(board);
    return board.some(function (value) { return value >= 2048; });
  }

  return Object.freeze({
    move: move,
    canMove: canMove,
    addRandomTile: addRandomTile,
    startBoard: startBoard,
    isWon: isWon
  });
});
