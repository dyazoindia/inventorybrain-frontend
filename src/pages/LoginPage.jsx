import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const ROLES = [
  { key: 'admin',          label: 'Admin',         icon: '👑', email: 'admin@yourcompany.com', hint: 'Full access' },
  { key: 'china_supplier', label: 'China Supplier', icon: '🏭', email: 'china@supplier.com',    hint: 'China SKUs only' },
  { key: 'md_supplier',    label: 'MD Supplier',    icon: '🏢', email: 'md@supplier.com',       hint: 'MD SKUs only' }
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('admin@yourcompany.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading,  setLoading]  = useState(false);

  const selectRole = (r) => { setEmail(r.email); };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Email and password required'); return; }
    setLoading(true);
    try {
      const user = await login(email, password);
      const redirects = { admin: '/admin', china_supplier: '/china', md_supplier: '/md' };
      navigate(redirects[user.role] || '/');
      toast.success(`Welcome, ${user.name}!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '36px 32px', width: 380, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue)', marginBottom: 4 }}>🧠 InventoryBrain</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>Inventory Planning & Supplier Collaboration</div>

        {/* Quick role select */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text)' }}>Quick select role</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {ROLES.map(r => (
              <button key={r.key} type="button"
                onClick={() => selectRole(r)}
                style={{
                  padding: '10px 8px', border: `1px solid ${email === r.email ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 8, background: email === r.email ? 'var(--blue-lt)' : 'var(--bg)',
                  cursor: 'pointer', textAlign: 'center', transition: 'all .13s'
                }}>
                <div style={{ fontSize: 18, marginBottom: 3 }}>{r.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: email === r.email ? 'var(--blue)' : 'var(--text)' }}>{r.label}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{r.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
            {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 20, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>Demo credentials (after seeding):</strong><br />
          Admin: admin@yourcompany.com / Admin@123<br />
          China: china@supplier.com / China@123<br />
          MD: md@supplier.com / MD@123
        </div>
      </div>
    </div>
  );
}
