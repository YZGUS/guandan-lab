import { randomInt } from 'node:crypto';
import {
  applyAction, createGame, decisionContext, playerView, startNextDeal, tableView,
  type GameState, type PlayerAction, type PlayerProfile, type Seat,
} from '@guandan/core';
import type {
  ActionMessage, CreateRoomMessage, RoomPlayerView, RoomStatus, RoomSummary, RoomView, SessionView,
} from '@guandan/protocol';
import type { Principal } from './auth.js';
import type { EntityStore } from './storage.js';

interface RoomPlayer {
  id: string;
  name: string;
  kind: 'HUMAN' | 'BOT';
  seat: Seat;
  connected: boolean;
}

export interface PersistedRoom {
  id: string;
  name: string;
  status: RoomStatus;
  hostPlayerId: string;
  turnSeconds: number;
  turnDeadline: number | null;
  players: RoomPlayer[];
  game?: GameState;
  handledActionIds: string[];
  createdAt: number;
  updatedAt: number;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

const botNames = ['青禾', 'Nova', 'Turing'];

export class RoomService {
  readonly rooms = new Map<string, PersistedRoom>();
  private activityAt: number | null = null;

  constructor(private readonly repository: EntityStore<PersistedRoom>, private readonly now: () => number = Date.now) {
    repository.list().forEach((room) => this.rooms.set(room.id, room));
  }

  roomCount() { return this.rooms.size; }
  lastActivityAt() { return this.activityAt; }
  roomCountForHost(userId: string) { return [...this.rooms.values()].filter((room) => room.hostPlayerId === userId).length; }

  sessionView(principal: Principal, token?: string): SessionView {
    const room = this.roomForUser(principal.userId);
    return { ...(token ? { token } : {}), playerId: principal.userId, name: principal.displayName, ...(room ? { roomId: room.id } : {}) };
  }

  createRoom(principal: Principal, message: CreateRoomMessage) {
    if (this.roomForUser(principal.userId)) throw new Error('你已经在一个房间中');
    const id = this.roomId();
    const players: RoomPlayer[] = [{ id: principal.userId, name: cleanName(message.playerName), kind: 'HUMAN', seat: 0, connected: true }];
    const botSeats: Seat[] = [3, 2, 1];
    for (let index = 0; index < message.botCount; index += 1) {
      players.push({ id: `${id}-bot-${index + 1}`, name: botNames[index], kind: 'BOT', seat: botSeats[index], connected: true });
    }
    const room: PersistedRoom = {
      id,
      name: message.roomName.trim(),
      status: 'WAITING',
      hostPlayerId: principal.userId,
      turnSeconds: message.turnSeconds,
      turnDeadline: null,
      players: players.sort((left, right) => left.seat - right.seat),
      handledActionIds: [],
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.save(room);
    return room;
  }

  joinRoom(principal: Principal, roomId: string, requestedName: string) {
    if (this.roomForUser(principal.userId)) throw new Error('你已经在一个房间中');
    const room = this.requireRoom(roomId);
    if (room.status !== 'WAITING') throw new Error('牌局已经开始');
    const seat = ([0, 1, 2, 3] as Seat[]).find((candidate) => !room.players.some((player) => player.seat === candidate));
    if (seat === undefined) throw new Error('房间已满');
    room.players.push({ id: principal.userId, name: availableName(room.players, cleanName(requestedName)), kind: 'HUMAN', seat, connected: true });
    room.players.sort((left, right) => left.seat - right.seat);
    this.save(room);
    return room;
  }

  leaveRoom(principal: Principal) {
    const room = this.requireMembership(principal.userId);
    if (room.status !== 'WAITING') throw new Error('牌局开始后请保留座位，以便断线恢复');
    room.players = room.players.filter((player) => player.id !== principal.userId);
    if (!room.players.some((player) => player.kind === 'HUMAN')) {
      this.rooms.delete(room.id);
      this.repository.delete(room.id);
      return { roomId: room.id, room: null };
    }
    if (room.hostPlayerId === principal.userId) room.hostPlayerId = room.players.find((player) => player.kind === 'HUMAN')!.id;
    this.save(room);
    return { roomId: room.id, room };
  }

  disbandRoom(principal: Principal) {
    const room = this.requireMembership(principal.userId);
    if (room.hostPlayerId !== principal.userId) throw new Error('只有房主可以解散房间');
    const memberUserIds = room.players.filter((player) => player.kind === 'HUMAN').map((player) => player.id);
    this.rooms.delete(room.id);
    this.repository.delete(room.id);
    return { roomId: room.id, memberUserIds };
  }

  startGame(principal: Principal) {
    const room = this.requireMembership(principal.userId);
    if (room.hostPlayerId !== principal.userId) throw new Error('只有房主可以开始');
    if (room.status !== 'WAITING') throw new Error('牌局已经开始');
    if (room.players.length !== 4) throw new Error('需要四个座位才能开始');
    const profiles = ([0, 1, 2, 3] as Seat[]).map((seat) => {
      const player = room.players.find((item) => item.seat === seat)!;
      return { id: player.id, name: player.name, kind: player.kind, seat };
    }) as [PlayerProfile, PlayerProfile, PlayerProfile, PlayerProfile];
    room.game = createGame({ seed: randomInt(0x7fff_ffff), players: profiles });
    room.status = 'PLAYING';
    room.turnDeadline = null;
    this.save(room);
    return room;
  }

  act(principal: Principal, message: ActionMessage) {
    const room = this.requireMembership(principal.userId);
    if (room.handledActionIds.includes(message.actionId)) return room;
    if (!room.game || room.status !== 'PLAYING') throw new Error('牌局尚未开始');
    if (message.matchId !== room.game.matchId || message.expectedVersion !== room.game.version) throw new Error('牌局已经推进，已刷新当前状态');
    this.applyForPlayer(room.id, principal.userId, message.action as PlayerAction);
    room.handledActionIds.push(message.actionId);
    room.handledActionIds = room.handledActionIds.slice(-500);
    this.save(room);
    return room;
  }

  applyForPlayer(roomId: string, playerId: string, action: PlayerAction) {
    const room = this.requireRoom(roomId);
    if (!room.game || room.game.currentPlayer === null) throw new Error('当前没有玩家行动');
    const player = room.game.players[room.game.currentPlayer];
    if (player.id !== playerId) throw new Error('现在还没轮到你');
    const result = applyAction(room.game, action);
    if (!result.ok) throw new Error(result.error);
    room.game = result.state;
    room.turnDeadline = null;
    if (room.game.phase === 'MATCH_FINISHED') room.status = 'FINISHED';
    this.save(room);
    return room;
  }

  nextDeal(roomId: string) {
    const room = this.requireRoom(roomId);
    if (!room.game || room.game.phase !== 'DEAL_FINISHED') throw new Error('当前不需要开始下一副');
    room.game = startNextDeal(room.game);
    room.turnDeadline = null;
    this.save(room);
    return room;
  }

  nextDealByHost(principal: Principal) {
    const room = this.requireMembership(principal.userId);
    if (room.hostPlayerId !== principal.userId) throw new Error('只有房主可以开始下一副');
    return this.nextDeal(room.id);
  }

  setConnected(userId: string, connected: boolean) {
    const room = this.roomForUser(userId);
    const player = room?.players.find((item) => item.id === userId);
    if (!room || !player) return null;
    player.connected = connected;
    this.save(room);
    return room;
  }

  setTurnDeadline(roomId: string, deadline: number | null) {
    const room = this.requireRoom(roomId);
    if (room.turnDeadline === deadline) return room;
    room.turnDeadline = deadline;
    this.save(room, false);
    return room;
  }

  listRooms(viewerId?: string): RoomSummary[] {
    return [...this.rooms.values()].map((room) => summary(room, viewerId)).sort((left, right) => left.name.localeCompare(right.name));
  }

  roomView(roomId: string, viewerId: string): { room: RoomView; table?: ReturnType<typeof tableView>; view?: ReturnType<typeof playerView> } {
    const room = this.requireRoom(roomId);
    if (!room.players.some((player) => player.id === viewerId)) throw new Error('你不在该房间中');
    const base = summary(room, viewerId);
    const view: RoomView = {
      ...base,
      hostPlayerId: room.hostPlayerId,
      viewerPlayerId: viewerId,
      turnSeconds: room.turnSeconds,
      turnDeadline: room.turnDeadline,
      players: room.players.map(({ id, name, kind, seat, connected }): RoomPlayerView => ({ id, name, kind, seat, connected })),
    };
    return {
      room: view,
      ...(room.game ? { table: tableView(room.game), view: playerView(room.game, viewerId) } : {}),
    };
  }

  botDecision(roomId: string) {
    const room = this.requireRoom(roomId);
    if (!room.game || room.game.currentPlayer === null) return null;
    const player = room.game.players[room.game.currentPlayer];
    return player.kind === 'BOT' ? { room, player, context: decisionContext(room.game, player.id) } : null;
  }

  roomForUser(userId: string) {
    return [...this.rooms.values()].find((room) => room.players.some((player) => player.id === userId));
  }

  isAtTable(userId: string) { return Boolean(this.roomForUser(userId)); }

  private requireRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');
    return room;
  }

  private requireMembership(userId: string) {
    const room = this.roomForUser(userId);
    if (!room) throw new Error('你还没有加入房间');
    return room;
  }

  private roomId() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const id = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      if (!this.rooms.has(id)) return id;
    }
  }

  private save(room: PersistedRoom, touch = true) {
    if (touch) { room.updatedAt = this.now(); this.activityAt = room.updatedAt; }
    this.rooms.set(room.id, room);
    this.repository.put(clone(room));
  }
}

function summary(room: PersistedRoom, viewerId?: string): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    playerCount: room.players.length,
    humanCount: room.players.filter((player) => player.kind === 'HUMAN').length,
    botCount: room.players.filter((player) => player.kind === 'BOT').length,
    membership: Boolean(viewerId && room.players.some((player) => player.id === viewerId)),
  };
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 16) || '玩家';
}

function availableName(players: readonly RoomPlayer[], requested: string) {
  const names = new Set(players.map((player) => player.name));
  if (!names.has(requested)) return requested;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const value = `${requested} ${suffix}`.slice(0, 16);
    if (!names.has(value)) return value;
  }
  return `${requested.slice(0, 12)} ${randomInt(100)}`;
}
