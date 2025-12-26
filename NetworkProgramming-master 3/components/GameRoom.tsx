import { useState } from 'react';
import TopBar from './TopBar';

interface GameRoomProps {
    user: any;
    roomId: string;
    role: string;
    isHost: boolean;
    gameState: any;
    gameOver: any;
    error: string | null;
    onStartGame: () => void;
    onLeave: (isForfeit?: boolean) => void;
    onMakeMove: (row: number, col: number, player: string) => void;
    onAcceptMatch: () => void;
    playersData: any[]; // Kept for types? Actually purely visual now if server sends options
    currentOptions: any[] | null;
    onRequestOptions: (row: number, col: number) => void;
}

export default function GameRoom({
    user, roomId, role, isHost, gameState, gameOver, error,
    onStartGame, onLeave, onMakeMove, onAcceptMatch, playersData,
    currentOptions, onRequestOptions
}: GameRoomProps) {
    const [selectedCell, setSelectedCell] = useState<{ row: number, col: number } | null>(null);
    const [showForfeitModal, setShowForfeitModal] = useState(false);
    const [hasAccepted, setHasAccepted] = useState(false);

    const handleLeaveRequest = () => {
        if (gameState.status === 'playing' && !gameOver) {
            setShowForfeitModal(true);
        } else {
            onLeave(); // Direct leave for other states
        }
    };

    const confirmForfeit = () => {
        setShowForfeitModal(false);
        onLeave(true); // Indicate forfeit
    };

    const cancelForfeit = () => {
        setShowForfeitModal(false);
    };

    const handleAccept = () => {
        setHasAccepted(true);
        onAcceptMatch();
    };

    // Derived state for rendering
    const playerOptions = currentOptions || [];

    const canStart = isHost && gameState.status === 'waiting' && gameState.players.length >= 2;


    const getPlayerName = (r: string) => {
        const p = gameState.players.find((pl: any) => pl.role === r);
        return p ? p.username : r === 'player1' ? 'HOST' : 'OPPONENT';
    };

    const opponentRole = role === 'player1' ? 'player2' : 'player1';
    const opponent = gameState.players.find((p: any) => p.role === opponentRole);

    return (
        <div className="dashboard-container fade-in">
            <TopBar
                user={user}
                onLeave={handleLeaveRequest}
            />

            {/* Match Found / Acceptance Overlay */}
            {gameState.status === 'pending_acceptance' && (
                <div className="game-over-modal" style={{ background: 'rgba(0,0,0,0.85)' }}>
                    <div className="content glass-panel" style={{ padding: '3rem', minWidth: '400px' }}>
                        <h1 className="pulse" style={{ color: '#00ff88', marginBottom: '1rem' }}>MATCH FOUND!</h1>
                        <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                            <div className="slot-avatar" style={{ width: '60px', height: '60px', fontSize: '1rem' }}>{opponent ? opponent.username.substring(0, 2).toUpperCase() : '?'}</div>
                            <span className="opp-name" style={{ fontSize: '2rem' }}>{opponent ? opponent.username : 'OPPONENT'}</span>
                        </div>

                        {!hasAccepted ? (
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button className="start-game-btn" style={{ background: 'transparent', border: '1px solid #ff2a6d', color: '#ff2a6d' }} onClick={() => onLeave(false)}>
                                    CANCEL
                                </button>
                                <button className="start-game-btn" onClick={handleAccept}>
                                    START MATCH
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div className="match-spinner" style={{ width: '50px', height: '50px', marginBottom: '1rem' }}></div>
                                <p style={{ color: '#aaa' }}>Waiting for opponent...</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ... Rest of Main Content ... */}
            <div className="main-content" style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                {/* ... Render regular game content only if NOT pending or if we want it in bg ... 
        Actually, we can render it but the overlay will cover it. 
        But status is 'pending_acceptance', so specific blocks below need to handle that or fallback to defaults.
        Existing blocks check status === 'waiting' or 'playing', so pending_acceptance will just show nothing in main content or header. 
        Let's keep the header at least.
    */}
                {/* Match Header Info */}
                <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', alignItems: 'center', position: 'relative' }}>
                    <div className="match-vs-header">
                        <span className="my-name">{user.username}</span>
                        <span className="vs-badge">VS</span>
                        <span className="opp-name">{opponent ? opponent.username : 'WAITING...'}</span>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', width: '100%' }}>
                    {gameState.status === 'waiting' && (
                        <div className="waiting-lobby">
                            <div className="player-slots">
                                <div className="slot filled">
                                    <div className="slot-avatar">{user.username.substring(0, 2).toUpperCase()}</div>
                                    <span>{user.username}</span>
                                </div>
                                <div className={`slot ${gameState.players.length >= 2 ? 'filled' : 'empty'}`}>
                                    <div className="slot-avatar">{opponent ? opponent.username.substring(0, 2).toUpperCase() : '?'}</div>
                                    <span>{opponent ? opponent.username : 'WAITING...'}</span>
                                </div>
                            </div>

                            {isHost ? (
                                <div className="host-controls">
                                    <button
                                        className={`start-game-btn ${canStart ? 'pulse' : 'disabled'}`}
                                        onClick={canStart ? onStartGame : undefined}
                                        disabled={!canStart}
                                    >
                                        KICK OFF
                                    </button>
                                    {!canStart && <p className="hint-text">Waiting for opponent to join the pitch...</p>}
                                </div>
                            ) : (
                                <div className="guest-msg">
                                    <div className="loader"></div>
                                    <p>Waiting for host to kick off...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {gameState.status === 'playing' && (
                        <>
                            <div className="game-status-bar">
                                <div className={`player-indicator ${gameState.currentTurn === 'player1' ? 'active-turn' : ''}`}>
                                    {getPlayerName('player1')}
                                </div>
                                <div className="vs">VS</div>
                                <div className={`player-indicator ${gameState.currentTurn === 'player2' ? 'active-turn' : ''}`}>
                                    {getPlayerName('player2')}
                                </div>
                            </div>

                            <div className="current-turn-msg">
                                {gameState.currentTurn === role ? <span className="highlight">YOUR TACTICAL TURN</span> : `OPPONENT'S MOVE`}
                            </div>

                            {error && <div className="error-toast">{error}</div>}

                            <div className="board-wrapper">
                                <div className="game-board">
                                    <div className="corner-cell"></div>
                                    {gameState.teams.cols.map((t: string, i: number) => (
                                        <div key={`h-${i}`} className="header-cell col-header">{t}</div>
                                    ))}

                                    {gameState.teams.rows.map((rowTeam: string, r: number) => (
                                        <>
                                            <div key={`v-${r}`} className="header-cell row-header">{rowTeam}</div>
                                            {gameState.teams.cols.map((_: any, c: number) => {
                                                const cell = gameState.board[r][c];
                                                const isWin = gameOver?.winningCells?.some(([wr, wc]: any) => wr === r && wc === c);
                                                return (
                                                    <div
                                                        key={`${r}-${c}`}
                                                        className={`board-cell ${cell ? 'filled' : ''} ${isWin ? 'winning' : ''}`}
                                                        onClick={() => {
                                                            if (role !== gameState.currentTurn) return;
                                                            if (!cell && !gameOver) {
                                                                setSelectedCell({ row: r, col: c });
                                                                onRequestOptions(r, c);
                                                            }
                                                        }}
                                                    >
                                                        {cell ? (
                                                            <div className={`cell-content player-${cell.player}`}>
                                                                <span className="footballer-name">{cell.footballer}</span>
                                                                <span className="player-tag">{cell.player === 'player1' ? 'P1' : 'P2'}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="plus-icon">+</span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {
                selectedCell && (
                    <div className="modal-overlay" onClick={() => setSelectedCell(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <h3>Who played for both?</h3>
                            <p style={{ marginBottom: '15px', color: 'var(--text-muted)' }}>
                                {gameState.teams.rows[selectedCell.row]} & {gameState.teams.cols[selectedCell.col]}
                            </p>
                            <div className="player-list">
                                {currentOptions === null ? (
                                    <div className="loading-spinner-container">
                                        <div className="spinner"></div>
                                        <p>Loading options...</p>
                                    </div>
                                ) : currentOptions.length === 0 ? (
                                    <div style={{ padding: '1rem', textAlign: 'center' }}>
                                        <p style={{ color: '#ff4444', marginBottom: '0.5rem' }}>No options found!</p>
                                        {error && (
                                            <p style={{ color: '#ffaa44', fontSize: '0.9rem' }}>{error}</p>
                                        )}
                                    </div>
                                ) : (
                                    playerOptions.map((opt: any, i: number) => (
                                        <button
                                            key={i}
                                            className={`player-button ${opt.isUsed ? 'disabled' : ''}`}
                                            onClick={() => {
                                                if (opt.isUsed) return;
                                                onMakeMove(selectedCell.row, selectedCell.col, opt.name);
                                                setSelectedCell(null);
                                            }}
                                            disabled={opt.isUsed}
                                        >
                                            {opt.name} {opt.isUsed ? '(Used)' : ''}
                                        </button>
                                    ))
                                )}
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '15px' }}>
                                <button
                                    className="cancel-btn-large"
                                    style={{
                                        background: '#333',
                                        color: '#fff',
                                        border: '1px solid #555',
                                        padding: '12px 24px',
                                        fontSize: '1rem',
                                        borderRadius: '8px',
                                        width: '100%',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                    onClick={() => setSelectedCell(null)}
                                >
                                    Cancel Selection
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                gameOver && (
                    <div className="game-over-modal">
                        <div className="content">
                            {gameOver.reason === 'opponent_left' ? (
                                <>
                                    <h1 style={{ color: '#00ff88', textShadow: '0 0 30px rgba(0,255,136,0.5)' }}>VICTORY!</h1>
                                    <p style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>OPPONENT FORFEITED</p>
                                    <div style={{ fontSize: '4rem', marginBottom: '2rem' }}>🏆</div>
                                    <button className="start-game-btn pulse" onClick={() => onLeave(false)}>RETURN TO LOBBY</button>
                                </>
                            ) : (
                                <>
                                    <h1>{gameOver.winner === role ? 'You won' : gameOver.winner === 'draw' ? 'Draw' : 'You lost'}</h1>
                                    <p>{gameOver.winner === 'draw' ? "It's a tie!" : `Winner: ${gameOver.winner === 'player1' ? 'Player 1' : 'Player 2'}`}</p>

                                    {gameOver.winner === role && gameOver.prize > 0 && (
                                        <div className="prize-display" style={{ fontSize: '1.5rem', color: '#ffd700', margin: '1rem 0' }}>
                                            +{gameOver.prize} Coins 🪙
                                        </div>
                                    )}

                                    <button className="start-game-btn" onClick={() => onLeave(false)}>Return to Lobby</button>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Forfeit Confirmation Modal */}
            {showForfeitModal && (
                <div className="game-over-modal">
                    <div className="content glass-panel" style={{ padding: '3rem', border: '1px solid #ff2a6d', boxShadow: '0 0 50px rgba(255, 42, 109, 0.2)' }}>
                        <h1 style={{ color: '#ff2a6d', marginBottom: '1rem', textShadow: '0 0 20px rgba(255, 42, 109, 0.5)' }}>WARNING</h1>
                        <p style={{ fontSize: '1.2rem', marginBottom: '2rem', color: '#fff' }}>
                            Are you sure you want to leave?<br />
                            <span style={{ color: '#ff2a6d', fontWeight: 'bold' }}>YOU WILL FORFEIT THE GAME</span>
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button className="start-game-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }} onClick={cancelForfeit}>
                                CANCEL
                            </button>
                            <button className="start-game-btn" style={{ background: '#ff2a6d', border: 'none' }} onClick={confirmForfeit}>
                                YES, FORFEIT
                            </button>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
}
