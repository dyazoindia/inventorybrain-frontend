import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../utils/api';

var AuthContext = createContext(null);

export function AuthProvider({ children }) {
  var [user,    setUser]    = useState(null);
  var [loading, setLoading] = useState(true);
  var [token,   setToken]   = useState(function() {
    return localStorage.getItem('ib_token') || null;
  });

  // On mount — verify saved token
  useEffect(function() {
    var saved = localStorage.getItem('ib_token');
    if (!saved) { setLoading(false); return; }
    authApi.me()
      .then(function(r) { setUser(r.data.user); })
      .catch(function() {
        localStorage.removeItem('ib_token');
        setToken(null);
      })
      .finally(function() { setLoading(false); });
  }, []);

  var login = useCallback(async function(email, password) {
    var r = await authApi.login({ email, password });
    var { token: newToken, user: newUser } = r.data;
    localStorage.setItem('ib_token', newToken);
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  var logout = useCallback(function() {
    localStorage.removeItem('ib_token');
    setToken(null);
    setUser(null);
  }, []);

  var value = {
    user,
    token,
    loading,
    login,
    logout,
    isAdmin:    user && user.role === 'admin',
    isOps:      user && user.role === 'operations',
    isSupplier: user && (user.role === 'china_supplier' || user.role === 'md_supplier'),
    isChina:    user && user.role === 'china_supplier',
    isMD:       user && user.role === 'md_supplier',
    isLoggedIn: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
