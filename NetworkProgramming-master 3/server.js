const express = require('express');
const next = require('next');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const db = require('./db');

// Middleware to parse JSON bodies
// Middleware to parse JSON bodies will be added after server init

// Game state management
// Rooms Map: roomId -> { board, currentTurn, usedFootballers, teams, players, status, host }
const rooms = new Map();

// Helper to create a new game state
function createGameState() {
  const randomTeams = generateRandomTeams();
  return {
    board: [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ],
    currentTurn: 'player1',
    usedFootballers: new Set(),
    teams: randomTeams,
    players: [], // Array of { socket, role, username }
    status: 'waiting', // waiting, playing
    host: null // username of host
  };
}

// Load players data
let playersData = [];
const playersPath = path.join(__dirname, 'data', 'players.json');

function loadPlayers() {
  try {
    const data = fs.readFileSync(playersPath, 'utf8');
    playersData = JSON.parse(data);
    console.log(`Loaded ${playersData.length} players from players.json`);
  } catch (error) {
    console.error('Error loading players.json:', error);
    playersData = [];
  }
}

// Initialize players data
loadPlayers();

// Load pre-calculated valid games
let validGames = [];
const validGamesPath = path.join(__dirname, 'data', 'valid_games.json');

function loadValidGames() {
  try {
    if (fs.existsSync(validGamesPath)) {
      const data = fs.readFileSync(validGamesPath, 'utf8');
      validGames = JSON.parse(data);
      console.log(`Loaded ${validGames.length} valid game configurations.`);
    } else {
      console.warn('valid_games.json not found. Generating simple fallback...');
      // Minimal fallback if file missing
      validGames = [{
        rows: ['Barcelona', 'Real Madrid', 'Manchester United'],
        potentialCols: ['PSG', 'Juventus', 'Bayern Munich']
      }];
    }
  } catch (err) {
    console.error('Error loading valid_games.json:', err);
  }
}

loadValidGames();

/**
 * Get random valid 3x3 teams from pre-calculated list
 */
function generateRandomTeams() {
  if (validGames.length === 0) {
    return {
      rows: ['Barcelona', 'Real Madrid', 'Manchester United'],
      cols: ['PSG', 'Juventus', 'Bayern Munich']
    };
  }

  // Pick a random configuration
  const config = validGames[Math.floor(Math.random() * validGames.length)];

  // Pick 3 random cols from the potentialCols
  // Shuffle potentialCols first
  const colsPool = [...config.potentialCols];
  for (let i = colsPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [colsPool[i], colsPool[j]] = [colsPool[j], colsPool[i]];
  }

  return {
    rows: config.rows,
    cols: colsPool.slice(0, 3)
  };
}

/**
 * Reset game state for a specific room
 */
function resetRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.board = [
    [null, null, null],
    [null, null, null],
    [null, null, null]
  ];
  room.currentTurn = 'player1';
  room.usedFootballers.clear();
  room.status = 'playing'; // Reset usually means restart
}

/**
 * Check if a footballer exists and has played for both teams
 */
function isValidFootballerForTeams(footballerName, rowTeam, colTeam) {
  const footballer = playersData.find(p => p.name === footballerName);
  if (!footballer) {
    return false;
  }

  const hasRowTeam = footballer.teams.includes(rowTeam);
  const hasColTeam = footballer.teams.includes(colTeam);

  return hasRowTeam && hasColTeam;
}

/**
 * Check for winner - returns 'player1', 'player2', 'draw', or null
 * Also returns winning cells if there's a winner
 */
function checkWinner(board) {

  // Check rows
  for (let row = 0; row < 3; row++) {
    if (board[row][0] && board[row][1] && board[row][2]) {
      if (
        board[row][0].player === board[row][1].player &&
        board[row][1].player === board[row][2].player
      ) {
        return {
          winner: board[row][0].player,
          winningCells: [[row, 0], [row, 1], [row, 2]]
        };
      }
    }
  }

  // Check columns
  for (let col = 0; col < 3; col++) {
    if (board[0][col] && board[1][col] && board[2][col]) {
      if (
        board[0][col].player === board[1][col].player &&
        board[1][col].player === board[2][col].player
      ) {
        return {
          winner: board[0][col].player,
          winningCells: [[0, col], [1, col], [2, col]]
        };
      }
    }
  }

  // Check main diagonal (top-left to bottom-right)
  if (board[0][0] && board[1][1] && board[2][2]) {
    if (
      board[0][0].player === board[1][1].player &&
      board[1][1].player === board[2][2].player
    ) {
      return {
        winner: board[0][0].player,
        winningCells: [[0, 0], [1, 1], [2, 2]]
      };
    }
  }

  // Check anti-diagonal (top-right to bottom-left)
  if (board[0][2] && board[1][1] && board[2][0]) {
    if (
      board[0][2].player === board[1][1].player &&
      board[1][1].player === board[2][0].player
    ) {
      return {
        winner: board[0][2].player,
        winningCells: [[0, 2], [1, 1], [2, 0]]
      };
    }
  }

  // Check for draw (all cells filled, no winner)
  let allFilled = true;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (!board[row][col]) {
        allFilled = false;
        break;
      }
    }
    if (!allFilled) break;
  }

  if (allFilled) {
    return { winner: 'draw', winningCells: null };
  }

  return null;
}

/**
 * Broadcast message to specific room
 */
function broadcastToRoom(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return;

  const messageStr = JSON.stringify(message);
  room.players.forEach((p) => {
    if (p.socket.readyState === WebSocket.OPEN) {
      p.socket.send(messageStr);
    }
  });
}

/**
 * Send initial game state to a newly connected client
 */
function sendInitialState(ws, roomId) {
  // Check if WebSocket is still open before sending
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('Cannot send initial state: WebSocket is not open');
    return;
  }

  const room = rooms.get(roomId);
  if (!room) return;

  // Find role based on socket
  const player = room.players.find(p => p.socket === ws);
  const role = player ? player.role : 'spectator';

  try {
    const message = {
      type: 'init',
      payload: {
        role: role,
        board: room.board,
        teams: room.teams,
        currentTurn: room.currentTurn,
        players: room.players.map(p => ({ role: p.role, username: p.username })), // Send username too
        status: room.status,
        roomId: roomId
      }
    };
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error('Error sending initial state:', error);
  }
}

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Middleware to parse JSON bodies
  server.use(express.json());

  // Create standalone WebSocket server on port 3001
  const wss = new WebSocket.Server({ port: 3001 });
  console.log('WebSocket server listening on port 3001');

  // Store WebSocket connections with their room and user info
  // ws -> { roomId, username }
  const connections = new Map();

  // Broadcast online counts to all connected clients
  function broadcastOnlineCounts() {
    const counts = {
      amateur: (global.queues && global.queues['amateur']) ? global.queues['amateur'].length : 0,
      pro: (global.queues && global.queues['pro']) ? global.queues['pro'].length : 0,
      elite: (global.queues && global.queues['elite']) ? global.queues['elite'].length : 0
    };

    const message = JSON.stringify({ type: 'onlineCounts', payload: counts });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  wss.on('connection', (ws) => {
    console.log('WebSocket connection established');

    // Send initial counts
    broadcastOnlineCounts();

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'createRoom') {
          const { roomName, password, username, entryFee } = data.payload; // Added entryFee
          const roomId = roomName; // simple ID for now

          if (rooms.has(roomId)) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room already exists' } }));
            return;
          }

          // Check balance if entry fee is set
          if (entryFee && entryFee > 0) {
            const user = await db.getUser(username);
            if (user.coins < entryFee) {
              ws.send(JSON.stringify({ type: 'error', payload: { message: 'Insufficient coins for entry fee!' } }));
              return;
            }
          }

          const roomState = createGameState();
          roomState.host = username;
          roomState.password = password; // Store password
          roomState.entryFee = entryFee ? parseInt(entryFee) : 0; // Store entry fee
          roomState.players.push({ socket: ws, role: 'player1', username: username });
          rooms.set(roomId, roomState);

          connections.set(ws, { roomId, username });

          ws.send(JSON.stringify({ type: 'roomJoined', payload: { roomId, role: 'player1', isHost: true } }));
          sendInitialState(ws, roomId);

        } else if (data.type === 'joinRoom') {
          const { roomId, username } = data.payload;
          const room = rooms.get(roomId);

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room not found' } }));
            return;
          }

          if (room.password && room.password !== data.payload.password) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Incorrect room password' } }));
            return;
          }

          // Check entry fee balance for joiner
          if (room.entryFee && room.entryFee > 0) {
            const user = await db.getUser(username);
            if (user.coins < room.entryFee) {
              ws.send(JSON.stringify({ type: 'error', payload: { message: `This room requires ${room.entryFee} coins!` } }));
              return;
            }
            // Deduct fee from joiner AND host (host pays when game starts? or now? usually now)
            // Ideally: Deduct from both now.
            // Host logic: Deducting host fee on creation is safer, but let's do simple validation now and deduct on game start?
            // "Deduct Fee: When a player joins a custom room with a fee, verify balance and deduct coins." - Plan
            // Let's deduct from Joiner NOW. Host? We didn't deduct host yet.
            // Let's just deduct joiner fee for now to match prompt "entry fee". Host usually sets it.
            // Assume "Entry Fee" means "Cost to enter". Host creates it... does Host pay? Usually yes in wager matches.
            // Let's deduct from BOTH to be fair if it's a wager. If it's just a price ticket, host gets it?
            // Prompt says: "oda oluştrumada kaç voinlik bi maç olduğunu belirt" -> "specify how many coins match it is".
            // This implies a wager/bet. So both pay, winner takes all (or pot).

            // Deduct from Host (if not already?) - Host created it, we didn't deduct yet.
            // We should have deducted from host on creation? Or purely check balance?
            // Let's deduct from Joiner here.
            await db.updateCoins(username, -room.entryFee);
            // Deduct from Host now too (or when created? Better when created to prevent "fake" hosts)
            // Limitation: We didn't deduct host on create. Let's fix create flow or just deduct joiner for now as "price to play against me".
            // If it's a wager, host should pay too. 
            // Let's implement: Joiner pays Room Fee. Host pays Room Fee (deducting from Host now is valid if we assume they committed).
            // Actually, safe bet: Deduct from Joiner. Deduct from Host. Prize = Fee * 2.
            await db.updateCoins(room.host, -room.entryFee);

            room.prize = room.entryFee * 2; // Winner takes pot

            // Send balance updates
            const updatedJoiner = await db.getUser(username);
            ws.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: updatedJoiner.coins } }));

            // Host might be online, need their socket to send balance update...
            // Host is player1
            const hostPlayer = room.players.find(p => p.role === 'player1');
            if (hostPlayer && hostPlayer.socket.readyState === WebSocket.OPEN) {
              const updatedHost = await db.getUser(room.host);
              hostPlayer.socket.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: updatedHost.coins } }));
            }
          }

          // Check if already in room (reconnect logic could go here, but simple for now)
          if (room.players.length >= 2) {
            // Spectator logic could go here
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room is full' } }));
            return;
          }

          const role = 'player2';
          room.players.push({ socket: ws, role, username });
          connections.set(ws, { roomId, username });

          ws.send(JSON.stringify({ type: 'roomJoined', payload: { roomId, role, isHost: false } }));
          sendInitialState(ws, roomId);

          // Notify others
          broadcastToRoom(roomId, {
            type: 'playerJoined',
            payload: { role, username }
          });

        } else if (data.type === 'joinLeague') {
          const { leagueId, username } = data.payload;
          const LEAGUES = {
            'amateur': { cost: 10, prize: 20 },
            'pro': { cost: 25, prize: 50 },
            'elite': { cost: 50, prize: 100 }
          };

          const league = LEAGUES[leagueId];
          if (!league) return;

          // Check balance
          const user = await db.getUser(username);
          if (user.coins < league.cost) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Insufficient coins!' } }));
            return;
          }

          // Deduct entry fee
          await db.updateCoins(username, -league.cost);
          const updatedUser = await db.getUser(username);
          ws.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: updatedUser.coins } }));

          // Simple Matchmaking Queue (In-Memory)
          if (!global.queues) global.queues = {};
          if (!global.queues[leagueId]) global.queues[leagueId] = [];

          const queue = global.queues[leagueId];

          if (queue.length > 0) {
            // Match found!
            const opponent = queue.shift();
            // Update counts immediately
            broadcastOnlineCounts();

            const roomId = `Match-${Date.now()}`; // Auto-generated ID

            const roomState = createGameState();
            roomState.host = opponent.username; // Randomly assigned host
            roomState.league = leagueId; // Mark as league game
            roomState.prize = league.prize;

            // Player 1 (Opponent from queue)
            roomState.players.push({ socket: opponent.socket, role: 'player1', username: opponent.username });
            connections.set(opponent.socket, { roomId, username: opponent.username });

            // Player 2 (Current user)
            roomState.players.push({ socket: ws, role: 'player2', username: username });
            connections.set(ws, { roomId, username });

            roomState.status = 'pending_acceptance'; // Wait for confirmation
            roomState.accepted = new Set();
            rooms.set(roomId, roomState);

            // Notify Player 1
            if (opponent.socket.readyState === WebSocket.OPEN) {
              opponent.socket.send(JSON.stringify({ type: 'roomJoined', payload: { roomId, role: 'player1', isHost: true } }));
              sendInitialState(opponent.socket, roomId);
              opponent.socket.send(JSON.stringify({ type: 'playerJoined', payload: { role: 'player2', username } }));
            }

            // Notify Player 2
            ws.send(JSON.stringify({ type: 'roomJoined', payload: { roomId, role: 'player2', isHost: false } }));
            sendInitialState(ws, roomId);

            // Start Game handled via acceptMatch now

          } else {
            // Convert circular structure (socket) to something safe or just store simple obj
            queue.push({ socket: ws, username });
            // Update counts immediately
            broadcastOnlineCounts();
            ws.send(JSON.stringify({ type: 'waitingForMatch', payload: { league: leagueId } }));
          }

        } else if (data.type === 'acceptMatch') {
          const { roomId, username } = connections.get(ws) || {};
          const room = rooms.get(roomId);
          if (!room || room.status !== 'pending_acceptance') return;

          room.accepted.add(username);

          // Notify room that this player accepted (optional, for UI feedback)
          broadcastToRoom(roomId, { type: 'playerAccepted', payload: { username } });

          if (room.accepted.size >= 2) {
            room.status = 'playing';
            broadcastToRoom(roomId, { type: 'gameStarted' });
          }

        } else if (data.type === 'sendEmoji') {
          const { roomId, username } = connections.get(ws) || {};
          const room = rooms.get(roomId);
          if (!room) return;

          const player = room.players.find(p => p.socket === ws);
          const role = player ? player.role : 'spectator';

          broadcastToRoom(roomId, {
            type: 'emojiReceived',
            payload: { emoji: data.payload.emoji, senderRole: role, username }
          });

        } else if (data.type === 'startGame') {
          const { roomId } = connections.get(ws) || {};
          const room = rooms.get(roomId);
          if (!room) return;

          if (room.host !== connections.get(ws).username) {
            return; // Only host can start
          }

          if (room.players.length < 2) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Need 2 players to start' } }));
            return;
          }

          room.status = 'playing';
          broadcastToRoom(roomId, { type: 'gameStarted' });

        } else if (data.type === 'makeMove') {
          const { row, col, playerName } = data.payload;
          const conn = connections.get(ws);
          if (!conn) return;
          const { roomId } = conn;
          const room = rooms.get(roomId);
          if (!room) return;

          const player = room.players.find(p => p.socket === ws);
          if (!player) return;
          const playerRole = player.role;

          // Validate move
          let rejectionReason = null;

          if (room.status !== 'playing') rejectionReason = 'Game not started';
          else if (playerRole !== room.currentTurn) rejectionReason = 'Not your turn';
          else if (room.board[row][col] !== null) rejectionReason = 'Cell is already occupied';
          else if (room.usedFootballers.has(playerName)) rejectionReason = 'Footballer used';

          if (rejectionReason) {
            ws.send(JSON.stringify({ type: 'moveRejected', payload: { reason: rejectionReason } }));
            return;
          }

          const rowTeam = room.teams.rows[row];
          const colTeam = room.teams.cols[col];

          if (!isValidFootballerForTeams(playerName, rowTeam, colTeam)) {
            broadcastToRoom(roomId, {
              type: 'moveMissed',
              payload: { player: playerRole, playerName, row, col }
            });
            room.currentTurn = room.currentTurn === 'player1' ? 'player2' : 'player1';
            broadcastToRoom(roomId, { type: 'turnChanged', payload: { currentTurn: room.currentTurn } });
            return;
          }

          room.board[row][col] = { player: playerRole, footballer: playerName };
          room.usedFootballers.add(playerName);

          const winnerResult = checkWinner(room.board);

          broadcastToRoom(roomId, {
            type: 'moveAccepted',
            payload: { row, col, playerName, by: playerRole, board: room.board }
          });

          if (winnerResult) {
            broadcastToRoom(roomId, {
              type: 'gameOver',
              payload: {
                winner: winnerResult.winner,
                winningCells: winnerResult.winningCells,
                board: room.board,
                prize: room.prize || 0 // Send prize info
              }
            });

            // Update stats & coins
            if (winnerResult.winner !== 'draw') {
              const winnerPlayer = room.players.find(p => p.role === winnerResult.winner);
              const loserPlayer = room.players.find(p => p.role !== winnerResult.winner);
              if (winnerPlayer) db.updateStats(winnerPlayer.username, 'win');
              if (loserPlayer) db.updateStats(loserPlayer.username, 'loss');

              // Prize Logic
              if (room.prize) {
                if (winnerPlayer) {
                  db.updateCoins(winnerPlayer.username, room.prize);
                  // Notify balance update
                  const u = await db.getUser(winnerPlayer.username);
                  winnerPlayer.socket.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: u.coins } }));
                }
              }
            } else {
              // Draw Logic - Refund if it was a paid room?
              if (room.entryFee && room.entryFee > 0) {
                room.players.forEach(async p => {
                  await db.updateCoins(p.username, room.entryFee); // Refund fee
                  const u = await db.getUser(p.username);
                  if (p.socket.readyState === WebSocket.OPEN) {
                    p.socket.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: u.coins } }));
                  }
                });
              }
            }

            setTimeout(() => {
              // If league, maybe don't reset room? Just kick or close?
              // For now standard reset logic
              resetRoom(roomId);
              broadcastToRoom(roomId, { type: 'gameReset', payload: { board: room.board, currentTurn: room.currentTurn } });
            }, 5000);

          } else {
            room.currentTurn = room.currentTurn === 'player1' ? 'player2' : 'player1';
            broadcastToRoom(roomId, { type: 'turnChanged', payload: { currentTurn: room.currentTurn } });
          }
        } else if (data.type === 'leaveRoom') {
          const conn = connections.get(ws);
          if (conn && conn.roomId) {
            const { roomId, username } = conn;
            // Update connection mapping to remove roomId
            connections.set(ws, { username }); // Keep username, remove roomId

            const room = rooms.get(roomId);
            if (room) {
              const playerIndex = room.players.findIndex(p => p.socket === ws);
              if (playerIndex > -1) {
                // Determine if this is a forfeit (game is playing)
                if (room.status === 'playing') {
                  const leavingPlayerRole = room.players[playerIndex].role;
                  const winnerRole = leavingPlayerRole === 'player1' ? 'player2' : 'player1';
                  const winnerPlayer = room.players.find(p => p.role === winnerRole);

                  console.log(`Player ${username} left active game. Forfeit! Winner: ${winnerPlayer?.username}`);

                  if (winnerPlayer) {
                    // Update DB stats
                    db.updateStats(winnerPlayer.username, 'win');
                    db.updateStats(username, 'loss'); // Leaver gets loss

                    // Award Prize
                    if (room.prize) {
                      db.updateCoins(winnerPlayer.username, room.prize);
                      // Notify balance update
                      (async () => { // Async wrapper for DB call
                        const u = await db.getUser(winnerPlayer.username);
                        if (winnerPlayer.socket.readyState === WebSocket.OPEN) {
                          winnerPlayer.socket.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: u.coins } }));
                        }
                      })();
                    }

                    // Notify Winner of Forfeit
                    if (winnerPlayer.socket.readyState === WebSocket.OPEN) {
                      winnerPlayer.socket.send(JSON.stringify({
                        type: 'gameOver',
                        payload: {
                          winner: winnerRole,
                          winningCells: null,
                          board: room.board,
                          reason: 'opponent_left' // Special reason
                        }
                      }));
                    }
                  }
                }

                room.players.splice(playerIndex, 1);
              }

              if (room.players.length === 0) {
                rooms.delete(roomId);
              } else {
                // Host migration (if valid)
                if (room.host === username) {
                  room.host = room.players[0].username;
                }

                // Match Cancelled logic
                if (room.status === 'pending_acceptance') {
                  broadcastToRoom(roomId, { type: 'matchCancelled' });
                  rooms.delete(roomId); // Destroy room immediately
                  return;
                }

                // Notify leave
                broadcastToRoom(roomId, { type: 'playerLeft', payload: { username } });

                // Reset room if playing (and not already handled by forfeit logic above? forfeit logic handles winner, but room state should reset)
                if (room.status === 'playing') {
                  room.status = 'waiting';
                  resetRoom(roomId);
                  broadcastToRoom(roomId, { type: 'gameReset', payload: { board: room.board, currentTurn: room.currentTurn } });
                }
              }
            }
            // Confirm leave to client
            ws.send(JSON.stringify({ type: 'leftRoom' }));
          }

        } else if (data.type === 'leaveQueue') {
          // Remove from all queues
          let queueChanged = false;
          if (global.queues) {
            for (const leagueId in global.queues) {
              const queue = global.queues[leagueId];
              const index = queue.findIndex(p => p.socket === ws);
              if (index > -1) {
                queue.splice(index, 1);
                queueChanged = true;
                // Refund entry fee if canceling search?
                // Logic: If they paid to join queue, refund them.
                // League Join logic deducted cost. So we must refund.
                const LEAGUES = {
                  'amateur': { cost: 10 },
                  'pro': { cost: 25 },
                  'elite': { cost: 50 }
                };
                const league = LEAGUES[leagueId];
                if (league) {
                  const u = await db.getUser(connections.get(ws).username);
                  if (u) {
                    await db.updateCoins(u.username, league.cost);
                    // Send balance update
                    const updatedUser = await db.getUser(u.username);
                    ws.send(JSON.stringify({ type: 'balanceUpdate', payload: { coins: updatedUser.coins } }));
                  }
                }
              }
            }
          }
          if (queueChanged) broadcastOnlineCounts();

        } else if (data.type === 'getRooms') {
          // Send list of rooms
          // Filter out full or started rooms if desired, or show all
          const roomList = Array.from(rooms.entries())
            .filter(([id, r]) => !r.league) // Hide league matches from public list?
            .map(([id, r]) => ({
              id,
              players: r.players.length,
              status: r.status,
              host: r.host,
              hasPassword: !!r.password,
              entryFee: r.entryFee || 0 // Send entry fee info
            }));
          ws.send(JSON.stringify({ type: 'roomList', payload: roomList }));
        }

      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      // Clean up queues just in case
      let queueChanged = false;
      if (global.queues) {
        for (const leagueId in global.queues) {
          const originalLen = global.queues[leagueId].length;
          global.queues[leagueId] = global.queues[leagueId].filter(p => p.socket !== ws);
          if (global.queues[leagueId].length !== originalLen) queueChanged = true;
        }
      }
      if (queueChanged) broadcastOnlineCounts();

      const conn = connections.get(ws);
      if (conn) {
        const { roomId, username } = conn;
        connections.delete(ws);

        const room = rooms.get(roomId);
        if (room) {
          const playerIndex = room.players.findIndex(p => p.socket === ws);
          if (playerIndex > -1) {
            room.players.splice(playerIndex, 1);
          }

          if (room.players.length === 0) {
            rooms.delete(roomId); // Delete empty room
          } else {
            // Host migration
            if (room.host === username) {
              room.host = room.players[0].username;
              // Ideally notify about new host
            }
            // Notify leave
            broadcastToRoom(roomId, { type: 'playerLeft', payload: { username } });
            // Reset if playing? Or wait/forfeit? For now, if playing and someone leaves, game essentially breaks/ends.
            // Simple logic: Reset room to waiting
            if (room.status === 'playing') {
              room.status = 'waiting';
              resetRoom(roomId);
              broadcastToRoom(roomId, { type: 'gameReset', payload: { board: room.board, currentTurn: room.currentTurn } });
            }
          }
        }
      }
    });
  });

  // Auth Routes
  server.post('/api/register', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
      await db.createUser(username, password);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'User already exists or other error' });
    }
  });

  server.post('/api/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await db.loginUser(username, password);
      if (user) {
        res.json({ success: true, user });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // HTTP Routes
  server.get('/api/leaderboard', async (req, res) => {
    try {
      const dashboard = await db.getLeaderboard();
      res.json(dashboard);
    } catch (e) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // Health check endpoint
  server.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Players list endpoint
  server.get('/players', (req, res) => {
    // Reload players data on each request (in case it was updated)
    loadPlayers();
    res.json(playersData);
  });

  // All other routes are handled by Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket server ready on ws://localhost:${PORT}`);
  });
});



