// ============================================================
// Notification — 通知浮层组件
// ============================================================
import React from 'react';
import { useUIStore } from '../stores/uiStore';

const typeStyles: Record<string, string> = {
  success: 'bg-green-600/90 border-green-500',
  error: 'bg-red-600/90 border-red-500',
  info: 'bg-blue-600/90 border-blue-500',
  warning: 'bg-yellow-600/90 border-yellow-500',
};

export const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useUIStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`px-4 py-3 rounded-lg border shadow-lg text-sm text-white
            flex items-center justify-between gap-2 animate-slide-in
            ${typeStyles[n.type] || typeStyles.info}`}
        >
          <span>{n.message}</span>
          <button
            onClick={() => removeNotification(n.id)}
            className="text-white/70 hover:text-white shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
