import { z } from 'zod';
import type { PlayerAction, PlayerView, TableView } from '@guandan/core';

export const PROTOCOL_VERSION = 1;

const playActionSchema = z.object({
  type: z.literal('PLAY'),
  cardIds: z.array(z.string().min(1).max(40)).min(1).max(10),
  declaration: z.object({
    type: z.enum(['SINGLE', 'PAIR', 'TRIPLE', 'FULL_HOUSE', 'STRAIGHT', 'PAIR_RUN', 'TRIPLE_RUN', 'BOMB', 'STRAIGHT_FLUSH', 'JOKER_BOMB']),
    primaryRank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', 'SJ', 'BJ']),
  }).optional(),
});

export const playerActionSchema = z.discriminatedUnion('type', [playActionSchema, z.object({ type: z.literal('PASS') })]);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HELLO'), protocolVersion: z.literal(PROTOCOL_VERSION), sessionToken: z.string().min(20).max(200).optional() }),
  z.object({ type: z.literal('LIST_ROOMS') }),
  z.object({
    type: z.literal('CREATE_ROOM'),
    roomName: z.string().trim().min(1).max(30),
    playerName: z.string().trim().min(1).max(16),
    botCount: z.number().int().min(0).max(3),
    turnSeconds: z.number().int().min(10).max(120),
  }),
  z.object({ type: z.literal('JOIN_ROOM'), roomId: z.string().min(4).max(12), playerName: z.string().trim().min(1).max(16) }),
  z.object({ type: z.literal('LEAVE_ROOM') }),
  z.object({ type: z.literal('DISBAND_ROOM') }),
  z.object({ type: z.literal('START_GAME') }),
  z.object({ type: z.literal('NEXT_DEAL') }),
  z.object({ type: z.literal('RESTART_MATCH') }),
  z.object({
    type: z.literal('ACTION'),
    actionId: z.string().min(1).max(100),
    matchId: z.string().min(1).max(100),
    expectedVersion: z.number().int().positive(),
    action: playerActionSchema,
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface RoomPlayerView {
  id: string;
  name: string;
  kind: 'HUMAN' | 'BOT';
  seat: 0 | 1 | 2 | 3;
  connected: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  playerCount: number;
  humanCount: number;
  botCount: number;
  membership: boolean;
}

export interface RoomView extends RoomSummary {
  hostPlayerId: string;
  viewerPlayerId: string;
  turnSeconds: number;
  turnDeadline: number | null;
  players: RoomPlayerView[];
}

export interface SessionView {
  token?: string;
  playerId: string;
  name: string;
  roomId?: string;
}

export type ServerMessage =
  | { type: 'WELCOME'; session: SessionView; resumed: boolean }
  | { type: 'LOBBY'; session: SessionView; rooms: RoomSummary[] }
  | { type: 'ROOM'; room: RoomView; table?: TableView; view?: PlayerView }
  | { type: 'ROOM_CLOSED'; roomId: string; message: string }
  | { type: 'ERROR'; message: string; table?: TableView; view?: PlayerView };

export type ActionMessage = Extract<ClientMessage, { type: 'ACTION' }>;
export type CreateRoomMessage = Extract<ClientMessage, { type: 'CREATE_ROOM' }>;

export function asPlayerAction(value: z.infer<typeof playerActionSchema>): PlayerAction {
  return value as PlayerAction;
}
