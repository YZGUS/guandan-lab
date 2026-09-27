import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoomService, type PersistedRoom } from './room-service.js';
import { MemoryEntityStore } from './storage.js';

const host = { userId: 'host-1', displayName: '房主' };

describe('room service', () => {
  it('starts one four-seat human and bot match and hides other hands', () => {
    const service = new RoomService(new MemoryEntityStore<PersistedRoom>());
    const room = service.createRoom(host, { type: 'CREATE_ROOM', roomName: '周末牌局', playerName: '南家', botCount: 3, turnSeconds: 30 });
    assert.equal(room.players.length, 4);
    service.startGame(host);
    const result = service.roomView(room.id, host.userId);
    assert.equal(result.view?.hand.length, 27);
    assert.equal(result.table?.players.length, 4);
    assert.equal('hand' in result.table!.players[1], false);
  });

  it('fills four human seats and normalizes duplicate names', () => {
    const service = new RoomService(new MemoryEntityStore<PersistedRoom>());
    const room = service.createRoom(host, { type: 'CREATE_ROOM', roomName: '好友房', playerName: '玩家', botCount: 0, turnSeconds: 30 });
    for (let index = 2; index <= 4; index += 1) {
      service.joinRoom({ userId: `human-${index}`, displayName: `Human ${index}` }, room.id, '玩家');
    }
    const names = service.rooms.get(room.id)!.players.map((player) => player.name);
    assert.deepEqual(names, ['玩家', '玩家 2', '玩家 3', '玩家 4']);
    assert.doesNotThrow(() => service.startGame(host));
  });

  it('hands an active leaver seat to a bot and transfers host without losing cards', () => {
    const service = new RoomService(new MemoryEntityStore<PersistedRoom>());
    const room = service.createRoom(host, { type: 'CREATE_ROOM', roomName: '离桌测试', playerName: 'Host', botCount: 2, turnSeconds: 30 });
    const guest = { userId: 'guest', displayName: 'Guest' };
    service.joinRoom(guest, room.id, 'Guest');
    service.startGame(host);
    const cards = room.game!.players[0].hand.map((card) => card.id);
    service.leaveRoom(host);
    assert.equal(room.hostPlayerId, guest.userId);
    assert.equal(room.game!.players[0].kind, 'BOT');
    assert.equal(room.players[0].kind, 'BOT');
    assert.deepEqual(room.game!.players[0].hand.map((card) => card.id), cards);
    assert.equal(service.roomForUser(host.userId), undefined);
    assert.throws(() => service.roomView(room.id, host.userId));
    assert.equal(service.leaveRoom(guest).room, null);
    assert.equal(service.roomCount(), 0);
  });

  it('restarts a completed match through the waiting room and resets levels', () => {
    const service = new RoomService(new MemoryEntityStore<PersistedRoom>());
    const room = service.createRoom(host, { type: 'CREATE_ROOM', roomName: '重新开局', playerName: 'Host', botCount: 2, turnSeconds: 30 });
    const guest = { userId: 'guest', displayName: 'Guest' };
    service.joinRoom(guest, room.id, 'Guest');
    service.startGame(host);
    assert.throws(() => service.restartMatch(host), /整场结束/);
    room.status = 'FINISHED';
    room.game!.phase = 'MATCH_FINISHED';
    room.game!.teams[0].level = 'A';
    assert.throws(() => service.restartMatch(guest), /房主/);
    service.restartMatch(host);
    assert.equal(room.status, 'WAITING');
    assert.equal(room.game, undefined);
    assert.equal(room.players.length, 4);
    service.startGame(host);
    assert.deepEqual(room.game!.teams.map((team) => team.level), ['2', '2']);
    room.game!.players.forEach((player) => assert.equal(player.hand.length, 27));
  });
});
