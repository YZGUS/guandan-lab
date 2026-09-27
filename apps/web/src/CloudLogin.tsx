import { useState, type FormEvent } from 'react';

export function CloudLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/auth/invite`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? '登录失败');
      onAuthenticated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败'); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">GUANDAN LAB · CLOUD</p>
        <h1>进入云端牌桌</h1>
        <p>输入管理员分配的邀请码。登录状态仅保存在安全 Cookie 中。</p>
        <label>邀请码<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" autoFocus /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy || !code.trim()}>{busy ? '正在验证…' : '进入大厅'}</button>
      </form>
    </main>
  );
}
