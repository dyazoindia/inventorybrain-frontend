// MDDashboard.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, poApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { DocCell, ActionBadge, POStatusBadge, Empty, Loading, fmtN } from '../components/ui';
import toast from 'react-hot-toast';

export function MDDashboard() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: invData, isLoading } = useQuery({
    queryKey: ['inventory-md'],
    queryFn: () => inventoryApi.getLatest({ supplier: 'MD' }).then(r => r.data)
  });

  const { data: poData } = useQuery({
    queryKey: ['pos-md'],
    queryFn: () => poApi.list({ supplier: 'MD' }).then(r => r.data)
  });

  const confirmMut = useMutation({
    mutationFn: ({ id }) => poApi.confirm(id, {}),
    onSuccess: () => { toast.success('Order confirmed!'); qc.invalidateQueries(['pos-md']); }
  });
  const approveMut = useMutation({
    mutationFn: ({ id }) => poApi.approve(id, {}),
    onSuccess: () => { toast.success('PO approved!'); qc.invalidateQueries(['pos-md']); }
  });

  if (isLoading) return <Loading text="Loading MD SKUs…" />;

  let rows = invData?.rows || [];
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => r.sku?.toLowerCase().includes(q) || r.asin?.toLowerCase().includes(q) || r.ean?.toLowerCase().includes(q));
  }

  const poMap = {};
  (poData?.purchaseOrders || []).forEach(po => { poMap[po.asin] = po; });

  const needPO = rows.filter(r => r.actionRequired === 'need_po').length;
  const pendingApproval = (poData?.purchaseOrders || []).filter(p => p.status === 'supplier_confirmed');

  return (
    <div>
      <div className="hero hero-md"><h2>🏢 MD Supplier Dashboard</h2><p>{rows.length} SKUs · {needPO} need PO</p></div>
      <div className="kgrid" style={{ marginBottom: 14 }}>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--red)' }} /><div className="klbl">Need PO</div><div className="kval" style={{ color: 'var(--red)' }}>{needPO}</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--green)' }} /><div className="klbl">Stock OK</div><div className="kval" style={{ color: 'var(--green)' }}>{rows.length - needPO}</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--blue)' }} /><div className="klbl">Target Co. DOC</div><div className="kval" style={{ color: 'var(--blue)' }}>60d</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--orange)' }} /><div className="klbl">WH Alert Threshold</div><div className="kval" style={{ color: 'var(--orange)' }}>30d</div></div>
      </div>
      <div className="info-box">📋 <strong>MD Logic:</strong> WH DOC &lt; 30 = Need PO | Co. DOC &gt; 60 = No Need | Co. DOC &lt; 60 = Need PO</div>

      {isAdmin && pendingApproval.length > 0 && (
        <>
          <div className="sec" style={{ color: 'var(--orange)', marginBottom: 10 }}>⏳ PO Approval Required ({pendingApproval.length})</div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead><tr><th>SKU</th><th>Suggest Qty</th><th>Co. DOC</th><th>Approve</th></tr></thead>
              <tbody>
                {pendingApproval.map(po => (
                  <tr key={po._id}>
                    <td style={{ fontWeight: 500 }}>{po.sku || po.asin}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtN(po.suggestQty)}</td>
                    <td><DocCell value={po.companyDocAtCreation} /></td>
                    <td><button className="btn btn-success btn-sm" onClick={() => approveMut.mutate({ id: po._id })}>✓ Approve</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="sec" style={{ marginBottom: 0 }}>MD SKU Table <small>({rows.length})</small></div>
        <input className="filter-input" style={{ marginLeft: 'auto', width: 200 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {!rows.length ? <Empty icon="🏢" title="No MD SKUs found" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Link</th><th>EAN</th><th>SKU</th><th>Title</th>
              <th>WH DOC</th><th>Co. DOC</th><th>DRR</th><th>Suggest Qty</th>
              <th>Action</th><th>PO Status</th>
              {!isAdmin && <th>Confirm Order</th>}
              {isAdmin  && <th>Approve PO</th>}
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const po = poMap[r.asin];
                return (
                  <tr key={r.asin}>
                    <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a> : '—'}</td>
                    <td style={{ fontSize: 10, color: 'var(--subtle)', fontFamily: 'monospace' }}>{r.ean || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{r.sku || '—'}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || '—'}</td>
                    <td><DocCell value={r.whDOC} /></td>
                    <td><DocCell value={r.companyDOC} /></td>
                    <td>{r.totalDRR?.toFixed(1)}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '—'}</td>
                    <td><ActionBadge action={r.actionRequired} /></td>
                    <td>{po ? <POStatusBadge status={po.status} /> : <span className="badge badge-gray">No PO</span>}</td>
                    {!isAdmin && (
                      <td>
                        {po?.status === 'system_suggested' ? (
                          <button className="btn btn-primary btn-sm" onClick={() => confirmMut.mutate({ id: po._id })}>Confirm Order</button>
                        ) : po ? <span className="badge badge-ok">✓ Done</span> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}
                    {isAdmin && (
                      <td>
                        {po?.status === 'supplier_confirmed' ? (
                          <button className="btn btn-success btn-sm" onClick={() => approveMut.mutate({ id: po._id })}>Approve</button>
                        ) : po ? <POStatusBadge status={po.status} /> : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MDDashboard;
