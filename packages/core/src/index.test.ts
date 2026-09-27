import { describe, expect, it } from 'vitest';
import {
  applyAction,
  beats,
  classifyPlay,
  createDeck,
  createGame,
  playerView,
  type Card,
  type PlayerProfile,
} from './index';

function card(id: string, rank: Card['rank'], suit: Card['suit']): Card {
  return { id, rank, suit, deck: 1 };
}

const profiles = [0, 1, 2, 3].map((seat) => ({
  id: `p${seat}`,
  name: `玩家 ${seat + 1}`,
  kind: 'HUMAN' as const,
  seat: seat as 0 | 1 | 2 | 3,
})) as [PlayerProfile, PlayerProfile, PlayerProfile, PlayerProfile];

describe('Guandan rules', () => {
  it('creates two complete decks with stable physical card ids', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((item) => item.id))).toHaveLength(108);
    expect(deck.filter((item) => item.rank === 'BJ')).toHaveLength(2);
  });

  it('uses the heart level card as a wildcard in a full house', () => {
    const cards = [
      card('s9', '9', 'spades'), card('h9', '9', 'hearts'), card('d9', '9', 'diamonds'),
      card('c4', '4', 'clubs'), card('h7', '7', 'hearts'),
    ];
    const play = classifyPlay(cards, '7');
    expect(play?.type).toBe('FULL_HOUSE');
    expect(play?.primaryRank).toBe('9');
    expect(play?.usesWild).toBe(true);
  });

  it('orders a straight flush between five and six card bombs', () => {
    const fiveBomb = classifyPlay(['clubs', 'diamonds', 'hearts', 'spades', 'clubs'].map((suit, index) => card(`b5-${index}`, '5', suit as Card['suit'])), '7')!;
    const sixBomb = classifyPlay(['clubs', 'diamonds', 'hearts', 'spades', 'clubs', 'diamonds'].map((suit, index) => card(`b6-${index}`, '6', suit as Card['suit'])), '7')!;
    const straightFlush = classifyPlay([
      card('s3', '3', 'spades'), card('s4', '4', 'spades'), card('s5', '5', 'spades'),
      card('s6', '6', 'spades'), card('s7', '7', 'spades'),
    ], '9')!;
    expect(fiveBomb.type).toBe('BOMB');
    expect(straightFlush.type).toBe('STRAIGHT_FLUSH');
    expect(beats(straightFlush, fiveBomb)).toBe(true);
    expect(beats(sixBomb, straightFlush)).toBe(true);
  });

  it('clears a trick after every active opponent passes', () => {
    const state = createGame({ seed: 42, players: profiles, starter: 0 });
    state.players[0].hand = [card('p0-3', '3', 'clubs'), card('p0-4', '4', 'clubs')];
    state.players[1].hand = [card('p1-5', '5', 'clubs')];
    state.players[2].hand = [card('p2-6', '6', 'clubs')];
    state.players[3].hand = [card('p3-7', '7', 'clubs')];
    const played = applyAction(state, { type: 'PLAY', cardIds: ['p0-3'] });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const pass1 = applyAction(played.state, { type: 'PASS' });
    const pass2 = pass1.ok ? applyAction(pass1.state, { type: 'PASS' }) : pass1;
    const pass3 = pass2.ok ? applyAction(pass2.state, { type: 'PASS' }) : pass2;
    expect(pass3.ok).toBe(true);
    if (!pass3.ok) return;
    expect(pass3.state.targetCombo).toBeNull();
    expect(pass3.state.currentPlayer).toBe(0);
  });

  it('never exposes another player hand in a player view', () => {
    const state = createGame({ seed: 7, players: profiles, starter: 0 });
    const view = playerView(state, 'p0');
    expect(view.hand).toHaveLength(27);
    expect(JSON.stringify(view)).not.toContain(state.players[1].hand[0].id);
  });
});
