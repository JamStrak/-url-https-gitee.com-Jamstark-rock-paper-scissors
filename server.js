const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, '../frontend')));

const games = new Map();
const players = new Map();

io.on('connection', (socket) => {
    console.log('用户连接：', socket.id);

    socket.on('challenge', (data) => {
        const targetSocket = Array.from(io.sockets.sockets.values())
            .find(s => players.get(s.id) === data.to);
        
        if (targetSocket) {
            players.set(socket.id, data.from);
            targetSocket.emit('challengeReceived', {
                from: data.from,
                prize: data.prize,
                challengerId: socket.id
            });
        }
    });

    socket.on('acceptChallenge', (data) => {
        const game = {
            players: [data.challengerId, socket.id],
            scores: {[data.challengerId]: 0, [socket.id]: 0},
            choices: {},
            round: 1
        };
        
        games.set(data.challengerId, game);
        io.to(data.challengerId).emit('gameStart');
        socket.emit('gameStart');
    });

    socket.on('makeChoice', (data) => {
        let game = games.get(socket.id) || 
                  Array.from(games.values()).find(g => g.players.includes(socket.id));
        
        if (!game) return;

        game.choices[socket.id] = data.choice;
        
        if (Object.keys(game.choices).length === 2) {
            determineRoundWinner(game);
        }
    });

    socket.on('disconnect', () => {
        console.log('用户断开连接：', socket.id);
        players.delete(socket.id);
        games.delete(socket.id);
    });
});

function determineRoundWinner(game) {
    const [p1, p2] = game.players;
    const c1 = game.choices[p1];
    const c2 = game.choices[p2];
    
    const rules = {
        rock: { beats: 'scissors' },
        paper: { beats: 'rock' },
        scissors: { beats: 'paper' }
    };

    if (c1 === c2) {
        // 平局
    } else if (rules[c1].beats === c2) {
        game.scores[p1]++;
    } else {
        game.scores[p2]++;
    }

    const gameOver = Object.values(game.scores).some(score => score >= 2);
    
    game.players.forEach(playerId => {
        io.to(playerId).emit('roundResult', {
            scores: game.scores,
            choices: game.choices,
            nextRound: game.round + 1,
            gameOver
        });
    });

    if (gameOver) {
        const winner = Object.entries(game.scores)
            .find(([_, score]) => score >= 2)[0];
        
        game.players.forEach(playerId => {
            io.to(playerId).emit('gameOver', { winner });
        });
        
        games.delete(game.players[0]);
    } else {
        game.round++;
        game.choices = {};
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});
