import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import axios from 'axios';
import PasswordInput from '@/components/shared/PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100';

export default function DevPortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('ceo@codes-ai.uk');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${API_URL}/api/v1/dev-portal/auth/login`,
        { email, password },
        { withCredentials: true },
      );
      if (res.data.success) {
        // Primary auth uses the httpOnly cookie set by the backend.
        // Fallback for browsers that drop cross-port cookies in
        // localhost dev: also stash the token in localStorage so the
        // dev-portal hook can send it as Authorization: Bearer when no
        // cookie comes back. Cleared on logout. Cookie remains the
        // production path; this is dev-only.
        const token = res.data?.data?.token;
        if (token) {
          try { localStorage.setItem('dev_portal_token', token); } catch { /* ignore */ }
        }
        router.push('/dev-portal');
      } else {
        setError(res.data.error?.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Connection failed. Is the API running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>VibeStudio — Sign In</title></Head>
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '50px 50px' }} />
        </div>

        <div className="relative w-full max-w-md mx-4">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <span className="text-white text-2xl font-black">V</span>
            </div>
            <h1 className="text-2xl font-bold text-white">VibeStudio</h1>
            <p className="text-sm text-gray-500 mt-1">Vibe Engineering Studio</p>
          </div>

          {/* Login Card */}
          <div className="bg-[#161922] border border-[#252830] rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0f1117] border border-[#252830] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  required
                  placeholder="Enter password"
                  className="w-full pl-4 pr-11 py-3 bg-[#0f1117] border border-[#252830] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
                />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Signing in...
                  </span>
                ) : 'Sign In to Dev Portal'}
              </button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 pt-5 border-t border-[#252830]">
              <p className="text-2xs text-gray-600 mb-3 font-medium uppercase tracking-wider">Demo Accounts</p>
              <div className="space-y-1.5">
                {[
                  { email: 'ceo@codes-ai.uk', label: 'CEO & Founder', role: 'ceo', color: 'bg-amber-500' },
                ].map(demo => (
                  <button
                    key={demo.email}
                    onClick={() => { setEmail(demo.email); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0f1117] hover:bg-[#1a1d27] border border-[#252830] transition-colors text-left"
                  >
                    <div className={`w-6 h-6 rounded-full ${demo.color} flex items-center justify-center`}>
                      <span className="text-white text-2xs font-bold">{demo.label[0]}</span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-300">{demo.email}</p>
                      <p className="text-2xs text-gray-600">{demo.label} — {demo.role}</p>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-2xs text-gray-600 mt-3">Click an account to pre-fill the email, then enter your password.</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-2xs text-gray-600 mt-6">
            VibeStudio — standalone Vibe Engineering Studio.
          </p>
        </div>
      </div>
    </>
  );
}
