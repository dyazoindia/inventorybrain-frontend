import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const DEFAULT_PORTALS = [
  { key: 'AMZ', name: 'Amazon',   color: '#e65100', active: true },
  { key: 'FLK', name: 'Flipkart', color: '#1565c0', active: true },
  { key: 'ZPT', name: 'Zepto',    color: '#1b5e20', active: true },
  { key: 'BLK', name: 'Blinkit',  color: '#6a1b9a', active: true }
];

export default function PortalSettingsPage() {
  const [portals, setPortals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ib_portals')) || DEFAULT_PORTALS; }
    catch { return DEFAULT_PORTALS; }
  });
  const [newPortal, setNewPortal] = useState({ key: '', name: '', color: '#3b6ff5' });
  const [showAdd, setShowAdd] = useState(false);

  const save = (updated) => {
    setPortals(updated);
    localStorage.setItem('ib_portals', JSON.stringify(updated));
    toast.success('Portal settings saved');
  };

  const togglePortal = (key) => {
    save(portals.map(p => p.key === key ? { ...p, active: !p.active } : p));
  };

  const addPortal = () => {
    if (!newPortal.key || !newPortal.name) { toast.error('Key and Name are required'); return; }
    const key = newPortal.key.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (portals.find(p => p.key === key)) { toast.error('Portal key already exists'); return; }
    save([...portals, { ...newPortal, key, active: true }]);
    setNewPortal({ key: '', name: '', color: '#3b6ff5' });
    setShowAdd(false);
  };

  const removePortal = (key) => {
    if (DEFAULT_PORTALS.find(p => p.key === key)) { toast.error('Cannot remove default portals'); return; }
    if (!window.confirm(`Remove ${key} portal?`)) return;
    save(portals.filter(p => p.key !== key));
  };

  return (
    <div>
      <div className="sec" style={{ marginBottom: 6 }}>⚙️ Portal Settings</div>
      <div className="info-box" style={{ marginBottom: 20 }}>
        Manage your sales platforms. Add new portals (e.g. Meesho, AJIO) for future use. Active portals will show in all dashboards and DOC calculations.
      </div>

      <div className="table-wrap" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr><th>Key</th><th>Portal Name</th><th>Color</th><th>Status</th><th>Excel Column (Inv)</th><th>Excel Column (DRR)</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {portals.map(p => (
              <tr key={p.key}>
                <td><code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{p.key}</code></td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td><div style={{ width: 24, height: 24, borderRadius: 6, background: p.color, border: '1px solid var(--border)' }} /></td>
                <td>
                  <span className={`badge ${p.active ? 'badge-ok' : 'badge-gray'}`}>
                    {p.active ? '✓ Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{p.key} Inv</td>
                <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{p.key} DRR</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className={`btn btn-sm ${p.active ? 'btn-ghost' : 'btn-success'}`}
                    onClick={() => togglePortal(p.key)}>
                    {p.active ? 'Disable' : 'Enable'}
                  </button>
                  {!DEFAULT_PORTALS.find(d => d.key === p.key) && (
                    <button className="btn btn-danger btn-sm" onClick={() => removePortal(p.key)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd ? (
        <div className="card" style={{ maxWidth: 440, padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Add New Portal</div>
          <div className="form-group">
            <label className="form-label">Portal Key (short code, e.g. MSH)</label>
            <input className="form-input" placeholder="e.g. MSH" maxLength={5}
              value={newPortal.key} onChange={e => setNewPortal({ ...newPortal, key: e.target.value.toUpperCase() })} />
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              This becomes the Excel column prefix: <strong>{newPortal.key || 'XXX'} Inv</strong> and <strong>{newPortal.key || 'XXX'} DRR</strong>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Portal Name</label>
            <input className="form-input" placeholder="e.g. Meesho"
              value={newPortal.name} onChange={e => setNewPortal({ ...newPortal, name: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Color</label>
            <input type="color" value={newPortal.color}
              onChange={e => setNewPortal({ ...newPortal, color: e.target.value })}
              style={{ width: 50, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={addPortal}>Add Portal</button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add New Portal</button>
      )}

      <div className="warn-box" style={{ marginTop: 24 }}>
        ⚠️ After adding a new portal, make sure your Excel file includes <strong>{newPortal.key || 'NEWKEY'} Inv</strong> and <strong>{newPortal.key || 'NEWKEY'} DRR</strong> columns for inventory calculations to work correctly.
      </div>
    </div>
  );
}
