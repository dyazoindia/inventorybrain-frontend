import { useQuery } from '@tanstack/react-query';
import { compareApi } from '../utils/api';
import { Empty, Loading } from '../components/ui';

const RISK_LABELS = { increased: '⬆ Risk', decreased: '⬇ Risk' };

function DiffRow({ change }) {
  const isDoc = change.type === 'doc';
  const isInv = change.type === 'inventory';
  const fmt = (v) => v === null || v === undefined ? '—' : isDoc || isInv ? parseFloat(v).toFixed(1) : v;

  const delta = change.delta;
  const arrowCls = delta === null ? '' : (isDoc || isInv) ? (delta < 0 ? 'diff-up' : 'diff-down') : '';
  const arrow = delta === null ? '' : delta > 0 ? '▲' : '▼';

  return (
    <tr>
      <td style={{ fontWeight: 500, color: 'var(--text)' }}>{change.label}</td>
      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{fmt(change.prev)}{isDoc ? 'd' : ''}</td>
      <td>
        <span style={{ fontWeight: 600 }}>{fmt(change.curr)}{isDoc ? 'd' : ''}</span>
      </td>
      <td>
        {delta !== null && (
          <span className={arrowCls} style={{ fontWeight: 600 }}>
            {arrow} {Math.abs(delta).toFixed(1)}{isDoc ? 'd' : ''}
            {change.pct && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--muted)' }}>({change.pct}%)</span>}
          </span>
        )}
        {change.type === 'status' && (
          <span style={{ fontWeight: 600 }}>{change.prev} → {change.curr}</span>
        )}
      </td>
      <td>
        {change.risk && (
          <span className={`diff-risk-badge ${change.risk === 'increased' ? 'risk-increased' : 'risk-decreased'}`}>
            {RISK_LABELS[change.risk]}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function CompareDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['compare-latest'],
    queryFn: () => compareApi.latest().then(r => r.data)
  });

  if (isLoading) return <Loading text="Comparing snapshots…" />;
  if (error) return <div className="warn-box">Error: {error.response?.data?.error || error.message}</div>;
  if (!data?.available) return (
    <div>
      <div className="sec">File Comparison Dashboard</div>
      <Empty icon="🔄" title="Need at least 2 uploads to compare" desc={data?.message || 'Upload another Excel file to see what changed between versions.'} />
    </div>
  );

  const { comparison, latestDate, previousDate, latestFile, previousFile } = data;
  const { summary, newSKUs, removedSKUs, changed } = comparison;

  return (
    <div>
      <div className="sec" style={{ marginBottom: 14 }}>File Comparison Dashboard</div>

      {/* Files being compared */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Previous</div>
          <div style={{ fontWeight: 500 }}>{previousFile || 'Upload 1'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(previousDate).toLocaleString()}</div>
        </div>
        <div style={{ fontSize: 24, color: 'var(--muted)' }}>→</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Latest</div>
          <div style={{ fontWeight: 500 }}>{latestFile || 'Upload 2'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(latestDate).toLocaleString()}</div>
        </div>
      </div>

      {/* Summary */}
      <div className="kgrid" style={{ marginBottom: 18 }}>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--green)' }} /><div className="klbl">New SKUs</div><div className="kval" style={{ color: 'var(--green)' }}>{summary.newSKUs}</div><div className="ksub">added in latest upload</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--red)' }} /><div className="klbl">Removed SKUs</div><div className="kval" style={{ color: 'var(--red)' }}>{summary.removedSKUs}</div><div className="ksub">not in latest upload</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--orange)' }} /><div className="klbl">Risk Increased</div><div className="kval" style={{ color: 'var(--orange)' }}>{summary.riskIncreased}</div><div className="ksub">DOC or inventory worsened</div></div>
        <div className="kcard"><div className="kbar" style={{ background: 'var(--blue)' }} /><div className="klbl">Changed SKUs</div><div className="kval" style={{ color: 'var(--blue)' }}>{changed.length}</div><div className="ksub">with any data change</div></div>
      </div>

      {/* New SKUs */}
      {newSKUs.length > 0 && (
        <>
          <div className="sec" style={{ color: 'var(--green)', marginBottom: 10 }}>✅ New SKUs Added ({newSKUs.length})</div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead><tr><th>SKU</th><th>ASIN</th><th>Supplier</th><th>Co. DOC</th><th>Action</th></tr></thead>
              <tbody>
                {newSKUs.slice(0, 20).map(r => (
                  <tr key={r.asin}>
                    <td style={{ fontWeight: 500 }}>{r.sku || '—'}</td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)' }}>{r.asin}</td>
                    <td><span className="badge badge-supplier">{r.supplier}</span></td>
                    <td>{r.companyDOC !== null ? `${parseFloat(r.companyDOC).toFixed(1)}d` : '—'}</td>
                    <td>{r.actionRequired === 'need_po' ? <span className="action-need">Need PO</span> : <span className="action-ok">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Removed SKUs */}
      {removedSKUs.length > 0 && (
        <>
          <div className="sec" style={{ color: 'var(--red)', marginBottom: 10 }}>❌ Removed SKUs ({removedSKUs.length})</div>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table>
              <thead><tr><th>SKU</th><th>ASIN</th><th>Supplier</th><th>Last Co. DOC</th></tr></thead>
              <tbody>
                {removedSKUs.slice(0, 20).map(r => (
                  <tr key={r.asin}>
                    <td style={{ fontWeight: 500 }}>{r.sku || '—'}</td>
                    <td style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--muted)' }}>{r.asin}</td>
                    <td><span className="badge badge-supplier">{r.supplier}</span></td>
                    <td>{r.companyDOC !== null ? `${parseFloat(r.companyDOC).toFixed(1)}d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Changed SKUs detail */}
      {changed.length > 0 && (
        <>
          <div className="sec" style={{ marginBottom: 10 }}>📊 Changed SKUs ({changed.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {changed.map(item => (
              <div key={item.asin} className="card" style={{ borderLeft: `3px solid ${item.diff.riskIncreased ? 'var(--red)' : item.diff.riskDecreased ? 'var(--green)' : 'var(--border)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>{item.sku || item.asin}</div>
                  <span className="badge badge-supplier">{item.supplier}</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.title}</div>
                  {item.diff.riskIncreased && <span className="diff-risk-badge risk-increased" style={{ marginLeft: 'auto' }}>⬆ Risk Increased</span>}
                  {item.diff.riskDecreased && <span className="diff-risk-badge risk-decreased" style={{ marginLeft: 'auto' }}>⬇ Risk Decreased</span>}
                </div>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead><tr><th>Metric</th><th>Previous</th><th>Latest</th><th>Change</th><th>Risk</th></tr></thead>
                  <tbody>
                    {item.diff.changes.map((change, i) => <DiffRow key={i} change={change} />)}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
