import React, { useState } from 'react';
import { Search, Bell, Calendar, Building2, ChevronDown, CheckCircle, LogOut } from "lucide-react";
import { useNavigate } from 'react-router';
import { useFinance } from '../context/FinanceContext';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  onMenuToggle: () => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
}

interface NavActionButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'ghost';
  ariaLabel: string;
}

function NavActionButton({
  children,
  onClick,
  variant = 'ghost',
  ariaLabel,
}: NavActionButtonProps): React.ReactElement {
  const variantClassName =
    variant === 'ghost'
      ? 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-blue-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-blue-100'
      : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${variantClassName}`}
    >
      {children}
    </button>
  );
}

export function Navbar({ onMenuToggle, searchTerm, setSearchTerm }: NavbarProps): React.ReactElement {
  const navigate = useNavigate();
  const { settings, updateSettings, activeUser, users, changeActiveUser, auditLogs } = useFinance();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);

  const notifications = auditLogs.slice(0, 5); // Show latest 5 logs as notifications

  const handleUserChange = (userId: string) => {
    changeActiveUser(userId);
    setShowUserDropdown(false);
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 dark:bg-slate-950/80 dark:border-slate-800 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Mobile Menu Trigger & Search */}
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={onMenuToggle}
          className="p-2 -ml-2 text-gray-500 hover:text-blue-900 rounded-lg hover:bg-gray-50 md:hidden transition-colors"
          aria-label="Toggle menu"
          type="button"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Global Search Bar */}
        <div className="relative max-w-md w-full hidden sm:block">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search accounts, journal entries, projects..."
            className="app-input w-full pl-9 pr-4 py-1.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-900/10 dark:focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Right: Quick Selectors & Profile */}
      <div className="flex items-center gap-3">
        
          {/* Theme Toggle */}
          <ThemeToggle />

        {/* Organization Quick Selector */}
        
        <div className="app-filter hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl">
          <Building2 className="w-3.5 h-3.5 text-blue-900" />
          <select 
            value={settings.organizationName}
            onChange={(e) => updateSettings({ organizationName: e.target.value })}
            className="app-input-plain font-semibold text-blue-950 dark:text-blue-100 text-xs cursor-pointer focus:ring-0 pr-1 py-0"
          >
            <option value="Bicol University">Bicol University</option>
            <option value="StatementStudio Corp">StatementStudio Corp</option>
            <option value="Scholarship Foundation">Scholarship Foundation</option>
          </select>
        </div>

        {/* Fiscal Year Selector */}
        <div className="app-filter hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-orange-500" />
          <select
            value={settings.fiscalYear}
            onChange={(e) => updateSettings({ fiscalYear: e.target.value })}
            className="app-input-plain font-semibold text-xs cursor-pointer focus:ring-0 pr-1 py-0"
          >
            <option value="FY 2026">FY 2026</option>
            <option value="FY 2027">FY 2027</option>
            <option value="FY 2025">FY 2025</option>
          </select>
        </div>

        <NavActionButton
          variant="ghost"
          onClick={() => navigate("/")}
          ariaLabel="Logout"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </NavActionButton>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
            onBlur={() => setTimeout(() => setShowNotificationDropdown(false), 200)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
              showNotificationDropdown 
                ? 'bg-blue-50/50 border-blue-200 text-blue-900 shadow-sm' 
                : 'bg-white border-slate-200 text-slate-500 hover:text-blue-900 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
            }`}
            type="button"
          >
            <span className="relative">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-600 rounded-full border border-white dark:border-slate-900" />
            </span>
          </button>

          {showNotificationDropdown && (
            <div className="absolute right-0 mt-2 w-80 app-surface rounded-2xl shadow-xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2 border-b app-divider flex items-center justify-between">
                <span className="font-bold text-xs app-strong uppercase tracking-wider">Activity Feed</span>
                <span className="text-[10px] text-blue-900 dark:text-blue-200 font-semibold bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-full">Real-time</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((log) => (
                  <div key={log.id} className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b app-divider last:border-none flex gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold app-strong">{log.action}</p>
                      <p className="text-[10px] app-muted line-clamp-2 mt-0.5">{log.details}</p>
                      <p className="text-[9px] app-soft mt-1">{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs app-soft">
                    No recent activities.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
            className="app-surface flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-all text-left"
            type="button"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
              {activeUser.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-bold text-blue-950 dark:text-blue-100 leading-tight">{activeUser.name}</p>
              <p className="text-[9px] app-soft font-semibold leading-none">{activeUser.role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 app-soft" />
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-56 app-surface rounded-2xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3.5 py-2 border-b app-divider">
                <p className="text-[10px] app-soft font-bold uppercase tracking-wider">Switch Active Role</p>
              </div>
              {users.map((usr) => (
                <button
                  key={usr.id}
                  onClick={() => handleUserChange(usr.id)}
                  className={`w-full px-3.5 py-2 text-left flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                    activeUser.id === usr.id ? 'bg-blue-50/30 dark:bg-blue-950/30' : ''
                  }`}
                  type="button"
                >
                  <span className="text-xs font-bold app-strong">{usr.name}</span>
                  <span className="text-[9px] app-soft font-semibold">{usr.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
