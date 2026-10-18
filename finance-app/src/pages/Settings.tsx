import React, { useEffect, useState, useRef } from 'react';
import {
  Building,
  FolderTree,
  User as UserIcon,
  Plus,
  ToggleLeft,
  ToggleRight,
  Edit3,
  Check,
  Database,
  Download,
  Upload,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Account, AccountType, NormalBalanceType, BackupPayload } from '../types';
import { validateBackupPayload } from '../lib/backupValidation';
import { CustomTransactionTypesManager } from '../components/CustomTransactionTypesManager';
import { BeginningBalancesForm } from '../components/BeginningBalancesForm';

export function Settings(): React.ReactElement {
  const {
    accounts,
    addAccount,
    updateAccount,
    settings,
    updateSettings,
    exportBackupData,
    restoreBackupData,
    resetFinancialWorkspace
  } = useFinance();

  // COA Form State
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Expenses');
  const [normalBalance, setNormalBalance] = useState<NormalBalanceType>('Debit');
  const [description, setDescription] = useState('');
  const [coaError, setCoaError] = useState('');
  const [accountsPage, setAccountsPage] = useState(1);
  const accountsPerPage = 10;
  const totalAccountPages = Math.max(1, Math.ceil(accounts.length / accountsPerPage));
  const paginatedAccounts = accounts.slice(
    (accountsPage - 1) * accountsPerPage,
    accountsPage * accountsPerPage
  );

  useEffect(() => {
    setAccountsPage(current => Math.min(current, totalAccountPages));
  }, [totalAccountPages]);

  // Editing COA Row
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');

  // Org Settings State
  const [orgName, setOrgName] = useState(settings.organizationName);
  const [fyName, setFyName] = useState(settings.fiscalYear);
  const [currency, setCurrency] = useState(settings.currencyCode);

  // Organization Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');


  // Data Backup — this app persists only to this browser's localStorage,
  // with no server and no sync. Export bundles everything into one JSON
  // file; restore requires an explicit confirmation step (pendingRestore)
  // before anything is overwritten, since it replaces the entire workspace
  // and cannot be undone from within the app.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupPayload | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');
  const [showResetWorkspaceConfirm, setShowResetWorkspaceConfirm] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');

  const handleExportBackup = () => {
    setExportSuccess('');
    const payload = exportBackupData();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const orgSlug = payload.organizationName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'statementstudio';
    const dateSlug = new Date().toISOString().split('T')[0];
    const filename = `${orgSlug}_backup_${dateSlug}.json`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportSuccess(`Backup download started: ${filename}`);
    window.setTimeout(() => setExportSuccess(''), 5000);
  };

  const handleResetFinancialWorkspace = () => {
    resetFinancialWorkspace();
    setShowResetWorkspaceConfirm(false);
    setResetSuccess('Financial workspace reset successfully. Organization settings and the Chart of Accounts were preserved.');
    window.setTimeout(() => setResetSuccess(''), 7000);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError('');
    setRestoreSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const validation = validateBackupPayload(parsed);
        if (!validation.valid) {
          setRestoreError(validation.reason || 'Invalid backup file.');
          return;
        }
        setPendingRestore(parsed as BackupPayload);
      } catch {
        setRestoreError('Could not read this file as valid JSON.');
      }
    };
    reader.onerror = () => setRestoreError('Could not read this file.');
    reader.readAsText(file);

    // Reset so selecting the same file again still fires onChange
    e.target.value = '';
  };

  const handleConfirmRestore = () => {
    if (!pendingRestore) return;
    try {
      restoreBackupData(pendingRestore);
      setPendingRestore(null);
      setRestoreSuccess('Backup restored successfully.');
      setTimeout(() => setRestoreSuccess(''), 5000);
    } catch (err: any) {
      setRestoreError(err.message || 'Failed to restore backup.');
    }
  };

  const handleCancelRestore = () => {
    setPendingRestore(null);
    setRestoreError('');
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setCoaError('');

    if (!code.trim() || !name.trim()) {
      setCoaError('Account Code and Name are required.');
      return;
    }

    if (accounts.some(a => a.code === code)) {
      setCoaError(`An account with code ${code} already exists.`);
      return;
    }

    try {
      addAccount({
        code,
        name,
        type,
        normalBalance,
        description,
        isActive: true
      });

      // Clear Form
      setCode('');
      setName('');
      setDescription('');
      setShowAccountForm(false);
      setAccountsPage(Math.ceil((accounts.length + 1) / accountsPerPage));
    } catch (err: any) {
      setCoaError(err.message || 'An error occurred.');
    }
  };

  const handleSaveAccountEdit = (code: string) => {
    updateAccount(code, {
      name: editingName,
      description: editingDesc
    });
    setEditingCode(null);
  };

  const startEditing = (acc: Account) => {
    setEditingCode(acc.code);
    setEditingName(acc.name);
    setEditingDesc(acc.description);
  };

  const handleToggleActive = (code: string, currentStatus: boolean) => {
    updateAccount(code, { isActive: !currentStatus });
  };

  const handleSaveGeneralSettings = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine Symbol
    let symbol = '$';
    if (currency === 'PHP') symbol = '₱';
    else if (currency === 'EUR') symbol = '€';
    else if (currency === 'GBP') symbol = '£';
    else if (currency === 'JPY') symbol = '¥';

    updateSettings({
      organizationName: orgName,
      fiscalYear: fyName,
      currencyCode: currency,
      currencySymbol: symbol
    });

    alert('General preferences updated successfully.');
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const rawOrgAccount = localStorage.getItem('orgAccount');
    const orgAccount = rawOrgAccount ? JSON.parse(rawOrgAccount) : null;

    if (!orgAccount) {
      setPasswordError('No organization account found.');
      return;
    }
    if (currentPassword !== orgAccount.password) {
      setPasswordError('Current password is incorrect.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    orgAccount.password = newPassword;
    localStorage.setItem('orgAccount', JSON.stringify(orgAccount));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordSuccess('Organization password updated.');
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="font-display text-3xl text-slate-900 dark:text-slate-100">Workspace <em className="text-blue-700 dark:text-blue-400">Settings</em></h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Configure chart of accounts, fiscal-year controls, transaction types, currency, and organization access.</p>
      </div>

      <CustomTransactionTypesManager />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
        {/* Left Side: General settings forms */}
        <div className="xl:col-span-4 space-y-6">
          {/* General Preferences */}
          <form onSubmit={handleSaveGeneralSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
              <Building className="w-4.5 h-4.5 text-blue-900" /> Organization Settings
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reporting Fiscal Year</label>
                <input
                  type="text"
                  value={fyName}
                  onChange={(e) => setFyName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Functional Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors cursor-pointer"
                >
                  <option value="PHP">Philippine Peso (₱ - PHP)</option>
                  <option value="USD">United States Dollar ($ - USD)</option>
                  <option value="EUR">Euro (€ - EUR)</option>
                  <option value="GBP">British Pound (£ - GBP)</option>
                  <option value="JPY">Japanese Yen (¥ - JPY)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs p-2.5 rounded-xl transition-all shadow-md shadow-blue-900/10 cursor-pointer"
            >
              Update Preferences
            </button>
          </form>

          {/* Organization password */}
          <form onSubmit={handleChangePassword} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
              <UserIcon className="w-4.5 h-4.5 text-blue-900" /> Organization Password
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-2">
              Everyone in your organization signs in with this one shared password.
            </p>

            {passwordError && (
              <p className="text-[12px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">{passwordSuccess}</p>
            )}

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs py-2.5 rounded-xl transition-colors"
              >
                Update Password
              </button>
            </div>
          </form>

        </div>

        {/* Right Side: Chart of Accounts Editor */}
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-sm space-y-6">
          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-blue-900" /> Chart of Accounts
            </h3>
            
            <button
              onClick={() => setShowAccountForm(!showAccountForm)}
              className="flex items-center gap-1 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-900 dark:text-blue-300 font-bold text-xs px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
              type="button"
            >
              <Plus className="w-4 h-4" /> Add Code
            </button>
          </div>

          {/* Add Account Panel Drawer */}
          {showAccountForm && (
            <form onSubmit={handleAddAccount} className="p-4 border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 rounded-2xl space-y-3.5 animate-in fade-in slide-in-from-top-3 duration-150">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Add Account Ledger Account</h4>
              
              {coaError && (
                <p className="text-[12px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg">{coaError}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Code (Unique ID)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. 5060, 1020..."
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 outline-none focus:border-blue-900 dark:focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Marketing Expense, Prepaid Insurance..."
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 outline-none focus:border-blue-900 dark:focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Classification Category</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 outline-none focus:border-blue-900 dark:focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Assets">Assets</option>
                    <option value="Liabilities">Liabilities</option>
                    <option value="Fund Balance">Fund Balance (Equity)</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expenses">Expenses</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Normal Book Balance</label>
                  <select
                    value={normalBalance}
                    onChange={(e) => setNormalBalance(e.target.value as NormalBalanceType)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 outline-none focus:border-blue-900 dark:focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Debit">Debit Balance</option>
                    <option value="Credit">Credit Balance</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Summary of transactions cataloged here..."
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2 outline-none focus:border-blue-900 dark:focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowAccountForm(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-950 rounded-lg shadow-sm cursor-pointer"
                >
                  Post Account
                </button>
              </div>
            </form>
          )}

          {/* Accounts List Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[12px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
                  <th className="py-2.5 px-4 w-20">Code</th>
                  <th className="py-2.5 px-4 w-40">Account Name</th>
                  <th className="py-2.5 px-4 max-w-[220px]">Description</th>
                  <th className="py-2.5 px-4 w-28">Type</th>
                  <th className="py-2.5 px-4 w-20">Normal</th>
                  <th className="py-2.5 px-4 w-20">Status</th>
                  <th className="py-2.5 px-4 w-20 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {paginatedAccounts.map((acc) => {
                  const isEditing = editingCode === acc.code;
                  return (
                    <tr key={acc.code} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors font-medium text-slate-900 dark:text-slate-100 ${acc.isActive ? '' : 'opacity-50'}`}>
                      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100">{acc.code}</td>
                      
                      {/* Name field */}
                      <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs w-full outline-none font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-900 dark:focus:border-blue-500"
                          />
                        ) : (
                          acc.name
                        )}
                      </td>

                      {/* Description field */}
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 max-w-[220px]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingDesc}
                            onChange={(e) => setEditingDesc(e.target.value)}
                            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs w-full outline-none font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-900 dark:focus:border-blue-500"
                          />
                        ) : (
                          <span className="block truncate" title={acc.description}>{acc.description}</span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100 font-semibold">{acc.type}</td>
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">{acc.normalBalance}</td>
                      
                      {/* Active Status */}
                      <td className="py-2.5 px-4">
                        <button
                          onClick={() => handleToggleActive(acc.code, acc.isActive)}
                          className="text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors cursor-pointer"
                          type="button"
                          title={acc.isActive ? 'Deactivate account' : 'Activate account'}
                        >
                          {acc.isActive ? (
                            <ToggleRight className="w-5 h-5 text-blue-900" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveAccountEdit(acc.code)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            type="button"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => startEditing(acc)}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded transition-colors"
                            type="button"
                            title="Edit Account"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
              Showing {(accountsPage - 1) * accountsPerPage + 1}–{Math.min(accountsPage * accountsPerPage, accounts.length)} of {accounts.length} accounts
            </p>
            <nav className="flex flex-wrap items-center gap-1.5" aria-label="Chart of Accounts pages">
              <button
                type="button"
                onClick={() => setAccountsPage(page => Math.max(1, page - 1))}
                disabled={accountsPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Previous accounts page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: totalAccountPages }, (_, index) => index + 1).map(page => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setAccountsPage(page)}
                  aria-current={accountsPage === page ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-colors ${
                    accountsPage === page
                      ? 'bg-blue-900 text-white dark:bg-blue-600'
                      : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setAccountsPage(page => Math.min(totalAccountPages, page + 1))}
                disabled={accountsPage === totalAccountPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Next accounts page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Data Backup */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
            <Database className="w-4.5 h-4.5 text-blue-900 dark:text-blue-400" /> Data Backup
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
            Your workspace is saved to your signed-in account, with a recovery copy in this browser. Check the save status before leaving, and export a backup regularly. Unsaved browser changes may be lost if browser data is cleared.
          </p>

          {restoreError && (
            <p className="text-[12px] text-rose-600 dark:text-rose-300 font-bold bg-rose-50 dark:bg-rose-500/10 p-2 rounded-lg">{restoreError}</p>
          )}
          {restoreSuccess && (
            <p className="text-[12px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg">{restoreSuccess}</p>
          )}
          {exportSuccess && (
            <p className="text-[12px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg">{exportSuccess}</p>
          )}

          <button
            type="button"
            onClick={handleExportBackup}
            className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-950 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs p-2.5 rounded-xl transition-all shadow-md shadow-blue-900/10 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export Full Backup
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleFileSelected}
            className="hidden"
            id="restore-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" /> Restore From Backup
          </button>

          {pendingRestore && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[13px] font-bold text-amber-800 dark:text-amber-300">
                  This will replace ALL current data. This cannot be undone.
                </p>
              </div>
              <div className="text-[12px] text-amber-700 dark:text-amber-300/80 font-medium space-y-0.5 pl-6">
                <p>Organization: <span className="font-bold">{pendingRestore.organizationName}</span></p>
                <p>Exported: <span className="font-bold">{new Date(pendingRestore.exportedAt).toLocaleString()}</span></p>
                <p>{pendingRestore.accounts.length} accounts, {pendingRestore.journalEntries.length} journal entries, {pendingRestore.projects?.length || 0} projects</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelRestore}
                  className="flex-1 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  className="flex-1 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm cursor-pointer"
                >
                  Confirm Restore
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reset financial workspace */}
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 p-5 rounded-2xl shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" /> Reset Financial Workspace
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
            Remove all transactions, receipts, activities/programs, fiscal-year closings, custom transaction types, and audit history. Your organization login, settings, currency, and Chart of Accounts will stay unchanged.
          </p>

          {resetSuccess && (
            <p className="text-[12px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-500/10 p-2 rounded-lg">{resetSuccess}</p>
          )}

          {!showResetWorkspaceConfirm ? (
            <button
              type="button"
              onClick={() => setShowResetWorkspaceConfirm(true)}
              className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-950 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-bold text-xs p-2.5 rounded-xl border border-rose-300 dark:border-rose-800 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4" /> Reset Financial Workspace
            </button>
          ) : (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl space-y-2.5">
              <p className="text-[13px] font-bold text-rose-800 dark:text-rose-300">
                This permanently removes the financial records listed above. Export a backup first if you may need them later.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetWorkspaceConfirm(false)}
                  className="flex-1 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetFinancialWorkspace}
                  className="flex-1 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm cursor-pointer"
                >
                  Confirm Reset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Beginning Balances */}
      <BeginningBalancesForm />
    </div>
  );
}
