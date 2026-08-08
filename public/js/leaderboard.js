const LeaderboardManager = (function() {
    function formatPlaytime(seconds) {
        if (seconds == null || isNaN(seconds)) return '00:00';
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        if (seconds >= 3600) {
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            return `${h}:${m}:${s}`;
        }
        return `${m}:${s}`;
    }

    function renderBase(tableElement, players, currentPlayerName, getExtraCols = null) {
        const tbody = tableElement.querySelector('tbody');
        tbody.innerHTML = '';
        
        players.forEach((p, index) => {
            const tr = document.createElement('tr');
            if (currentPlayerName && p.name === currentPlayerName) {
                tr.className = 'current-player-row';
            }

            let html = `
                <td>${index + 1}</td>
                <td>${p.name || 'Unknown'}</td>
                <td>${p.score || 0}</td>
                <td>${p.moves || 0}</td>
                <td>${formatPlaytime(p.playtime)}</td>
                <td>${p.largestTile || 0}</td>
            `;

            if (getExtraCols) {
                html += getExtraCols(p);
            }

            tr.innerHTML = html;
            tbody.appendChild(tr);
        });
    }

    return {
        formatPlaytime,
        
        renderPlayerLeaderboard(tableElement, players, currentPlayerName) {
            renderBase(tableElement, players, currentPlayerName);
        },

        renderMiniLeaderboard(tableElement, players, currentPlayerName) {
            const tbody = tableElement.querySelector('tbody');
            tbody.innerHTML = '';
            
            const topPlayers = players.slice(0, 4);
            topPlayers.forEach((p, index) => {
                const tr = document.createElement('tr');
                if (currentPlayerName && p.name === currentPlayerName) {
                    tr.className = 'current-player-row';
                }
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${p.name || 'Unknown'}</td>
                    <td>${p.score || 0}</td>
                `;
                tbody.appendChild(tr);
            });
        },

        renderAdminLeaderboard(tableElement, players, callbacks) {
            const tbody = tableElement.querySelector('tbody');
            tbody.innerHTML = '';
            
            players.forEach((p, index) => {
                const tr = document.createElement('tr');
                
                let badgeClass = '';
                switch (p.status) {
                    case 'active': badgeClass = 'badge-active'; break;
                    case 'end': badgeClass = 'badge-end'; break;
                    case 'hidden': badgeClass = 'badge-hidden'; break;
                    case 'game_over': badgeClass = 'badge-game_over'; break;
                    default: badgeClass = 'badge-game_over'; break;
                }

                let actionsHtml = '';
                if (p.status === 'active') {
                    actionsHtml = `<button class="btn btn-hide-player" data-name="${p.name}" style="padding:4px 8px;font-size:12px;min-height:auto;margin:0;">Hide</button>`;
                }

                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${p.name || 'Unknown'}</td>
                    <td>${p.score || 0}</td>
                    <td>${p.moves || 0}</td>
                    <td>${formatPlaytime(p.playtime)}</td>
                    <td>${p.largestTile || 0}</td>
                    <td><span class="badge ${badgeClass}">${p.status}</span></td>
                    <td>${actionsHtml}</td>
                `;
                tbody.appendChild(tr);
            });

            // Attach listeners
            const hideBtns = tbody.querySelectorAll('.btn-hide-player');
            hideBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (callbacks && callbacks.onHidePlayer) {
                        callbacks.onHidePlayer(btn.getAttribute('data-name'));
                    }
                });
            });
        },

        renderGameOverLeaderboard(tableElement, players, currentPlayerName) {
            renderBase(tableElement, players, currentPlayerName);
        },

        toggleFullscreen(show) {
            const fs = document.getElementById('screen-leaderboard-fullscreen');
            if (show) {
                fs.style.display = 'block';
            } else {
                fs.style.display = 'none';
            }
        }
    };
})();
