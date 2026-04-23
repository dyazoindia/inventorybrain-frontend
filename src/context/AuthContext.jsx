import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('ib_user');
    const token  = localStorage.getItem('ib_token');
    if (stored && token) {
      setUser(JSON.parse(stored));
      // Verify token is still valid
      authApi.me()
        .then(res => setUser(res.data.user))
        .catch(() => { localStorage.removeItem('ib_token'); localStorage.removeItem('ib_user'); setUser(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const { token, user } = res.data;
    localStorage.setItem('ib_token', token);
    localStorage.setItem('ib_user', JSON.stringify(user));
    setUser(user);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('ib_token');
    localStorage.removeItem('ib_user');
    setUser(null);
  };

  const isAdmin    = user?.role === 'admin';
  const isChina    = user?.role === 'china_supplier';
  const isMD       = user?.role === 'md_supplier';
  const isSupplier = isChina || isMD;

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, isChina, isMD, isSupplier }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
