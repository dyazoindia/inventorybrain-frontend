import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../utils/api';
import { KPICard, Empty, Loading, DocCell, fmtN } from '../components/ui';

const PLATFORMS = ['AMZ', 'FLK', 'ZPT', 'BLK'];
const PLATFORM_NAMES = { AMZ: 'Amazon', FLK: 'Flipkart', ZPT: 'Zepto', BLK: 'Blinkit' };
const PLATFORM_COLORS = { AMZ: '#e65100', FLK: '#1565c0', ZPT: '#1b5e20', BLK: '#6a1b9a' };

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => inventoryApi.getStats().then(r => r.data)
  });

  if (isLoading) return <Loading text="Loading dashboard…" />;
  if (error) return <div className="warn-box">Error: {error.response?.data?.error || error.message}</div>;
  if (!data?.totalSKUs) return (
    <div>
      <div className="sec" style={{ marginBottom: 16 }}>Admin Dashboard</div>
      <Empty icon="📊" title="No inventory data yet" desc='Upload an Excel file using the "Upload Excel" button above to get started.' />
    </div>
  );

  const { totalSKUs, totalInv, totalDRR, companyDOC, health, alerts, platformStats, supplierStats, uploadedAt, fileName } = data;
  const docColor = companyDOC < 30 ? 'var(--red)' : companyDOC < 60 ? 'var(--orange)' : 'var(--green)';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="sec" style={{ marginBottom: 0 }}>Admin Dashboard</div>
        {uploadedAt && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Last upload: {new Date(uploadedAt).toLocaleString()} · {fileName}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="kgrid">
        <KPICard label="Total Inventory"   value={fmtN(totalInv)}        sub="units across all channels"          barColor="linear-gradient(90deg,var(--blue),var(--purple-lt))" />
        <KPICard label="Daily Run Rate"    value={totalDRR?.toFixed(1)}  sub="units sold per day"                 barColor="var(--purple)" />
        <KPICard label="Company DOC"       value={`${companyDOC}d`}      sub="company days of cover"              barColor={docColor} />
        <KPICard label="Active SKUs"       value={totalSKUs}             sub="across all suppliers"               barColor="var(--teal)" />
        <KPICard label="🔴 Critical"       value={alerts?.critical ?? 0} sub="DOC < 7 days — urgent action"       barColor="var(--red)" />
      </div>

      {/* Supplier Action Summary */}
      <div className="sec sec-divider" style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>Supplier Action Summary</div>
      <div className="kgrid">
        {['CHINA', 'MD'].map(sup => (
          <div key={sup} className="kcard">
            <div className="kbar" style={{ background: sup === 'CHINA' ? 'var(--purple)' : 'var(--orange)' }} />
            <div className="klbl">{sup} Supplier</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>{supplierStats?.[sup]?.needPO ?? 0}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Need PO</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{supplierStats?.[sup]?.stockOk ?? 0}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Stock OK</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--muted)' }}>{supplierStats?.[sup]?.total ?? 0}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>Total SKUs</div>
              </div>
            </div>
          </div>
        ))}

        {/* Alert summary */}
        <div className="kcard">
          <div className="kbar" style={{ background: 'var(--red)' }} />
          <div className="klbl">Alerts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {[
              { label: '🔴 Critical', val: alerts?.critical, color: 'var(--red)' },
              { label: '🟠 Urgent',   val: alerts?.urgent,   color: 'var(--orange)' },
              { label: '🟡 PO Req.',  val: alerts?.po_required, color: 'var(--yellow)' }
            ].map(a => (
              <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{a.label}</span>
                <span style={{ fontWeight: 700, color: a.color }}>{a.val ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory Health */}
      <div className="sec" style={{ marginBottom: 10 }}>Inventory Health</div>
      <div className="kgrid" style={{ marginBottom: 20 }}>
        {[
          { key: 'healthy',        label: 'Healthy',       color: 'var(--green)',  sub: 'DOC ≤ 60d' },
          { key: 'slow_moving',    label: 'Slow Moving',   color: 'var(--yellow)', sub: 'DOC 61–120d' },
          { key: 'overstock',      label: 'Overstock',     color: 'var(--orange)', sub: 'DOC 121–180d' },
          { key: 'dead_inventory', label: 'Dead Inventory', color: 'var(--red)',   sub: 'DOC > 180d' }
        ].map(({ key, label, color, sub }) => (
          <div key={key} className="kcard" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="kval" style={{ color }}>{health?.[key] ?? 0}</div>
            <div className="klbl">{label}</div>
            <div className="ksub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Platform DOC */}
      <div className="sec">Platform Average DOC</div>
      <div className="kgrid" style={{ marginBottom: 0 }}>
        {PLATFORMS.map(p => {
          const ps = platformStats?.[p];
          const avgDoc = ps?.avgDOC;
          const color = avgDoc === null ? 'var(--muted)' : avgDoc < 15 ? 'var(--red)' : avgDoc < 30 ? 'var(--orange)' : 'var(--green)';
          const pct = avgDoc ? Math.min(100, (avgDoc / 180) * 100) : 0;
          return (
            <div key={p} className="kcard">
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.7px', color: PLATFORM_COLORS[p], marginBottom: 8 }}>
                {PLATFORM_NAMES[p]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 2 }}>
                {avgDoc !== null ? `${avgDoc.toFixed(1)}d` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>avg. days of cover</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                <span style={{ color: 'var(--red)' }}>⚡ {ps?.oosRisk ?? 0} OOS risk</span>
                <span style={{ color: 'var(--orange)' }}>⚠ {ps?.urgent ?? 0} urgent</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 8 }}>
                <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: color, transition: 'width .5s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
