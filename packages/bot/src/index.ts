import { type DecisionContext, type PlayerAction } from '@guandan/core';

export interface BotStrategy {
  id: string;
  name: string;
  decide(context: Readonly<DecisionContext>): PlayerAction;
}

export const cooperativeBasicBot: BotStrategy = {
  id: 'cooperative-basic',
  name: '基础搭档策略',
  decide(context) {
    const plays = context.player.legalPlays;
    if (!plays.length) return { type: 'PASS' };
    const partner = ((context.player.seat + 2) % 4) as 0 | 1 | 2 | 3;
    const partnerOwnsTrick = context.table.targetOwner === partner;
    if (partnerOwnsTrick && context.player.canPass) return { type: 'PASS' };
    const ordinary = plays.find((play) => !['BOMB', 'STRAIGHT_FLUSH', 'JOKER_BOMB'].includes(play.type));
    const selected = ordinary ?? plays[0];
    return {
      type: 'PLAY',
      cardIds: selected.cards.map((card) => card.id),
      declaration: { type: selected.type, primaryRank: selected.primaryRank },
    };
  },
};

export function decideBotAction(context: Readonly<DecisionContext>) {
  return cooperativeBasicBot.decide(context);
}
