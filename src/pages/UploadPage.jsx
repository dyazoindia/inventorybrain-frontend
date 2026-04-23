import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { inventoryApi, uploadApi } from '../utils/api';
import toast from 'react-hot-toast';

export default function UploadPage() {
  const { isAdmin } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => inventoryApi.getSnapshots().then(r => r.data)
  });

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadApi.uploadExcel(file);
      toast.success(res.data.message);
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const snapshots = data?.snapshots || [];

  return (
    <div>
      <div className="sec" style={{ marginBottom: 16 }}>📤 Upload Inventory Data</div>

      {/* Info box */}
      <div className="info-box" style={{ marginBottom: 20 }}>
        <strong>Operations Team:</strong> You can upload new inventory Excel files here. Each upload creates a new version — nothing is overwritten. Only Admin can modify or delete data.
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border2)'}`,
          borderRadius: 16, padding: '48px 40px', textAlign: 'center',
          background: dragOver ? 'var(--blue-lt)' : 'var(--card)',
          transition: 'all .2s', marginBottom: 24, maxWidth: 560
        }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>📊</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          {uploading ? 'Uploading...' : 'Drop your Excel file here'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 16 }}>
          Required columns: <code style={{ background: 'var(--blue-lt)', color: 'var(--blue)', padding: '1px 5px', borderRadius: 4 }}>Asin</code> · <code style={{ background: 'var(--blue-lt)', color: 'var(--blue)', padding: '1px 5px', borderRadius: 4 }}>Supplier</code> · <code style={{ background: 'var(--blue-lt)', color: 'var(--blue)', padding: '1px 5px', borderRadius: 4 }}>WH Inv</code> · <code style={{ background: 'var(--blue-lt)', color: 'var(--blue)', padding: '1px 5px', borderRadius: 4 }}>AMZ DRR</code> · <code style={{ background: 'var(--blue-lt)', color: 'var(--blue)', padding: '1px 5px', borderRadius: 4 }}>Open PO</code>
          <br />Supplier column must be: <strong>CHINA</strong> or <strong>MD</strong>
        </p>
        {uploading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--blue)' }}>
            <span className="spinner" /> Processing file...
          </div>
        ) : (
          <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
            ⬆ Choose Excel File
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} disabled={uploading} />
          </label>
        )}
      </div>

      {/* Upload history */}
      <div className="sec" style={{ marginBottom: 12 }}>
        Upload History <small>({snapshots.length} versions)</small>
      </div>

      {!snapshots.length ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>No uploads yet. Upload your first Excel file above.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>File Name</th>
                <th>SKUs</th>
                <th>Uploaded By</th>
                <th>Date & Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={s._id}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{snapshots.length - i}</td>
                  <td style={{ fontWeight: 500 }}>{s.fileName || 'inventory.xlsx'}</td>
                  <td style={{ color: 'var(--blue)', fontWeight: 600 }}>{s.rowCount}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{s.uploadedBy?.name || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(s.createdAt).toLocaleString()}</td>
                  <td>
                    {i === 0
                      ? <span className="badge badge-ok">✓ Active</span>
                      : <span className="badge badge-gray">Archived</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin note */}
      {!isAdmin && (
        <div className="warn-box" style={{ marginTop: 20 }}>
          ⚠️ You can only upload data. To delete, modify, or manage inventory, contact your Admin.
        </div>
      )}
    </div>
  );
}
