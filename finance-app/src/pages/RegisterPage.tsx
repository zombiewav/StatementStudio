import React, { useState } from 'react';
import { ArrowRight, BarChart3, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import AuroraBackground from '../components/landing/AuroraBackground';

interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  password: string;
  role: string;
  createdAt: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    company: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
    // Clear errors when user starts typing
    if (error) setError('');
  };

  const validateForm = (): boolean => {
    // Check for empty fields
    if (!formData.fullName.trim()) {
      setError('Full name is required');
      return false;
    }

    if (!formData.email.trim()) {
      setError('Email address is required');
      return false;
    }

    if (!formData.company.trim()) {
      setError('Company/Organization name is required');
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

    if (!formData.confirmPassword) {
      setError('Please confirm your password');
      return false;
    }

    // Check for password mismatch
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    // Check for duplicate email
    const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.some((user) => user.email === formData.email.toLowerCase())) {
      setError('An account with this email already exists');
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Simulate a brief delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get existing users
      const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');

      // Create new user object
      const newUser: User = {
        id: Date.now().toString(),
        name: formData.fullName.trim(),
        email: formData.email.toLowerCase().trim(),
        company: formData.company.trim(),
        password: formData.password, // Note: In production, this would be hashed
        role: 'Administrator',
        createdAt: new Date().toISOString(),
      };

      // Add user to array
      users.push(newUser);

      // Save to localStorage
      localStorage.setItem('users', JSON.stringify(users));

      setSuccess('Account created successfully! Redirecting to login...');

      // Redirect to login after a brief delay
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-black text-white min-h-screen overflow-hidden flex flex-col items-center justify-center relative">
      {/* AURORA BACKGROUND */}
      <AuroraBackground />

      {/* CONTENT */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          {/* CARD */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 space-y-8">
            
            {/* HEADER */}
            <div className="space-y-4 text-center">
              {/* LOGO */}
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
              </div>

              <h1 className="text-3xl font-bold text-white">
                Create Your Account
              </h1>

              <p className="text-slate-400 text-sm">
                Set up your StatementStudio workspace.
              </p>
            </div>

            {/* ERROR MESSAGE */}
            {error && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {/* SUCCESS MESSAGE */}
            {success && (
              <div className="bg-green-950/50 border border-green-800 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-200">{success}</p>
              </div>
            )}

            {/* FORM */}
            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleRegister(); }}>
              {/* FULL NAME FIELD */}
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              {/* EMAIL FIELD */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="you@example.com"
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              {/* COMPANY FIELD */}
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-300 mb-2">
                  Company / Organization Name
                </label>
                <input
                  id="company"
                  type="text"
                  value={formData.company}
                  onChange={handleInputChange}
                  placeholder="Your Company"
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              {/* PASSWORD FIELD */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              {/* CONFIRM PASSWORD FIELD */}
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
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                />
              </div>

              {/* CREATE ACCOUNT BUTTON */}
              <button
                onClick={handleRegister}
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/20 flex items-center justify-center gap-2 mt-6 disabled:opacity-70"
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            {/* FOOTER TEXT */}
            <div className="text-center">
              <p className="text-slate-400 text-sm">
                Already have an account?{' '}
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

          {/* BACK TO HOME */}
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
