import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portalPOApi, inventoryApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Empty, Loading, fmtN } from '../components/ui';
import toast from 'react-hot-toast';

const PORTALS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PNAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
const PCOLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function OpenPODashboard() {
  const { isAdmin, user } = useAuth();
  const isOps = user && user.role === 'operations';
  const qc = useQueryClient();
  const [portal, setPortal] = useState('AMZ');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ asin: '', openPOQty: '', poReference: '', notes: '' });

  const { data: poData, isLoading } = useQuery({
    queryKey: ['portal-po', portal],
    queryFn: function() { return portalPOApi.list({ portal: portal }).then(function(r) { return r.data; }); }
  });

  const { data: invData } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: function() { return inventoryApi.getLatest().then(function(r) { return r.data; }); }
  });

  const shipMut = useMutation({
    mutationFn: function(d) { return portalPOApi.ship(d.id, { shippedQty: d.qty }); },
    onSuccess: function() { toast.success('Updated'); qc.invalidateQueries(['portal-po']); },
    onError: function(e) { toast.error(e.response?.data?.error || 'Failed'); }
  });

  const deliverMut = useMutation({
    mutationFn: function(d) { return portalPOApi.deliver(d.id, { deliveredQty: d.qty }); },
    onSuccess: function() { toast.success('Delivered'); qc.invalidateQueries(['portal-po']); },
    onError: function() { toast.error('Failed'); }
  });

  const createMut = useMutation({
    mutationFn: function(d) { return portalPOApi.create(d); },
    onSuccess: function() {
      toast.success('Created!');
      qc.invalidateQueries(['portal-po']);
      setModal(false);
      setForm({ asin: '', openPOQty: '', poReference: '', notes: '' });
    },
    onError: function() { toast.error('Failed'); }
  });

  var allPOs = poData?.portalPOs || [];
  var whMap = {};
  var invRows = invData?.rows || [];
  invRows.forEach(function(r) { whMap[r.asin] = r.whInv; });

  var rows = allPOs;
  if (search) {
    var q = search.toLowerCase();
    rows = rows.filter(function(r) {
      return (r.sku?.toLowerCase().indexOf(q) >= 0) || (r.asin?.toLowerCase().indexOf(q) >= 0);
    });
  }

  if (isLoading) return <Loading text="Loading..." />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>Open PO Dashboard</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(isAdmin || isOps) && (
            <button className="btn btn-primary btn-sm" onClick={function() { setModal(true); }}>
              + Add PO
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' }}>
        {PORTALS.map(function(p) {
          var active = portal === p;
          return (
            <button key={p} onClick={function() { setPortal(p); }}
              style={{
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 700 : 500,
                background: active ? PCOLORS[p] : '#f5f6fa',
                color: active ? '#fff' : PCOLORS[p],
                borderRight: p !== 'BLK' ? '1px solid rgba(0,0,0,.1)' : 'none'
              }}>
              {PNAMES[p]}
            </button>
          );
        })}
      </div>

      <div className="info-box" style={{ marginBottom: 14 }}>
        <strong>Portal PO:</strong> Open PO = Platform demand | Pending = Open PO minus Shipped | Ops enters Shipped | Admin marks Delivered
      </div>

      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input className="filter-input" placeholder="Search SKU / ASIN..."
          value={search} onChange={function(e) { setSearch(e.target.value); }} />
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {rows.length === 0 ? (
        <Empty icon="📦" title={'No ' + PNAMES[portal] + ' POs found'}
          desc={(isAdmin || isOps) ? 'Add portal POs using the + button.' : 'No open POs yet.'} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Title</th>
                <th>WH Inv</th>
                <th>Open PO Qty</th>
                <th>Shipped Qty</th>
                <th>Pending Qty</th>
                <th>Delivered</th>
                <th>Status</th>
                <th>PO Ref</th>
                {isAdmin && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                var pending = Math.max(0, (r.openPOQty || 0) - (r.shippedQty || 0));
                var wh = whMap[r.asin] || r.warehouseInvAtCreation || 0;
                return (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 500 }}>{r.sku || r.asin}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '—'}</td>
                    <td style={{ color: wh < 20 ? 'var(--red)' : 'var(--text)', fontWeight: 500 }}>{fmtN(wh)}</td>
                    <td style={{ fontWeight: 700, color: PCOLORS[portal] }}>{fmtN(r.openPOQty)}</td>
                    <td style={{ background: '#fffde7' }}>
                      {(isAdmin || isOps) && r.status !== 'delivered' ? (
                        <button className="btn btn-ghost btn-xs"
                          onClick={function() {
                            var qty = prompt('Enter shipped qty:', r.shippedQty || 0);
                            if (qty !== null) shipMut.mutate({ id: r._id, qty: parseInt(qty) || 0 });
                          }}>
                          {r.shippedQty || 'Enter'}
                        </button>
                      ) : (
                        <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{fmtN(r.shippedQty || 0)}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: pending > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmtN(pending)}
                    </td>
                    <td style={{ color: 'var(--green)' }}>{fmtN(r.deliveredQty || 0)}</td>
                    <td>
                      <span className={'badge ' + (r.status === 'delivered' ? 'badge-ok' : r.status === 'fully_shipped' ? 'badge-transit' : r.status === 'partially_shipped' ? 'badge-urgent' : 'badge-po')}>
                        {r.status === 'delivered' ? 'Delivered' : r.status === 'fully_shipped' ? 'Shipped' : r.status === 'partially_shipped' ? 'Part.Shipped' : 'Open'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.poReference || '—'}</td>
                    {isAdmin && (
                      <td>
                        {r.status === 'fully_shipped' && (
                          <button className="btn btn-success btn-xs"
                            onClick={function() { deliverMut.mutate({ id: r._id, qty: r.shippedQty }); }}>
                            Deliver
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={function(e) { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Add {PNAMES[portal]} PO</div>
              <button className="modal-close" onClick={function() { setModal(false); }}>x</button>
            </div>
            <div className="form-group">
              <label className="form-label">ASIN</label>
              <input className="form-input" placeholder="B09XXXXX"
                value={form.asin} onChange={function(e) { setForm({ ...form, asin: e.target.value }); }} />
            </div>
            <div className="form-group">
              <label className="form-label">Open PO Qty</label>
              <input className="form-input" type="number" min="0" placeholder="100"
                value={form.openPOQty} onChange={function(e) { setForm({ ...form, openPOQty: e.target.value }); }} />
            </div>
            <div className="form-group">
              <label className="form-label">PO Reference</label>
              <input className="form-input" placeholder="AMZ-PO-XXX"
                value={form.poReference} onChange={function(e) { setForm({ ...form, poReference: e.target.value }); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Notes</label>
              <input className="form-input" placeholder="Optional"
                value={form.notes} onChange={function(e) { setForm({ ...form, notes: e.target.value }); }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={function() { setModal(false); }}>Cancel</button>
              <button className="btn btn-primary" disabled={createMut.isPending}
                onClick={function() {
                  createMut.mutate({ asin: form.asin, portal: portal, openPOQty: parseInt(form.openPOQty) || 0, poReference: form.poReference, notes: form.notes });
                }}>
                {createMut.isPending ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
