// src/components/layout/AppLayout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, CheckSquare, Calendar,
  BarChart2, Users, Settings, LogOut, Bell, HardHat, ContactRound
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../../api/index';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['PM','ClusterHead','VP','PMHead','PMManager','Admin'] },
  { to: '/reservations', icon: ClipboardList, label: 'Reservations', roles: ['PM','ClusterHead','VP','PMHead','PMManager','Admin'] },
  { to: '/approvals', icon: CheckSquare, label: 'Approvals', roles: ['VP','ClusterHead','PMHead'] },
  { to: '/calendar', icon: Calendar, label: 'Capacity Calendar', roles: ['PMHead','PMManager','VP','Admin'] },
  { to: '/reports', icon: BarChart2, label: 'Reports', roles: ['VP','ClusterHead','PMHead','PMManager','Admin'] },
  { to: '/engineers', icon: ContactRound, label: 'Engineers', roles: ['PM','PMHead','Admin'] },
  { to: '/users', icon: Users, label: 'Users', roles: ['Admin'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['Admin'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  const visibleNav = navItems.filter((n) => user && n.roles.includes(user.role));

  const roleBadgeColor: Record<string, string> = {
    PM: 'bg-blue-100 text-blue-800',
    ClusterHead: 'bg-purple-100 text-purple-800',
    VP: 'bg-orange-100 text-orange-800',
    PMHead: 'bg-green-100 text-green-800',
    PMManager: 'bg-teal-100 text-teal-800',
    Admin: 'bg-red-100 text-red-800',
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <HardHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">ConcreteMS</p>
              <p className="text-xs text-gray-400">Reservation System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-700 font-semibold text-xs">
                {user?.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleBadgeColor[user?.role || 'PM']}`}>
                {user?.role}
              </span>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }} className="text-gray-400 hover:text-gray-600">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-medium text-gray-500">Concrete Reservation System</h1>
          <div className="flex items-center gap-3">
            {/* Notifications bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
                  <div className="p-3 border-b border-gray-100 font-medium text-sm">Notifications</div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 && (
                      <p className="p-4 text-sm text-gray-400 text-center">No notifications</p>
                    )}
                    {notifications.slice(0, 10).map((n: any) => (
                      <div key={n.notification_id} className={`p-3 border-b border-gray-50 hover:bg-gray-50 ${!n.is_read ? 'bg-blue-50' : ''}`}>
                        <p className="text-sm font-medium text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PM quick action */}
            {user?.role === 'PM' && (
              <NavLink to="/reservations/new" className="btn-primary flex items-center gap-1.5 text-xs">
                + New Reservation
              </NavLink>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
