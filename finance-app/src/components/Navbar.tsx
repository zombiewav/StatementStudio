import React, { useEffect, useRef, useState } from 'react';
import { Search, Bell, Calendar, Building2, CheckCircle, ChevronDown, LogOut } from "lucide-react";
import { useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import { useFinance } from '../context/FinanceContext';
import { Semester, SEMESTER_OPTIONS, periodForSemester, parseSchoolYear } from '../lib/reportingPeriod';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  onMenuToggle: () => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  onSearchSubmit: () => void;
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

export function Navbar({ onMenuToggle, searchTerm, setSearchTerm, onSearchSubmit }: NavbarProps): React.ReactElement {
  const navigate = useNavigate();
  const { settings, auditLogs, reportingPeriodWorkspaces, switchReportingPeriod } = useFinance();
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showFiscalYearDropdown, setShowFiscalYearDropdown] = useState(false);
  const fiscalYearDropdownRef = useRef<HTMLDivElement>(null);
  // Same Semester/Period/Year structure already used per-transaction (see
  // reportingPeriod.ts) — Period is always derived from Semester, never
  // entered directly, so the two can't disagree. The school year spans two
  // calendar years (1st Semester Aug-Dec of the entered year, 2nd Semester
  // Jan-May of the year after), hence the "2021-2022" range in the label,
  // regardless of which semester is currently selected.
  const [fySemester, setFySemester] = useState<Semester | ''>('');
  const [fyYear, setFyYear] = useState('');
  const [fyError, setFyError] = useState('');

  const applyFiscalYear = () => {
    setFyError('');
    if (!fySemester) { setFyError('Select a semester.'); return; }
    try {
      const schoolYear = parseSchoolYear(fyYear);
      switchReportingPeriod(schoolYear.label, fySemester, schoolYear.startYear);
      setShowFiscalYearDropdown(false);
    } catch (err) {
      setFyError(err instanceof Error ? err.message : 'Enter a valid year.');
    }
  };

  useEffect(() => {
    const closeFiscalYearDropdown = (event: MouseEvent) => {
      if (!fiscalYearDropdownRef.current?.contains(event.target as Node)) {
        setShowFiscalYearDropdown(false);
      }
    };

    document.addEventListener('mousedown', closeFiscalYearDropdown);
    return () => document.removeEventListener('mousedown', closeFiscalYearDropdown);
  }, []);

  const notifications = auditLogs.slice(0, 5); // Show latest 5 logs as notifications

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
            onKeyDown={(event) => {
              if (event.key === 'Enter' && searchTerm.trim()) onSearchSubmit();
            }}
            aria-label="Global search"
            placeholder="Search accounts, journal entries, projects..."
            className="app-input w-full pl-9 pr-4 py-1.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-900/10 dark:focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Right: Quick Selectors & Profile */}
      <div className="flex items-center gap-3">
        
          {/* Theme Toggle */}
          <ThemeToggle />

        {/* Organization identity — renamed from Settings, not here */}
        <div className="app-filter hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl">
          <Building2 className="w-3.5 h-3.5 text-blue-900" />
          <span className="font-semibold text-blue-950 dark:text-blue-100 text-xs">
            {settings.organizationName}
          </span>
        </div>

        {/* School Year Selector */}
        <div ref={fiscalYearDropdownRef} className="app-filter relative hidden md:flex items-center gap-2 rounded-xl px-3 py-1.5">
          <Calendar className="w-3.5 h-3.5 text-orange-500" />
          <button
            type="button"
            onClick={() => setShowFiscalYearDropdown(value => !value)}
            aria-haspopup="listbox"
            aria-expanded={showFiscalYearDropdown}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 outline-none dark:text-slate-200"
          >
            <span>{settings.fiscalYear}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showFiscalYearDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showFiscalYearDropdown && (
            <div
              aria-label="School year"
              className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Add or open semester</p>
              <div className="mb-3 flex gap-2">
                {SEMESTER_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => { setFySemester(option); setFyError(''); }}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      fySemester === option
                        ? 'bg-blue-700 text-white'
                        : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className="mb-3 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                School Year
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  value={fyYear}
                  onChange={event => { setFyYear(event.target.value.replace(/[^\d-]/g, '').slice(0, 9)); setFyError(''); }}
                  placeholder="Example: 2021-2022"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>

              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Period</p>
              <p className="mb-3 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {fySemester ? periodForSemester(fySemester) : 'Automatic once a semester is selected'}
              </p>

              {fyError && <p className="mb-2 text-[10px] font-bold text-rose-600 dark:text-rose-400">{fyError}</p>}

              <button
                type="button"
                onClick={applyFiscalYear}
                className="w-full rounded-lg bg-blue-700 py-2 text-[11px] font-bold text-white hover:bg-blue-800"
              >
                Apply to All
              </button>
              <p className="mt-2 text-[9px] font-medium text-slate-500 dark:text-slate-400">Every new transaction uses this automatically — no need to set it again per-transaction.</p>
              {reportingPeriodWorkspaces.length > 0 && (
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Saved semesters</p>
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {reportingPeriodWorkspaces.map(workspace => (
                      <button key={workspace.key} type="button" onClick={() => { switchReportingPeriod(workspace.schoolYear, workspace.semester, workspace.reportingYear); setShowFiscalYearDropdown(false); }} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-left text-[10px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        {workspace.semester} {workspace.schoolYear}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <NavActionButton
          variant="ghost"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/login');
          }}
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
        <div className="app-surface flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl">
          <div className="w-7 h-7 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
            {settings.organizationName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-bold text-blue-950 dark:text-blue-100 leading-tight">{settings.organizationName}</p>
            <p className="text-[9px] app-soft font-semibold leading-none">Organization Account</p>
          </div>
        </div>
      </div>
    </header>
  );
}
