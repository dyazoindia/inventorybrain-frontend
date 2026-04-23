import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import toast from 'react-hot-toast';

const ROLE_LABELS = { admin: '👑 Admin', china_supplier: '🏭 China Supplier', md_supplier: '🏢 MD Supplier' };

const ROLE_NAV = {
  admin: [
    { to: '/admin',              icon: '📊', label: 'Dashboard' },
    { to: '/admin/all-products', icon: '📋', label: 'All Products' },
    { to: '/admin/china',        icon: '🏭', label: 'China Supplier' },
    { to: '/admin/md',           icon: '🏢', label: 'MD Supplier' },
    { to: '/admin/open-po',      icon: '📦', label: 'Open PO' },
    { to: '/admin/compare',      icon: '🔄', label: 'Compare Files' },
    { to: '/admin/users',        icon: '👥', label: 'Users' }
  ],
  china_supplier: [
    { to: '/china',         icon: '📋', label: 'My SKUs' },
    { to: '/china/open-po', icon: '📦', label: 'PO Status' }
  ],
  md_supplier: [
    { to: '/md',         icon: '📋', label: 'My SKUs' },
    { to: '/md/open-po', icon: '📦', label: 'PO Status' }
  ]
};

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadApi } = await import('../../utils/api');
      const res = await uploadApi.uploadExcel(file);
      toast.success(res.data.message);
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const nav = ROLE_NAV[user?.role] || [];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          🧠 InventoryBrain
          <span>Inventory Planning v3</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/china' || item.to === '/md'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-role">
            <strong>{user?.name}</strong>
            {ROLE_LABELS[user?.role]}
          </div>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { logout(); navigate('/login'); }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span style={{ fontWeight: 600, fontSize: 14 }}>InventoryBrain</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>|</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[user?.role]}</span>
          <div className="ml-auto" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                {uploading ? <><span className="spinner" /> Uploading…</> : '⬆ Upload Excel'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
