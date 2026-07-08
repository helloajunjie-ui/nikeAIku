// ============================================================
// AuthModal — 登录/注册弹窗
// ============================================================
import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose }) => {
  const { login, register, error, clearError } = useAuthStore();
  const { addNotification } = useUIStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username, password);
        addNotification({ type: 'success', message: '登录成功' });
      } else {
        await register(username, password);
        addNotification({ type: 'success', message: '注册成功' });
      }
      onClose();
      setUsername('');
      setPassword('');
    } catch {
      // error is set in store
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1c1d26] rounded-lg border border-[#2a2b36] p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="text-red-400 text-sm cursor-pointer" onClick={clearError}>
              {error}
            </p>
          )}

          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
              focus:outline-none focus:border-purple-500"
            required
            autoFocus
          />

          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[#13141c] border border-[#2a2b36] rounded text-gray-200 text-sm
              focus:outline-none focus:border-purple-500"
            required
          />

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600
                text-white rounded text-sm transition-colors"
            >
              {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                clearError();
              }}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              {mode === 'login' ? '注册' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
