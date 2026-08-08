const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./db/database.js');
const engine = require('./game/engine.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = 'Aloha';
const ROOM_CODE_LENGTH = 4;
const LEADERBOARD_INTERVAL = 15000;
const TIMER_DURATION = 180; // seconds

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js/engine.js', express.static(path.join(__dirname, 'game/engine.js')));

// Active timers per room and socket-to-session mapping
const activeTimers = new Map();  // roomCode -> intervalId
const socketMap = new Map();     // socketId -> { sessionToken, roomCode, isAdmin }
const leaderboardIntervals = new Map(); // roomCode -> intervalId
const lastMoveTimes = new Map(); // sessionToken -> timestamp

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (db.getRoom(code));
  return code;
}

// Convert DB player row to frontend-friendly format
function formatPlayer(p) {
  return {
    name: p.name,
    score: p.score,
    moves: p.moves,
    playtime: p.playtime_seconds,
    largestTile: p.largest_tile,
    status: p.status,
    endReason: p.end_reason
  };
}

// Start leaderboard broadcast interval for a room
function ensureLeaderboardInterval(roomCode) {
  if (leaderboardIntervals.has(roomCode)) return;
  
  const intervalId = setInterval(() => {
    const leaderboard = db.getLeaderboard(roomCode);
    const allFormatted = leaderboard.map(formatPlayer);
    const publicLeaderboard = allFormatted.filter(p => p.status !== 'hidden');
    
    io.to(`room:${roomCode}`).emit('leaderboard:update', { leaderboard: publicLeaderboard });
    io.to(`admin:${roomCode}`).emit('leaderboard:admin-update', { leaderboard: allFormatted });
  }, LEADERBOARD_INTERVAL);
  
  leaderboardIntervals.set(roomCode, intervalId);
}

// ===== REST API Endpoints =====

app.post('/api/rooms/create', (req, res) => {
  const name = req.body.name || req.body.adminName;
  const password = req.body.password || req.body.adminPassword;
  
  if (!name) return res.status(400).json({ success: false, error: 'Admin name is required' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Invalid password' });
  
  const roomCode = generateRoomCode();
  db.createRoom(roomCode, name);
  res.json({ success: true, roomCode });
});

app.post('/api/rooms/join-admin', (req, res) => {
  const roomCode = req.body.roomCode;
  const name = req.body.name || req.body.adminName;
  const password = req.body.password || req.body.adminPassword;
  
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Invalid password' });
  
  const room = db.getRoom(roomCode);
  if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
  
  res.json({ success: true, room });
});

app.post('/api/players/join', (req, res) => {
  const { name, roomCode } = req.body;
  
  if (!name || !roomCode) {
    return res.status(400).json({ success: false, error: 'Name and room code are required' });
  }
  
  const room = db.getRoom(roomCode);
  if (!room || room.status !== 'active') {
    return res.status(400).json({ success: false, error: 'Room not found or not active' });
  }
  
  const existingPlayer = db.getPlayerByName(roomCode, name);
  if (existingPlayer) {
    if (existingPlayer.status === 'end' || existingPlayer.status === 'game_over') {
      return res.status(400).json({ success: false, error: 'Game already finished for this player in this room' });
    }
    // Player exists and is active/hidden — return their session for reconnection
    let rngState = existingPlayer.rng_state;
    if (rngState === null || rngState === undefined) {
      rngState = Math.floor(Math.random() * 0xFFFFFFFF);
      db.updatePlayerRngState(existingPlayer.session_token, rngState);
    }
    return res.json({
      success: true,
      sessionToken: existingPlayer.session_token,
      grid: JSON.parse(existingPlayer.grid_state),
      score: existingPlayer.score,
      moves: existingPlayer.moves,
      largestTile: existingPlayer.largest_tile,
      playtime: existingPlayer.playtime_seconds,
      status: existingPlayer.status,
      isHidden: existingPlayer.status === 'hidden',
      playerName: existingPlayer.name,
      roomCode: roomCode,
      rngState: rngState
    });
  }
  
  const sessionToken = uuidv4();
  const seed = Math.floor(Math.random() * 0xFFFFFFFF);
  const { grid, rngState } = engine.createGrid(seed);
  const isHidden = db.isProfane(name);
  
  db.createPlayer(roomCode, name, sessionToken, JSON.stringify(grid), rngState);
  if (isHidden) {
    db.updatePlayerStatus(sessionToken, 'hidden', null);
  }
  
  // Start leaderboard interval for this room
  ensureLeaderboardInterval(roomCode);
  
  res.json({
    success: true,
    sessionToken,
    grid,
    score: 0,
    moves: 0,
    largestTile: engine.getLargestTile(grid),
    playtime: 0,
    status: isHidden ? 'hidden' : 'active',
    isHidden,
    playerName: name,
    roomCode: roomCode,
    rngState
  });
});

app.post('/api/players/reconnect', (req, res) => {
  const { sessionToken } = req.body;
  const player = db.getPlayer(sessionToken);
  
  if (!player) return res.json({ success: false });
  
  const room = db.getRoom(player.room_code);
  
  if (player.status === 'active' || player.status === 'hidden') {
    // Start leaderboard interval for this room
    ensureLeaderboardInterval(player.room_code);
    
    let rngState = player.rng_state;
    if (rngState === null || rngState === undefined) {
      rngState = Math.floor(Math.random() * 0xFFFFFFFF);
      db.updatePlayerRngState(player.session_token, rngState);
    }
    
    res.json({
      success: true,
      grid: JSON.parse(player.grid_state),
      score: player.score,
      moves: player.moves,
      largestTile: player.largest_tile,
      playtime: player.playtime_seconds,
      status: player.status,
      gameOver: false,
      playerName: player.name,
      roomCode: player.room_code,
      isHidden: player.status === 'hidden',
      timerEnd: room ? room.timer_end : null,
      rngState: rngState
    });
  } else if (player.status === 'end' || player.status === 'game_over') {
    res.json({
      success: true,
      grid: JSON.parse(player.grid_state),
      score: player.score,
      moves: player.moves,
      largestTile: player.largest_tile,
      playtime: player.playtime_seconds,
      status: player.status,
      gameOver: true,
      endReason: player.end_reason,
      playerName: player.name,
      roomCode: player.room_code
    });
  }
});

app.get('/api/leaderboard/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const leaderboard = db.getLeaderboard(roomCode)
    .filter(p => p.status !== 'hidden')
    .map(formatPlayer);
  res.json({ success: true, leaderboard });
});

// ===== Socket.io =====

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomCode, sessionToken, isAdmin }) => {
    socket.join(`room:${roomCode}`);
    if (isAdmin) {
      socket.join(`admin:${roomCode}`);
    }
    socketMap.set(socket.id, { sessionToken, roomCode, isAdmin });
    
    // Ensure leaderboard is broadcasting for this room
    ensureLeaderboardInterval(roomCode);
    
    // Send immediate leaderboard on join
    const leaderboard = db.getLeaderboard(roomCode);
    const allFormatted = leaderboard.map(formatPlayer);
    const publicLeaderboard = allFormatted.filter(p => p.status !== 'hidden');
    
    socket.emit('leaderboard:update', { leaderboard: publicLeaderboard });
    if (isAdmin) {
      socket.emit('leaderboard:admin-update', { leaderboard: allFormatted });
    }
  });

  socket.on('player:move', ({ sessionToken, direction, sequenceNumber }) => {
    if (!sessionToken || !direction) return;
    
    // Rate Limiting (80ms)
    const nowMs = Date.now();
    const lastMove = lastMoveTimes.get(sessionToken) || 0;
    if (nowMs - lastMove < 80) {
      return; // Ignore move if too fast
    }
    lastMoveTimes.set(sessionToken, nowMs);
    
    const player = db.getPlayer(sessionToken);
    if (!player || (player.status !== 'active' && player.status !== 'hidden')) return;
    
    // Ensure rng_state is initialized just in case
    let currentRng = player.rng_state;
    if (currentRng === null || currentRng === undefined) {
        currentRng = Math.floor(Math.random() * 0xFFFFFFFF);
        db.updatePlayerRngState(sessionToken, currentRng);
    }
    
    let grid = JSON.parse(player.grid_state);
    const { grid: newGrid, score: moveScore, moved } = engine.move(grid, direction);
    
    if (moved) {
      const { grid: finalGrid, rngState: newRng } = engine.addRandomTile(newGrid, currentRng);
      const newScore = player.score + moveScore;
      const newMoves = player.moves + 1;
      const largestTile = engine.getLargestTile(finalGrid);
      
      // Calculate playtime: time since game started
      const now = Math.floor(Date.now() / 1000);
      const newPlaytime = now - player.started_at;
      
      db.updatePlayerState(sessionToken, JSON.stringify(finalGrid), newScore, newMoves, largestTile, newPlaytime, newRng);
      
      const gameOver = engine.isGameOver(finalGrid);
      if (gameOver) {
        db.updatePlayerStatus(sessionToken, 'game_over', 'normal');
        db.createPlayerRecord(player.room_code, player.name, newScore, newMoves, newPlaytime, largestTile, 'normal');
        socket.emit('game:state', {
          sequenceNumber,
          grid: finalGrid,
          score: newScore,
          moves: newMoves,
          largestTile,
          playtime: newPlaytime,
          gameOver: true,
          status: 'game_over',
          endReason: 'normal',
          rngState: newRng
        });
      } else {
        socket.emit('game:state', {
          sequenceNumber,
          grid: finalGrid,
          score: newScore,
          moves: newMoves,
          largestTile,
          playtime: newPlaytime,
          gameOver: false,
          rngState: newRng
        });
      }
    } else {
      socket.emit('game:state', { sequenceNumber, moved: false, gameOver: false });
    }
  });

  socket.on('admin:force-end', ({ roomCode, password }) => {
    if (password !== ADMIN_PASSWORD) return;
    
    // Get active players BEFORE ending them (to create records)
    const activePlayers = db.getLeaderboard(roomCode).filter(p => p.status === 'active' || p.status === 'hidden');
    
    // End all active/hidden players
    db.endAllActivePlayers(roomCode, 'admin_force');
    db.updateRoomStatus(roomCode, 'finished');
    
    // Create records for each ended player
    for (const p of activePlayers) {
      const playtime = Math.floor(Date.now() / 1000) - p.started_at;
      db.createPlayerRecord(p.room_code, p.name, p.score, p.moves, playtime, p.largest_tile, 'admin_force');
    }
    
    // Notify all players in the room
    io.to(`room:${roomCode}`).emit('game:ended', { reason: 'admin_force' });
    
    // Send one final leaderboard update
    const finalLeaderboard = db.getLeaderboard(roomCode).map(formatPlayer);
    io.to(`room:${roomCode}`).emit('leaderboard:update', { leaderboard: finalLeaderboard });
    io.to(`admin:${roomCode}`).emit('leaderboard:admin-update', { leaderboard: finalLeaderboard });
  });

  socket.on('admin:start-timer', ({ roomCode, password }) => {
    if (password !== ADMIN_PASSWORD) return;
    if (activeTimers.has(roomCode)) return; // Timer already running
    
    const timerEnd = Date.now() + TIMER_DURATION * 1000;
    db.setRoomTimer(roomCode, timerEnd);
    
    // Broadcast initial tick immediately
    io.to(`room:${roomCode}`).emit('game:timer-tick', { remaining: TIMER_DURATION, total: TIMER_DURATION });
    
    const intervalId = setInterval(() => {
      const remaining = Math.max(0, Math.floor((timerEnd - Date.now()) / 1000));
      io.to(`room:${roomCode}`).emit('game:timer-tick', { remaining, total: TIMER_DURATION });
      
      if (remaining <= 0) {
        clearInterval(intervalId);
        activeTimers.delete(roomCode);
        db.clearRoomTimer(roomCode);
        
        // End all active players
        const activePlayers = db.getLeaderboard(roomCode).filter(p => p.status === 'active' || p.status === 'hidden');
        db.endAllActivePlayers(roomCode, 'timer');
        db.updateRoomStatus(roomCode, 'finished');
        
        for (const p of activePlayers) {
          const playtime = Math.floor(Date.now() / 1000) - p.started_at;
          db.createPlayerRecord(p.room_code, p.name, p.score, p.moves, playtime, p.largest_tile, 'timer');
        }
        
        io.to(`room:${roomCode}`).emit('game:ended', { reason: 'timer' });
        
        // Final leaderboard
        const finalLeaderboard = db.getLeaderboard(roomCode).map(formatPlayer);
        io.to(`room:${roomCode}`).emit('leaderboard:update', { leaderboard: finalLeaderboard });
        io.to(`admin:${roomCode}`).emit('leaderboard:admin-update', { leaderboard: finalLeaderboard });
      }
    }, 1000);
    
    activeTimers.set(roomCode, intervalId);
  });

  socket.on('admin:hide-player', ({ roomCode, password, playerName }) => {
    if (password !== ADMIN_PASSWORD) return;
    const player = db.getPlayerByName(roomCode, playerName);
    if (!player || player.status !== 'active') return;
    
    db.updatePlayerStatus(player.session_token, 'hidden', null);
    
    // Find the player's socket and notify them
    for (const [sId, data] of socketMap.entries()) {
      if (data.sessionToken === player.session_token) {
        io.to(sId).emit('player:hidden');
        break;
      }
    }
  });

  socket.on('player:update-name', ({ sessionToken, newName }) => {
    if (!sessionToken || !newName || !newName.trim()) return;
    newName = newName.trim();
    
    const player = db.getPlayer(sessionToken);
    if (!player) return;
    
    // Check if new name is taken by someone else in the room
    const existing = db.getPlayerByName(player.room_code, newName);
    if (existing && existing.session_token !== sessionToken) {
      socket.emit('name:updated', { success: false, error: 'Name already taken in this room' });
      return;
    }
    
    const isProfaneName = db.isProfane(newName);
    db.updatePlayerName(sessionToken, newName);
    
    if (!isProfaneName) {
      db.updatePlayerStatus(sessionToken, 'active', null);
      socket.emit('name:updated', { success: true, newName, status: 'active' });
    } else {
      db.updatePlayerStatus(sessionToken, 'hidden', null);
      socket.emit('name:updated', { success: true, newName, status: 'hidden' });
    }
  });

  socket.on('disconnect', () => {
    const data = socketMap.get(socket.id);
    if (data) {
      lastMoveTimes.delete(data.sessionToken);
    }
    socketMap.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`2048 Multiplayer server running on http://localhost:${PORT}`);
});
