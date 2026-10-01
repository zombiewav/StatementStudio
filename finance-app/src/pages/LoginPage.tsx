import React, { useState } from 'react';
import { ArrowRight, BarChart3, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router';
import AuroraBackground from '../components/landing/AuroraBackground';
import { supabase } from '../lib/supabase';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setSuccess(''); setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setIsLoading(false);
    if (signInError) return setError(signInError.message);
    setSuccess('Login successful! Loading your workspace...');
    navigate('/app/dashboard', { replace: true });
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) return setError('Enter your email first, then choose Forgot password.');
    setError(''); setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
    setIsLoading(false);
    if (resetError) setError(resetError.message);
    else setSuccess('Check your email for the password reset link.');
  };

  return <div className="bg-black text-white min-h-screen overflow-hidden flex flex-col items-center justify-center relative">
    <AuroraBackground />
    <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8"><div className="max-w-md mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 space-y-8">
        <div className="space-y-4 text-center"><div className="flex justify-center mb-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center"><BarChart3 className="w-7 h-7 text-white" /></div></div><h1 className="text-3xl font-bold text-white">Welcome Back</h1><p className="text-slate-400 text-sm">Sign in to your saved StatementStudio workspace.</p></div>
        {error && <div className="bg-red-950/50 border border-red-800 rounded-lg p-4 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-200">{error}</p></div>}
        {success && <div className="bg-green-950/50 border border-green-800 rounded-lg p-4 flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" /><p className="text-sm text-green-200">{success}</p></div>}
        <form className="space-y-5" onSubmit={handleLogin}>
          <div><label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={isLoading} autoComplete="username" autoFocus className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50" /></div>
          <div><div className="flex items-center justify-between mb-2"><label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label><button type="button" onClick={handlePasswordReset} disabled={isLoading} className="text-xs text-blue-400 hover:text-blue-300">Forgot password?</button></div><div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" disabled={isLoading} autoComplete="current-password" className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-4 py-3 pr-12 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm disabled:opacity-50" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <button type="submit" disabled={isLoading} className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-70">{isLoading ? 'Logging in...' : 'Login'} {!isLoading && <ArrowRight className="w-4 h-4" />}</button>
        </form>
        <p className="text-center text-slate-400 text-sm">New here? <button onClick={() => navigate('/register')} disabled={isLoading} className="text-slate-200 hover:text-white font-medium">Create an account</button></p>
      </div><div className="text-center mt-6"><button onClick={() => navigate('/')} disabled={isLoading} className="text-slate-400 hover:text-slate-300 text-sm transition-colors">← Back to Home</button></div>
    </div></div>
  </div>;
};

export default LoginPage;
