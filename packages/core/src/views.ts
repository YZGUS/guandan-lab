import { enumeratePlays } from './rules.js';
import type { DecisionContext, GameState, PlayerView, Seat, TableView } from './types.js';

function teamOf(seat: Seat) {
  return (seat % 2) as 0 | 1;
}

export function tableView(state: GameState): TableView {
  return {
    matchId: state.matchId,
    dealNumber: state.dealNumber,
    version: state.version,
    phase: state.phase,
    levelTeam: state.levelTeam,
    levelRank: state.levelRank,
    teams: state.teams,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      kind: player.kind,
      seat: player.seat,
      team: teamOf(player.seat),
      cardCount: player.hand.length,
      finished: player.finished,
    })),
    currentPlayer: state.currentPlayer,
    trickLeader: state.trickLeader,
    targetCombo: state.targetCombo,
    targetOwner: state.targetOwner,
    consecutivePasses: state.consecutivePasses,
    finishOrder: state.finishOrder,
    dealWinnerTeam: state.dealWinnerTeam,
    matchWinnerTeam: state.matchWinnerTeam,
    recentHistory: state.history.slice(-20),
  };
}

export function playerView(state: GameState, playerId: string): PlayerView {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error('玩家不在牌局中');
  const isTurn = state.phase === 'PLAYING' && state.currentPlayer === player.seat;
  return {
    viewerId: playerId,
    seat: player.seat,
    hand: player.hand,
    isTurn,
    canPass: isTurn && state.targetCombo !== null && state.targetOwner !== player.seat,
    legalPlays: isTurn ? enumeratePlays(player.hand, state.levelRank, state.targetCombo) : [],
  };
}

export function decisionContext(state: GameState, playerId: string): DecisionContext {
  return { table: tableView(state), player: playerView(state, playerId) };
}
