import { describe, expect, it } from 'vitest';
import { createGame, decisionContext, type PlayerProfile } from '@guandan/core';
import { decideBotAction } from './index';

const profiles = [0, 1, 2, 3].map((seat) => ({
  id: `bot-${seat}`,
  name: `Bot ${seat + 1}`,
  kind: 'BOT' as const,
  seat: seat as 0 | 1 | 2 | 3,
})) as [PlayerProfile, PlayerProfile, PlayerProfile, PlayerProfile];

describe('basic bot', () => {
  it('returns one legal opening play', () => {
    const state = createGame({ seed: 3, players: profiles, starter: 0 });
    const context = decisionContext(state, 'bot-0');
    const action = decideBotAction(context);
    expect(action.type).toBe('PLAY');
    if (action.type === 'PLAY') expect(action.cardIds.length).toBeGreaterThan(0);
  });
});
