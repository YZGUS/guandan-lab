import type { Card } from '@guandan/core';

const symbols = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', joker: '★' } as const;

export function CardFace({ card, selected = false, wild = false, disabled = false, onClick }: {
  card: Card;
  selected?: boolean;
  wild?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds' || card.rank === 'BJ';
  const label = card.rank === 'BJ' ? '大王' : card.rank === 'SJ' ? '小王' : card.rank;
  return (
    <button
      type="button"
      className={`card-face${red ? ' red' : ''}${selected ? ' selected' : ''}${card.suit === 'joker' ? ' joker' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      title={`${label}${card.suit === 'joker' ? '' : symbols[card.suit]}${wild ? ' · 逢人配' : ''}`}
    >
      <b>{label}</b><span>{symbols[card.suit]}</span>{wild && <small>配</small>}
    </button>
  );
}
