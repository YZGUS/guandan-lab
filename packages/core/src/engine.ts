import { compareNaturalCards, compareTributeCards, describeCombo, beats, classifyPlay } from './rules.js';
import { isWild, NORMAL_RANKS, rankStrength, shuffledDeck, sortHand } from './cards.js';
import type {
  ApplyResult, Card, CreateGameOptions, GameEvent, GameState, NormalRank, PlayerAction,
  PlayerProfile, PlayerState, Seat, Team, TeamState,
} from './types.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

function asPlayers(profiles: readonly PlayerProfile[], hands: readonly Card[][], level: NormalRank) {
  return profiles.map((profile, seat) => ({ ...profile, seat: seat as Seat, hand: sortHand(hands[seat], level), finished: false })) as GameState['players'];
}

function deal(seed: number) {
  const deck = shuffledDeck(seed);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, index) => hands[index % 4].push(card));
  return hands;
}

function event(state: GameState, value: Omit<GameEvent, 'index'>) {
  state.history.push({ index: state.history.length, ...value });
}

export function createGame(options: CreateGameOptions): GameState {
  if (options.players.length !== 4) throw new Error('掼蛋固定为四人对局');
  const profiles = options.players.map((player, seat) => ({ ...player, seat: seat as Seat })) as CreateGameOptions['players'];
  const levelRank: NormalRank = '2';
  const players = asPlayers(profiles, deal(options.seed), levelRank);
  const starter = options.starter ?? ((options.seed >>> 0) % 4) as Seat;
  const state: GameState = {
    matchId: `match-${options.seed.toString(36)}`,
    dealNumber: 1,
    version: 1,
    seed: options.seed >>> 0,
    phase: 'PLAYING',
    levelTeam: 0,
    levelRank,
    teams: [{ team: 0, level: '2' }, { team: 1, level: '2' }],
    players,
    currentPlayer: starter,
    trickLeader: starter,
    targetCombo: null,
    targetOwner: null,
    consecutivePasses: 0,
    finishOrder: [],
    dealWinnerTeam: null,
    matchWinnerTeam: null,
    history: [],
  };
  event(state, { type: 'DEAL_STARTED', seat: starter, text: `第 1 副开始，${players[starter].name} 先手` });
  return state;
}

function nextActive(players: readonly PlayerState[], seat: Seat): Seat | null {
  for (let offset = 1; offset <= 4; offset += 1) {
    const candidate = ((seat + offset) % 4) as Seat;
    if (!players[candidate].finished) return candidate;
  }
  return null;
}

function partner(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

function completedOrder(state: GameState) {
  const order = [...state.finishOrder];
  if (order.length === 2 && teamOf(order[0]) === teamOf(order[1])) {
    const rest = ([0, 1, 2, 3] as Seat[]).filter((seat) => !order.includes(seat));
    rest.sort((left, right) => state.players[left].hand.length - state.players[right].hand.length || left - right);
    order.push(...rest);
  } else if (order.length >= 3) {
    const last = ([0, 1, 2, 3] as Seat[]).find((seat) => !order.includes(seat));
    if (last !== undefined) order.push(last);
  }
  return order;
}

function levelGain(order: readonly Seat[]) {
  const winningTeam = teamOf(order[0]);
  const partnerPlace = order.findIndex((seat) => teamOf(seat) === winningTeam && seat !== order[0]);
  return partnerPlace === 1 ? 3 : partnerPlace === 2 ? 2 : 1;
}

function advanceLevel(level: NormalRank, amount: number): NormalRank {
  return NORMAL_RANKS[Math.min(NORMAL_RANKS.length - 1, NORMAL_RANKS.indexOf(level) + amount)];
}

function finishDeal(state: GameState) {
  const order = completedOrder(state);
  const winnerTeam = teamOf(order[0]);
  const gain = levelGain(order);
  const currentLevel = state.teams[winnerTeam].level;
  const passedAce = currentLevel === 'A' && gain >= 2;
  state.finishOrder = order;
  state.dealWinnerTeam = winnerTeam;
  state.currentPlayer = null;
  state.targetCombo = null;
  state.targetOwner = null;
  state.consecutivePasses = 0;
  if (passedAce) {
    state.phase = 'MATCH_FINISHED';
    state.matchWinnerTeam = winnerTeam;
    event(state, { type: 'MATCH_FINISHED', text: `${winnerTeam === 0 ? '南北队' : '东西队'}打过 A，赢得整场` });
  } else {
    state.teams[winnerTeam].level = advanceLevel(currentLevel, gain);
    state.phase = 'DEAL_FINISHED';
    event(state, { type: 'DEAL_FINISHED', text: `${winnerTeam === 0 ? '南北队' : '东西队'}升 ${gain} 级，下一副打 ${state.teams[winnerTeam].level}` });
  }
}

function shouldFinishDeal(state: GameState) {
  return state.finishOrder.length >= 3
    || (state.finishOrder.length === 2 && teamOf(state.finishOrder[0]) === teamOf(state.finishOrder[1]));
}

export function applyAction(source: GameState, action: PlayerAction): ApplyResult {
  const state = clone(source);
  try {
    if (state.phase !== 'PLAYING' || state.currentPlayer === null) throw new Error('当前牌局不能行动');
    const seat = state.currentPlayer;
    const player = state.players[seat];
    if (player.finished) throw new Error('该玩家已经出完手牌');
    if (action.type === 'PASS') {
      if (!state.targetCombo || state.targetOwner === seat) throw new Error('领出时不能不要');
      state.consecutivePasses += 1;
      event(state, { type: 'PASS', seat, text: `${player.name} 不要` });
      const required = state.players.filter((item) => !item.finished && item.seat !== state.targetOwner).length;
      if (state.consecutivePasses >= required) {
        const owner = state.targetOwner;
        let leader = owner !== null && !state.players[owner].finished ? owner : owner !== null ? partner(owner) : seat;
        if (state.players[leader].finished) leader = nextActive(state.players, leader) ?? leader;
        state.targetCombo = null;
        state.targetOwner = null;
        state.consecutivePasses = 0;
        state.trickLeader = leader;
        state.currentPlayer = leader;
        event(state, { type: 'TRICK_CLEARED', seat: leader, text: `${state.players[leader].name} 获得新一轮出牌权` });
      } else {
        state.currentPlayer = nextActive(state.players, seat);
      }
    } else {
      const uniqueIds = [...new Set(action.cardIds)];
      if (!uniqueIds.length || uniqueIds.length !== action.cardIds.length) throw new Error('请选择有效手牌');
      const cards = uniqueIds.map((id) => player.hand.find((card) => card.id === id));
      if (cards.some((card) => !card)) throw new Error('所选牌不在你的手牌中');
      const combo = classifyPlay(cards as Card[], state.levelRank, action.declaration);
      if (!combo) throw new Error('所选牌不能组成合法牌型');
      if (state.targetCombo && !beats(combo, state.targetCombo)) throw new Error('所选牌无法压过当前牌型');
      player.hand = player.hand.filter((card) => !uniqueIds.includes(card.id));
      state.targetCombo = combo;
      state.targetOwner = seat;
      state.trickLeader = seat;
      state.consecutivePasses = 0;
      event(state, { type: 'PLAY', seat, cards: combo.cards, combo, text: `${player.name} 出 ${describeCombo(combo)}` });
      if (!player.hand.length) {
        player.finished = true;
        state.finishOrder.push(seat);
        event(state, { type: 'PLAYER_FINISHED', seat, text: `${player.name} 第 ${state.finishOrder.length} 个出完` });
        if (shouldFinishDeal(state)) finishDeal(state);
      }
      if (state.phase === 'PLAYING') state.currentPlayer = nextActive(state.players, seat);
    }
    state.version += 1;
    return { ok: true, state };
  } catch (error) {
    return { ok: false, state: source, error: error instanceof Error ? error.message : '行动失败' };
  }
}

function tributeCard(player: PlayerState, level: NormalRank) {
  return player.hand
    .filter((card) => !isWild(card, level))
    .sort((left, right) => compareTributeCards(left, right, level))[0] ?? null;
}

function returnCard(player: PlayerState, level: NormalRank) {
  const eligible = player.hand.filter((card) => card.rank !== level && !['SJ', 'BJ'].includes(card.rank));
  const small = eligible.filter((card) => rankStrength(card.rank, level) <= rankStrength('10', level));
  return [...(small.length ? small : eligible)].sort(compareNaturalCards)[0] ?? null;
}

function transfer(state: GameState, from: Seat, to: Seat, card: Card, kind: 'TRIBUTE' | 'RETURN_TRIBUTE') {
  state.players[from].hand = state.players[from].hand.filter((item) => item.id !== card.id);
  state.players[to].hand.push(card);
  event(state, {
    type: kind,
    seat: from,
    targetSeat: to,
    cards: [card],
    text: `${state.players[from].name}${kind === 'TRIBUTE' ? '进贡' : '还贡'}给${state.players[to].name}：${cardTextSafe(card)}`,
  });
}

function cardTextSafe(card: Card) {
  return card.rank === 'BJ' ? '大王' : card.rank === 'SJ' ? '小王' : card.rank;
}

function applyTribute(state: GameState, previousOrder: readonly Seat[]) {
  const first = previousOrder[0];
  const second = previousOrder[1];
  const doubleDown = teamOf(first) === teamOf(second);
  const payers = doubleDown ? [previousOrder[2], previousOrder[3]] : [previousOrder[3]];
  const bigJokers = payers.flatMap((seat) => state.players[seat].hand).filter((card) => card.rank === 'BJ').length;
  const resisted = doubleDown ? bigJokers >= 2 : state.players[payers[0]].hand.filter((card) => card.rank === 'BJ').length >= 2;
  if (resisted) {
    event(state, { type: 'RESIST_TRIBUTE', seat: first, text: '下游方持有两张大王，本副抗贡' });
    return first;
  }
  const offers = payers.map((payer) => ({ payer, card: tributeCard(state.players[payer], state.levelRank) })).filter((item): item is { payer: Seat; card: Card } => Boolean(item.card));
  offers.sort((left, right) => compareTributeCards(left.card, right.card, state.levelRank));
  const receivers = doubleDown ? [first, second] : [first];
  offers.forEach((offer, index) => {
    const receiver = receivers[index];
    transfer(state, offer.payer, receiver, offer.card, 'TRIBUTE');
    const back = returnCard(state.players[receiver], state.levelRank);
    if (back) transfer(state, receiver, offer.payer, back, 'RETURN_TRIBUTE');
  });
  state.players.forEach((player) => { player.hand = sortHand(player.hand, state.levelRank); });
  return offers[0]?.payer ?? first;
}

export function startNextDeal(source: GameState): GameState {
  if (source.phase !== 'DEAL_FINISHED' || source.dealWinnerTeam === null) throw new Error('当前不能开始下一副');
  const previousOrder = [...source.finishOrder];
  const levelTeam = source.dealWinnerTeam;
  const levelRank = source.teams[levelTeam].level;
  const profiles = source.players.map(({ id, name, kind, seat }) => ({ id, name, kind, seat })) as [PlayerProfile, PlayerProfile, PlayerProfile, PlayerProfile];
  const state: GameState = {
    ...clone(source),
    dealNumber: source.dealNumber + 1,
    version: source.version + 1,
    phase: 'PLAYING',
    levelTeam,
    levelRank,
    players: asPlayers(profiles, deal(source.seed + source.dealNumber * 101), levelRank),
    currentPlayer: null,
    trickLeader: null,
    targetCombo: null,
    targetOwner: null,
    consecutivePasses: 0,
    finishOrder: [],
    dealWinnerTeam: null,
    history: [],
  };
  const starter = applyTribute(state, previousOrder);
  state.currentPlayer = starter;
  state.trickLeader = starter;
  event(state, { type: 'DEAL_STARTED', seat: starter, text: `第 ${state.dealNumber} 副开始，打 ${levelRank}` });
  return state;
}
