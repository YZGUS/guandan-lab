import type { Card, NormalRank, Rank, Suit } from './types.js';

export const NORMAL_RANKS: readonly NormalRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const STANDARD_SUITS: readonly Exclude<Suit, 'joker'>[] = ['clubs', 'diamonds', 'hearts', 'spades'];

const suitCode: Record<Suit, string> = { clubs: 'C', diamonds: 'D', hearts: 'H', spades: 'S', joker: 'J' };

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const deck of [1, 2] as const) {
    for (const suit of STANDARD_SUITS) {
      for (const rank of NORMAL_RANKS) cards.push({ id: `${deck}-${suitCode[suit]}-${rank}`, deck, suit, rank });
    }
    cards.push({ id: `${deck}-J-SJ`, deck, suit: 'joker', rank: 'SJ' });
    cards.push({ id: `${deck}-J-BJ`, deck, suit: 'joker', rank: 'BJ' });
  }
  return cards;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

export function shuffledDeck(seed: number) {
  const cards = createDeck();
  const random = seededRandom(seed);
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

export function isWild(card: Card, level: NormalRank) {
  return card.suit === 'hearts' && card.rank === level;
}

export function rankStrength(rank: Rank, level: NormalRank) {
  if (rank === 'BJ') return 17;
  if (rank === 'SJ') return 16;
  if (rank === level) return 15;
  return NORMAL_RANKS.indexOf(rank) + 2;
}

export function naturalRankStrength(rank: NormalRank) {
  return NORMAL_RANKS.indexOf(rank) + 2;
}

export function sortHand(cards: readonly Card[], level: NormalRank) {
  const suitOrder: Record<Suit, number> = { joker: 0, hearts: 1, spades: 2, clubs: 3, diamonds: 4 };
  return [...cards].sort((left, right) => {
    const strength = rankStrength(right.rank, level) - rankStrength(left.rank, level);
    if (strength) return strength;
    const wild = Number(isWild(right, level)) - Number(isWild(left, level));
    if (wild) return wild;
    return suitOrder[left.suit] - suitOrder[right.suit] || left.id.localeCompare(right.id);
  });
}

export function cardText(card: Card) {
  if (card.rank === 'BJ') return '大王';
  if (card.rank === 'SJ') return '小王';
  const symbols: Record<Exclude<Suit, 'joker'>, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
  return `${card.rank}${symbols[card.suit as Exclude<Suit, 'joker'>]}`;
}
