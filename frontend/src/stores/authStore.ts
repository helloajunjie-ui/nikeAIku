// ============================================================
// authStore — 认证状态管理
// ============================================================
import { create } from 'zustand';
import * as api from '../utils/api';

interface User {
  id: string;
  username: string;
  points: number;
  role: 'user' | 'admin';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => void;
  clearError: () => void;

  // F-59/F-60: 乐观积分更新
  optimisticDeductPoints: (amount: number) => void;
  refreshPoints: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.login({ username, password });
      api.setToken(res.token);
      // 持久化 user 信息到 localStorage
      localStorage.setItem('niko_user', JSON.stringify(res.user));
      set({
        user: res.user as User,
        token: res.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.register({ username, password });
      api.setToken(res.token);
      // 持久化 user 信息到 localStorage
      localStorage.setItem('niko_user', JSON.stringify(res.user));
      set({
        user: res.user as User,
        token: res.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '注册失败';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    api.clearToken();
    localStorage.removeItem('niko_user');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  restoreSession: () => {
    const token = api.getToken();
    if (token) {
      // 从 localStorage 恢复持久化的 user 信息
      let user: User | null = null;
      try {
        const raw = localStorage.getItem('niko_user');
        if (raw) user = JSON.parse(raw) as User;
      } catch {
        // ignore parse failure
      }
      set({ token, user, isAuthenticated: !!user });
    }
  },

  clearError: () => set({ error: null }),

  // F-59/F-60: 乐观积分更新 — 先扣减本地缓存，后端确认后修正
  optimisticDeductPoints: (amount: number) => {
    const { user } = get();
    if (!user) return;
    const updated = { ...user, points: Math.max(0, user.points - amount) };
    set({ user: updated });
    localStorage.setItem('niko_user', JSON.stringify(updated));
  },

  refreshPoints: async () => {
    try {
      const { points } = await api.getUserPoints();
      const { user } = get();
      if (!user) return;
      const updated = { ...user, points };
      set({ user: updated });
      localStorage.setItem('niko_user', JSON.stringify(updated));
    } catch {
      // silently fail — 离线时使用本地缓存值
    }
  },
}));
