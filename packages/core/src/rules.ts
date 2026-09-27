import { cardText, isWild, naturalRankStrength, NORMAL_RANKS, rankStrength, STANDARD_SUITS } from './cards.js';
import type { Card, Combo, ComboDeclaration, ComboType, NormalRank, Rank, Suit } from './types.js';

const sequenceRanks: readonly NormalRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const sequenceWindows = Array.from({ length: 10 }, (_, index) => sequenceRanks.slice(index, index + 5));
const pairWindows = Array.from({ length: 11 }, (_, index) => sequenceRanks.slice(index, index + 3));
const tripleWindows = Array.from({ length: 12 }, (_, index) => sequenceRanks.slice(index, index + 2));

const typeLabel: Record<ComboType, string> = {
  SINGLE: '单张', PAIR: '对子', TRIPLE: '三张', FULL_HOUSE: '三带二', STRAIGHT: '顺子',
  PAIR_RUN: '三连对', TRIPLE_RUN: '钢板', BOMB: '炸弹', STRAIGHT_FLUSH: '同花顺', JOKER_BOMB: '四王炸',
};

function combo(type: ComboType, cards: readonly Card[], primaryRank: Rank, primaryValue: number, level: NormalRank): Combo {
  return {
    type,
    cards: [...cards],
    primaryRank,
    primaryValue,
    size: cards.length,
    label: type === 'BOMB' ? `${cards.length} 张炸弹` : typeLabel[type],
    usesWild: cards.some((card) => isWild(card, level)),
  };
}

function uniqueCards(cards: readonly Card[]) {
  return new Set(cards.map((card) => card.id)).size === cards.length;
}

function groups(cards: readonly Card[], level: NormalRank) {
  const map = new Map<Rank, Card[]>();
  for (const card of cards) {
    if (isWild(card, level)) continue;
    const list = map.get(card.rank) ?? [];
    list.push(card);
    map.set(card.rank, list);
  }
  return map;
}

function sameRankCandidate(cards: readonly Card[], level: NormalRank, type: 'PAIR' | 'TRIPLE' | 'BOMB') {
  const wilds = cards.filter((card) => isWild(card, level));
  const natural = cards.filter((card) => !isWild(card, level));
  if (natural.length === 0) {
    if (cards.length <= 3) return combo(type, cards, level, rankStrength(level, level), level);
    return null;
  }
  const rank = natural[0].rank;
  if (natural.some((card) => card.rank !== rank)) return null;
  if ((rank === 'SJ' || rank === 'BJ') && wilds.length) return null;
  if (type === 'BOMB' && (rank === 'SJ' || rank === 'BJ')) return null;
  return combo(type, cards, rank, rankStrength(rank, level), level);
}

function matchesRequirements(cards: readonly Card[], level: NormalRank, requirements: ReadonlyMap<Rank, number>) {
  const wilds = cards.filter((card) => isWild(card, level));
  const naturalGroups = groups(cards, level);
  let missing = 0;
  for (const [rank, natural] of naturalGroups) {
    const required = requirements.get(rank);
    if (!required || natural.length > required) return false;
  }
  for (const [rank, required] of requirements) {
    const actual = naturalGroups.get(rank)?.length ?? 0;
    if ((rank === 'SJ' || rank === 'BJ') && actual < required) return false;
    missing += required - actual;
  }
  return missing === wilds.length;
}

function sequenceCandidate(
  cards: readonly Card[],
  level: NormalRank,
  windows: readonly (readonly NormalRank[])[],
  multiplicity: number,
  type: 'STRAIGHT' | 'PAIR_RUN' | 'TRIPLE_RUN' | 'STRAIGHT_FLUSH',
  suit?: Exclude<Suit, 'joker'>,
) {
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    if (suit && cards.some((card) => !isWild(card, level) && card.suit !== suit)) continue;
    const requirements = new Map<Rank, number>(window.map((rank) => [rank, multiplicity]));
    if (!matchesRequirements(cards, level, requirements)) continue;
    const primaryRank = window[window.length - 1];
    return combo(type, cards, primaryRank, (multiplicity === 1 ? 5 : 2 + multiplicity) + index, level);
  }
  return null;
}

export function classifyPlays(cards: readonly Card[], level: NormalRank): Combo[] {
  if (!cards.length || !uniqueCards(cards)) return [];
  const candidates: Combo[] = [];
  const jokerRanks = cards.map((card) => card.rank).sort();
  if (cards.length === 4 && jokerRanks.filter((rank) => rank === 'BJ').length === 2 && jokerRanks.filter((rank) => rank === 'SJ').length === 2) {
    candidates.push(combo('JOKER_BOMB', cards, 'BJ', 99, level));
  }
  if (cards.length >= 4 && cards.length <= 10) {
    const bomb = sameRankCandidate(cards, level, 'BOMB');
    if (bomb) candidates.push(bomb);
  }
  if (cards.length === 5) {
    for (const suit of STANDARD_SUITS) {
      const straightFlush = sequenceCandidate(cards, level, sequenceWindows, 1, 'STRAIGHT_FLUSH', suit);
      if (straightFlush) { candidates.push(straightFlush); break; }
    }
    for (const tripleRank of NORMAL_RANKS) {
      for (const pairRank of [...NORMAL_RANKS, 'SJ', 'BJ'] as Rank[]) {
        if (tripleRank === pairRank) continue;
        const requirements = new Map<Rank, number>([[tripleRank, 3], [pairRank, 2]]);
        if (matchesRequirements(cards, level, requirements)) {
          candidates.push(combo('FULL_HOUSE', cards, tripleRank, rankStrength(tripleRank, level), level));
        }
      }
    }
    const straight = sequenceCandidate(cards, level, sequenceWindows, 1, 'STRAIGHT');
    if (straight) candidates.push(straight);
  }
  if (cards.length === 6) {
    const pairRun = sequenceCandidate(cards, level, pairWindows, 2, 'PAIR_RUN');
    if (pairRun) candidates.push(pairRun);
    const tripleRun = sequenceCandidate(cards, level, tripleWindows, 3, 'TRIPLE_RUN');
    if (tripleRun) candidates.push(tripleRun);
  }
  if (cards.length === 3) {
    const triple = sameRankCandidate(cards, level, 'TRIPLE');
    if (triple) candidates.push(triple);
  }
  if (cards.length === 2) {
    const pair = sameRankCandidate(cards, level, 'PAIR');
    if (pair) candidates.push(pair);
  }
  if (cards.length === 1) {
    const rank = isWild(cards[0], level) ? level : cards[0].rank;
    candidates.push(combo('SINGLE', cards, rank, rankStrength(rank, level), level));
  }
  return dedupeCombos(candidates);
}

export function classifyPlay(cards: readonly Card[], level: NormalRank, declaration?: ComboDeclaration) {
  const candidates = classifyPlays(cards, level);
  if (declaration) return candidates.find((item) => item.type === declaration.type && item.primaryRank === declaration.primaryRank) ?? null;
  return candidates[0] ?? null;
}

function isSpecial(value: Combo) {
  return value.type === 'BOMB' || value.type === 'STRAIGHT_FLUSH' || value.type === 'JOKER_BOMB';
}

export function beats(challenger: Combo, target: Combo) {
  if (challenger.type === 'JOKER_BOMB') return target.type !== 'JOKER_BOMB';
  if (target.type === 'JOKER_BOMB') return false;
  if (challenger.type === 'BOMB' && target.type === 'BOMB') {
    return challenger.size !== target.size ? challenger.size > target.size : challenger.primaryValue > target.primaryValue;
  }
  if (challenger.type === 'STRAIGHT_FLUSH' && target.type === 'STRAIGHT_FLUSH') return challenger.primaryValue > target.primaryValue;
  if (challenger.type === 'BOMB' && target.type === 'STRAIGHT_FLUSH') return challenger.size >= 6;
  if (challenger.type === 'STRAIGHT_FLUSH' && target.type === 'BOMB') return target.size <= 5;
  if (isSpecial(challenger) && !isSpecial(target)) return true;
  if (!isSpecial(challenger) || isSpecial(target)) {
    return challenger.type === target.type && challenger.size === target.size && challenger.primaryValue > target.primaryValue;
  }
  return false;
}

function choose<T>(items: readonly T[], count: number): T[] | null {
  if (count < 0 || items.length < count) return null;
  return items.slice(0, count);
}

function pickRequirements(hand: readonly Card[], level: NormalRank, requirements: ReadonlyMap<Rank, number>, suit?: Exclude<Suit, 'joker'>) {
  const wilds = hand.filter((card) => isWild(card, level));
  const picked: Card[] = [];
  let wildNeeded = 0;
  for (const [rank, count] of requirements) {
    const available = hand.filter((card) => !isWild(card, level) && card.rank === rank && (!suit || card.suit === suit));
    const natural = choose(available, Math.min(count, available.length)) ?? [];
    picked.push(...natural);
    const missing = count - natural.length;
    if ((rank === 'SJ' || rank === 'BJ') && missing) return null;
    wildNeeded += missing;
  }
  const fill = choose(wilds, wildNeeded);
  if (!fill) return null;
  return [...picked, ...fill];
}

export function enumeratePlays(hand: readonly Card[], level: NormalRank, target: Combo | null = null) {
  const plays: Combo[] = [];
  const wilds = hand.filter((card) => isWild(card, level));
  const ranks = [...NORMAL_RANKS, 'SJ', 'BJ'] as Rank[];
  for (const rank of ranks) {
    const representative = hand.find((card) => !isWild(card, level) && card.rank === rank)
      ?? (rank === level ? wilds[0] : undefined);
    if (representative) plays.push(combo('SINGLE', [representative], rank, rankStrength(rank, level), level));
    const natural = hand.filter((card) => !isWild(card, level) && card.rank === rank);
    for (const [size, type] of [[2, 'PAIR'], [3, 'TRIPLE']] as const) {
      if ((rank === 'SJ' || rank === 'BJ') && natural.length < size) continue;
      const cards = [...natural.slice(0, size), ...wilds.slice(0, Math.max(0, size - natural.length))].slice(0, size);
      if (cards.length === size && (natural.length || rank === level)) plays.push(combo(type, cards, rank, rankStrength(rank, level), level));
    }
    if (rank !== 'SJ' && rank !== 'BJ') {
      for (let size = 4; size <= Math.min(10, natural.length + wilds.length); size += 1) {
        if (!natural.length) continue;
        const cards = [...natural.slice(0, size), ...wilds.slice(0, Math.max(0, size - natural.length))].slice(0, size);
        if (cards.length === size) plays.push(combo('BOMB', cards, rank, rankStrength(rank, level), level));
      }
    }
  }
  for (const tripleRank of NORMAL_RANKS) {
    for (const pairRank of ranks) {
      if (tripleRank === pairRank) continue;
      const cards = pickRequirements(hand, level, new Map<Rank, number>([[tripleRank, 3], [pairRank, 2]]));
      if (cards) plays.push(combo('FULL_HOUSE', cards, tripleRank, rankStrength(tripleRank, level), level));
    }
  }
  const sequenceSpecs = [
    [sequenceWindows, 1, 'STRAIGHT'],
    [pairWindows, 2, 'PAIR_RUN'],
    [tripleWindows, 3, 'TRIPLE_RUN'],
  ] as const;
  for (const [windows, multiplicity, type] of sequenceSpecs) {
    windows.forEach((window, index) => {
      const cards = pickRequirements(hand, level, new Map<Rank, number>(window.map((rank) => [rank, multiplicity])));
      if (cards) plays.push(combo(type, cards, window[window.length - 1], (multiplicity === 1 ? 5 : 2 + multiplicity) + index, level));
    });
  }
  for (const suit of STANDARD_SUITS) {
    sequenceWindows.forEach((window, index) => {
      const cards = pickRequirements(hand, level, new Map<Rank, number>(window.map((rank) => [rank, 1])), suit);
      if (cards) plays.push(combo('STRAIGHT_FLUSH', cards, window[window.length - 1], 5 + index, level));
    });
  }
  const jokers = hand.filter((card) => card.rank === 'BJ' || card.rank === 'SJ');
  if (jokers.filter((card) => card.rank === 'BJ').length >= 2 && jokers.filter((card) => card.rank === 'SJ').length >= 2) {
    plays.push(combo('JOKER_BOMB', [...jokers.filter((card) => card.rank === 'BJ').slice(0, 2), ...jokers.filter((card) => card.rank === 'SJ').slice(0, 2)], 'BJ', 99, level));
  }
  const unique = dedupeCombos(plays).filter((play) => !target || beats(play, target));
  return unique.sort((left, right) => playWeight(left) - playWeight(right));
}

function dedupeCombos(plays: readonly Combo[]) {
  const seen = new Set<string>();
  return plays.filter((play) => {
    const key = `${play.type}:${play.primaryRank}:${play.cards.map((card) => card.id).sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function playWeight(play: Combo) {
  const special = play.type === 'JOKER_BOMB' ? 4_000 : play.type === 'BOMB' ? 2_000 + play.size * 100 : play.type === 'STRAIGHT_FLUSH' ? 2_550 : 0;
  return special + play.primaryValue + play.size / 100;
}

export function describeCombo(value: Combo) {
  return `${value.label} ${value.cards.map(cardText).join(' ')}`;
}

export function compareTributeCards(left: Card, right: Card, level: NormalRank) {
  return rankStrength(right.rank, level) - rankStrength(left.rank, level) || left.id.localeCompare(right.id);
}

export function compareNaturalCards(left: Card, right: Card) {
  const leftRank = left.rank === 'SJ' ? 16 : left.rank === 'BJ' ? 17 : naturalRankStrength(left.rank);
  const rightRank = right.rank === 'SJ' ? 16 : right.rank === 'BJ' ? 17 : naturalRankStrength(right.rank);
  return leftRank - rightRank || left.id.localeCompare(right.id);
}
