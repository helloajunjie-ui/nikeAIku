// ============================================================
// Sidebar — 响应式导航栏
// PC（md+）：左侧固定边栏
// 移动端（<md）：底部悬浮毛玻璃导航条（ColorOS 风格）
// ============================================================
import React, { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { AuthModal } from './AuthModal';

const navItems: Array<{
  view: 'lobby' | 'saves' | 'my-scenarios' | 'settings';
  label: string;
  icon: string;
}> = [
  { view: 'lobby', label: '大厅', icon: '🏠' },
  { view: 'saves', label: '存档', icon: '💾' },
  { view: 'my-scenarios', label: '创作', icon: '✏️' },
  { view: 'settings', label: '设置', icon: '⚙️' },
];

export const Sidebar: React.FC = () => {
  const { sidebarOpen, currentView, navigateTo, toggleSidebar } = useUIStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      {/* Auth Modal */}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />

      {/* ========== PC 侧边栏（md+） ========== */}
      {/* 【圣杯弹性壳】relative 参与 flex 流布局，物理性将主内容向右推 */}
      <aside
        className={`
          hidden md:flex relative h-full z-20 shrink-0
          transition-all duration-300 ease-in-out
          bg-[#1c1d26] border-r border-[#2a2b36] flex-col overflow-hidden
          ${sidebarOpen ? 'w-56' : 'w-0 border-r-0'}
        `}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-[#2a2b36] shrink-0 w-56">
          <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            NIKO酒馆
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-2 overflow-y-auto w-56">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => {
                navigateTo(item.view);
                if (window.innerWidth < 1024) toggleSidebar();
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                ${currentView === item.view
                  ? 'bg-purple-600/20 text-purple-300 border-r-2 border-purple-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#252630]'
                }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Info */}
        <div className="border-t border-[#2a2b36] p-3 shrink-0 w-56">
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">{user.username}</p>
                <p className="text-xs text-gray-500">{user.points} 积分</p>
              </div>
              <button
                onClick={logout}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-2"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="w-full text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              登录 / 注册
            </button>
          )}
        </div>

        {/* Admin Entry */}
        {user?.role === 'admin' && (
          <button
            onClick={() => {
              navigateTo('admin');
              if (window.innerWidth < 1024) toggleSidebar();
            }}
            className={`mx-3 mb-2 px-3 py-2 rounded text-xs font-bold tracking-wider
              border transition-colors shrink-0 w-56
              ${currentView === 'admin'
                ? 'bg-yellow-600/30 text-yellow-300 border-yellow-600'
                : 'bg-yellow-900/20 text-yellow-600 border-yellow-800/50 hover:bg-yellow-800/30 hover:text-yellow-400'
              }`}
          >
            ⚠ 管理控制台
          </button>
        )}

        {/* Toggle Button — 折叠/展开触发器 */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12
            bg-[#1c1d26] border border-[#2a2b36] rounded-r-md
            flex items-center justify-center text-gray-500 hover:text-gray-300
            transition-colors text-xs z-30"
        >
          {sidebarOpen ? '◀' : '▶'}
        </button>
      </aside>

      {/* ========== 移动端底部导航条（<md）ColorOS 风格 ========== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50
        h-16 bg-[#13141c]/60 backdrop-blur-2xl
        shadow-glass border-t border-white/5
        flex items-center justify-around
        pb-safe">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => navigateTo(item.view)}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl
              transition-all duration-300 ease-aqua active:scale-90
              ${currentView === item.view
                ? 'text-purple-400 scale-110 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] leading-none">{item.label}</span>
          </button>
        ))}
        {/* 用户头像 / 登录入口 */}
        {isAuthenticated && user ? (
          <button
            onClick={() => navigateTo('settings')}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl
              transition-all duration-300 ease-aqua active:scale-90
              ${currentView === 'settings'
                ? 'text-purple-400 scale-110 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            <span className="text-xl leading-none">👤</span>
            <span className="text-[10px] leading-none">我的</span>
          </button>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl
              transition-all duration-300 ease-aqua active:scale-90 text-gray-500 hover:text-gray-300"
          >
            <span className="text-xl leading-none">🔑</span>
            <span className="text-[10px] leading-none">登录</span>
          </button>
        )}
      </nav>
    </>
  );
};
