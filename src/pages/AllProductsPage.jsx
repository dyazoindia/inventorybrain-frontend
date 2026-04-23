import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { DocCell, HealthBadge, AlertBadge, ActionBadge, Empty, Loading, fmtN } from '../components/ui';

const PORTALS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PORTAL_NAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };

function SmartAlert({ row }) {
  const d = row.companyDOC;
  if (d === null) return <span className="badge badge-gray">—</span>;
  if (d > 180) return <span className="action-stop">🔻 Liquidate</span>;
  if (d > 120) return <span className="action-stop">⛔ Overstock</span>;
  if (d < 7)   return <span className="action-need">⚡ Order Now</span>;
  if (d < 15)  return <span className="action-need">🔴 Urgent Order</span>;
  if (d < 30)  return <span className="action-watch">🟡 PO Required</span>;
  return <span className="action-ok">✓ OK</span>;
}

export default function AllProductsPage({ initialFilter }) {
  const [search,    setSearch]    = useState('');
  const [fSupplier, setFSupplier] = useState('all');
  const [fCategory, setFCategory] = useState('all');
  const [fAlert,    setFAlert]    = useState(initialFilter || 'all');
  const [fHealth,   setFHealth]   = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-all'],
    queryFn: () => inventoryApi.getLatest().then(r => r.data)
  });

  if (isLoading) return <Loading text="Loading products…" />;

  let rows = data?.rows || [];

  // Filters
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.asin?.toLowerCase().includes(q) ||
      r.sku?.toLowerCase().includes(q)  ||
      r.title?.toLowerCase().includes(q)||
      r.ean?.toLowerCase().includes(q)
    );
  }
  if (fSupplier !== 'all') rows = rows.filter(r => r.supplier === fSupplier);
  if (fCategory !== 'all') rows = rows.filter(r => r.category === fCategory);
  if (fHealth   !== 'all') rows = rows.filter(r => r.healthStatus === fHealth);
  if (fAlert === 'critical')    rows = rows.filter(r => r.companyDOC !== null && r.companyDOC < 7);
  else if (fAlert === 'urgent') rows = rows.filter(r => r.companyDOC !== null && r.companyDOC >= 7 && r.companyDOC < 15);
  else if (fAlert === 'po')     rows = rows.filter(r => r.companyDOC !== null && r.companyDOC >= 15 && r.companyDOC < 30);
  else if (fAlert === 'low')    rows = rows.filter(r => r.companyDOC !== null && r.companyDOC < 30);
  else if (fAlert === 'dead')   rows = rows.filter(r => r.companyDOC !== null && r.companyDOC > 180);
  else if (fAlert === 'over')   rows = rows.filter(r => r.companyDOC !== null && r.companyDOC > 120 && r.companyDOC <= 180);

  // Unique values for filters
  const allRows = data?.rows || [];
  const suppliers  = [...new Set(allRows.map(r => r.supplier).filter(Boolean))].sort();
  const categories = [...new Set(allRows.map(r => r.category).filter(Boolean))].sort();

  const exportCSV = () => {
    const headers = ['ASIN','EAN','SKU','Title','Supplier','Category','WH Inv','AMZ Inv','FLK Inv','ZPT Inv','BLK Inv',
      'AMZ DRR','FLK DRR','ZPT DRR','BLK DRR','Open PO','Mfg Qty','In Transit',
      'Total Inv','Total DRR','WH DOC','AMZ DOC','FLK DOC','ZPT DOC','BLK DOC','Company DOC',
      'Health','Alert','Action','Suggest Qty'];
    const body = rows.map(r => [
      r.asin, r.ean||'', r.sku||'', `"${(r.title||'').replace(/"/g,'""')}"`,
      r.supplier||'', r.category||'',
      r.whInv, r.amzInv, r.flkInv, r.zptInv, r.blkInv,
      r.amzDRR, r.flkDRR, r.zptDRR, r.blkDRR,
      r.openPO, r.mfgQty, r.inTransit||0,
      r.totalInv, r.totalDRR?.toFixed(1),
      r.whDOC?.toFixed(1)||'—', r.amzDOC?.toFixed(1)||'—', r.flkDOC?.toFixed(1)||'—',
      r.zptDOC?.toFixed(1)||'—', r.blkDOC?.toFixed(1)||'—', r.companyDOC?.toFixed(1)||'—',
      r.healthStatus, r.alertLevel, r.actionRequired, r.suggestQty
    ].join(','));
    const csv = [headers.join(','), ...body].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'inventory_export.csv';
    a.click();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="sec" style={{ marginBottom: 0 }}>
          All Products <small>({rows.length} of {allRows.length} SKUs)</small>
        </div>
        <button className="btn btn-ghost" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {/* Filters */}
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <input
          className="filter-input"
          placeholder="Search SKU / ASIN / EAN / Title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 220 }}
        />
        <select className="filter-select" value={fSupplier} onChange={e => setFSupplier(e.target.value)}>
          <option value="all">All Suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={fCategory} onChange={e => setFCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={fAlert} onChange={e => setFAlert(e.target.value)}>
          <option value="all">All Alerts</option>
          <option value="critical">🔴 Critical (&lt;7d)</option>
          <option value="urgent">🟠 Urgent (7–14d)</option>
          <option value="po">🟡 PO Required (15–29d)</option>
          <option value="low">All Low DOC (&lt;30d)</option>
          <option value="dead">Dead Stock (&gt;180d)</option>
          <option value="over">Overstock (120–180d)</option>
        </select>
        <select className="filter-select" value={fHealth} onChange={e => setFHealth(e.target.value)}>
          <option value="all">All Health</option>
          <option value="healthy">Healthy</option>
          <option value="slow_moving">Slow Moving</option>
          <option value="overstock">Overstock</option>
          <option value="dead_inventory">Dead Inventory</option>
        </select>
        {(search || fSupplier !== 'all' || fCategory !== 'all' || fAlert !== 'all' || fHealth !== 'all') && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFSupplier('all'); setFCategory('all'); setFAlert('all'); setFHealth('all'); }}>
            ✕ Clear filters
          </button>
        )}
        <span className="filter-count" style={{ marginLeft: 'auto' }}>{rows.length} rows</span>
      </div>

      {!rows.length
        ? <Empty icon="🔍" title="No products found" desc="Try clearing your filters or upload an Excel file." />
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Link</th>
                  <th>EAN</th>
                  <th>ASIN</th>
                  <th>SKU</th>
                  <th style={{ minWidth: 160 }}>Title</th>
                  <th>Supplier</th>
                  <th>Category</th>
                  <th>WH Inv</th>
                  <th>AMZ</th>
                  <th>FLK</th>
                  <th>ZPT</th>
                  <th>BLK</th>
                  <th>AMZ DRR</th>
                  <th>FLK DRR</th>
                  <th>ZPT DRR</th>
                  <th>BLK DRR</th>
                  <th>WH DOC</th>
                  {PORTALS.map(p => <th key={p}>{p} DOC</th>)}
                  <th>Open PO</th>
                  <th>Mfg Qty</th>
                  <th>Total Inv</th>
                  <th>Total DRR</th>
                  <th>Co. DOC</th>
                  <th>Health</th>
                  <th>Alert</th>
                  <th>Smart Alert</th>
                  <th>Suggest Qty</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.asin}>
                    <td>
                      {r.productLink
                        ? <a className="link-btn" href={r.productLink} target="_blank" rel="noreferrer">↗</a>
                        : <span style={{ color: 'var(--subtle)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--subtle)', fontFamily: 'monospace' }}>{r.ean || '—'}</td>
                    <td style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.asin}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{r.sku || '—'}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.title}>
                      {r.productLink
                        ? <a href={r.productLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 11 }}>{r.title || '—'}</a>
                        : <span style={{ fontSize: 11 }}>{r.title || '—'}</span>}
                    </td>
                    <td><span className="badge badge-supplier">{r.supplier || '—'}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{fmtN(r.whInv)}</td>
                    <td>{fmtN(r.amzInv)}</td>
                    <td>{fmtN(r.flkInv)}</td>
                    <td>{fmtN(r.zptInv)}</td>
                    <td>{fmtN(r.blkInv)}</td>
                    <td>{r.amzDRR || '—'}</td>
                    <td>{r.flkDRR || '—'}</td>
                    <td>{r.zptDRR || '—'}</td>
                    <td>{r.blkDRR || '—'}</td>
                    <td><DocCell value={r.whDOC} /></td>
                    <td><DocCell value={r.amzDOC} /></td>
                    <td><DocCell value={r.flkDOC} /></td>
                    <td><DocCell value={r.zptDOC} /></td>
                    <td><DocCell value={r.blkDOC} /></td>
                    <td style={{ color: r.openPO > 0 ? 'var(--green)' : 'var(--muted)', fontWeight: r.openPO > 0 ? 600 : 400 }}>{fmtN(r.openPO)}</td>
                    <td style={{ color: r.mfgQty > 0 ? 'var(--teal)' : 'var(--muted)' }}>{fmtN(r.mfgQty)}</td>
                    <td style={{ fontWeight: 500 }}>{fmtN(r.totalInv)}</td>
                    <td>{r.totalDRR?.toFixed(1) || '—'}</td>
                    <td><DocCell value={r.companyDOC} /></td>
                    <td><HealthBadge status={r.healthStatus} /></td>
                    <td><AlertBadge level={r.alertLevel} /></td>
                    <td><SmartAlert row={r} /></td>
                    <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '—'}</td>
                    <td><ActionBadge action={r.actionRequired} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}
