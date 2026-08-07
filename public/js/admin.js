const AdminManager = (function() {
    let adminState = { name: '', roomCode: '', password: '' };

    return {
        init() {
            // Initialization is handled by app.js mostly, but we keep state here
        },

        setState(name, roomCode, password) {
            adminState.name = name;
            adminState.roomCode = roomCode;
            adminState.password = password;
        },

        getState() {
            return adminState;
        },

        async createRoom(name, password) {
            const res = await fetch('/api/rooms/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminName: name, adminPassword: password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create room');
            this.setState(name, data.roomCode, password);
            return data;
        },

        async joinRoom(roomCode, name, password) {
            const res = await fetch('/api/rooms/join-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomCode, adminName: name, adminPassword: password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to join room');
            this.setState(name, roomCode, password);
            return data;
        },

        forceEndAll() {
            if (confirm("Are you sure? This will end the game for ALL players.")) {
                SocketManager.adminForceEnd(adminState.roomCode, adminState.password);
            }
        },

        startTimer() {
            SocketManager.adminStartTimer(adminState.roomCode, adminState.password);
        },

        hidePlayer(playerName) {
            SocketManager.adminHidePlayer(adminState.roomCode, adminState.password, playerName);
        }
    };
})();
