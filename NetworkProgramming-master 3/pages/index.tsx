import { useState, useEffect, useRef, useCallback } from 'react';
import AuthView from '../components/AuthView';
import LobbyView from '../components/LobbyView';
import GameRoom from '../components/GameRoom';

interface Player {
  name: string;
  teams: string[];
}

interface Cell {
  player: 'player1' | 'player2';
  footballer: string;
}

interface GameState {
  board: (Cell | null)[][];
  teams: {
    rows: string[];
    cols: string[];
  };
  currentTurn: 'player1' | 'player2';
  players: string[]; // roles
  status: 'waiting' | 'playing';
  roomId: string;
}

interface User {
  username: string;
  wins: number;
  losses: number;
  coins: number;
}

interface RoomInfo {
  id: string;
  players: number;
  status: 'waiting' | 'playing';
  host: string;
  hasPassword: boolean;
}

export default function Home() {
  // Application State
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'auth' | 'lobby' | 'room'>('auth');
  const [error, setError] = useState<string | null>(null);
  const [isMatchmaking, setIsMatchmaking] = useState(false);

  // Lobby State
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [onlineCounts, setOnlineCounts] = useState<{ amateur: number, pro: number, elite: number }>({ amateur: 0, pro: 0, elite: 0 });

  // Game State
  const [playersData, setPlayersData] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentOptions, setCurrentOptions] = useState<any[] | null>(null); // Options from server
  const [myRole, setMyRole] = useState<'player1' | 'player2' | 'spectator'>('spectator');
  const [isHost, setIsHost] = useState(false);
  const [gameOver, setGameOver] = useState<{ winner: string; winningCells: number[][] | null } | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch players data (footballers)
  useEffect(() => {
    fetch('/players')
      .then((res) => res.json())
      .then((data) => setPlayersData(data))
      .catch((err) => console.error('Error fetching players:', err));
  }, []);

  // WebSocket Message Handling
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'roomList':
        setRooms(message.payload);
        break;
      case 'onlineCounts':
        setOnlineCounts(message.payload);
        break;

      case 'roomJoined':
        setIsMatchmaking(false);
        setMyRole(message.payload.role);
        setIsHost(message.payload.isHost);
        setView('room');
        setError(null);
        break;
      case 'init':
        setGameState(message.payload);
        setGameOver(null);
        break;
      case 'playerJoined':
        setGameState(prev => {
          if (!prev) return null;
          if (prev.players.includes(message.payload.role)) return prev;
          return {
            ...prev,
            players: [...prev.players, message.payload.role]
          };
        });
        break;
      case 'options':
        setCurrentOptions(message.payload.options || []);
        break;
      case 'gameStarted':
        setIsMatchmaking(false);
        setGameState(prev => prev ? { ...prev, status: 'playing' } : null);
        break;
      case 'moveAccepted':
        setGameState((prev) => {
          if (!prev) return prev;
          return { ...prev, board: message.payload.board };
        });
        setError(null);
        setCurrentOptions(null);
        break;
      case 'turnChanged':
        setGameState((prev) => {
          if (!prev) return prev;
          return { ...prev, currentTurn: message.payload.currentTurn };
        });
        break;
      case 'gameOver':
        // Alert handled by GameRoom now
        setGameOver(message.payload);
        setGameState(prev => prev ? { ...prev, board: message.payload.board } : null);
        break;
      case 'gameReset':
        setGameState(prev => prev ? { ...prev, board: message.payload.board, currentTurn: message.payload.currentTurn, status: 'waiting' } : null);
        // Preserve forfeit state
        setGameOver((prev: any) => (prev?.reason === 'opponent_left' || prev?.reason === 'forfeit') ? prev : null);
        setError(null);
        break;
      case 'moveRejected':
        setError(message.payload.reason);
        break;
      case 'moveMissed':
        // Just show error, state transition handling is on server (turn switch)
        setError(`❌ Player ${message.payload.player} missed!`);
        break;
      case 'error':
        setIsMatchmaking(false);
        setError(message.payload.message);
        break;
      case 'matchCancelled':
        setGameState(null);
        setView('lobby');
        setError('Match cancelled by opponent.');
        setIsMatchmaking(false);
        break;
      case 'balanceUpdate':
        if (user) {
          setUser({ ...user, coins: message.payload.coins });
        }
        break;

      case 'leftRoom':
        setIsMatchmaking(false);
        setGameState(null);
        setGameOver(null);
        setIsHost(false);
        setMyRole('spectator');
        setView('lobby');
        break;
      case 'waitingForMatch':
        setIsMatchmaking(true);
        break;
    }
  }, [user]);

  // Connect WebSocket when entering Lobby
  useEffect(() => {
    if (view === 'lobby' && !wsRef.current) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:3001`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'getRooms' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWebSocketMessage(msg);
        } catch (e) {
          console.error(e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (view === 'lobby' || view === 'room') {
          setTimeout(() => {
            // trigger re-render
            setWsConnected(false);
          }, 3000);
        }
      };
    }
  }, [view, handleWebSocketMessage]);

  const handleLoginSuccess = (user: User) => {
    setUser(user);
    setView('lobby');
  };

  const createRoom = (roomName: string, password?: string, entryFee?: number) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: 'createRoom',
      payload: { roomName, password, entryFee, username: user?.username }
    }));
  };

  const joinRoom = (roomId: string, hasPassword: boolean) => {
    if (!wsRef.current) return;
    let pass = '';
    if (hasPassword) {
      const input = prompt('Enter room password:');
      if (input === null) return;
      pass = input;
    }

    wsRef.current.send(JSON.stringify({
      type: 'joinRoom',
      payload: { roomId, password: pass, username: user?.username }
    }));
  };

  const refreshRooms = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'getRooms' }));
    }
  };

  const startGame = () => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'startGame' }));
  };

  const makeMove = (row: number, col: number, playerName: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: 'makeMove',
      payload: { row, col, playerName }
    }));
  };



  const leaveRoom = (isForfeit: boolean = false) => {
    if (!wsRef.current) return;

    wsRef.current.send(JSON.stringify({ type: 'leaveQueue' })); // Ensure we leave queue if stuck
    wsRef.current.send(JSON.stringify({ type: 'leaveRoom' }));

    if (isForfeit && gameState) {
      // Did not actually leave logic-wise in client yet, just sent request.
      // Show "You Forfeited" screen by faking a GameOver state
      setGameOver({
        winner: myRole === 'player1' ? 'player2' : 'player1',
        reason: 'forfeit',
        winningCells: [],
        board: gameState.board
      } as any);
      // Do NOT setGameState(null) or setView('lobby') yet.
    } else {
      setGameState(null);
      setGameOver(null);
      setView('lobby');
    }
  };

  // Join League
  const joinLeague = (leagueId: string) => {
    if (!wsRef.current) return;
    if (user && user.coins < (leagueId === 'amateur' ? 10 : leagueId === 'pro' ? 25 : 50)) {
      alert("Not enough coins!");
      return;
    }
    // Optimistic UI update
    // setIsMatchmaking(true); // Wait for server confirmation waitingForMatch
    wsRef.current.send(JSON.stringify({
      type: 'joinLeague',
      payload: { leagueId, username: user?.username }
    }));
  };

  const cancelMatchmaking = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'leaveQueue' }));
    }
    setIsMatchmaking(false);
  };

  const acceptMatch = () => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'acceptMatch' }));
  };

  const handleRequestOptions = (row: number, col: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setCurrentOptions(null); // Show loading
    wsRef.current.send(JSON.stringify({ type: 'getOptions', payload: { row, col } }));
  };

  return (
    <div>
      {/* Matchmaking Overlay */}
      {isMatchmaking && (
        <div className="matchmaking-overlay">
          <div className="match-content">
            <div className="match-spinner"></div>
            <div className="match-text">Searching for Opponent...</div>
            <button className="cancel-match-btn" onClick={cancelMatchmaking}>Cancel Search</button>
          </div>
        </div>
      )}

      {view === 'auth' && <AuthView onLogin={handleLoginSuccess} />}

      {view === 'lobby' && user && (
        <LobbyView
          user={user}
          rooms={rooms}
          onlineCounts={onlineCounts}
          connected={wsConnected}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onRefresh={refreshRooms}
          onJoinLeague={joinLeague}
        />
      )}

      {view === 'room' && gameState && (
        <GameRoom
          user={user}
          roomId={gameState.roomId}
          role={myRole}
          isHost={isHost}
          gameState={gameState}
          gameOver={gameOver}
          error={error}
          onStartGame={startGame}
          onLeave={leaveRoom}
          onMakeMove={makeMove}
          onAcceptMatch={acceptMatch}
          playersData={playersData}
          currentOptions={currentOptions}
          onRequestOptions={handleRequestOptions}
        />
      )}
    </div>
  );
}
