import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { WorkspaceSyncStatus } from './components/WorkspaceSyncStatus';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { TransactionHistory } from './pages/TransactionHistory';
import { Review } from './pages/Review';
import { OtherAdjustments } from './pages/OtherAdjustments';
import { JournalEntries } from './pages/JournalEntries';
import { GeneralLedger } from './pages/GeneralLedger';
import { TrialBalance } from './pages/TrialBalance';
import { FinancialStatements } from './pages/FinancialStatements';
import { Analytics } from './pages/Analytics';
import { ProjectsPage } from './pages/ProjectsPage';
import { Settings } from './pages/Settings';
import { ClosingEntries } from './pages/ClosingEntries';
import { PostClosingTrialBalance } from './pages/PostClosingTrialBalance';
import { ClosingEntriesDirect } from './pages/ClosingEntriesDirect';
import { CLOSING_FLOW, CLOSING_PAGES_ENABLED } from './lib/featureFlags';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { RedirectIfSignedIn } from './components/auth/RedirectIfSignedIn';
import { AuthProvider } from './context/AuthContext';

function DashboardLayout() {
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  // Set from Review's "Continue" on a draft — looked up fresh each render
  // so Transactions always sees the current saved state, then cleared once
  // Transactions has consumed it.
  // `post` is set by Review's "Post" button: the draft is loaded and posted
  // straight away with the form's own validation, instead of being edited.
  const [resumeDraft, setResumeDraft] = useState<{ id: string; post: boolean } | null>(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const { draftTransactions } = useFinance();
  const draftToResume = resumeDraft ? draftTransactions.find(d => d.id === resumeDraft.id) || null : null;
  // Depreciation and Retirement of PPE are recorded in Other Adjustments, so their drafts resume there.
  const pageForDraft = (draftId: string) => {
    const category = draftTransactions.find(d => d.id === draftId)?.category;
    return category === 'depreciation' || category === 'retirement-of-ppe' ? 'other-adjustments' : 'transactions';
  };

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return (
          <Transactions
            draftToResume={draftToResume}
            autoPostDraft={!!resumeDraft?.post}
            onDraftResumed={() => setResumeDraft(null)}
            onDraftSaved={() => setActivePage('review')}
            onDraftPosted={(message) => { setReviewNotice(message); setActivePage('review'); }}
            onNavigate={setActivePage}
          />
        );
      case 'transaction-history':
        return <TransactionHistory onNavigate={setActivePage} />;
      case 'other-adjustments':
        return (
          <OtherAdjustments
            draftToResume={draftToResume}
            autoPostDraft={!!resumeDraft?.post}
            onDraftResumed={() => setResumeDraft(null)}
            onDraftPosted={(message) => { setReviewNotice(message); setActivePage('review'); }}
          />
        );
      case 'review':
        return <Review
          onContinueDraft={(draftId) => { setResumeDraft({ id: draftId, post: false }); setActivePage(pageForDraft(draftId)); }}
          onPostDraft={(draftId) => { setResumeDraft({ id: draftId, post: true }); setActivePage(pageForDraft(draftId)); }}
          notice={reviewNotice}
          onNoticeShown={() => setReviewNotice('')}
        />;
      case 'journals':
        return <JournalEntries searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />;
      case 'ledger':
        return <GeneralLedger />;
      case 'trial-balance':
        return <TrialBalance />;
      case 'statements':
        return <FinancialStatements onNavigate={setActivePage} />;
      case 'analytics':
        return <Analytics />;
      case 'projects':
        return <ProjectsPage />;
      case 'settings':
        return <Settings />;
      case 'closing-entries':
        return !CLOSING_PAGES_ENABLED ? <Dashboard /> : CLOSING_FLOW === 'direct' ? <ClosingEntriesDirect /> : <ClosingEntries />;
      case 'post-closing-ledger':
        return CLOSING_PAGES_ENABLED ? <GeneralLedger mode="post" /> : <Dashboard />;
      case 'post-closing-trial-balance':
        return CLOSING_PAGES_ENABLED ? <PostClosingTrialBalance /> : <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-shell flex h-screen font-sans overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Sidebar Navigation */}
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        isOpen={isMobileMenuOpen} 
        setIsOpen={setIsMobileMenuOpen} 
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
      />
      
      {/* Main Content Area */}
      <div
        className={`app-shell flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 print:block print:h-auto print:overflow-visible print:pl-0 ${
          isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        {/* Top Navbar */}
        <Navbar 
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          onSearchSubmit={() => setActivePage('journals')}
          onOpenSettings={() => setActivePage('settings')}
        />

        {/* Scrollable Content Container */}
        <WorkspaceSyncStatus />
        <main className="app-shell flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5 z-10 custom-scrollbar select-none print:overflow-visible print:p-0">
          <div className="max-w-[1520px] mx-auto pb-10">
            <div key={activePage} className="page-enter">
              {renderActivePage()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function AppRoutes(): React.ReactElement {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={<RedirectIfSignedIn><LandingPage onEnterApp={() => navigate('/login')} /></RedirectIfSignedIn>}
      />
      <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
      <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <FinanceProvider>
        <AppRoutes />
      </FinanceProvider>
    </AuthProvider>
  );
}
