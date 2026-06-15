import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { 
  Account, 
  JournalEntry, 
  Project, 
  AuditLog, 
  User, 
  AppSettings, 
  ClassificationRule 
} from '../types';

// Extended classification rule shape used by the rule-based classification
// engine below. It builds on the base `ClassificationRule` shape from
// ../types by adding `expenseType` and `suggestedProgram`, which feed the
// Program -> Expense -> Journal Entry workflow preview added to the
// Transactions form. Defined locally so the shared ../types module does not
// need to change. The original fields (keyword, debitAccountCode,
// creditAccountCode, description) keep their existing meaning and behavior.
export interface ClassificationRuleWithWorkflow extends ClassificationRule {
  expenseType: string;
  suggestedProgram: string;
}

// Standard Chart of Accounts
const INITIAL_ACCOUNTS: Account[] = [
  // Assets (Normal: Debit)
  { code: '1010', name: 'Cash & Cash Equivalents', type: 'Assets', normalBalance: 'Debit', description: 'Primary business checking and cash accounts', isActive: true },
  { code: '1200', name: 'Receivables', type: 'Assets', normalBalance: 'Debit', description: 'Uncollected amounts due from sponsors, partners, and other receivables', isActive: true },
  { code: '1500', name: 'Equipment & Tools', type: 'Assets', normalBalance: 'Debit', description: 'Laptops, computers, hardware, tools, and other equipment used by the organization', isActive: true },
  { code: '1600', name: 'Property & Facilities', type: 'Assets', normalBalance: 'Debit', description: 'Real estate and facilities owned/held by the organization', isActive: true },
  
  // Liabilities (Normal: Credit)
  { code: '2010', name: 'Accounts Payable', type: 'Liabilities', normalBalance: 'Credit', description: 'Outstanding unpaid bills to vendors', isActive: true },
  { code: '2200', name: 'Loans & Financial Obligations', type: 'Liabilities', normalBalance: 'Credit', description: 'Loans and other financial obligations payable within a year', isActive: true },
  { code: '2300', name: 'Accrued Liabilities', type: 'Liabilities', normalBalance: 'Credit', description: 'Accrued unpaid expenses such as taxes or interest', isActive: true },
  
  // Fund Balance / Equity (Normal: Credit)
  { code: '3010', name: 'General Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Unrestricted accumulated fund balances', isActive: true },
  { code: '3020', name: 'Restricted Fund Balance', type: 'Fund Balance', normalBalance: 'Credit', description: 'Donor-restricted capital or specific reserves', isActive: true },
  
  // Revenue (Normal: Credit)
  { code: '4010', name: 'Organization Income', type: 'Revenue', normalBalance: 'Credit', description: 'Income earned through the organization’s programs and services', isActive: true },
  { code: '4020', name: 'Government Grants', type: 'Revenue', normalBalance: 'Credit', description: 'State and federal funding allocations', isActive: true },
  { code: '4030', name: 'Donations & Sponsorships', type: 'Revenue', normalBalance: 'Credit', description: 'Contributions and sponsorships received from private donors and sponsors', isActive: true },
  
  // Expenses (Normal: Debit)
  { code: '5010', name: 'Salaries & Wages', type: 'Expenses', normalBalance: 'Debit', description: 'Staff payroll, social security, and benefits', isActive: true },
  { code: '5020', name: 'Rent Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Monthly lease cost for office spaces', isActive: true },
  { code: '5030', name: 'Utilities Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Electricity, water, gas, and internet fees', isActive: true },
  { code: '5040', name: 'Office Supplies', type: 'Expenses', normalBalance: 'Debit', description: 'Stationary, postage, and administrative sundries', isActive: true },
  { code: '5050', name: 'Travel & Transportation', type: 'Expenses', normalBalance: 'Debit', description: 'Business travel, flights, hotels, and mileage', isActive: true },
  // Added to support the Training Expense and Maintenance Expense
  // classification categories used by the rule-based engine below. These are
  // additive entries only — they plug into the existing generic balance,
  // totals, and statement calculations without any logic changes.
  { code: '5060', name: 'Training & Seminar Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for staff training, seminars, workshops, and certifications', isActive: true },
  { code: '5070', name: 'Repairs & Maintenance Expense', type: 'Expenses', normalBalance: 'Debit', description: 'Costs for repairing and maintaining equipment and facilities', isActive: true },
];

// Initial Projects
const INITIAL_PROJECTS: Project[] = [
  { id: 'proj-1', name: 'General Fund Operations', budget: 500000, status: 'Active', description: 'Standard administrative and overhead operations' },
  { id: 'proj-2', name: 'Leadership Development Program', budget: 120000, status: 'Active', description: 'Core product research and engineering sprint' },
  { id: 'proj-3', name: 'Community Outreach Program', budget: 85000, status: 'Active', description: 'Annual community academic support program' },
  { id: 'proj-4', name: 'Fundraising Program 2026', budget: 150000, status: 'Active', description: 'Applied science exploration and dataset synthesis' },
];

// Initial Journal Entries
const INITIAL_JOURNALS: JournalEntry[] = [
  {
    id: 'je-1',
    reference: 'JE-0001',
    date: '2026-01-01',
    description: 'Initial Capital Funding',
    project: 'General Fund',
    lines: [
      { accountCode: '1010', debit: 150000, credit: 0 },
      { accountCode: '3010', debit: 0, credit: 150000 }
    ]
  },
  {
    id: 'je-2',
    reference: 'JE-0002',
    date: '2026-01-15',
    description: 'Organization Laptop Purchase',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1500', debit: 25000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 25000 }
    ]
  },
  {
    id: 'je-3',
    reference: 'JE-0003',
    date: '2026-02-01',
    description: 'Sponsor Donation Received',
    project: 'General Fund Operations',
    lines: [
      { accountCode: '1010', debit: 50000, credit: 0 },
      { accountCode: '2200', debit: 0, credit: 50000 }
    ]
  },
  {
    id: 'je-4',
    reference: 'JE-0004',
    date: '2026-02-12',
    description: 'Paid Q1 Office Lease Rent',
    project: 'General Fund',
    lines: [
      { accountCode: '5020', debit: 6000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 6000 }
    ]
  },
  {
    id: 'je-5',
    reference: 'JE-0005',
    date: '2026-03-01',
    description: 'Fundraising Event Collection',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1200', debit: 35000, credit: 0 },
      { accountCode: '4010', debit: 0, credit: 35000 }
    ]
  },
  {
    id: 'je-6',
    reference: 'JE-0006',
    date: '2026-03-15',
    description: 'Electric and Water Utilities Payment',
    project: 'General Fund',
    lines: [
      { accountCode: '5030', debit: 4500, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 4500 }
    ]
  },
  {
    id: 'je-7',
    reference: 'JE-0007',
    date: '2026-04-05',
    description: 'University Grant Received',
    project: 'Fundraising Program 2026',
    lines: [
      { accountCode: '1010', debit: 40000, credit: 0 },
      { accountCode: '4020', debit: 0, credit: 40000 }
    ]
  },
  {
    id: 'je-8',
    reference: 'JE-0008',
    date: '2026-04-20',
    description: 'Fundraising Event Collection',
    project: 'Leadership Development Program',
    lines: [
      { accountCode: '1010', debit: 20000, credit: 0 },
      { accountCode: '1200', debit: 0, credit: 20000 }
    ]
  },
  {
    id: 'je-9',
    reference: 'JE-0009',
    date: '2026-05-10',
    description: 'Q1 Staff Salaries Payment',
    project: 'General Fund Operations',
    lines: [
      { accountCode: '5010', debit: 18000, credit: 0 },
      { accountCode: '1010', debit: 0, credit: 18000 }
    ]
  },
  {
    id: 'je-10',
    reference: 'JE-0010',
    date: '2026-05-15',
    description: 'Travel Expenses Billed to Vendor',
    project: 'Community Outreach Program',
    lines: [
      { accountCode: '5050', debit: 3500, credit: 0 },
      { accountCode: '2010', debit: 0, credit: 3500 }
    ]
  }
];

// Default Auto-classification rules
//
// Each rule now carries `expenseType` and `suggestedProgram` in addition to
// the original `debitAccountCode`, `creditAccountCode`, and `description`.
// The original fields keep doing exactly what they did before (driving the
// Debit/Credit account auto-fill and memo suggestion on the Transactions
// form). The two new fields are additional, forward-looking classification
// data for the Program -> Expense -> Journal Entry workflow preview and do
// not change any existing balance, ledger, or statement calculations.
//
// `suggestedProgram` values reference either an existing project/fund name
// (e.g. 'General Operations', matching the Program / Project / Fund
// Allocation list) or one of the newer Program categories (e.g. 'Research
// Program', 'Faculty Development Program', 'Community Outreach Program',
// 'Extension Program') used by the Program -> Expense workflow preview.
//
// Rules are ordered so that more specific keywords are checked before more
// general ones that could otherwise match first (e.g. 'bond paper' before
// 'paper', 'printer ink' before both 'ink' and 'printer', 'ballpen' before
// 'pen', 'water bill' before 'water', 'electricity' before 'electric').
const DEFAULT_RULES: ClassificationRuleWithWorkflow[] = [
  // --- Utilities -----------------------------------------------------------
  { keyword: 'electricity', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Electricity Bill Payment' },
  { keyword: 'electric', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Electricity Utility Bill' },
  { keyword: 'power bill', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Power Bill Payment' },
  { keyword: 'water bill', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Water Bill Payment' },
  { keyword: 'water', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Water Utility Bill' },
  { keyword: 'internet', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Office Internet Fees' },
  { keyword: 'wifi', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Wifi / Internet Subscription' },
  { keyword: 'utility', expenseType: 'Utilities', suggestedProgram: 'General Fund Operations', debitAccountCode: '5030', creditAccountCode: '1010', description: 'Utility Payments' },

  // --- Office Supplies ------------------------------------------------------
  { keyword: 'bond paper', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Supplies Purchase' },
  { keyword: 'printer ink', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Ink and Toner Purchase' },
  { keyword: 'ink', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Ink Supplies' },
  { keyword: 'folder', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Document Folders and Filing Supplies' },
  { keyword: 'ballpen', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Ballpen and Writing Supplies' },
  { keyword: 'pen', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Supplies Stationary' },
  { keyword: 'notebook', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Notebooks and Writing Pads' },
  { keyword: 'paper', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Printer Paper and Ink' },
  { keyword: 'office supplies', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '1010', description: 'Office Administrative Supplies' },

  // --- Equipment Expense -----------------------------------------------------
  { keyword: 'laptop', expenseType: 'Equipment Expense', suggestedProgram: 'Research Program', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Developer Laptop Purchase' },
  { keyword: 'computer', expenseType: 'Equipment Expense', suggestedProgram: 'Research Program', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hardware Equipment Purchase' },
  { keyword: 'monitor', expenseType: 'Equipment Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Monitor Purchase' },
  { keyword: 'printer', expenseType: 'Equipment Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Printer Equipment Purchase' },
  { keyword: 'equipment', expenseType: 'Equipment Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1500', creditAccountCode: '1010', description: 'General Equipment Purchase' },
  { keyword: 'hardware', expenseType: 'Equipment Expense', suggestedProgram: 'Research Program', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Computer Hardware' },
  { keyword: 'server', expenseType: 'Equipment Expense', suggestedProgram: 'Research Program', debitAccountCode: '1500', creditAccountCode: '1010', description: 'Hosting Server Equipment' },

  // --- Training Expense -------------------------------------------------------
  { keyword: 'seminar', expenseType: 'Training Expense', suggestedProgram: 'Faculty Development Program', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Seminar / Conference Attendance Fee' },
  { keyword: 'workshop', expenseType: 'Training Expense', suggestedProgram: 'Faculty Development Program', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Workshop Training Fee' },
  { keyword: 'training', expenseType: 'Training Expense', suggestedProgram: 'Faculty Development Program', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Staff Training Expense' },
  { keyword: 'certification', expenseType: 'Training Expense', suggestedProgram: 'Faculty Development Program', debitAccountCode: '5060', creditAccountCode: '1010', description: 'Professional Certification Fee' },

  // --- Travel Expense ----------------------------------------------------------
  { keyword: 'travel', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Business Travel Reimbursement' },
  { keyword: 'hotel', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Hotel Lodging Expenses' },
  { keyword: 'flight', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Flight Ticket Fare' },
  { keyword: 'taxi', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Local Transport Expense' },
  { keyword: 'transportation', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Transportation Expense' },
  { keyword: 'fare', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Fare / Local Transport Expense' },
  { keyword: 'fuel', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Fuel Expense' },
  { keyword: 'gasoline', expenseType: 'Travel Expense', suggestedProgram: 'Extension Program', debitAccountCode: '5050', creditAccountCode: '1010', description: 'Gasoline Expense' },

  // --- Maintenance Expense ----------------------------------------------------
  { keyword: 'repair', expenseType: 'Maintenance Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Repair Service Expense' },
  { keyword: 'maintenance', expenseType: 'Maintenance Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Maintenance Service Expense' },
  { keyword: 'fixing', expenseType: 'Maintenance Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5070', creditAccountCode: '1010', description: 'Equipment Fixing / Repair Expense' },

  // --- Rent / Lease (Miscellaneous Expense) -----------------------------------
  { keyword: 'rent', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5020', creditAccountCode: '1010', description: 'Monthly Office Rental Payment' },
  { keyword: 'lease', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5020', creditAccountCode: '1010', description: 'Office Space Lease' },

  // --- Payroll (Miscellaneous Expense) ------------------------------------------
  { keyword: 'salary', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5010', creditAccountCode: '1010', description: 'Staff Payroll Disbursement' },
  { keyword: 'wage', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5010', creditAccountCode: '1010', description: 'Hourly Wages Pay' },
  { keyword: 'payroll', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '5010', creditAccountCode: '1010', description: 'General Staff Payroll' },

  // --- Revenue & Funding ---------------------------------------------------------
  // These postings are not expenses, so `expenseType` is set to the generic
  // 'Miscellaneous Expense' placeholder for structural consistency only.
  { keyword: 'consulting', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1010', creditAccountCode: '4010', description: 'Client Consulting Services' },
  { keyword: 'service', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1010', creditAccountCode: '4010', description: 'Professional Services Rendered' },
  { keyword: 'billed', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1200', creditAccountCode: '4010', description: 'Customer Invoice Billed' },
  { keyword: 'invoice', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1200', creditAccountCode: '4010', description: 'Customer Milestone Invoice' },
  { keyword: 'grant', expenseType: 'Miscellaneous Expense', suggestedProgram: 'Research Program', debitAccountCode: '1010', creditAccountCode: '4020', description: 'Public Funding Grant Receipt' },
  { keyword: 'donation', expenseType: 'Miscellaneous Expense', suggestedProgram: 'Community Outreach Program', debitAccountCode: '1010', creditAccountCode: '4030', description: 'Charitable Donation Received' },
  { keyword: 'sponsor', expenseType: 'Miscellaneous Expense', suggestedProgram: 'Community Outreach Program', debitAccountCode: '1010', creditAccountCode: '4030', description: 'Sponsorship Contribution' },
  { keyword: 'loan', expenseType: 'Miscellaneous Expense', suggestedProgram: 'General Fund Operations', debitAccountCode: '1010', creditAccountCode: '2200', description: 'Bank Loan Capital Funding' },

  // --- Office Supplies purchased on credit (Accounts Payable) --------------------
  { keyword: 'vendor bill', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '2010', description: 'Office Supplies Billed by Vendor' },
  { keyword: 'on account', expenseType: 'Office Supplies', suggestedProgram: 'General Fund Operations', debitAccountCode: '5040', creditAccountCode: '2010', description: 'Vendor Purchase on Credit' }
];

const INITIAL_LOGS: AuditLog[] = [
  { id: 'log-1', timestamp: '2026-05-27T01:00:00Z', action: 'System Init', details: 'Initialized Chart of Accounts and default historical transactions.', user: 'System' },
];

const INITIAL_USERS: User[] = [
  { id: 'usr-1', name: 'Khurt Alex', email: 'finance@organization.edu', role: 'Administrator' },
  { id: 'usr-2', name: 'Clarissa Santos', email: 'treasurer@organization.edu', role: 'Accountant' },
  { id: 'usr-3', name: 'John Doe', email: 'auditor@organization.edu', role: 'Auditor' }
];

interface FinanceContextType {
  accounts: Account[];
  journalEntries: JournalEntry[];
  projects: Project[];
  auditLogs: AuditLog[];
  users: User[];
  settings: AppSettings;
  activeUser: User;
  classificationRules: ClassificationRuleWithWorkflow[];
  
  addJournalEntry: (date: string, description: string, project: string, lines: { accountCode: string; debit: number; credit: number }[]) => JournalEntry;
  deleteJournalEntry: (id: string) => void;
  
  addAccount: (account: Account) => void;
  updateAccount: (code: string, updated: Partial<Account>) => void;
  
  addProject: (name: string, budget: number, description: string) => void;
  updateProject: (id: string, updated: Partial<Project>) => void;
  
  updateSettings: (updated: Partial<AppSettings>) => void;
  changeActiveUser: (userId: string) => void;
  
  formatCurrency: (value: number) => string;
  suggestTransactionClassification: (name: string) => { 
    expenseType: string; 
    suggestedProgram: string; 
    debitAccountCode: string; 
    creditAccountCode: string; 
    defaultDesc: string; 
  } | null;
  
  accountBalances: Record<string, number>;
  totals: Record<string, number>; // Assets, Liabilities, etc.
  netIncome: number;
  isBalanced: boolean;
  clearAllData: () => void;
  loadSampleData: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const local = localStorage.getItem('ss_accounts');
    return local ? JSON.parse(local) : INITIAL_ACCOUNTS;
  });

  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const local = localStorage.getItem('ss_journals');
    return local ? JSON.parse(local) : INITIAL_JOURNALS;
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const local = localStorage.getItem('ss_projects');
    return local ? JSON.parse(local) : INITIAL_PROJECTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const local = localStorage.getItem('ss_audit_logs');
    return local ? JSON.parse(local) : INITIAL_LOGS;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const local = localStorage.getItem('ss_settings');
    return local ? JSON.parse(local) : {
      fiscalYear: 'FY 2026',
      organizationName: 'Bicol University',
      currencySymbol: '₱',
      currencyCode: 'PHP',
    };
  });

  const [users] = useState<User[]>(INITIAL_USERS);
  const [activeUser, setActiveUser] = useState<User>(INITIAL_USERS[0]);
  const [classificationRules] = useState<ClassificationRuleWithWorkflow[]>(DEFAULT_RULES);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('ss_accounts', JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem('ss_journals', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('ss_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('ss_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('ss_settings', JSON.stringify(settings));
  }, [settings]);

  const logAudit = (action: string, details: string) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      action,
      details,
      user: activeUser.name,
    };
    setAuditLogs(prev => [newLog, ...prev].slice(0, 100)); // Cap at 100 logs
  };

  // Rule Based Classifier
  //
  // Looks up the first rule whose keyword appears in the transaction name and
  // returns its full classification payload: the original debit/credit
  // account suggestions and description (unchanged behavior), plus the new
  // `expenseType` and `suggestedProgram` fields for the Program -> Expense ->
  // Journal Entry workflow preview.
  const suggestTransactionClassification = (name: string) => {
    if (!name || name.trim().length === 0) return null;
    const lowerName = name.toLowerCase();
    for (const rule of classificationRules) {
      if (lowerName.includes(rule.keyword)) {
        return {
          expenseType: rule.expenseType,
          suggestedProgram: rule.suggestedProgram,
          debitAccountCode: rule.debitAccountCode,
          creditAccountCode: rule.creditAccountCode,
          defaultDesc: rule.description
        };
      }
    }
    return null;
  };

  // Helpers to add data
  const addJournalEntry = (
    date: string, 
    description: string, 
    project: string, 
    lines: { accountCode: string; debit: number; credit: number }[]
  ) => {
    // Generate simple sequence code
    const lastEntry = journalEntries
      .filter(e => e.reference.startsWith('JE-'))
      .sort((a, b) => b.reference.localeCompare(a.reference))[0];
    
    let nextNum = 1;
    if (lastEntry) {
      const match = lastEntry.reference.match(/JE-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    const reference = `JE-${String(nextNum).padStart(4, '0')}`;
    const newEntry: JournalEntry = {
      id: `je-${Date.now()}`,
      reference,
      date,
      description,
      project,
      lines
    };

    setJournalEntries(prev => [...prev, newEntry]);
    logAudit('Create Journal Entry', `Posted journal entry ${reference}: ${description} (${settings.currencySymbol}${lines.reduce((s, l) => s + l.debit, 0).toLocaleString()})`);
    return newEntry;
  };

  const deleteJournalEntry = (id: string) => {
    const entry = journalEntries.find(e => e.id === id);
    if (entry) {
      setJournalEntries(prev => prev.filter(e => e.id !== id));
      logAudit('Delete Journal Entry', `Deleted journal entry ${entry.reference}: ${entry.description}`);
    }
  };

  const addAccount = (account: Account) => {
    if (accounts.some(a => a.code === account.code)) {
      throw new Error(`Account code ${account.code} already exists.`);
    }
    setAccounts(prev => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)));
    logAudit('Add Account', `Created account ${account.code} - ${account.name}`);
  };

  const updateAccount = (code: string, updated: Partial<Account>) => {
    setAccounts(prev => prev.map(a => a.code === code ? { ...a, ...updated } : a));
    const acc = accounts.find(a => a.code === code);
    if (acc) {
      logAudit('Update Account', `Updated account ${code} (${acc.name}) fields: ${Object.keys(updated).join(', ')}`);
    }
  };

  const addProject = (name: string, budget: number, description: string) => {
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name,
      budget,
      status: 'Active',
      description
    };
    setProjects(prev => [...prev, newProj]);
    logAudit('Add Activity', `Created new activity/program: ${name} (Budget: ${settings.currencySymbol}${budget.toLocaleString()})`);
  };

  const updateProject = (id: string, updated: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    const proj = projects.find(p => p.id === id);
    if (proj) {
      logAudit('Update Project', `Updated project ${proj.name}: ${Object.keys(updated).join(', ')}`);
    }
  };

  const updateSettings = (updated: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updated };
      logAudit('Update Settings', `Changed app settings: ${Object.keys(updated).join(', ')}`);
      return next;
    });
  };

  const changeActiveUser = (userId: string) => {
    const usr = users.find(u => u.id === userId);
    if (usr) {
      setActiveUser(usr);
      // Wait for state to apply
      setTimeout(() => logAudit('User Switch', `User switched to ${usr.name} (${usr.role})`), 50);
    }
  };

  const formatCurrency = (val: number): string => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(val));
    
    const symbol = settings.currencySymbol;
    // Strip original symbol and prepend user-defined symbol
    const cleanNum = formatted.replace(/[a-zA-Z$₱€£¥\s]+/g, '').trim();
    
    if (val < 0) {
      return `(${symbol}${cleanNum})`;
    }
    return `${symbol}${cleanNum}`;
  };

  const clearAllData = () => {
    setJournalEntries([]);
    logAudit('Clear Data', 'All financial journal entries have been cleared.');
  };

  const loadSampleData = () => {
    setAccounts(INITIAL_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNALS);
    setProjects(INITIAL_PROJECTS);
    logAudit('Load Sample Data', 'Reset database to original sample data.');
  };

  // Computations
  const accountBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    // Init all accounts to 0
    accounts.forEach(acc => {
      balances[acc.code] = 0;
    });

    // Aggregate postings
    journalEntries.forEach(je => {
      je.lines.forEach(line => {
        const acc = accounts.find(a => a.code === line.accountCode);
        if (!acc) return;
        
        const debitChange = line.debit;
        const creditChange = line.credit;

        if (acc.normalBalance === 'Debit') {
          balances[acc.code] = (balances[acc.code] || 0) + debitChange - creditChange;
        } else {
          balances[acc.code] = (balances[acc.code] || 0) + creditChange - debitChange;
        }
      });
    });

    return balances;
  }, [journalEntries, accounts]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {
      Assets: 0,
      Liabilities: 0,
      'Fund Balance': 0,
      Revenue: 0,
      Expenses: 0
    };

    accounts.forEach(acc => {
      const bal = accountBalances[acc.code] || 0;
      t[acc.type] = (t[acc.type] || 0) + bal;
    });

    return t;
  }, [accountBalances, accounts]);

  const netIncome = useMemo(() => {
    return totals.Revenue - totals.Expenses;
  }, [totals]);

  const isBalanced = useMemo(() => {
    // Total Assets = Total Liabilities + (Beginning Fund Balance + Net Income)
    const assets = totals.Assets;
    const liabilities = totals.Liabilities;
    const begFund = totals['Fund Balance'];
    const endingFund = begFund + netIncome;
    
    // We check if Total Assets matches Total Liabilities + Ending Fund Balance
    const difference = Math.abs(assets - (liabilities + endingFund));
    return difference < 0.01;
  }, [totals, netIncome]);

  return (
    <FinanceContext.Provider value={{
      accounts,
      journalEntries,
      projects,
      auditLogs,
      users,
      settings,
      activeUser,
      classificationRules,
      addJournalEntry,
      deleteJournalEntry,
      addAccount,
      updateAccount,
      addProject,
      updateProject,
      updateSettings,
      changeActiveUser,
      formatCurrency,
      suggestTransactionClassification,
      accountBalances,
      totals,
      netIncome,
      isBalanced,
      clearAllData,
      loadSampleData
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}