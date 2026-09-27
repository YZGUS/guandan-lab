import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type ClientMessage, type RoomSummary, type RoomView, type ServerMessage, type SessionView } from '@guandan/protocol';
import type { PlayerView, TableView } from '@guandan/core';

type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

function wsUrl() {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}/ws`;
}

export function useGameClient(enabled: boolean) {
  const socket = useRef<WebSocket | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const [connection, setConnection] = useState<ConnectionState>('CONNECTING');
  const [session, setSession] = useState<SessionView | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [table, setTable] = useState<TableView | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((message: Exclude<ClientMessage, { type: 'HELLO' }>) => {
    if (socket.current?.readyState !== WebSocket.OPEN) { setError('连接尚未就绪'); return false; }
    socket.current.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setConnection(attempts.current ? 'RECONNECTING' : 'CONNECTING');
      const client = new WebSocket(wsUrl());
      socket.current = client;
      client.addEventListener('open', () => {
        attempts.current = 0;
        setConnection('CONNECTED');
        setError(null);
        const token = localStorage.getItem('guandan-session-token') ?? undefined;
        client.send(JSON.stringify({ type: 'HELLO', protocolVersion: PROTOCOL_VERSION, ...(token ? { sessionToken: token } : {}) }));
      });
      client.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'WELCOME') {
          setSession(message.session);
          if (message.session.token) localStorage.setItem('guandan-session-token', message.session.token);
        } else if (message.type === 'LOBBY') {
          setSession(message.session); setRooms(message.rooms); setRoom(null); setTable(null); setView(null);
        } else if (message.type === 'ROOM') {
          setRoom(message.room); setTable(message.table ?? null); setView(message.view ?? null); setError(null);
        } else if (message.type === 'ROOM_CLOSED') {
          setRoom(null); setTable(null); setView(null); setError(message.message);
          client.send(JSON.stringify({ type: 'LIST_ROOMS' }));
        } else if (message.type === 'ERROR') {
          setError(message.message);
          if (message.table) setTable(message.table);
          if (message.view) setView(message.view);
        }
      });
      client.addEventListener('close', () => {
        if (socket.current === client) socket.current = null;
        if (disposed) return;
        setConnection('RECONNECTING');
        attempts.current += 1;
        retry.current = setTimeout(connect, Math.min(5_000, 500 * 2 ** Math.min(4, attempts.current)));
      });
      client.addEventListener('error', () => client.close());
    };
    connect();
    return () => {
      disposed = true;
      if (retry.current) clearTimeout(retry.current);
      socket.current?.close();
      socket.current = null;
      setConnection('DISCONNECTED');
    };
  }, [enabled]);

  return { connection, session, rooms, room, table, view, error, clearError: () => setError(null), send };
}
