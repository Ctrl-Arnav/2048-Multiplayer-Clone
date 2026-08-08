const SocketManager = {
  socket: null,
  
  connect() {
    this.socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    this.setupDefaultListeners();
    return this.socket;
  },
  
  setupDefaultListeners() {
    this.socket.on('connect', () => console.log('Connected'));
    this.socket.on('disconnect', (reason) => console.log('Disconnected:', reason));
    this.socket.on('connect_error', (err) => console.log('Connection error:', err.message));
  },
  
  joinRoom(roomCode, sessionToken, isAdmin) {
    this.socket.emit('join-room', { roomCode, sessionToken, isAdmin });
  },
  
  sendMove(sessionToken, direction, sequenceNumber) {
    if (this.socket) {
      this.socket.emit('player:move', { sessionToken, direction, sequenceNumber });
    }
  },
  
  onGameState(callback) {
    this.socket.on('game:state', callback);
  },
  
  onLeaderboardUpdate(callback) {
    this.socket.on('leaderboard:update', callback);
  },
  
  onAdminLeaderboardUpdate(callback) {
    this.socket.on('leaderboard:admin-update', callback);
  },
  
  onGameEnded(callback) {
    this.socket.on('game:ended', callback);
  },
  
  onTimerTick(callback) {
    this.socket.on('game:timer-tick', callback);
  },
  
  onPlayerHidden(callback) {
    this.socket.on('player:hidden', callback);
  },
  
  onNameUpdated(callback) {
    this.socket.on('name:updated', callback);
  },
  
  adminForceEnd(roomCode, password) {
    this.socket.emit('admin:force-end', { roomCode, password });
  },
  
  adminStartTimer(roomCode, password) {
    this.socket.emit('admin:start-timer', { roomCode, password });
  },
  
  adminHidePlayer(roomCode, password, playerName) {
    this.socket.emit('admin:hide-player', { roomCode, password, playerName });
  },
  
  updateName(sessionToken, newName) {
    this.socket.emit('player:update-name', { sessionToken, newName });
  },
  
  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
};
