export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'joker';
export type NormalRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Rank = NormalRank | 'SJ' | 'BJ';
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export interface Card {
  id: string;
  deck: 1 | 2;
  suit: Suit;
  rank: Rank;
}

export type ComboType =
  | 'SINGLE'
  | 'PAIR'
  | 'TRIPLE'
  | 'FULL_HOUSE'
  | 'STRAIGHT'
  | 'PAIR_RUN'
  | 'TRIPLE_RUN'
  | 'BOMB'
  | 'STRAIGHT_FLUSH'
  | 'JOKER_BOMB';

export interface ComboDeclaration {
  type: ComboType;
  primaryRank: Rank;
}

export interface Combo {
  type: ComboType;
  cards: Card[];
  primaryRank: Rank;
  primaryValue: number;
  size: number;
  label: string;
  usesWild: boolean;
}

export type PlayerAction =
  | { type: 'PLAY'; cardIds: string[]; declaration?: ComboDeclaration }
  | { type: 'PASS' };

export interface PlayerProfile {
  id: string;
  name: string;
  kind: 'HUMAN' | 'BOT';
  seat: Seat;
}

export interface PlayerState extends PlayerProfile {
  hand: Card[];
  finished: boolean;
}

export interface TeamState {
  team: Team;
  level: NormalRank;
}

export type Phase = 'PLAYING' | 'DEAL_FINISHED' | 'MATCH_FINISHED';
export type GameEventType =
  | 'DEAL_STARTED'
  | 'TRIBUTE'
  | 'RETURN_TRIBUTE'
  | 'RESIST_TRIBUTE'
  | 'PLAY'
  | 'PASS'
  | 'TRICK_CLEARED'
  | 'PLAYER_FINISHED'
  | 'DEAL_FINISHED'
  | 'MATCH_FINISHED';

export interface GameEvent {
  index: number;
  type: GameEventType;
  seat?: Seat;
  targetSeat?: Seat;
  cards?: Card[];
  combo?: Combo;
  text: string;
}

export interface GameState {
  matchId: string;
  dealNumber: number;
  version: number;
  seed: number;
  phase: Phase;
  levelTeam: Team;
  levelRank: NormalRank;
  teams: [TeamState, TeamState];
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  currentPlayer: Seat | null;
  trickLeader: Seat | null;
  targetCombo: Combo | null;
  targetOwner: Seat | null;
  consecutivePasses: number;
  finishOrder: Seat[];
  dealWinnerTeam: Team | null;
  matchWinnerTeam: Team | null;
  history: GameEvent[];
}

export interface CreateGameOptions {
  seed: number;
  players: [PlayerProfile, PlayerProfile, PlayerProfile, PlayerProfile];
  starter?: Seat;
}

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };

export interface PublicPlayer {
  id: string;
  name: string;
  kind: 'HUMAN' | 'BOT';
  seat: Seat;
  team: Team;
  cardCount: number;
  finished: boolean;
}

export interface TableView {
  matchId: string;
  dealNumber: number;
  version: number;
  phase: Phase;
  levelTeam: Team;
  levelRank: NormalRank;
  teams: [TeamState, TeamState];
  players: PublicPlayer[];
  currentPlayer: Seat | null;
  trickLeader: Seat | null;
  targetCombo: Combo | null;
  targetOwner: Seat | null;
  consecutivePasses: number;
  finishOrder: Seat[];
  dealWinnerTeam: Team | null;
  matchWinnerTeam: Team | null;
  recentHistory: GameEvent[];
}

export interface PlayerView {
  viewerId: string;
  seat: Seat;
  hand: Card[];
  isTurn: boolean;
  canPass: boolean;
  legalPlays: Combo[];
}

export interface DecisionContext {
  table: TableView;
  player: PlayerView;
}
