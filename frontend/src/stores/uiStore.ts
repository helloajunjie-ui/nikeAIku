// ============================================================
// uiStore — UI 状态管理（侧边栏、主题、通知、大厅持久状态）
// ============================================================
import { create } from 'zustand';

type SidebarView = 'lobby' | 'saves' | 'creator' | 'my-scenarios' | 'settings' | 'admin' | 'play';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

/** 大厅页面持久状态：导航离开再回来时保持搜索词/页码 */
interface LobbyState {
  keyword: string;
  page: number;
}

interface UIState {
  sidebarOpen: boolean;
  currentView: SidebarView;
  notifications: Notification[];
  theme: 'dark';
  /** 编辑模式：待编辑的剧本 ID，由 MyScenarios 传递给 Creator */
  editScenarioId: string | null;
  /** 大厅持久状态 */
  lobbyState: LobbyState;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  navigateTo: (view: SidebarView) => void;
  /** 导航到 Creator 编辑模式 */
  navigateToEditor: (scenarioId: string) => void;
  addNotification: (notif: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  /** 更新大厅持久状态 */
  setLobbyState: (state: Partial<LobbyState>) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  currentView: 'lobby',
  notifications: [],
  theme: 'dark',
  editScenarioId: null,
  lobbyState: { keyword: '', page: 1 },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  navigateTo: (view) => set({ currentView: view, editScenarioId: null }),
  navigateToEditor: (scenarioId) => set({ currentView: 'creator', editScenarioId: scenarioId }),
  addNotification: (notif) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notification: Notification = { ...notif, id };
    set((state) => ({
      notifications: [...state.notifications, notification],
    }));
    // 自动移除
    const duration = notif.duration ?? 3000;
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    }, duration);
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  setLobbyState: (partial) =>
    set((state) => ({
      lobbyState: { ...state.lobbyState, ...partial },
    })),
}));
