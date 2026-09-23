import React, { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, AlertCircle, CheckCircle, Building2, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import AuroraBackground from '../components/landing/AuroraBackground';
import { credentialsMatch, OrgAccount, readOrgAccount } from '../lib/localAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [orgAccount, setOrgAccount] = useState<OrgAccount | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Nothing to sign into yet on this browser — send them to set one up.
  useEffect(() => {
    const account = readOrgAccount(localStorage.getItem('orgAccount'));
    if (!account) {
      localStorage.removeItem('isLoggedIn');
      navigate('/register', { replace: true });
      return;
    }
    setOrgAccount(account);
    setEmail(account.email || '');
  }, [navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (orgAccount?.email && !email.trim()) {
      setError('Organization email is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    if (!orgAccount) {
      return;
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!credentialsMatch(orgAccount, email, password)) {
        setError('Incorrect organization email or password.');
        setIsLoading(false);
        return;
      }

      setSuccess('Login successful! Redirecting...');
      localStorage.setItem('isLoggedIn', 'true');

      // A full page load, not client-side navigate(): FinanceProvider
      // mounts once at the app root and reads currentUser/users from
      // localStorage only at that first mount, so a SPA-only transition
      // would land in the app still showing whatever was there before.
      setTimeout(() => {
        window.location.href = '/app/dashboard';
      }, 1000);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen overflow-hidden flex flex-col items-center justify-center relative">
      <AuroraBackground />

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 space-y-8">

            <div className="space-y-4 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
              </div>

              <h1 className="text-3xl font-bold text-white">
                Welcome Back
              </h1>

              {orgAccount && (
                <div className="inline-flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-full px-4 py-1.5 text-sm text-slate-200 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  {orgAccount.organizationName}
                </div>
              )}

              <p className="text-slate-400 text-sm">
                Enter your organization's password to access the workspace.
              </p>
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-950/50 border border-green-800 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-200">{success}</p>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleLogin}>
              {orgAccount?.email && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Organization Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                    placeholder="organization@example.com"
                    disabled={isLoading}
                    autoComplete="username"
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                  />
                </div>
              )}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                    placeholder="••••••••"
                    disabled={isLoading}
                    autoFocus={!orgAccount?.email}
                    autoComplete="current-password"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 pr-12 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                  />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/20 flex items-center justify-center gap-2 mt-6 disabled:opacity-70"
              >
                {isLoading ? 'Logging in...' : 'Login'}
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </div>

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/')}
              disabled={isLoading}
              className="text-slate-400 hover:text-slate-300 text-sm transition-colors disabled:opacity-50"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
