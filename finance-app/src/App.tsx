import React, { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { FinanceProvider } from './context/FinanceContext';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { TransactionHistory } from './pages/TransactionHistory';
import { Review } from './pages/Review';
import { JournalEntries } from './pages/JournalEntries';
import { GeneralLedger } from './pages/GeneralLedger';
import { TrialBalance } from './pages/TrialBalance';
import { FinancialStatements } from './pages/FinancialStatements';
import { Analytics } from './pages/Analytics';
import { ProjectsPage } from './pages/ProjectsPage';
import { Settings } from './pages/Settings';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function DashboardLayout() {
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return <Transactions />;
      case 'transaction-history':
        return <TransactionHistory />;
      case 'review':
        return <Review />;
      case 'journals':
        return <JournalEntries />;
      case 'ledger':
        return <GeneralLedger />;
      case 'trial-balance':
        return <TrialBalance />;
      case 'statements':
        return <FinancialStatements />;
      case 'analytics':
        return <Analytics />;
      case 'projects':
        return <ProjectsPage />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-shell flex h-screen font-sans overflow-hidden">
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
        className={`app-shell flex-1 flex flex-col h-full overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        {/* Top Navbar */}
        <Navbar 
          onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />

        {/* Scrollable Content Container */}
        <main className="app-shell flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5 z-10 custom-scrollbar select-none">
          <div className="max-w-[1520px] mx-auto pb-10">
            {renderActivePage()}
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
        element={<LandingPage onEnterApp={() => navigate('/login')} />}
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
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
    <FinanceProvider>
      <AppRoutes />
    </FinanceProvider>
  );
}
