function createGrid() {
  const grid = Array(4).fill(null).map(() => Array(4).fill(0));
  let added = 0;
  while (added < 2) {
    const r = Math.floor(Math.random() * 4);
    const c = Math.floor(Math.random() * 4);
    if (grid[r][c] === 0) {
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
      added++;
    }
  }
  return grid;
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

function addRandomTile(grid) {
  const newGrid = cloneGrid(grid);
  const emptyCells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (newGrid[r][c] === 0) {
        emptyCells.push({ r, c });
      }
    }
  }
  
  if (emptyCells.length > 0) {
    const idx = Math.floor(Math.random() * emptyCells.length);
    const cell = emptyCells[idx];
    newGrid[cell.r][cell.c] = Math.random() < 0.9 ? 2 : 4;
  }
  
  return newGrid;
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

module.exports = {
  createGrid,
  move,
  addRandomTile,
  isGameOver,
  getLargestTile,
  cloneGrid
};
