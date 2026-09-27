import { describe, expect, it } from 'vitest';
import { applyAction, beats, classifyPlay, classifyPlays, createDeck, createGame, enumeratePlays, NORMAL_RANKS, startNextDeal, type Card, type CreateGameOptions, type GameState, type NormalRank } from './index.js';

const players = [0, 1, 2, 3].map((seat) => ({ id: `p${seat}`, name: `P${seat}`, kind: 'BOT', seat })) as CreateGameOptions['players'];
function hand(spec: string) {
  const deck = createDeck();
  const suits = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const;
  return spec.split(' ').map((token) => {
    const [rank, suit] = token.split(':');
    const index = deck.findIndex((card) => card.rank === rank && (!suit || card.suit === suits[suit as keyof typeof suits]));
    if (index < 0) throw new Error(`Invalid physical card: ${token}`);
    return deck.splice(index, 1)[0];
  });
}
function winningPair(teamLevel: NormalRank, playedLevel: NormalRank) {
  const game = createGame({ seed: 1, players, starter: 2 });
  game.teams[0].level = teamLevel;
  game.levelRank = playedLevel;
  game.levelTeam = 1;
  game.finishOrder = [0];
  game.players[0].hand = [];
  game.players[0].finished = true;
  game.players[2].hand = hand('BJ');
  return game;
}
function finishPair(state: GameState) {
  const result = applyAction(state, { type: 'PLAY', cardIds: state.players[2].hand.map((card) => card.id) });
  expect(result.ok).toBe(true);
  return result.state;
}

describe('acceptance regressions', () => {
  it('recognizes the highest pair run and plate', () => {
    expect(classifyPlay(hand('Q:s Q:h K:s K:h A:s A:h'), '7')?.type).toBe('PAIR_RUN');
    expect(classifyPlay(hand('K:s K:h K:d A:s A:h A:d'), '7')?.type).toBe('TRIPLE_RUN');
  });

  it('keeps both wildcard straight interpretations and accepts the higher declared play', () => {
    const selected = hand('5:s 6:h 7:c 8:d 10:h');
    const target = classifyPlay(hand('4:c 5:d 6:s 7:d 8:h'), '10')!;
    expect(classifyPlays(selected, '10').map((play) => play.primaryRank)).toEqual(['8', '9']);
    const legal = enumeratePlays(selected, '10', target);
    expect(legal).toHaveLength(1);
    const declared = classifyPlay(legal[0].cards, '10', legal[0]);
    expect(declared).not.toBeNull();
    expect(beats(declared!, target)).toBe(true);
    const state = createGame({ seed: 1, players, starter: 0 });
    state.levelRank = '10';
    state.targetOwner = 3;
    state.targetCombo = target;
    state.players[0].hand = selected;
    const result = applyAction(state, { type: 'PLAY', cardIds: selected.map((card) => card.id), declaration: legal[0] });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it('round-trips generated moves through the validator at every level', () => {
    for (const level of NORMAL_RANKS) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const state = createGame({ seed, players });
        for (const player of state.players) {
          for (const generated of enumeratePlays(player.hand, level)) {
            const validated = classifyPlay(generated.cards, level, generated);
            expect(validated, `${level}: ${generated.type}/${generated.primaryRank}`).not.toBeNull();
            expect(validated?.primaryValue).toBe(generated.primaryValue);
          }
        }
      }
    }
  });

  it('does not pass A while winning a deal played at another level', () => {
    const state = finishPair(winningPair('A', '5'));
    expect(state.phase).toBe('DEAL_FINISHED');
    expect(state.teams[0].level).toBe('A');
    expect(startNextDeal(state).levelRank).toBe('A');
  });

  it('allows A on the table with both teams at A, but not a lower-level winner', () => {
    expect(finishPair(winningPair('A', 'A')).phase).toBe('MATCH_FINISHED');
    expect(finishPair(winningPair('5', 'A')).phase).toBe('DEAL_FINISHED');
  });

  it('resolves equal double tribute by seating order, not physical card ids', () => {
    const game = createGame({ seed: 1, players });
    game.phase = 'DEAL_FINISHED';
    game.dealWinnerTeam = 0;
    game.finishOrder = [2, 0, 1, 3];
    game.teams[0].level = '5';
    const next = startNextDeal(game);
    const tribute = next.history.filter((item) => item.type === 'TRIBUTE');
    expect(tribute).toHaveLength(2);
    expect(tribute[0].cards![0].rank).toBe(tribute[1].cards![0].rank);
    expect(tribute[0].seat).toBe(3);
    expect(tribute[0].targetSeat).toBe(2);
    expect(next.currentPlayer).toBe(3);
    expect(new Set(next.players.flatMap((p) => p.hand.map((c: Card) => c.id))).size).toBe(108);
    next.players.forEach((p) => expect(p.hand).toHaveLength(27));
  });
});
