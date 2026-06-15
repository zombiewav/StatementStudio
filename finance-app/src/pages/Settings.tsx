import React, { useState } from 'react';
import { 
  Building, 
  FolderTree, 
  User as UserIcon, 
  Plus, 
  ToggleLeft, 
  ToggleRight, 
  Edit3, 
  Check 
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Account, AccountType, NormalBalanceType } from '../types';

export function Settings(): React.ReactElement {
  const { 
    accounts, 
    addAccount, 
    updateAccount, 
    settings, 
    updateSettings, 
    users 
  } = useFinance();

  // COA Form State
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('Expenses');
  const [normalBalance, setNormalBalance] = useState<NormalBalanceType>('Debit');
  const [description, setDescription] = useState('');
  const [coaError, setCoaError] = useState('');

  // Editing COA Row
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');

  // Org Settings State
  const [orgName, setOrgName] = useState(settings.organizationName);
  const [fyName, setFyName] = useState(settings.fiscalYear);
  const [currency, setCurrency] = useState(settings.currencyCode);

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

  return (
    <div className="space-y-6 bg-slate-50 dark:bg-slate-950">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Workspace Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Configure chart of accounts, fiscal year calendars, active currency models, and staff accounts.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Side: General settings forms */}
        <div className="xl:col-span-4 space-y-6">
          {/* General Preferences */}
          <form onSubmit={handleSaveGeneralSettings} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
              <Building className="w-4.5 h-4.5 text-blue-900" /> Organization Settings
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Company / Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reporting Fiscal Year</label>
                <input
                  type="text"
                  value={fyName}
                  onChange={(e) => setFyName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-2.5 outline-none focus:border-blue-900 dark:focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Functional Currency</label>
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

          {/* User management list */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5 flex items-center gap-2">
              <UserIcon className="w-4.5 h-4.5 text-blue-900" /> Active Team Roles
            </h3>
            
            <div className="space-y-3">
              {users.map((usr) => (
                <div key={usr.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-blue-900 font-extrabold flex items-center justify-center text-xs">
                    {usr.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">{usr.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">{usr.email}</p>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-100/50">
                    {usr.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
                <p className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg">{coaError}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Code (Unique ID)</label>
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
                  <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Name</label>
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
                  <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Classification Category</label>
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
                  <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Normal Book Balance</label>
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
                  <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Account Description</label>
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
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
                  <th className="py-2.5 px-4 w-20">Code</th>
                  <th className="py-2.5 px-4 w-40">Account Name</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 w-28">Type</th>
                  <th className="py-2.5 px-4 w-20">Normal</th>
                  <th className="py-2.5 px-4 w-20">Status</th>
                  <th className="py-2.5 px-4 w-20 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {accounts.map((acc) => {
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
                      <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingDesc}
                            onChange={(e) => setEditingDesc(e.target.value)}
                            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs w-full outline-none font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-900 dark:focus:border-blue-500"
                          />
                        ) : (
                          acc.description
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
        </div>
      </div>
    </div>
  );
}
