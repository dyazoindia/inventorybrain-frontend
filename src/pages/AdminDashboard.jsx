import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../utils/api';
import { Empty, Loading, fmtN } from '../components/ui';
import AllProductsPage from './AllProductsPage';

const PLATFORMS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PLATFORM_NAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
const PLATFORM_COLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function AdminDashboard() {
  const [activeFilter, setActiveFilter] = useState(null);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => inventoryApi.getStats().then(r => r.data)
  });

  if (isLoading) return <Loading text="Loading dashboard…" />;

  if (activeFilter !== null) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => setActiveFilter(null)}>
          ← Back to Dashboard
        </button>
        <AllProductsPage initialFilter={activeFilter} />
      </div>
    );
  }

  if (!data?.totalSKUs) return (
    <div>
      <div className="sec" style={{ marginBottom: 16 }}>Admin Dashboard</div>
      <Empty icon="📊" title="No inventory data yet" desc='Upload an Excel file using the "Upload Excel" button above to get started.' />
    </div>
  );

  const { totalSKUs, totalInv, totalDRR, companyDOC, health, alerts, platformStats, supplierStats, uploadedAt, fileName } = data;
  const docColor = companyDOC < 30 ? 'var(--red)' : companyDOC < 60 ? 'var(--orange)' : 'var(--green)';

  const cardStyle = (clickable) => ({
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '14px 16px', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow)',
    cursor: clickable ? 'pointer' : 'default', transition: 'box-shadow .15s'
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>Admin Dashboard</div>
        {uploadedAt && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Last upload: {new Date(uploadedAt).toLocaleString()} · {fileName}</div>}
      </div>

      {/* KPI Cards */}
      <div className="kgrid">
        {[
          { label: 'Total Inventory', value: fmtN(totalInv), sub: 'click to view all products', bar: 'linear-gradient(90deg,var(--blue),#7c3aed)', color: 'var(--blue)', filter: 'all' },
          { label: 'Daily Run Rate', value: totalDRR?.toFixed(1), sub: 'units/day', bar: 'var(--purple)', color: 'var(--purple)', filter: null },
          { label: 'Company DOC', value: `${companyDOC}d`, sub: 'click for low DOC', bar: docColor, color: docColor, filter: 'low' },
          { label: 'Active SKUs', value: totalSKUs, sub: 'click to view all', bar: 'var(--teal)', color: 'var(--teal)', filter: 'all' },
          { label: '🔴 Critical Stock', value: alerts?.critical ?? 0, sub: 'DOC < 7 days', bar: 'var(--red)', color: 'var(--red)', filter: 'critical' }
        ].map((k, i) => (
          <div key={i} style={cardStyle(k.filter !== null)}
            onClick={() => k.filter !== null && setActiveFilter(k.filter)}
            onMouseEnter={e => k.filter !== null && (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}>
            <div className="kbar" style={{ background: k.bar }} />
            <div className="klbl">{k.label}</div>
            <div className="kval" style={{ color: k.color }}>{k.value}</div>
            <div className="ksub">{k.sub}</div>
            {k.filter !== null && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 4 }}>View →</div>}
          </div>
        ))}
      </div>

      {/* Alert Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {[
          { label: '🔴 Critical (<7d)',   count: alerts?.critical,    filter: 'critical' },
          { label: '🟠 Urgent (7–14d)',   count: alerts?.urgent,      filter: 'urgent' },
          { label: '🟡 PO Required',      count: alerts?.po_required, filter: 'po' },
          { label: '✅ Stock OK',         count: alerts?.ok,          filter: 'all' }
        ].map(a => (
          <div key={a.filter} onClick={() => setActiveFilter(a.filter)}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20,
              padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', boxShadow: 'var(--shadow)' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{a.count ?? 0}</span>{a.label} →
          </div>
        ))}
      </div>

      {/* Supplier Summary */}
      <div className="sec" style={{ marginBottom: 10 }}>Supplier Action Summary</div>
      <div className="kgrid" style={{ marginBottom: 18 }}>
        {['CHINA', 'MD'].map(sup => (
          <div key={sup} style={cardStyle(true)}
            onClick={() => navigate(sup === 'CHINA' ? '/admin/china' : '/admin/md')}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}>
            <div className="kbar" style={{ background: sup === 'CHINA' ? 'var(--purple)' : 'var(--orange)' }} />
            <div className="klbl">{sup} Supplier</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>{supplierStats?.[sup]?.needPO ?? 0}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Need PO</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{supplierStats?.[sup]?.stockOk ?? 0}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Stock OK</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--muted)' }}>{supplierStats?.[sup]?.total ?? 0}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Total</div></div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 8 }}>Click to view →</div>
          </div>
        ))}
        <div style={cardStyle(false)}>
          <div className="kbar" style={{ background: 'var(--green)' }} />
          <div className="klbl">Inventory Health</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
            {[
              { label: 'Healthy',        val: health?.healthy,       color: 'var(--green)',  filter: 'all' },
              { label: 'Slow Moving',    val: health?.slow_moving,   color: 'var(--yellow)', filter: 'all' },
              { label: 'Overstock',      val: health?.overstock,     color: 'var(--orange)', filter: 'over' },
              { label: 'Dead Inventory', val: health?.dead_inventory, color: 'var(--red)',   filter: 'dead' }
            ].map(h => (
              <div key={h.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer' }}
                onClick={() => setActiveFilter(h.filter)}>
                <span style={{ color: 'var(--muted)' }}>{h.label}</span>
                <span style={{ fontWeight: 700, color: h.color }}>{h.val ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platform DOC */}
      <div className="sec" style={{ marginBottom: 10 }}>Platform Average DOC</div>
      <div className="kgrid" style={{ marginBottom: 24 }}>
        {PLATFORMS.map(p => {
          const ps = platformStats?.[p];
          const avg = ps?.avgDOC;
          const color = !avg ? 'var(--muted)' : avg < 15 ? 'var(--red)' : avg < 30 ? 'var(--orange)' : 'var(--green)';
          return (
            <div key={p} style={cardStyle(false)}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.7px', color: PLATFORM_COLORS[p], marginBottom: 8 }}>{PLATFORM_NAMES[p]}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>{avg ? `${avg.toFixed(1)}d` : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>avg. days of cover</div>
              <div style={{ fontSize: 10, display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚡ {ps?.oosRisk ?? 0} OOS</span>
                <span style={{ color: 'var(--orange)', fontWeight: 600 }}>⚠ {ps?.urgent ?? 0} urgent</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 8 }}>
                <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, (avg / 180) * 100)}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini product table — sorted by lowest DOC */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="sec" style={{ marginBottom: 0 }}>⚠️ Most At-Risk Products <small>(sorted by lowest DOC)</small></div>
        <button className="btn btn-primary btn-sm" onClick={() => setActiveFilter('all')}>View All {totalSKUs} Products →</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>SKU</th><th>Title</th><th>Supplier</th><th>WH Inv</th><th>DRR</th><th>Co. DOC</th><th>Alert</th><th>Suggest Qty</th></tr>
          </thead>
          <tbody>
            {(data?.rows || []).filter(r => r.companyDOC !== null).sort((a, b) => (a.companyDOC ?? 999) - (b.companyDOC ?? 999)).slice(0, 15).map(r => (
              <tr key={r.asin}>
                <td style={{ fontWeight: 500 }}>{r.sku || r.asin}</td>
                <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{r.title || '—'}</td>
                <td><span className="badge badge-supplier">{r.supplier}</span></td>
                <td>{fmtN(r.whInv)}</td>
                <td>{r.totalDRR?.toFixed(1)}</td>
                <td><span style={{ fontWeight: 600, color: r.companyDOC < 7 ? 'var(--red)' : r.companyDOC < 15 ? 'var(--orange)' : r.companyDOC < 30 ? 'var(--yellow)' : 'var(--green)' }}>{r.companyDOC?.toFixed(1)}d</span></td>
                <td><span className={`badge ${r.alertLevel === 'critical' ? 'badge-critical' : r.alertLevel === 'urgent' ? 'badge-urgent' : r.alertLevel === 'po_required' ? 'badge-po' : 'badge-ok'}`}>{r.alertLevel === 'critical' ? '🔴 Critical' : r.alertLevel === 'urgent' ? '🟠 Urgent' : r.alertLevel === 'po_required' ? '🟡 PO Req.' : '✅ OK'}</span></td>
                <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.suggestQty > 0 ? fmtN(r.suggestQty) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={() => setActiveFilter('all')}>View all {totalSKUs} products with full details →</button>
      </div>
    </div>
  );
}
