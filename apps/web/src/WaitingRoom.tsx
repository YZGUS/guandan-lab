import type { ClientMessage, RoomView } from '@guandan/protocol';

type Send = (message: Exclude<ClientMessage, { type: 'HELLO' }>) => boolean;

export function WaitingRoom({ room, send }: { room: RoomView; send: Send }) {
  const isHost = room.hostPlayerId === room.viewerPlayerId;
  return (
    <main className="waiting-shell">
      <header className="waiting-header"><div><p className="eyebrow">WAITING ROOM</p><h1>{room.name}</h1></div><button onClick={() => send(isHost ? { type: 'DISBAND_ROOM' } : { type: 'LEAVE_ROOM' })}>{isHost ? '解散' : '离开'}</button></header>
      <section className="waiting-card">
        <div className="room-code"><span>分享房间码</span><strong>{room.id}</strong><small>让其他玩家打开同一地址后输入</small></div>
        <div className="seat-grid">
          {[0, 1, 2, 3].map((seat) => {
            const player = room.players.find((item) => item.seat === seat);
            return <article key={seat} className={player ? 'occupied' : ''}><b>{['南家', '东家', '北家', '西家'][seat]}</b>{player ? <><span className={player.kind === 'BOT' ? 'bot-avatar' : 'human-avatar'}>{player.kind === 'BOT' ? 'AI' : player.name.slice(0, 1)}</span><div><strong>{player.name}</strong><small>{seat % 2 === 0 ? '南北队' : '东西队'} · {player.connected ? '在线' : '断线'}</small></div></> : <span className="empty-seat">等待玩家</span>}</article>;
          })}
        </div>
        {isHost ? <button className="primary-button" disabled={room.playerCount !== 4} onClick={() => send({ type: 'START_GAME' })}>{room.playerCount === 4 ? '开始牌局' : `还需 ${4 - room.playerCount} 位玩家`}</button> : <p className="waiting-note">等待房主开始牌局</p>}
      </section>
    </main>
  );
}
