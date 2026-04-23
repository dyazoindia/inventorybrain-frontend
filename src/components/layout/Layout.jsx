import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import toast from 'react-hot-toast';

const ROLE_LABELS = {
  admin:          '👑 Admin',
  china_supplier: '🏭 China Supplier',
  md_supplier:    '🏢 MD Supplier',
  operations:     '📤 Operations'
};

const ROLE_NAV = {
  admin: [
    { to: '/admin',              icon: '📊', label: 'Dashboard' },
    { to: '/admin/all-products', icon: '📋', label: 'All Products' },
    { to: '/admin/china',        icon: '🏭', label: 'China Supplier' },
    { to: '/admin/md',           icon: '🏢', label: 'MD Supplier' },
    { to: '/admin/open-po',      icon: '📦', label: 'Open PO' },
    { to: '/admin/compare',      icon: '🔄', label: 'Compare Files' },
    { to: '/admin/upload',       icon: '📤', label: 'Upload Data' },
    { to: '/admin/portals',      icon: '⚙️',  label: 'Portal Settings' },
    { to: '/admin/users',        icon: '👥', label: 'Users' }
  ],
  operations: [
    { to: '/ops', icon: '📤', label: 'Upload Data' }
  ],
  china_supplier: [
    { to: '/china', icon: '📋', label: 'My SKUs' }
  ],
  md_supplier: [
    { to: '/md', icon: '📋', label: 'My SKUs' }
  ]
};

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
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
              end={['admin','ops','china','md'].some(r => item.to === '/' + r)}
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
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { logout(); navigate('/login'); }}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span style={{ fontWeight: 600, fontSize: 14 }}>InventoryBrain</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>|</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{ROLE_LABELS[user?.role]}</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
