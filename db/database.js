const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ---------------------------------------------------------
// Profanity JSON File Integration
// ---------------------------------------------------------
const profanityPath = path.join(dbDir, 'profanity.json');
let profanityWords = [];

const defaultWords = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'hell', 'dick', 'pussy', 'cock', 'cunt', 'bastard', 'whore', 'slut', 'fag', 'nigger', 'nigga', 'retard', 'crap', 'piss', 'twat', 'wanker', 'bollocks', 'arse', 'tit', 'boob'];

try {
  if (fs.existsSync(profanityPath)) {
    profanityWords = JSON.parse(fs.readFileSync(profanityPath, 'utf8'));
  } else {
    profanityWords = defaultWords;
    fs.writeFileSync(profanityPath, JSON.stringify(profanityWords, null, 2), 'utf8');
  }
} catch (err) {
  console.error("Error reading/writing profanity.json, using default fallback list", err);
  profanityWords = defaultWords;
}

function isProfane(name) {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  for (const w of profanityWords) {
    if (lowerName.includes(w.toLowerCase())) return true;
  }
  return false;
}

function addProfanityWord(word) {
  if (!word) return;
  const cleanWord = word.trim().toLowerCase();
  if (!profanityWords.includes(cleanWord)) {
    profanityWords.push(cleanWord);
    try {
      fs.writeFileSync(profanityPath, JSON.stringify(profanityWords, null, 2), 'utf8');
    } catch (err) {
      console.error("Failed to save updated profanity list to profanity.json", err);
    }
  }
}

function getProfanityWords() {
  return profanityWords;
}

// ---------------------------------------------------------
// Game Database
// ---------------------------------------------------------
const gameDb = new DatabaseSync(path.join(dbDir, 'game.db'));
gameDb.exec('PRAGMA journal_mode = WAL;');

gameDb.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    admin_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    timer_end INTEGER,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    name TEXT NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    grid_state TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    moves INTEGER DEFAULT 0,
    largest_tile INTEGER DEFAULT 2,
    playtime_seconds INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    end_reason TEXT,
    last_active INTEGER,
    started_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(room_code, name),
    FOREIGN KEY (room_code) REFERENCES rooms(code)
  );

  CREATE TABLE IF NOT EXISTS player_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    name TEXT NOT NULL,
    final_score INTEGER NOT NULL,
    total_moves INTEGER NOT NULL,
    playtime_seconds INTEGER NOT NULL,
    largest_tile INTEGER NOT NULL,
    end_reason TEXT NOT NULL,
    finished_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

function createRoom(code, adminName) {
  const stmt = gameDb.prepare('INSERT INTO rooms (code, admin_name) VALUES (?, ?)');
  stmt.run(code, adminName);
}

function getRoom(code) {
  const stmt = gameDb.prepare('SELECT * FROM rooms WHERE code = ?');
  return stmt.get(code);
}

function updateRoomStatus(code, status) {
  const stmt = gameDb.prepare('UPDATE rooms SET status = ? WHERE code = ?');
  stmt.run(status, code);
}

function setRoomTimer(code, timerEnd) {
  const stmt = gameDb.prepare('UPDATE rooms SET timer_end = ? WHERE code = ?');
  stmt.run(timerEnd, code);
}

function clearRoomTimer(code) {
  const stmt = gameDb.prepare('UPDATE rooms SET timer_end = NULL WHERE code = ?');
  stmt.run(code);
}

function createPlayer(roomCode, name, sessionToken, gridState) {
  const stmt = gameDb.prepare(`
    INSERT INTO players (room_code, name, session_token, grid_state, last_active)
    VALUES (?, ?, ?, ?, (strftime('%s','now')))
  `);
  stmt.run(roomCode, name, sessionToken, gridState);
}

function getPlayer(sessionToken) {
  const stmt = gameDb.prepare('SELECT * FROM players WHERE session_token = ?');
  return stmt.get(sessionToken);
}

function getPlayerByName(roomCode, name) {
  const stmt = gameDb.prepare('SELECT * FROM players WHERE room_code = ? AND name = ?');
  return stmt.get(roomCode, name);
}

function updatePlayerState(sessionToken, gridState, score, moves, largestTile, playtimeSeconds) {
  const stmt = gameDb.prepare(`
    UPDATE players
    SET grid_state = ?, score = ?, moves = ?, largest_tile = ?, playtime_seconds = ?, last_active = (strftime('%s','now'))
    WHERE session_token = ?
  `);
  stmt.run(gridState, score, moves, largestTile, playtimeSeconds, sessionToken);
}

function updatePlayerStatus(sessionToken, status, endReason) {
  const stmt = gameDb.prepare('UPDATE players SET status = ?, end_reason = ? WHERE session_token = ?');
  stmt.run(status, endReason, sessionToken);
}

function updatePlayerName(sessionToken, newName) {
  const stmt = gameDb.prepare('UPDATE players SET name = ? WHERE session_token = ?');
  stmt.run(newName, sessionToken);
}

function getLeaderboard(roomCode) {
  const stmt = gameDb.prepare('SELECT * FROM players WHERE room_code = ? ORDER BY score DESC');
  return stmt.all(roomCode);
}

function getActivePlayers(roomCode) {
  const stmt = gameDb.prepare('SELECT * FROM players WHERE room_code = ? AND status = ?');
  return stmt.all(roomCode, 'active');
}

function endAllActivePlayers(roomCode, endReason) {
  const stmt = gameDb.prepare('UPDATE players SET status = ?, end_reason = ? WHERE room_code = ? AND status IN (?, ?)');
  stmt.run('end', endReason, roomCode, 'active', 'hidden');
}

function createPlayerRecord(roomCode, name, finalScore, totalMoves, playtime, largestTile, endReason) {
  const stmt = gameDb.prepare(`
    INSERT INTO player_records (room_code, name, final_score, total_moves, playtime_seconds, largest_tile, end_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(roomCode, name, finalScore, totalMoves, playtime, largestTile, endReason);
}

function getPlayerRecords(roomCode) {
  const stmt = gameDb.prepare('SELECT * FROM player_records WHERE room_code = ?');
  return stmt.all(roomCode);
}

module.exports = {
  // Profanity DB (JSON Backed)
  isProfane,
  addProfanityWord,
  getProfanityWords,
  
  // Game DB
  createRoom,
  getRoom,
  updateRoomStatus,
  setRoomTimer,
  clearRoomTimer,
  createPlayer,
  getPlayer,
  getPlayerByName,
  updatePlayerState,
  updatePlayerStatus,
  updatePlayerName,
  getLeaderboard,
  getActivePlayers,
  endAllActivePlayers,
  createPlayerRecord,
  getPlayerRecords
};
