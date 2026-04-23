import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { poApi, inventoryApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { DocCell, POStatusBadge, Empty, Loading, fmtN, POFlowBar } from '../components/ui';

const PLATFORMS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PLATFORM_NAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
const PLATFORM_COLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function OpenPODashboard() {
  const { isAdmin } = useAuth();
  const [platform, setPlatform] = useState('AMZ');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['inventory-latest'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['pos-all'],
    queryFn: () => poApi.list().then(r => r.data)
  });

  if (invLoading || poLoading) return <Loading text="Loading PO data…" />;

  const rows     = invData?.rows || [];
  const allPOs   = poData?.purchaseOrders || [];

  // Platform rows with DOC
  const pKey  = platform.toLowerCase() + 'DOC';
  const pRows = rows
    .filter(r => r['totalDRR'] > 0)
    .map(r => ({ ...r, platformDOC: r[pKey] }))
    .sort((a, b) => (a.platformDOC ?? 9999) - (b.platformDOC ?? 9999));

  const oos    = pRows.filter(r => r.platformDOC !== null && r.platformDOC < 7).length;
  const urgent = pRows.filter(r => r.platformDOC !== null && r.platformDOC >= 7 && r.platformDOC < 15).length;
  const ok     = pRows.filter(r => r.platformDOC !== null && r.platformDOC >= 30).length;

  // PO list
  let filteredPOs = allPOs;
  if (statusFilter !== 'all') filteredPOs = allPOs.filter(po => po.status === statusFilter);

  return (
    <div>
      <div className="sec">Open PO Master Dashboard</div>

      {/* Platform summary cards */}
      <div className="kgrid" style={{ marginBottom: 16 }}>
        {PLATFORMS.map(p => {
          const key = p.toLowerCase() + 'DOC';
          const pOos  = rows.filter(r => r[key] !== null && r[key] < 7).length;
          const pUrg  = rows.filter(r => r[key] !== null && r[key] >= 7 && r[key] < 15).length;
          const pOk   = rows.filter(r => r[key] !== null && r[key] >= 30).length;
          return (
            <div key={p} className="kcard" style={{ cursor: 'pointer', borderColor: platform === p ? PLATFORM_COLORS[p] : 'var(--border)' }}
              onClick={() => setPlatform(p)}>
              <div className="kbar" style={{ background: PLATFORM_COLORS[p] }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: PLATFORM_COLORS[p], textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 }}>
                {PLATFORM_NAMES[p]}
              </div>
              <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚡ {pOos} OOS Risk</span>
                <span style={{ color: 'var(--orange)', fontWeight: 600 }}>⚠ {pUrg} Urgent</span>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ {pOk} OK</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform inventory table */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="sec" style={{ marginBottom: 0 }}>{PLATFORM_NAMES[platform]} Platform View</div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {PLATFORMS.map(p => (
            <button key={p} className={`btn btn-sm ${platform === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPlatform(p)}>{PLATFORM_NAMES[p]}</button>
          ))}
        </div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead><tr>
            <th>SKU</th><th>Title</th><th>Supplier</th>
            <th>{PLATFORM_NAMES[platform]} Inv</th><th>DRR/day</th>
            <th>Platform DOC</th><th>Open PO</th><th>Risk Status</th>
          </tr></thead>
          <tbody>
            {pRows.map(r => {
              const invKey = platform.toLowerCase() + 'Inv';
              const drrKey = platform.toLowerCase() + 'DRR';
              const pdoc   = r.platformDOC;
              const statusEl = pdoc === null ? <span className="badge badge-gray">N/A</span>
                : pdoc < 7  ? <span className="badge badge-critical">⚡ OOS Risk</span>
                : pdoc < 15 ? <span className="badge badge-urgent">⚠ Urgent</span>
                : pdoc < 30 ? <span className="badge badge-po">PO Required</span>
                : <span className="badge badge-ok">OK</span>;
              return (
                <tr key={r.asin}>
                  <td style={{ fontWeight: 500 }}>{r.sku || '—'}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || '—'}</td>
                  <td><span className="badge badge-supplier">{r.supplier}</span></td>
                  <td>{fmtN(r[invKey])}</td>
                  <td>{r[drrKey]?.toFixed(1) || '—'}</td>
                  <td><DocCell value={pdoc} /></td>
                  <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>{fmtN(r.openPO)}</td>
                  <td>{statusEl}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PO List */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="sec" style={{ marginBottom: 0 }}>All Purchase Orders <small>({filteredPOs.length})</small></div>
        <select className="filter-select" style={{ marginLeft: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="system_suggested">Suggested</option>
          <option value="supplier_confirmed">Confirmed</option>
          <option value="admin_approved">Approved</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {!allPOs.length ? <Empty icon="📦" title="No purchase orders yet" desc="POs will appear here once created by the system or admin." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>EAN</th><th>Supplier</th><th>Qty</th><th>Status</th><th>Confirmed By</th><th>Approved By</th><th>Packing List</th><th>Created</th></tr></thead>
            <tbody>
              {filteredPOs.map(po => (
                <tr key={po._id}>
                  <td style={{ fontWeight: 500 }}>{po.sku || po.asin}</td>
                  <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)' }}>{po.ean || '—'}</td>
                  <td><span className="badge badge-supplier">{po.supplier}</span></td>
                  <td style={{ fontWeight: 600 }}>{fmtN(po.quantity)}</td>
                  <td><POStatusBadge status={po.status} /></td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{po.confirmedBy?.name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{po.approvedBy?.name || '—'}</td>
                  <td>
                    {po.packingListFile?.url
                      ? <a href={po.packingListFile.url} target="_blank" rel="noreferrer" className="badge badge-transit">📎 View</a>
                      : <span className="badge badge-gray">None</span>}
                  </td>
                  <td style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(po.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
