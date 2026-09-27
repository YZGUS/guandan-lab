import { useEffect, useState } from 'react';
import { CloudLogin } from './CloudLogin';
import { GameTable } from './GameTable';
import { Lobby } from './Lobby';
import { WaitingRoom } from './WaitingRoom';
import { useGameClient } from './useGameClient';

type AuthState = { ready: boolean; mode: 'local' | 'cloud'; authenticated: boolean };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ ready: false, mode: 'local', authenticated: false });
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/auth/status`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((value: { mode: 'local' | 'cloud'; authenticated: boolean }) => setAuth({ ready: true, ...value }))
      .catch(() => setAuth({ ready: true, mode: 'local', authenticated: true }));
  }, []);
  const client = useGameClient(auth.ready && auth.authenticated);

  if (!auth.ready) return <main className="loading-shell"><span>掼</span><p>正在确认服务模式…</p></main>;
  if (auth.mode === 'cloud' && !auth.authenticated) return <CloudLogin onAuthenticated={() => setAuth((current) => ({ ...current, authenticated: true }))} />;
  if (!client.session) return <main className="loading-shell"><span>掼</span><p>{client.connection === 'RECONNECTING' ? '正在恢复牌桌…' : '正在连接牌桌…'}</p></main>;

  return (
    <>
      {client.room && client.table && client.view
        ? <GameTable room={client.room} table={client.table} view={client.view} send={client.send} connection={client.connection} />
        : client.room
          ? <WaitingRoom room={client.room} send={client.send} />
          : <Lobby session={client.session} rooms={client.rooms} send={client.send} />}
      {client.error && <button className="error-toast" onClick={client.clearError}>{client.error}<span>×</span></button>}
    </>
  );
}
