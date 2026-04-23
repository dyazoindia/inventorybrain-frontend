import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, poApi, uploadApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { DocCell, ActionBadge, POStatusBadge, Empty, Loading, fmtN } from '../components/ui';
import toast from 'react-hot-toast';

export default function ChinaDashboard() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: invData, isLoading } = useQuery({
    queryKey: ['inventory-china'],
    queryFn: () => inventoryApi.getLatest({ supplier: 'CHINA' }).then(r => r.data)
  });

  const { data: poData } = useQuery({
    queryKey: ['pos-china'],
    queryFn: () => poApi.list({ supplier: 'CHINA' }).then(r => r.data)
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, notes }) => poApi.confirm(id, { notes }),
    onSuccess: () => { toast.success('PO confirmed!'); qc.invalidateQueries(['pos-china']); }
  });

  const approveMut = useMutation({
    mutationFn: ({ id, notes }) => poApi.approve(id, { notes }),
    onSuccess: () => { toast.success('PO approved!'); qc.invalidateQueries(['pos-china']); }
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }) => poApi.reject(id, { reason }),
    onSuccess: () => { toast.error('PO rejected'); qc.invalidateQueries(['pos-china']); }
  });

  const deliverMut = useMutation({
    mutationFn: ({ id, status, discrepancyNotes }) => poApi.deliver(id, { status, discrepancyNotes }),
    onSuccess: () => { toast.success('Delivery status updated'); qc.invalidateQueries(['pos-china']); }
  });

  const uploadPacking = async (poId, file) => {
    try {
      await uploadApi.uploadPackingList(poId, file);
      toast.success('Packing list uploaded');
      qc.invalidateQueries(['pos-china']);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
  };

  if (isLoading) return <Loading text="Loading China SKUs…" />;

  let rows = invData?.rows || [];
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => r.sku?.toLowerCase().includes(q) || r.asin?.toLowerCase().includes(q) || r.ean?.toLowerCase().includes(q) || r.title?.toLowerCase().includes(q));
  }

  const poMap = {};
  (poData?.purchaseOrders || []).forEach(po => { poMap[po.asin] = po; });

  const needPO  = rows.filter(r => r.actionRequired === 'need_po').length;
  const stockOk = rows.filter(r => r.actionRequired !== 'need_po').length;

  const pendingApproval = (poData?.purchaseOrders || []).filter(po => po.status === 'supplier_confirmed');

  return (
    <div>
      {/* Hero */}
      <div className="hero hero-china">
        <h2>🏭 China Supplier Dashboard</h2>
        <p>{rows.length} SKUs · {needPO} need PO · {stockOk} stock OK</p>
      </div>

      {/* KPIs */}
      <div className="kgrid" style={{ marginBottom: 16 }}>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--red)' }} /><div className="klbl">Need PO</div><div className="kval" style={{ color: 'var(--red)' }}>{needPO}</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--green)' }} /><div className="klbl">Stock OK</div><div className="kval" style={{ color: 'var(--green)' }}>{stockOk}</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--blue)' }} /><div className="klbl">Target Co. DOC</div><div className="kval" style={{ color: 'var(--blue)' }}>120d</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--orange)' }} /><div className="klbl">WH Alert Threshold</div><div className="kval" style={{ color: 'var(--orange)' }}>60d</div></div>
      </div>

      <div className="info-box">
        📋 <strong>China Reorder Logic:</strong> WH DOC &lt; 60d = Flag | WH DOC &lt; 60 + Co. DOC &gt; 120 = No Need | Co. DOC &lt; 120 = Need PO
      </div>

      {/* PO Approval table (admin only) */}
      {isAdmin && pendingApproval.length > 0 && (
        <>
          <div className="sec" style={{ color: 'var(--orange)', marginBottom: 10 }}>⏳ PO Approval Required ({pendingApproval.length})</div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead><tr><th>SKU</th><th>EAN</th><th>Suggest Qty</th><th>Co. DOC</th><th>Action</th><th>Approve</th><th>Reject</th></tr></thead>
              <tbody>
                {pendingApproval.map(po => (
                  <tr key={po._id}>
                    <td style={{ fontWeight: 500 }}>{po.sku || po.asin}</td>
                    <td style={{ fontSize: 10, color: 'var(--subtle)', fontFamily: 'monospace' }}>{po.ean}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmtN(po.suggestQty)}</td>
                    <td><DocCell value={po.companyDocAtCreation} /></td>
                    <td><span className="action-need">Need PO</span></td>
                    <td><button className="btn btn-success btn-sm" onClick={() => approveMut.mutate({ id: po._id })} disabled={approveMut.isPending}>✓ Approve</button></td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => rejectMut.mutate({ id: po._id, reason: 'Rejected by admin' })} disabled={rejectMut.isPending}>✗ Reject</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Main SKU Table */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="sec" style={{ marginBottom: 0 }}>China SKU Action Table <small>({rows.length} SKUs)</small></div>
        <input className="filter-input" style={{ marginLeft: 'auto', width: 200 }} placeholder="Search SKU / EAN / ASIN…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {!rows.length ? <Empty icon="🏭" title="No China SKUs found" desc='Ensure the "Supplier" column in your Excel has "CHINA" values.' /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Link</th><th>EAN</th><th>SKU</th><th>Title</th>
                <th>WH DOC</th><th>Co. DOC</th><th>DRR/day</th><th>Suggest Qty</th>
                <th>Action</th><th>PO Status</th>
                {!isAdmin && <th>Confirm PO</th>}
                {!isAdmin && <th>Packing List</th>}
                {isAdmin  && <th>Admin: Delivery</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const po = poMap[r.asin];
                return (
                  <tr key={r.asin}>
                    <td>{r.productLink ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a> : '—'}</td>
                    <td style={{ fontSize: 10, color: 'var(--subtle)', fontFamily: 'monospace' }}>{r.ean || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{r.sku || '—'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.title}>{r.title || '—'}</td>
                    <td><DocCell value={r.whDOC} /></td>
                    <td><DocCell value={r.companyDOC} /></td>
                    <td>{r.totalDRR?.toFixed(1)}</td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '—'}</td>
                    <td><ActionBadge action={r.actionRequired} /></td>
                    <td>{po ? <POStatusBadge status={po.status} /> : <span className="badge badge-gray">No PO</span>}</td>

                    {/* Supplier confirm */}
                    {!isAdmin && (
                      <td>
                        {r.actionRequired === 'need_po' && !po && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Admin creates PO</span>
                        )}
                        {po && po.status === 'system_suggested' && (
                          <button className="btn btn-primary btn-sm" onClick={() => confirmMut.mutate({ id: po._id })} disabled={confirmMut.isPending}>
                            Confirm PO
                          </button>
                        )}
                        {po && po.status !== 'system_suggested' && <span className="badge badge-ok">✓ Done</span>}
                        {!po && r.actionRequired !== 'need_po' && <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}

                    {/* Packing list upload (supplier) */}
                    {!isAdmin && (
                      <td>
                        {po && po.status === 'admin_approved' && !po.packingListFile?.url ? (
                          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                            📤 Upload
                            <input type="file" style={{ display: 'none' }} accept=".pdf,.xlsx,.csv,.jpg,.png"
                              onChange={e => e.target.files[0] && uploadPacking(po._id, e.target.files[0])} />
                          </label>
                        ) : po?.packingListFile?.url ? (
                          <a href={po.packingListFile.url} target="_blank" rel="noreferrer" className="badge badge-transit">📎 View</a>
                        ) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}

                    {/* Admin delivery */}
                    {isAdmin && (
                      <td>
                        {po && po.status === 'in_transit' ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-success btn-xs" onClick={() => deliverMut.mutate({ id: po._id, status: 'delivered' })}>✓ Received</button>
                            <button className="btn btn-danger btn-xs" onClick={() => deliverMut.mutate({ id: po._id, status: 'discrepancy', discrepancyNotes: 'Discrepancy noted' })}>⚠ Issue</button>
                          </div>
                        ) : po?.status === 'delivered' ? (
                          <span className="badge badge-delivered">Delivered</span>
                        ) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}
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
