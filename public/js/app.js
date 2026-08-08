document.addEventListener('DOMContentLoaded', () => {
    // Application State (kept in closure for anti-cheat)
    const AppState = {
        sessionToken: null,
        roomCode: null,
        playerName: null,
        isAdmin: false,
        gameActive: false
    };

    // DOM Elements
    const screens = document.querySelectorAll('.screen');
    const startError = document.getElementById('start-error');
    const adminError = document.getElementById('admin-error');

    // Current leaderboard data (kept updated for fullscreen view)
    let currentLeaderboardData = [];
    let adminLeaderboardData = [];
    
    // Client-side prediction state
    let currentRngState = null;
    let sequenceNumber = 0;
    let pendingMoves = [];
    let currentGrid = null;

    // Helper to generate and download CSV
    function downloadCSV(data, filename) {
        if (!data || data.length === 0) return;
        const headers = ['Rank', 'Name', 'Score', 'Moves', 'Playtime', 'Largest Tile', 'Status'];
        const rows = data.map((p, idx) => {
            // Check playTime or playtime field depending on formatting
            const playtimeSeconds = p.playtime !== undefined ? p.playtime : (p.playtime_seconds || 0);
            const playtimeStr = LeaderboardManager.formatPlaytime(playtimeSeconds);
            return [
                idx + 1,
                `"${(p.name || '').replace(/"/g, '""')}"`,
                p.score || 0,
                p.moves || 0,
                `"${playtimeStr}"`,
                p.largestTile !== undefined ? p.largestTile : (p.largest_tile || 0),
                p.status || ''
            ];
        });
        
        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Utility: Show Screen
    function showScreen(screenId) {
        screens.forEach(s => s.style.display = 'none');
        document.getElementById(screenId).style.display = 'block';
    }

    // Auto-uppercase room code inputs
    document.getElementById('input-room-code').addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });
    document.getElementById('input-admin-room-code').addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });

    // Check localStorage on page load for reconnection
    async function checkExistingSession() {
        const token = localStorage.getItem('session_token');
        const room = localStorage.getItem('room_code');
        if (token && room) {
            try {
                const res = await fetch('/api/players/reconnect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionToken: token })
                });
                
                const data = await res.json();
                if (data.success) {
                    AppState.sessionToken = token;
                    AppState.roomCode = data.roomCode || room;
                    AppState.playerName = data.playerName;
                    
                    if (data.gameOver) {
                        // Game already over — show game over screen
                        setupSocketConnection();
                        showGameOver({
                            score: data.score,
                            moves: data.moves,
                            playtime: data.playtime,
                            largestTile: data.largestTile,
                            status: data.status,
                            endReason: data.endReason
                        });
                    } else {
                        // Game still active — resume
                        setupGameClient(data);
                    }
                } else {
                    localStorage.removeItem('session_token');
                    localStorage.removeItem('room_code');
                }
            } catch (err) {
                console.error('Reconnection failed:', err);
            }
        }
    }
    checkExistingSession();

    // ===== Start Screen - Join Game =====
    document.getElementById('btn-join').addEventListener('click', async () => {
        const name = document.getElementById('input-player-name').value.trim();
        const room = document.getElementById('input-room-code').value.trim().toUpperCase();

        if (!name) {
            startError.textContent = 'Please enter your name.';
            return;
        }
        if (room.length !== 4) {
            startError.textContent = 'Room code must be 4 characters.';
            return;
        }

        try {
            startError.textContent = '';
            const res = await fetch('/api/players/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, roomCode: room })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to join');
            
            AppState.sessionToken = data.sessionToken;
            AppState.roomCode = room;
            AppState.playerName = data.playerName || name;
            localStorage.setItem('session_token', data.sessionToken);
            localStorage.setItem('room_code', room);

            setupGameClient(data);

        } catch (err) {
            startError.textContent = err.message;
        }
    });

    // ===== Setup socket connection (used by both player and admin) =====
    function setupSocketConnection() {
        if (!SocketManager.socket || !SocketManager.socket.connected) {
            SocketManager.connect();
        }
    }

    // ===== Setup Game Client after joining/reconnecting =====
    function setupGameClient(data) {
        AppState.gameActive = true;
        showScreen('screen-game');
        document.getElementById('game-room-code').textContent = AppState.roomCode;
        
        // Initialize grid
        GameManager.init(document.getElementById('game-grid'));
        
        // Prediction State Init
        currentRngState = data.rngState;
        sequenceNumber = 0;
        pendingMoves = [];
        currentGrid = data.grid;

        // Render initial state from server
        if (currentGrid) GameManager.renderGrid(currentGrid);
        if (data.score !== undefined) GameManager.updateScore(data.score);
        if (data.moves !== undefined) GameManager.updateMoves(data.moves);
        if (data.playtime !== undefined) GameManager.updatePlaytime(data.playtime);
        
        // Start local playtime counter
        GameManager.startLocalPlaytime();
        
        // Set up move handler
        const onMove = (dir) => {
            if (!AppState.gameActive) return;
            
            sequenceNumber++;
            const seq = sequenceNumber;
            
            // Client-side prediction
            if (currentGrid && currentRngState !== null && window.GameEngine) {
                const { grid: newGrid, moved } = GameEngine.move(currentGrid, dir);
                if (moved) {
                    const { grid: finalGrid, rngState: newRng } = GameEngine.addRandomTile(newGrid, currentRngState);
                    
                    // Update local state instantly
                    currentGrid = finalGrid;
                    currentRngState = newRng;
                    pendingMoves.push({ seq, dir });
                    
                    // Render instantly
                    GameManager.setLastMoveDir(dir);
                    GameManager.renderGrid(currentGrid);
                } else {
                    pendingMoves.push({ seq, dir, noop: true });
                }
            }
            
            SocketManager.sendMove(AppState.sessionToken, dir, seq);
        };
        GameManager.setupKeyboardControls(onMove);
        GameManager.setupTouchControls(document.getElementById('game-grid-container'), onMove);

        // Connect socket and join room
        setupSocketConnection();
        SocketManager.joinRoom(AppState.roomCode, AppState.sessionToken, false);

        // === Socket event handlers ===
        
        // Game state updates (after each move)
        SocketManager.onGameState((state) => {
            if (state.sequenceNumber !== undefined) {
                // Filter out pending moves up to this sequence number
                pendingMoves = pendingMoves.filter(m => m.seq > state.sequenceNumber);
            }
            
            if (state.moved === false && pendingMoves.length === 0) return; // No-op move
            
            if (state.grid) {
                currentGrid = state.grid;
                if (state.rngState !== undefined) {
                    currentRngState = state.rngState;
                }
                
                // Replay any unconfirmed pending moves
                if (window.GameEngine) {
                    for (const pm of pendingMoves) {
                        if (pm.noop) continue;
                        const { grid: newGrid, moved } = GameEngine.move(currentGrid, pm.dir);
                        if (moved) {
                            const res = GameEngine.addRandomTile(newGrid, currentRngState);
                            currentGrid = res.grid;
                            currentRngState = res.rngState;
                        }
                    }
                }
                GameManager.renderGrid(currentGrid);
            }
            
            if (state.score !== undefined) GameManager.updateScore(state.score);
            if (state.moves !== undefined) GameManager.updateMoves(state.moves);
            if (state.playtime !== undefined) GameManager.updatePlaytime(state.playtime);

            if (state.gameOver) {
                pendingMoves = []; // Game is definitively over on server
                AppState.gameActive = false;
                showGameOver({
                    score: state.score,
                    moves: state.moves,
                    playtime: state.playtime,
                    largestTile: state.largestTile,
                    status: state.status || 'game_over',
                    endReason: state.endReason || 'normal'
                });
            }
        });

        // Admin ended the game
        SocketManager.onGameEnded((data) => {
            AppState.gameActive = false;
            GameManager.stopLocalPlaytime();
            
            // Fetch current state for final stats
            fetch('/api/players/reconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken: AppState.sessionToken })
            })
            .then(res => res.json())
            .then(playerData => {
                showGameOver({
                    score: playerData.score || 0,
                    moves: playerData.moves || 0,
                    playtime: playerData.playtime || 0,
                    largestTile: playerData.largestTile || 0,
                    status: 'end',
                    endReason: data.reason
                });
            })
            .catch(() => {
                showGameOver({
                    score: 0, moves: 0, playtime: 0, largestTile: 0,
                    status: 'end', endReason: data.reason
                });
            });
        });

        // Leaderboard updates (every 15 seconds)
        SocketManager.onLeaderboardUpdate((data) => {
            currentLeaderboardData = data.leaderboard || [];
            
            // Update game-over leaderboard if visible
            const goTable = document.getElementById('game-over-leaderboard-table');
            if (goTable && document.getElementById('screen-game-over').style.display !== 'none') {
                LeaderboardManager.renderPlayerLeaderboard(goTable, currentLeaderboardData, AppState.playerName);
            }
            
            // Update fullscreen leaderboard if visible
            const fsTable = document.getElementById('fullscreen-leaderboard-table');
            if (fsTable && document.getElementById('screen-leaderboard-fullscreen').style.display !== 'none') {
                LeaderboardManager.renderPlayerLeaderboard(fsTable, currentLeaderboardData, AppState.playerName);
            }
        });

        // Timer countdown
        SocketManager.onTimerTick((data) => {
            GameManager.showTimerBar(data.remaining, data.total || 180);
            if (data.remaining <= 0) {
                GameManager.hideTimerBar();
            }
        });

        // Player hidden notification
        SocketManager.onPlayerHidden(() => {
            document.getElementById('hidden-popup').style.display = 'block';
        });

        // Name update result
        SocketManager.onNameUpdated((data) => {
            if (data.success) {
                AppState.playerName = data.newName;
                if (data.status === 'active') {
                    document.getElementById('hidden-popup').style.display = 'none';
                }
            }
        });
        
        // Show hidden popup if player was flagged on join
        if (data.isHidden || data.status === 'hidden') {
            document.getElementById('hidden-popup').style.display = 'block';
        }
    }

    // ===== Name Change popup handling =====
    document.getElementById('btn-change-name').addEventListener('click', () => {
        const newName = document.getElementById('input-new-name').value.trim();
        if (newName) {
            SocketManager.updateName(AppState.sessionToken, newName);
        }
    });
    document.getElementById('btn-close-popup').addEventListener('click', () => {
        document.getElementById('hidden-popup').style.display = 'none';
    });

    // ===== Game Over Screen =====
    function showGameOver(state) {
        GameManager.stopLocalPlaytime();
        showScreen('screen-game-over');
        
        // Set title based on end reason
        const title = (state.endReason === 'admin_force' || state.endReason === 'timer') ? 'Game End' : 'Game Over';
        document.getElementById('game-over-title').textContent = title;
        
        document.getElementById('go-score').textContent = state.score || 0;
        document.getElementById('go-moves').textContent = state.moves || 0;
        document.getElementById('go-playtime').textContent = LeaderboardManager.formatPlaytime(state.playtime || 0);
        document.getElementById('go-largest-tile').textContent = state.largestTile || 0;
        
        // Fetch leaderboard for game over screen
        fetch(`/api/leaderboard/${AppState.roomCode}`)
            .then(res => res.json())
            .then(data => {
                if (data.leaderboard) {
                    currentLeaderboardData = data.leaderboard;
                    LeaderboardManager.renderPlayerLeaderboard(
                        document.getElementById('game-over-leaderboard-table'),
                        data.leaderboard,
                        AppState.playerName
                    );
                }
            })
            .catch(err => console.error('Failed to fetch leaderboard:', err));
    }

    // ===== Admin Navigation =====
    document.getElementById('btn-admin-open').addEventListener('click', () => {
        showScreen('screen-admin-login');
    });

    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => {
            showScreen('screen-start');
            SocketManager.disconnect();
            AppState.isAdmin = false;
        });
    });

    // ===== Admin Login / Create / Join =====
    document.getElementById('btn-create-room').addEventListener('click', async () => {
        const name = document.getElementById('input-admin-name').value.trim();
        const pwd = document.getElementById('input-admin-password').value;
        if (!name || !pwd) {
            adminError.textContent = 'Enter name and password.';
            return;
        }
        
        try {
            adminError.textContent = '';
            const data = await AdminManager.createRoom(name, pwd);
            setupAdminDashboard(data.roomCode, name, pwd);
        } catch(err) { adminError.textContent = err.message; }
    });

    document.getElementById('btn-join-room-admin').addEventListener('click', async () => {
        const name = document.getElementById('input-admin-name').value.trim();
        const pwd = document.getElementById('input-admin-password').value;
        const room = document.getElementById('input-admin-room-code').value.trim().toUpperCase();
        
        if (!name || !pwd || room.length !== 4) {
            adminError.textContent = 'Enter name, password, and 4-character room code.';
            return;
        }
        
        try {
            adminError.textContent = '';
            await AdminManager.joinRoom(room, name, pwd);
            setupAdminDashboard(room, name, pwd);
        } catch(err) { adminError.textContent = err.message; }
    });

    function setupAdminDashboard(roomCode, name, pwd) {
        AppState.isAdmin = true;
        showScreen('screen-admin-dashboard');
        document.getElementById('admin-room-code').textContent = roomCode;
        document.getElementById('admin-name-display').textContent = name;
        
        setupSocketConnection();
        SocketManager.joinRoom(roomCode, null, true);

        SocketManager.onAdminLeaderboardUpdate((data) => {
            const players = data.leaderboard || [];
            adminLeaderboardData = players;
            document.getElementById('admin-player-count').textContent = players.length;
            LeaderboardManager.renderAdminLeaderboard(
                document.getElementById('admin-leaderboard-table'), 
                players, 
                { onHidePlayer: (pName) => AdminManager.hidePlayer(pName) }
            );
        });

        SocketManager.onTimerTick((data) => {
            const display = document.getElementById('admin-timer-display');
            display.style.display = 'block';
            const val = document.getElementById('admin-timer-val');
            const mins = Math.floor(data.remaining / 60);
            const secs = data.remaining % 60;
            val.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            if (data.remaining <= 0) {
                display.style.display = 'none';
            }
        });
    }

    // ===== Admin Dashboard Actions =====
    document.getElementById('btn-force-end').addEventListener('click', () => {
        AdminManager.forceEndAll();
    });
    
    document.getElementById('btn-start-timer').addEventListener('click', () => {
        AdminManager.startTimer();
    });

    document.getElementById('btn-download-admin-csv').addEventListener('click', () => {
        downloadCSV(adminLeaderboardData, `leaderboard_admin_room_${AppState.roomCode}.csv`);
    });

    document.getElementById('btn-download-go-csv').addEventListener('click', () => {
        downloadCSV(currentLeaderboardData, `leaderboard_room_${AppState.roomCode}.csv`);
    });

    // ===== Fullscreen Leaderboard toggles =====
    document.getElementById('btn-view-leaderboard').addEventListener('click', () => {
        document.getElementById('fs-room-code').textContent = AppState.roomCode;
        LeaderboardManager.renderPlayerLeaderboard(
            document.getElementById('fullscreen-leaderboard-table'),
            currentLeaderboardData,
            AppState.playerName
        );
        LeaderboardManager.toggleFullscreen(true);
    });
    document.getElementById('btn-fullscreen-leaderboard').addEventListener('click', () => {
        document.getElementById('fs-room-code').textContent = AppState.roomCode;
        LeaderboardManager.renderPlayerLeaderboard(
            document.getElementById('fullscreen-leaderboard-table'),
            currentLeaderboardData,
            AppState.playerName
        );
        LeaderboardManager.toggleFullscreen(true);
    });
    document.getElementById('btn-exit-fullscreen').addEventListener('click', () => {
        LeaderboardManager.toggleFullscreen(false);
    });
    
    // Exit game over → back to start screen
    document.getElementById('btn-exit-game-over').addEventListener('click', () => {
        localStorage.removeItem('session_token');
        localStorage.removeItem('room_code');
        SocketManager.disconnect();
        AppState.sessionToken = null;
        AppState.roomCode = null;
        AppState.playerName = null;
        AppState.gameActive = false;
        showScreen('screen-start');
    });
});
