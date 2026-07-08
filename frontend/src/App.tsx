// ============================================================
// App — 根组件（布局 + 路由）
// ============================================================
import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { NotificationContainer } from './components/Notification';
import { useUIStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';
import Lobby from './pages/Lobby';
import Saves from './pages/Saves';
import { Creator } from './pages/Creator';
import { MyScenarios } from './pages/MyScenarios';
import { Settings } from './pages/Settings';
import { Admin } from './pages/Admin';
import { Play } from './pages/Play';

const App: React.FC = () => {
  const { currentView, sidebarOpen } = useUIStore();
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
  }, []);

  function renderPage() {
    switch (currentView) {
      case 'lobby':
        return <Lobby />;
      case 'saves':
        return <Saves />;
      case 'my-scenarios':
        return <MyScenarios />;
      case 'creator':
        return <Creator />;
      case 'settings':
        return <Settings />;
      case 'admin':
        return <Admin />;
      case 'play':
        return <Play />;
      default:
        return <Lobby />;
    }
  }

  return (
    // 【圣杯弹性壳】flex-row 确保左右兄弟物理分栏，永不重叠
    <div className="h-screen flex flex-col md:flex-row bg-[#13141c] text-gray-100 overflow-hidden">
      {/* shrink-0：Sidebar 宽度变化时主内容自适应，绝不压缩菜单 */}
      <div className="shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        <Sidebar />
      </div>
      {/* flex-1 + min-w-0：灵魂组合，自动占满剩余空间，防止长内容撑爆布局 */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
      <NotificationContainer />
    </div>
  );
};

export default App;
