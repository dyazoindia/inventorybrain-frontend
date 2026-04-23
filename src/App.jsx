import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage        from './pages/LoginPage';
import AdminDashboard   from './pages/AdminDashboard';
import ChinaDashboard   from './pages/ChinaDashboard';
import MDDashboard      from './pages/MDDashboard';
import OpenPODashboard  from './pages/OpenPODashboard';
import CompareDashboard from './pages/CompareDashboard';
import UsersPage        from './pages/UsersPage';
import AllProductsPage  from './pages/AllProductsPage';
import UploadPage       from './pages/UploadPage';
import PortalSettingsPage from './pages/PortalSettingsPage';
import Layout           from './components/layout/Layout';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'Inter,sans-serif',color:'#6b7280' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin')          return <Navigate to="/admin"    replace />;
  if (user.role === 'china_supplier') return <Navigate to="/china"    replace />;
  if (user.role === 'md_supplier')    return <Navigate to="/md"       replace />;
  if (user.role === 'operations')     return <Navigate to="/ops"      replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 4000, style: { fontFamily: 'Inter, sans-serif', fontSize: '13px' } }} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleRedirect />} />

            {/* Admin routes - full access */}
            <Route path="/admin" element={<RequireAuth roles={['admin']}><Layout /></RequireAuth>}>
              <Route index element={<AdminDashboard />} />
              <Route path="all-products" element={<AllProductsPage />} />
              <Route path="china"        element={<ChinaDashboard />} />
              <Route path="md"           element={<MDDashboard />} />
              <Route path="open-po"      element={<OpenPODashboard />} />
              <Route path="compare"      element={<CompareDashboard />} />
              <Route path="users"        element={<UsersPage />} />
              <Route path="upload"       element={<UploadPage />} />
              <Route path="portals"      element={<PortalSettingsPage />} />
            </Route>

            {/* Operations team - upload only, no delete/edit */}
            <Route path="/ops" element={<RequireAuth roles={['operations']}><Layout /></RequireAuth>}>
              <Route index element={<UploadPage />} />
            </Route>

            {/* China supplier - no open PO access */}
            <Route path="/china" element={<RequireAuth roles={['china_supplier','admin']}><Layout /></RequireAuth>}>
              <Route index element={<ChinaDashboard />} />
            </Route>

            {/* MD supplier - no open PO access */}
            <Route path="/md" element={<RequireAuth roles={['md_supplier','admin']}><Layout /></RequireAuth>}>
              <Route index element={<MDDashboard />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
