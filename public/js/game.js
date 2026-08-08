const GameManager = (function() {
    let gridElement = null;
    let prevGrid = null;
    let localPlaytimeInterval = null;
    let currentPlaytime = 0;
    let lastMoveDir = null;

    return {
        init(el) {
            gridElement = el;
            gridElement.innerHTML = '';
            for (let i = 0; i < 16; i++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell tile-0';
                gridElement.appendChild(cell);
            }
            prevGrid = null;
        },

        renderGrid(grid) {
            if (prevGrid && JSON.stringify(prevGrid) === JSON.stringify(grid)) return;
            
            const cells = gridElement.children;
            let index = 0;
            
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    const val = grid[r][c];
                    const cell = cells[index];
                    const prevVal = prevGrid ? prevGrid[r][c] : 0;
                    
                    let className = 'grid-cell';
                    if (val === 0) {
                        className += ' tile-0';
                        cell.textContent = '';
                        cell.style.animation = 'none';
                    } else {
                        if (val > 2048) {
                            className += ' tile-super';
                        } else {
                            className += ' tile-' + val;
                        }
                        cell.textContent = val;

                        cell.style.animation = 'none';
                        cell.offsetHeight; // trigger reflow

                        if (prevVal === 0) {
                            className += ' tile-new';
                        } else if (val === prevVal * 2) {
                            className += ' tile-merged';
                        } else if (lastMoveDir && prevVal !== 0 && prevGrid && prevVal !== val) {
                             cell.style.animation = `fake-slide-${lastMoveDir} 0.1s ease-in-out`;
                        } else if (lastMoveDir && prevVal !== 0) {
                             cell.style.animation = `fake-slide-${lastMoveDir} 0.1s ease-in-out`;
                        }
                    }
                    
                    cell.className = className;
                    index++;
                }
            }
            
            // Deep copy grid for next render comparison
            prevGrid = grid.map(row => [...row]);
            // Clear move direction so animations don't replay on reconciliation renders
            lastMoveDir = null;
        },

        updateScore(score) {
            document.getElementById('game-score').textContent = score;
        },

        updateMoves(moves) {
            document.getElementById('game-moves').textContent = moves;
        },

        updatePlaytime(seconds) {
            currentPlaytime = seconds;
            this.renderPlaytime();
        },

        startLocalPlaytime() {
            if (localPlaytimeInterval) clearInterval(localPlaytimeInterval);
            localPlaytimeInterval = setInterval(() => {
                currentPlaytime++;
                this.renderPlaytime();
            }, 1000);
        },

        stopLocalPlaytime() {
            if (localPlaytimeInterval) {
                clearInterval(localPlaytimeInterval);
                localPlaytimeInterval = null;
            }
        },

        renderPlaytime() {
            const m = Math.floor(currentPlaytime / 60).toString().padStart(2, '0');
            const s = (currentPlaytime % 60).toString().padStart(2, '0');
            let display = `${m}:${s}`;
            if (currentPlaytime >= 3600) {
                const h = Math.floor(currentPlaytime / 3600).toString().padStart(2, '0');
                display = `${h}:${display}`;
            }
            document.getElementById('game-playtime').textContent = display;
        },

        setLastMoveDir(dir) {
            lastMoveDir = dir;
        },

        setupKeyboardControls(onMove) {
            document.addEventListener('keydown', (e) => {
                let dir = null;
                switch (e.key) {
                    case 'ArrowUp': dir = 'up'; break;
                    case 'ArrowDown': dir = 'down'; break;
                    case 'ArrowLeft': dir = 'left'; break;
                    case 'ArrowRight': dir = 'right'; break;
                }
                if (dir) {
                    e.preventDefault();
                    onMove(dir);
                }
            });
        },

        setupTouchControls(el, onMove) {
            let startX, startY;
            el.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                e.preventDefault(); // prevent scrolling
            }, {passive: false});

            el.addEventListener('touchend', e => {
                if (!startX || !startY) return;
                let endX = e.changedTouches[0].clientX;
                let endY = e.changedTouches[0].clientY;
                let deltaX = endX - startX;
                let deltaY = endY - startY;

                if (Math.abs(deltaX) < 30 && Math.abs(deltaY) < 30) return;

                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    if (deltaX > 0) onMove('right');
                    else onMove('left');
                } else {
                    if (deltaY > 0) onMove('down');
                    else onMove('up');
                }
                startX = null;
                startY = null;
                e.preventDefault();
            }, {passive: false});
        },

        showTimerBar(remaining, total) {
            const box = document.getElementById('game-timer-box');
            const val = document.getElementById('game-timer-val');
            box.style.display = 'block';
            
            const m = Math.floor(remaining / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            val.textContent = `${m}:${s}`;
            
            // Show popup when timer starts
            const popup = document.getElementById('timer-popup');
            if (remaining === total && total > 0) {
                popup.style.display = 'block';
                setTimeout(() => { popup.style.display = 'none'; }, 4000);
            }
        },

        hideTimerBar() {
            document.getElementById('game-timer-box').style.display = 'none';
            document.getElementById('timer-popup').style.display = 'none';
        },

        setGameOver(title) {
            document.getElementById('game-over-title').textContent = title;
            this.stopLocalPlaytime();
        }
    };
})();
