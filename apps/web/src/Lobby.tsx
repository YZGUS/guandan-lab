import { useMemo, useState } from 'react';
import type { ClientMessage, RoomSummary, SessionView } from '@guandan/protocol';

type Send = (message: Exclude<ClientMessage, { type: 'HELLO' }>) => boolean;

export function Lobby({ session, rooms, send }: { session: SessionView; rooms: RoomSummary[]; send: Send }) {
  const [name, setName] = useState(session.name || '玩家');
  const [roomName, setRoomName] = useState('周末掼蛋牌局');
  const [joinCode, setJoinCode] = useState('');
  const [botCount, setBotCount] = useState(3);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const available = useMemo(() => rooms.filter((room) => room.status === 'WAITING'), [rooms]);

  return (
    <main className="lobby-shell">
      <div className="lobby-layout">
        <header className="lobby-header">
          <div><p className="eyebrow">GUANDAN LAB</p><h1>四人两队，打过 A</h1><p>局域网与云端使用同一套规则和牌桌。</p></div>
          <div className="identity"><span>{name.slice(0, 1)}</span><div><small>当前昵称</small><strong>{name}</strong></div></div>
        </header>
        <section className="lobby-grid">
          <article className="lobby-card create-card">
            <p className="kicker">快速开桌</p><h2>创建四人好友房</h2>
            <p>默认由三个基础搭档 Bot 补位，可以减少 Bot 后等待真人加入。</p>
            <label>你的昵称<input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} /></label>
            <label>房间名称<input value={roomName} maxLength={30} onChange={(event) => setRoomName(event.target.value)} /></label>
            <div className="compact-fields">
              <label>Bot 数量<select value={botCount} onChange={(event) => setBotCount(Number(event.target.value))}>{[0, 1, 2, 3].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>行动时间<select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}>{[20, 30, 45, 60].map((value) => <option key={value} value={value}>{value} 秒</option>)}</select></label>
            </div>
            <button className="primary-button" onClick={() => send({ type: 'CREATE_ROOM', roomName, playerName: name, botCount, turnSeconds })} disabled={!name.trim() || !roomName.trim()}>创建牌桌</button>
          </article>
          <article className="lobby-card join-card">
            <p className="kicker">加入牌局</p><h2>输入六位房间码</h2>
            <p>同一 Wi-Fi 下访问开桌设备的地址，或通过云端域名进入。</p>
            <input className="room-code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))} placeholder="ABC234" />
            <button onClick={() => send({ type: 'JOIN_ROOM', roomId: joinCode, playerName: name })} disabled={joinCode.length < 4 || !name.trim()}>加入房间</button>
            <div className="mode-notes"><span>4 人固定牌桌</span><span>南北 / 东西搭档</span><span>断线恢复</span></div>
          </article>
        </section>
        <section className="room-list">
          <header><div><h2>可加入的牌桌</h2><p>{available.length ? `${available.length} 个房间正在等待` : '暂时没有公开等待中的房间'}</p></div><button onClick={() => send({ type: 'LIST_ROOMS' })}>刷新</button></header>
          {available.map((room) => <article className="room-row" key={room.id}><div><strong>{room.name}</strong><span>#{room.id}</span></div><span>{room.humanCount} 真人 · {room.botCount} Bot</span><b>{room.playerCount}/4</b><button onClick={() => send({ type: 'JOIN_ROOM', roomId: room.id, playerName: name })}>加入</button></article>)}
        </section>
      </div>
    </main>
  );
}
