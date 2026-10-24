'use client';

import React from 'react';
import { useAuthStore } from '../store/authStore';
import {
  Bell,
  HelpCircle
} from 'lucide-react';

import { getBackendUrl } from '../lib/api';

interface NavbarProps {
  onOpenCreateTask?: () => void;
  onOpenSubscription?: () => void;
  onOpenInvite?: () => void;
  onOpenProfile: () => void;
  onOpenHelp?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenProfile,
  onOpenHelp,
  onToggleSidebar,
  isSidebarCollapsed
}) => {
  const { user, currentWorkspace, logout } = useAuthStore();

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-gray-200/60 px-4 sm:px-6 py-2.5 flex items-center justify-between select-none shrink-0">
      {/* Left: Brand */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 min-w-[36px] min-h-[36px] aspect-square rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] flex items-center justify-center text-white font-black text-sm shadow-md shadow-[#0F172A]/20 ring-1 ring-black/5 border border-white/10 relative shrink-0">
            <span className="text-[#22C55E] tracking-tight">OS</span>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-2 ring-white shrink-0" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-black text-[#111827] tracking-tight text-base leading-none">
              <span>Outdid</span>
              <span className="text-[#22C55E]">Sync</span>
            </div>
            <span className="text-xs text-slate-500 font-bold tracking-wide">
              {currentWorkspace?.name || 'Workspace'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Notifications, Help Center & Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Help Center Button */}
        <button
          onClick={onOpenHelp}
          title="Help Center, User Guide & Terms"
          className="p-2 rounded-xl text-slate-600 hover:text-[#0F172A] hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200 focus:ring-2 focus:ring-blue-500"
        >
          <HelpCircle className="w-4.5 h-4.5" />
        </button>

        {/* Notification Bell (Placeholder) */}
        <button
          title="Notifications"
          className="relative p-2 rounded-xl text-slate-500 hover:text-[#0F172A] hover:bg-gray-100 transition-all cursor-pointer"
        >
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#22C55E] rounded-full" />
        </button>

        {/* User Avatar & Profile Button */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200/80">
          <button
            onClick={onOpenProfile}
            title="Profile & Password Settings"
            className="flex items-center gap-2 text-left hover:bg-gray-50 p-1.5 rounded-xl transition-all cursor-pointer group"
          >
            <div className="w-9 h-9 min-w-[36px] min-h-[36px] aspect-square rounded-full bg-gradient-to-br from-[#0F172A] to-[#334155] text-white flex items-center justify-center font-black text-xs uppercase shadow-sm group-hover:ring-2 group-hover:ring-[#22C55E]/40 group-hover:shadow-md overflow-hidden shrink-0 transition-all">
              {user?.avatar ? (
                <img
                  src={
                    user.avatar.startsWith('http')
                      ? user.avatar
                      : `${getBackendUrl()}${user.avatar.startsWith('/') ? '' : '/'}${user.avatar}`
                  }
                  alt={user?.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.name?.charAt(0) || 'U'
              )}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-bold text-[#111827] leading-tight group-hover:text-[#0F172A]">
                {user?.name || 'Personal Account'}
              </div>
              <div className="text-xs text-slate-500 font-semibold">
                {user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN'
                  ? 'Organization Admin'
                  : user?.role === 'PROJECT_MANAGER'
                  ? 'Project Manager'
                  : user?.role === 'TEAM_LEAD'
                  ? 'Team Lead'
                  : user?.role === 'HARDWARE'
                  ? 'Hardware Engineer'
                  : user?.role === 'FIRMWARE'
                  ? 'Firmware Engineer'
                  : user?.role === 'PCB_DESIGNER'
                  ? 'PCB Designer'
                  : user?.role === 'DEVELOPER'
                  ? 'Developer'
                  : user?.role === 'QA'
                  ? 'QA Engineer'
                  : user?.role === 'CLOUD'
                  ? 'Cloud Engineer'
                  : user?.role === 'DESIGNER'
                  ? 'Designer'
                  : user?.jobTitle || 'Team Member'}
              </div>
            </div>
          </button>

          <button
            onClick={() => logout(false)}
            title="Logout from this tab only (other tabs remain active)"
            className="text-xs text-rose-600 hover:text-white hover:bg-rose-600 font-bold px-3 py-1.5 rounded-lg transition-all ml-1 cursor-pointer border border-rose-300 hover:border-rose-600 shadow-2xs"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};
