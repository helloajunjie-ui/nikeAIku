// ============================================================
// TopBar — 顶部导航栏（Sidebar 折叠时显示汉堡菜单 + 用户状态）
// ============================================================
import React from 'react';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

const viewTitles: Record<string, string> = {
  lobby: '剧本大厅',
  saves: '我的存档',
  creator: '创作新剧本',
  settings: '设置',
  admin: '管理后台',
};

export const TopBar: React.FC = () => {
  const { sidebarOpen, currentView, toggleSidebar } = useUIStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { currentScenario } = useGameStore();

  // play 视图显示剧本名，其他视图显示固定标题
  const pageTitle = currentView === 'play'
    ? (currentScenario?.name || '游玩')
    : (viewTitles[currentView] || 'NIKO酒馆');

  return (
    <header
      className={`h-14 border-b border-[#2a2b36] bg-[#13141c] flex items-center justify-between px-4 shrink-0
        transition-all duration-300 ${sidebarOpen ? 'lg:ml-56' : 'ml-0'}`}
    >
      {/* Left: Hamburger + Title */}
      <div className="flex items-center gap-3">
        {/* Hamburger Button — 始终可见 */}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-md
            text-gray-400 hover:text-gray-200 hover:bg-[#252630] transition-colors"
          title={sidebarOpen ? '收起菜单' : '展开菜单'}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              // X 图标
              <>
                <path d="M5 5L15 15M15 5L5 15" />
              </>
            ) : (
              // 汉堡图标
              <>
                <path d="M3 5H17M3 10H17M3 15H17" />
              </>
            )}
          </svg>
        </button>

        {/* Page Title — play 视图显示剧本名 */}
        <h1 className="text-base font-semibold text-gray-200 hidden sm:block">
          {pageTitle}
        </h1>
      </div>

      {/* Right: User Status */}
      <div className="flex items-center gap-3">
        {isAuthenticated && user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300 hidden sm:inline">{user.username}</span>
            <span className="text-xs text-gray-500 hidden md:inline">{user.points} 积分</span>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
            >
              退出
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-500">未登录</span>
        )}
      </div>
    </header>
  );
};
