import type { IncomingMessage } from 'node:http';
import { WebSocket, type WebSocketServer } from 'ws';
import { decideBotAction } from '@guandan/bot';
import { decisionContext } from '@guandan/core';
import { clientMessageSchema, type ClientMessage, type ServerMessage } from '@guandan/protocol';
import { AccessError, AuthService, type RequestContext } from './auth.js';
import { RoomService } from './room-service.js';

const botDelayMs = 450;
const nextDealDelayMs = 1_600;

export class GameServer {
  private readonly connections = new Map<WebSocket, RequestContext>();
  private readonly sessionClients = new Map<string, WebSocket>();
  private readonly pending = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  private readonly roomTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly socketServer: WebSocketServer,
    private readonly service: RoomService,
    private readonly auth: AuthService,
  ) {
    socketServer.on('connection', (client, request) => this.accept(client, request));
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    this.cleanupTimer.unref();
  }

  start() {
    this.service.rooms.forEach((room) => this.schedule(room.id));
  }

  stop() {
    clearInterval(this.cleanupTimer);
    this.pending.forEach(clearTimeout);
    this.roomTimers.forEach(clearTimeout);
    this.pending.clear();
    this.roomTimers.clear();
  }

  private accept(client: WebSocket, request: IncomingMessage) {
    client.on('error', () => client.terminate());
    const timer = setTimeout(() => client.close(4003, '身份验证超时'), 5_000);
    timer.unref();
    this.pending.set(client, timer);
    client.on('message', (raw) => void this.handle(client, request, raw.toString()));
    client.on('close', () => this.disconnect(client));
  }

  private async handle(client: WebSocket, request: IncomingMessage, raw: string) {
    try { this.auth.authorizeFrame(request); }
    catch { client.close(4008, '消息过于频繁'); return; }
    let data: unknown;
    try { data = JSON.parse(raw); }
    catch { this.send(client, { type: 'ERROR', message: '消息格式无效' }); return; }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) { this.send(client, { type: 'ERROR', message: '消息参数无效' }); return; }
    const message = parsed.data;
    try {
      let context = this.connections.get(client);
      if (!context) {
        if (message.type !== 'HELLO') throw new AccessError('请先建立身份会话', 401);
        context = this.auth.establish(request, message.sessionToken);
        this.clearPending(client);
        this.admit(client, context);
        this.welcome(client, context);
        return;
      }
      this.auth.validate(context);
      if (message.type === 'HELLO') throw new Error('身份会话已经建立');
      await this.dispatch(client, context, message);
    } catch (error) {
      const context = this.connections.get(client);
      const room = context ? this.service.roomForUser(context.principal.userId) : undefined;
      const state = context && room ? this.safeRoomState(room.id, context.principal.userId) : undefined;
      this.send(client, { type: 'ERROR', message: error instanceof Error ? error.message : '操作失败', ...(state ?? {}) });
      if (error instanceof AccessError && error.statusCode === 401) client.close(4003, error.message);
    }
  }

  private admit(client: WebSocket, context: RequestContext) {
    const existing = this.sessionClients.get(context.sessionId);
    const userCount = [...this.connections.values()].filter((item) => item.principal.userId === context.principal.userId).length;
    const ipCount = [...this.connections.values()].filter((item) => item.ip === context.ip).length;
    if (userCount >= this.auth.deployment.maxConnectionsPerUser) throw new AccessError('该用户连接数已达上限', 429);
    if (ipCount >= this.auth.deployment.maxConnectionsPerIp) throw new AccessError('该地址连接数已达上限', 429);
    if (existing && existing !== client) {
      this.connections.delete(existing);
      existing.close(4001, '会话已在新连接恢复');
    }
    this.connections.set(client, context);
    this.sessionClients.set(context.sessionId, client);
  }

  private welcome(client: WebSocket, context: RequestContext) {
    this.service.setConnected(context.principal.userId, true);
    const session = this.service.sessionView(context.principal, this.auth.sessionToken(context));
    this.send(client, { type: 'WELCOME', session, resumed: context.resumed });
    const room = this.service.roomForUser(context.principal.userId);
    if (room) this.sendRoom(client, room.id, context.principal.userId); else this.sendLobby(client, context);
    if (room) this.broadcastRoom(room.id);
    this.broadcastLobby();
  }

  private async dispatch(client: WebSocket, context: RequestContext, message: Exclude<ClientMessage, { type: 'HELLO' }>) {
    const principal = context.principal;
    if (message.type === 'LIST_ROOMS') {
      this.sendLobby(client, context);
    } else if (message.type === 'CREATE_ROOM') {
      if (this.service.roomCount() >= this.auth.deployment.maxRooms) throw new Error('服务器房间数量已达上限');
      if (this.service.roomCountForHost(principal.userId) >= this.auth.deployment.maxRoomsPerUser) throw new Error('个人房间数量已达上限');
      const room = this.service.createRoom(principal, message);
      this.broadcastRoom(room.id);
      this.broadcastLobby();
    } else if (message.type === 'JOIN_ROOM') {
      const room = this.service.joinRoom(principal, message.roomId, message.playerName);
      this.broadcastRoom(room.id);
      this.broadcastLobby();
    } else if (message.type === 'LEAVE_ROOM') {
      const result = this.service.leaveRoom(principal);
      if (result.room) this.broadcastRoom(result.roomId); else this.clearRoomTimer(result.roomId);
      this.sendLobby(client, context);
      this.broadcastLobby();
    } else if (message.type === 'DISBAND_ROOM') {
      const closed = this.service.disbandRoom(principal);
      this.clearRoomTimer(closed.roomId);
      this.notifyClosed(closed.memberUserIds, closed.roomId);
      this.broadcastLobby();
    } else if (message.type === 'START_GAME') {
      const room = this.service.startGame(principal);
      this.broadcastRoom(room.id);
      this.broadcastLobby();
      this.schedule(room.id);
    } else if (message.type === 'NEXT_DEAL') {
      const room = this.service.nextDealByHost(principal);
      this.broadcastRoom(room.id);
      this.schedule(room.id);
    } else if (message.type === 'ACTION') {
      const room = this.service.act(principal, message);
      this.broadcastRoom(room.id);
      this.schedule(room.id);
    }
  }

  private schedule(roomId: string) {
    this.clearRoomTimer(roomId);
    const room = this.service.rooms.get(roomId);
    if (!room?.game || room.status !== 'PLAYING') return;
    if (room.game.phase === 'DEAL_FINISHED') {
      const timer = setTimeout(() => {
        try { this.service.nextDeal(roomId); this.broadcastRoom(roomId); this.schedule(roomId); }
        catch { /* room changed while waiting */ }
      }, nextDealDelayMs);
      timer.unref();
      this.roomTimers.set(roomId, timer);
      return;
    }
    if (room.game.phase !== 'PLAYING' || room.game.currentPlayer === null) return;
    const player = room.game.players[room.game.currentPlayer];
    const delay = player.kind === 'BOT' ? botDelayMs : room.turnSeconds * 1_000;
    const deadline = Date.now() + delay;
    this.service.setTurnDeadline(roomId, deadline);
    this.broadcastRoom(roomId);
    const timer = setTimeout(() => {
      try {
        const latest = this.service.rooms.get(roomId);
        if (!latest?.game || latest.turnDeadline !== deadline) return;
        const current = latest.game.players[latest.game.currentPlayer!];
        const context = this.service.botDecision(roomId)?.context ?? decisionContext(latest.game, current.id);
        const action = decideBotAction(context);
        this.service.applyForPlayer(roomId, current.id, action);
        this.broadcastRoom(roomId);
        this.schedule(roomId);
      } catch { this.clearRoomTimer(roomId); }
    }, delay);
    timer.unref();
    this.roomTimers.set(roomId, timer);
  }

  private send(client: WebSocket, message: ServerMessage) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }

  private sendLobby(client: WebSocket, context: RequestContext) {
    this.send(client, {
      type: 'LOBBY',
      session: this.service.sessionView(context.principal, this.auth.sessionToken(context)),
      rooms: this.service.listRooms(context.principal.userId),
    });
  }

  private sendRoom(client: WebSocket, roomId: string, userId: string) {
    this.send(client, { type: 'ROOM', ...this.service.roomView(roomId, userId) });
  }

  private safeRoomState(roomId: string, userId: string) {
    try {
      const state = this.service.roomView(roomId, userId);
      return { table: state.table, view: state.view };
    } catch { return undefined; }
  }

  private broadcastLobby() {
    for (const [client, context] of this.connections) {
      if (!this.service.roomForUser(context.principal.userId)) this.sendLobby(client, context);
    }
  }

  private broadcastRoom(roomId: string) {
    for (const [client, context] of this.connections) {
      if (this.service.roomForUser(context.principal.userId)?.id === roomId) this.sendRoom(client, roomId, context.principal.userId);
    }
  }

  private notifyClosed(userIds: readonly string[], roomId: string) {
    for (const [client, context] of this.connections) {
      if (userIds.includes(context.principal.userId)) this.send(client, { type: 'ROOM_CLOSED', roomId, message: '房主已解散房间' });
    }
  }

  private disconnect(client: WebSocket) {
    this.clearPending(client);
    const context = this.connections.get(client);
    if (!context) return;
    this.connections.delete(client);
    if (this.sessionClients.get(context.sessionId) === client) this.sessionClients.delete(context.sessionId);
    const room = this.service.setConnected(context.principal.userId, false);
    if (room) this.broadcastRoom(room.id);
    this.broadcastLobby();
  }

  private clearPending(client: WebSocket) {
    const timer = this.pending.get(client);
    if (timer) clearTimeout(timer);
    this.pending.delete(client);
  }

  private clearRoomTimer(roomId: string) {
    const timer = this.roomTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.roomTimers.delete(roomId);
  }

  private cleanup() {
    this.auth.cleanup();
    for (const [client, context] of this.connections) {
      try { this.auth.validate(context); }
      catch { client.close(4003, '身份会话已过期'); }
    }
  }
}
