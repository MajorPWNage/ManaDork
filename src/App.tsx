import { GameBoard } from './components/GameBoard';
import { RoomLobby } from './components/RoomLobby';
import { useRoomState } from './hooks/useRoomState';

function App() {
  const {
    room,
    joinCode,
    setJoinCode,
    createRoom,
    joinRoom,
    adjustLife,
    adjustPoison,
    adjustCommanderTax,
    adjustCommanderDamage,
    renamePlayer,
    resetGame,
    newGameWithSettings,
    revertLogAction,
    status,
    recentRooms,
    connectedCount,
    isOnline,
    hasSupabase,
    setTurnSeatIndex,
    leaveRoom,
    focusedSeatId,
    clientRoomRole
  } = useRoomState();

  return (
    <div className="min-h-screen bg-arcane font-display text-white">
      {!room ? (
        <RoomLobby
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          createLocalRoom={(settings) => createRoom('local', settings)}
          createOnlineRoom={(settings, hostOnlyMode) =>
            createRoom('online', settings, hostOnlyMode ? 'host' : 'player')
          }
          joinRoom={() => joinRoom(joinCode)}
          joinRoomByCode={(roomCode) => joinRoom(roomCode)}
          recentRooms={recentRooms}
          hasSupabase={hasSupabase}
        />
      ) : (
        <GameBoard
          room={room}
          status={status}
          connectedCount={connectedCount}
          isOnline={isOnline}
          focusedSeatId={focusedSeatId}
          clientRoomRole={clientRoomRole}
          onAdjustLife={adjustLife}
          onAdjustPoison={adjustPoison}
          onAdjustTax={adjustCommanderTax}
          onAdjustCommanderDamage={adjustCommanderDamage}
          onRenamePlayer={renamePlayer}
          onRevertLogAction={revertLogAction}
          onReset={resetGame}
          onNewGameWithSettings={newGameWithSettings}
          onSetTurn={setTurnSeatIndex}
          onLeave={leaveRoom}
        />
      )}
    </div>
  );
}

export default App;