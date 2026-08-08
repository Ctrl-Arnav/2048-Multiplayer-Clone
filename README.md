# 2048 Multiplayer Clone 🎮

A real-time, competitive multiplayer version of the classic 2048 game. Players join a shared room and compete on a live leaderboard. Designed to handle up to 100 concurrent players per room with an emphasis on anti-cheat server-side logic and smooth UI animations.

## 🌟 Game Features

- **Live Multiplayer Racing:** Join a room via a 4-character code and race against others for the highest score.
- **Server-Authoritative Anti-Cheat:** The game grid and mechanics run 100% on the server. Clients only send directional inputs and render what the server replies with, preventing local score manipulation.
- **Classic 4x4 Grid:** Authentic 2048 mechanics including precise sliding, merging, and spawning logic.
- **Live Leaderboard:** A shared leaderboard updates every 15 seconds ranking everyone in the room by Score. It tracks Score, Moves, Playtime, and the Largest Tile.
- **Admin Dashboard:** 
  - Admins can create rooms with the password (`Aloha`).
  - Admins can trigger a **3-Minute Global Timer**.
  - Admins can **Force End** all active games.
  - Admins can **Hide** players from the leaderboard.
- **Data Export:** Admins and players can download the final leaderboard as a `.csv` file when a game ends.
- **Session Persistence:** Accidental tab close? No problem. Browser `localStorage` caches a UUID session token allowing players to seamlessly reconnect and resume their exact grid.
- **Profanity Filter:** Automatically scrubs offensive names using a lightweight JSON-backed dictionary, hiding inappropriate names from the public leaderboard while letting the player continue to play.

---

## 🏗️ Technical Architecture

### 1. Technology Stack
- **Backend:** Node.js (v22.5.0+), Express.js
- **WebSockets:** Socket.io for low-latency real-time bidirectional communication.
- **Database (Game State):** `node:sqlite` (Node's native SQLite implementation) utilizing WAL (Write-Ahead Logging) for lightning-fast synchronous reads/writes without locking the event loop.
- **Database (Profanity):** Statically loaded from `db/profanity.json` into memory for zero-latency lookups.
- **Frontend:** Vanilla HTML, CSS, JavaScript (Zero build tools needed).

### 2. File Structure & Responsibilities

```text
📁 2048-Multiplayer-Clone
├── 📄 server.js             # Express API & Socket.io Event Handlers (The Brains)
├── 📁 game
│   └── 📄 engine.js         # Pure 4x4 2048 Logic (Move, Merge, Spawn, GameOver)
├── 📁 db
│   ├── 📄 database.js       # SQLite Queries & JSON Profanity logic
│   ├── 📄 profanity.json    # Array of banned words
│   └── 📄 game.db           # (Auto-generated) SQLite DB storing rooms and players
└── 📁 public                # Frontend Static Files
    ├── 📄 index.html        # Single Page App layout (Start, Admin, Game, Leaderboard)
    ├── 📁 css
    │   └── 📄 style.css     # CSS Grid, Themes, and sliding/pop micro-animations
    └── 📁 js
        ├── 📄 app.js        # Main UI router, Socket initialization, and Event Bindings
        ├── 📄 game.js       # Grid rendering, keyboard/touch input capturing
        ├── 📄 socket.js     # Socket event wrapper API
        ├── 📄 admin.js      # Admin REST API calls (Create room, force end)
        └── 📄 leaderboard.js# DOM manipulation for the Leaderboard tables
```

---

## 🔄 Data & Execution Flow

### 1. Connection & Initialization
1. Player enters Name and Room Code on `index.html`.
2. Client sends a `POST /api/players/join` request to `server.js`.
3. Server validates the room, checks the name against `profanity.json`, and generates a 4x4 grid via `engine.js`.
4. Server stores the player in `game.db` and generates a UUID `sessionToken`.
5. Client receives the token, saves it to `localStorage`, and connects via Socket.io (`socket.join('room:CODE')`).

### 2. Gameplay Loop (The Move)
1. Player presses an arrow key. `game.js` captures this and passes it to `app.js`.
2. `app.js` emits a `player:move { direction }` event to the server.
3. **Server Validation:** `server.js` fetches the player's current grid string from SQLite.
4. **Logic Execution:** `engine.js` computes the slide, merges tiles, calculates the score increment, and spawns a new random tile (2 or 4).
5. **State Update:** If the grid changed, the new grid, score, and moves are written back to `game.db`.
6. **Client Render:** Server emits `game:state` back to that specific player's socket. The client updates the CSS grid and triggers a fake slide animation for visual smoothness.

### 3. Global Events
- **Leaderboard Sync:** `server.js` runs a `setInterval` every 15 seconds per active room. It queries `game.db` for the top scores, filters out hidden players, and broadcasts `leaderboard:update` to everyone in the Socket.io room.
- **Timer Countdown:** If an admin starts the timer, a 1-second interval broadcasts a `game:timer-tick` event to the room. When it hits 0, the server forcefully updates all active players to `game_over` and broadcasts `game:ended`.

---

## 🚀 Deployment (Render)

This app is optimized for platforms like Render:
- It relies on `node:sqlite`, which **requires Node 22.5.0 or higher**. This is strictly enforced via the `package.json` engines field.
- Because Render's free tier uses ephemeral filesystems, the `game.db` is rebuilt from scratch automatically upon server restart (perfect for temporary session-based tournaments).
- `profanity.json` is committed directly to the repo, ensuring it is always available without requiring external database setups.
