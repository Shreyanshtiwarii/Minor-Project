import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getToken,
  getStoredUser,
  fetchCurrentUser,
  loginUser,
  registerUser,
  loginWithGoogleIdToken,
  logoutUser,
  updateStoredUser
} from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [initializing, setInitializing] = useState(true);

  // On mount, verify any stored token is still valid against the backend.
  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = getToken();
      if (!token) {
        setInitializing(false);
        return;
      }
      const fresh = await fetchCurrentUser();
      if (cancelled) return;
      if (fresh) {
        setUser((prev) => ({ ...prev, ...fresh }));
      } else {
        // Token missing/expired/invalid - clear stale session.
        logoutUser();
        setUser(null);
      }
      setInitializing(false);
    }

    verify();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const loggedInUser = await loginUser({ email, password });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // No session is created on signup anymore - the account must verify its email before it can
  // log in, so this deliberately does NOT call setUser. Returns { message, email } for the
  // SignUp page to show a "check your inbox" screen.
  const register = useCallback(async (name, email, password, confirmPassword) => {
    return registerUser({ name, email, password, confirmPassword });
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const loggedInUser = await loginWithGoogleIdToken(idToken);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
  }, []);

  // Patches the locally-known user (e.g. after Profile Settings saves a new name) so the
  // navbar greeting/avatar and anywhere else `user` is read update immediately.
  const updateUser = useCallback((partialUser) => {
    const merged = updateStoredUser(partialUser);
    setUser(merged);
    return merged;
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    initializing,
    login,
    register,
    loginWithGoogle,
    logout,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
