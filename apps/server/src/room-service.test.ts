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
});
