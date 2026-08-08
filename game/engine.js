(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Mulberry32 PRNG
  // Takes an integer state, returns { value: float [0, 1), nextState: integer }
  function mulberry32(a) {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return { value, nextState: a };
  }

  function cloneGrid(grid) {
    return grid.map(row => [...row]);
  }

  function getLargestTile(grid) {
    let max = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] > max) max = grid[r][c];
      }
    }
    return max;
  }

  function slide(row) {
    const arr = row.filter(val => val !== 0);
    const missing = 4 - arr.length;
    const zeros = Array(missing).fill(0);
    return arr.concat(zeros);
  }

  function merge(row) {
    let score = 0;
    for (let i = 0; i < 3; i++) {
      if (row[i] !== 0 && row[i] === row[i+1]) {
        row[i] = row[i] * 2;
        row[i+1] = 0;
        score += row[i];
      }
    }
    return { row, score };
  }

  function operate(row) {
    let r = slide(row);
    const mergeResult = merge(r);
    r = slide(mergeResult.row);
    return { row: r, score: mergeResult.score };
  }

  function transpose(grid) {
    const newGrid = Array(4).fill(null).map(() => Array(4).fill(0));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        newGrid[c][r] = grid[r][c];
      }
    }
    return newGrid;
  }

  function reverseRows(grid) {
    const newGrid = Array(4).fill(null).map(() => Array(4).fill(0));
    for (let r = 0; r < 4; r++) {
      newGrid[r] = grid[r].slice().reverse();
    }
    return newGrid;
  }

  // move returns { grid, score, moved }
  // Notice it does NOT add a random tile. That is done explicitly.
  function move(grid, direction) {
    let newGrid = cloneGrid(grid);
    let score = 0;
    
    if (direction === 'up' || direction === 'down') {
      newGrid = transpose(newGrid);
    }
    if (direction === 'right' || direction === 'down') {
      newGrid = reverseRows(newGrid);
    }
    
    for (let r = 0; r < 4; r++) {
      const res = operate(newGrid[r]);
      newGrid[r] = res.row;
      score += res.score;
    }
    
    if (direction === 'right' || direction === 'down') {
      newGrid = reverseRows(newGrid);
    }
    if (direction === 'up' || direction === 'down') {
      newGrid = transpose(newGrid);
    }
    
    const moved = JSON.stringify(grid) !== JSON.stringify(newGrid);
    return { grid: newGrid, score, moved };
  }

  function addRandomTile(grid, rngState) {
    const newGrid = cloneGrid(grid);
    const emptyCells = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (newGrid[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }
    
    let currentState = rngState;
    
    if (emptyCells.length > 0) {
      // 1. Pick a random index
      const { value: v1, nextState: s1 } = mulberry32(currentState);
      const idx = Math.floor(v1 * emptyCells.length);
      const cell = emptyCells[idx];
      
      // 2. Pick the value (2 or 4)
      const { value: v2, nextState: s2 } = mulberry32(s1);
      newGrid[cell.r][cell.c] = v2 < 0.9 ? 2 : 4;
      
      currentState = s2;
    }
    
    return { grid: newGrid, rngState: currentState };
  }

  function createGrid(seed) {
    let grid = Array(4).fill(null).map(() => Array(4).fill(0));
    let currentState = seed;
    
    // Add two random tiles
    const res1 = addRandomTile(grid, currentState);
    grid = res1.grid;
    currentState = res1.rngState;
    
    const res2 = addRandomTile(grid, currentState);
    grid = res2.grid;
    currentState = res2.rngState;
    
    return { grid, rngState: currentState };
  }

  function isGameOver(grid) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] === 0) return false;
        if (c < 3 && grid[r][c] === grid[r][c+1]) return false;
        if (r < 3 && grid[r][c] === grid[r+1][c]) return false;
      }
    }
    return true;
  }

  return {
    createGrid,
    move,
    addRandomTile,
    isGameOver,
    getLargestTile,
    cloneGrid,
    mulberry32
  };
});
