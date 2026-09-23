import React, { useEffect, useState } from 'react';
import { ArrowRight, BarChart3, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import AuroraBackground from '../components/landing/AuroraBackground';
import { useFinance } from '../context/FinanceContext';
import { isValidEmail, normalizeEmail, OrgAccount, readOrgAccount } from '../lib/localAuth';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { updateSettings } = useFinance();

  // Only one organization lives in this browser's storage. If it's already
  // set up, there's nothing to register — send them to sign in instead.
  useEffect(() => {
    if (readOrgAccount(localStorage.getItem('orgAccount'))) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const [formData, setFormData] = useState({
    organizationName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
    if (error) setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.organizationName.trim()) {
      setError('Organization name is required');
      return false;
    }

    if (!isValidEmail(formData.email)) {
      setError('Enter a valid organization email');
      return false;
    }

    if (!formData.password) {
      setError('Password is required');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const orgAccount: OrgAccount = {
        organizationName: formData.organizationName.trim(),
        email: normalizeEmail(formData.email),
        password: formData.password,
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem('orgAccount', JSON.stringify(orgAccount));
      localStorage.setItem('isLoggedIn', 'true');
      updateSettings({ organizationName: orgAccount.organizationName });

      setSuccess('Organization set up! Taking you to your workspace...');

      // A full page load, not client-side navigate(): FinanceProvider
      // mounts once at the app root and reads settings from localStorage
      // only at that first mount, so a SPA-only transition would land in
      // the app still showing the default organization name.
      setTimeout(() => {
        window.location.href = '/app/dashboard';
      }, 800);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
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
                Set Up Your Organization
              </h1>

              <p className="text-slate-400 text-sm">
                Create one shared login your whole organization uses to access this workspace.
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

            <form className="space-y-5" onSubmit={handleRegister}>
              <div>
                <label htmlFor="organizationName" className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Name
                </label>
                <input
                  id="organizationName"
                  type="text"
                  value={formData.organizationName}
                  onChange={handleInputChange}
                  placeholder="Your Organization"
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="organization@example.com"
                  disabled={isLoading}
                  autoComplete="username"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Organization Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 pr-12 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                  />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">Anyone in your organization who knows this password can sign in.</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/20 flex items-center justify-center gap-2 mt-6 disabled:opacity-70"
              >
                {isLoading ? 'Setting Up...' : 'Set Up Organization'}
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <div className="text-center">
              <p className="text-slate-400 text-sm">
                Already set up?{' '}
                <button
                  onClick={() => navigate('/login')}
                  disabled={isLoading}
                  className="text-slate-300 hover:text-white font-medium transition-colors disabled:opacity-50"
                >
                  Sign In
                </button>
              </p>
            </div>
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

export default RegisterPage;
