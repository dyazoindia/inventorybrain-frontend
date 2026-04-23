import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../utils/api';
import { Empty, Loading, Modal } from '../components/ui';
import toast from 'react-hot-toast';

const ROLES = { admin: '👑 Admin', china_supplier: '🏭 China Supplier', md_supplier: '🏢 MD Supplier' };

export default function UsersPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'md_supplier' });

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data)
  });

  const createMut = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      toast.success('User created!');
      qc.invalidateQueries(['users']);
      setShowAdd(false);
      setForm({ name: '', email: '', password: '', role: 'md_supplier' });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create user')
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => usersApi.remove(id),
    onSuccess: () => { toast.success('User deactivated'); qc.invalidateQueries(['users']); }
  });

  if (isLoading) return <Loading text="Loading users…" />;

  const users = data?.users || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>User Management <small>({users.length} users)</small></div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add User</button>
      </div>

      {!users.length ? <Empty icon="👥" title="No users found" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Created</th><th>Action</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{u.email}</td>
                  <td><span className="badge badge-supplier">{ROLES[u.role] || u.role}</span></td>
                  <td>
                    <span className={`badge ${u.isActive ? 'badge-ok' : 'badge-dead'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    {u.isActive && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Deactivate ${u.name}?`)) deactivateMut.mutate(u._id); }}>
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add New User" onClose={() => setShowAdd(false)}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" placeholder="John Doe" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" placeholder="user@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Min 6 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Role</label>
            <select className="form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="admin">👑 Admin</option>
              <option value="china_supplier">🏭 China Supplier</option>
              <option value="md_supplier">🏢 MD Supplier</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
