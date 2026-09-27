import { Fragment, useEffect, useMemo, useState } from 'react';
import { beats, classifyPlay, type Card, type Combo, type PlayerView, type Seat, type TableView } from '@guandan/core';
import type { ClientMessage, RoomView } from '@guandan/protocol';
import { CardFace } from './CardFace';

type Send = (message: Exclude<ClientMessage, { type: 'HELLO' }>) => boolean;

function relativeSeat(seat: Seat, viewer: Seat) {
  const relative = (seat - viewer + 4) % 4;
  return ['hero', 'right', 'partner', 'left'][relative];
}

function comboText(combo: Combo | null) {
  if (!combo) return '自由领出';
  return combo.label;
}

export function GameTable({ room, table, view, send, connection }: {
  room: RoomView;
  table: TableView;
  view: PlayerView;
  send: Send;
  connection: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<'rules' | 'history' | null>(null);
  const [now, setNow] = useState(Date.now());
  const selectedCards = useMemo(() => view.hand.filter((card) => selected.has(card.id)), [selected, view.hand]);
  const selectedCombo = useMemo(() => classifyPlay(selectedCards, table.levelRank), [selectedCards, table.levelRank]);
  const canPlay = Boolean(view.isTurn && selectedCombo && (!table.targetCombo || beats(selectedCombo, table.targetCombo)));
  const remainingSeconds = room.turnDeadline ? Math.max(0, Math.ceil((room.turnDeadline - now) / 1_000)) : null;

  useEffect(() => { setSelected(new Set()); }, [table.version]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  function toggle(card: Card) {
    if (!view.isTurn) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(card.id)) next.delete(card.id); else next.add(card.id);
      return next;
    });
  }

  function play() {
    if (!selectedCombo || !canPlay) return;
    send({
      type: 'ACTION',
      actionId: crypto.randomUUID(),
      matchId: table.matchId,
      expectedVersion: table.version,
      action: { type: 'PLAY', cardIds: selectedCards.map((card) => card.id), declaration: { type: selectedCombo.type, primaryRank: selectedCombo.primaryRank } },
    });
  }

  function pass() {
    if (!view.canPass) return;
    send({ type: 'ACTION', actionId: crypto.randomUUID(), matchId: table.matchId, expectedVersion: table.version, action: { type: 'PASS' } });
  }

  function hint() {
    const play = view.legalPlays[0];
    if (play) setSelected(new Set(play.cards.map((card) => card.id)));
  }

  const actions = (
    <div className="game-actions">
      <button disabled={!view.canPass} onClick={pass}>不要</button>
      <button disabled={!view.isTurn || !view.legalPlays.length} onClick={hint}>提示</button>
      <button className="primary" disabled={!canPlay} onClick={play}>出牌</button>
    </div>
  );

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <div className="game-brand"><span>掼</span><div><b>GUANDAN LAB</b><small>好友房 · {room.id}</small></div></div>
        <div className="level-status"><i>♥{table.levelRank}</i><b>本局打 {table.levelRank}</b><span>第 {table.dealNumber} 副</span></div>
        <div className="game-tools"><span className={`connection ${connection.toLowerCase()}`}></span><button onClick={() => setDrawer(drawer === 'rules' ? null : 'rules')}>规则</button><button onClick={() => setDrawer(drawer === 'history' ? null : 'history')}>记录</button></div>
      </header>
      <div className="game-body">
        <aside className="action-rail">
          <div className="turn-status"><i></i><strong>{view.isTurn ? '轮到你' : table.currentPlayer === null ? '本副结算' : `等待 ${table.players.find((player) => player.seat === table.currentPlayer)?.name}`}</strong><small>{view.isTurn && remainingSeconds !== null ? `剩余 ${remainingSeconds} 秒` : comboText(table.targetCombo)}</small></div>
          {actions}
        </aside>
        <section className="table-zone">
          <div className="team-score"><span>南北 {table.teams[0].level} 级</span><b>VS</b><span>东西 {table.teams[1].level} 级</span></div>
          <div className="felt-table">
            {table.players.map((player) => (
              <article key={player.id} className={`game-seat ${relativeSeat(player.seat, view.seat)}${player.seat === table.currentPlayer ? ' current' : ''}${player.finished ? ' finished' : ''}`}>
                <div className="seat-panel"><span className={player.team === table.players.find((item) => item.seat === view.seat)?.team ? 'ally-avatar' : 'opponent-avatar'}>{player.seat === view.seat ? '你' : player.kind === 'BOT' ? 'AI' : player.name.slice(0, 1)}</span><div><strong>{player.seat === view.seat ? '你' : player.name}</strong><small>{player.team === 0 ? '南北队' : '东西队'}</small></div><b>{player.cardCount}</b></div>
                <em>{player.finished ? `第 ${table.finishOrder.indexOf(player.seat) + 1} 名` : player.seat === table.currentPlayer ? '行动中' : player.team === (view.seat % 2) ? '搭档' : '对手'}</em>
              </article>
            ))}
            <div className="table-center">
              <div className="target-label"><span>{table.targetOwner === null ? '新一轮' : table.players.find((player) => player.seat === table.targetOwner)?.name}</span><b>{comboText(table.targetCombo)}</b></div>
              <div className="played-cards">{table.targetCombo?.cards.map((card) => <CardFace key={card.id} card={card} disabled />)}</div>
              <small>{view.isTurn ? (selectedCombo ? `已选：${selectedCombo.label}` : '选择手牌，或使用提示') : '等待其他玩家行动'}</small>
            </div>
          </div>
          <div className="hand-rack">
            <div className="hand-caption"><span>手牌 <b>{view.hand.length} 张</b></span><span>{selectedCards.length ? `已选 ${selectedCards.length} 张${selectedCombo ? ` · ${selectedCombo.label}` : ''}` : '点击牌面选择'}</span></div>
            <div className="hand-cards">
              {view.hand.map((card, index) => (
                <Fragment key={card.id}>
                  {index === 14 && <span className="hand-break" />}
                  <CardFace card={card} selected={selected.has(card.id)} wild={card.suit === 'hearts' && card.rank === table.levelRank} disabled={!view.isTurn} onClick={() => toggle(card)} />
                </Fragment>
              ))}
            </div>
          </div>
          {drawer && <aside className="game-drawer"><header><h2>{drawer === 'rules' ? '规则速查' : '本副记录'}</h2><button onClick={() => setDrawer(null)}>×</button></header>{drawer === 'rules' ? <ul><li><b>级牌</b><span>本局打 {table.levelRank}，红桃 {table.levelRank} 为逢人配。</span></li><li><b>炸弹</b><span>六张及以上炸弹大于同花顺，同花顺大于五炸与四炸。</span></li><li><b>升级</b><span>搭档二游升 3 级、三游升 2 级、末游升 1 级。</span></li></ul> : <ul>{table.recentHistory.slice().reverse().map((item) => <li key={item.index}><b>{item.index + 1}</b><span>{item.text}</span></li>)}</ul>}</aside>}
          {(table.phase === 'DEAL_FINISHED' || table.phase === 'MATCH_FINISHED') && <div className="result-overlay"><div><span className="result-mark">{table.phase === 'MATCH_FINISHED' ? '胜' : '升'}</span><p>{table.phase === 'MATCH_FINISHED' ? '整场结束' : `第 ${table.dealNumber} 副结束`}</p><h2>{table.dealWinnerTeam === 0 ? '南北队' : '东西队'}{table.phase === 'MATCH_FINISHED' ? '打过 A' : '完成升级'}</h2><small>{table.phase === 'DEAL_FINISHED' ? '下一副将自动开始' : '感谢参与本场牌局'}</small></div></div>}
        </section>
        <footer className="bottom-actions">{actions}</footer>
      </div>
    </main>
  );
}
