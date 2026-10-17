import { useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { Lock, Mail, User, AlertCircle, ArrowRight, WifiOff } from 'lucide-react';
import { MegaHertzLogo } from '../components/MegaHertzLogo.js';

interface AuthPageProps {
  onAuthSuccess: (tokenData: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
    defaultStoreId?: string;
  }) => void;
  onBackToStorefront?: () => void;
}

export function AuthPage({ onAuthSuccess, onBackToStorefront }: AuthPageProps) {
  const isOnline = useOnlineStatus();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isOnline) {
      setError('An active internet connection is required to authenticate for the first time.');
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Store credentials locally for offline persistence
      localStorage.setItem('countwise_token', data.accessToken);
      localStorage.setItem('countwise_refresh_token', data.refreshToken);
      localStorage.setItem('countwise_user', JSON.stringify(data.user));
      if (data.defaultStoreId) {
        localStorage.setItem('countwise_store_id', data.defaultStoreId);
      }

      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOfflineDemo = () => {
    const demoStoreId = '22222222-2222-2222-2222-222222222222';
    const demoUser = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'demo@countwise.local',
    };
    localStorage.setItem('countwise_token', 'offline_demo_token');
    localStorage.setItem('countwise_refresh_token', 'offline_demo_refresh');
    localStorage.setItem('countwise_user', JSON.stringify(demoUser));
    localStorage.setItem('countwise_store_id', demoStoreId);

    onAuthSuccess({
      accessToken: 'offline_demo_token',
      refreshToken: 'offline_demo_refresh',
      user: demoUser,
      defaultStoreId: demoStoreId,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-stone-950 text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="w-full max-w-md">
        {onBackToStorefront && (
          <div className="mb-4 text-center">
            <button
              type="button"
              onClick={onBackToStorefront}
              className="text-xs text-stone-400 hover:text-amber-400 transition inline-flex items-center gap-1 font-semibold cursor-pointer"
            >
              ← Return to Online Store
            </button>
          </div>
        )}

        {/* Header Branding */}
        <div className="text-center mb-8">
          <MegaHertzLogo variant="stacked" size="xl" showSubtitle={false} className="mb-3" />
          <p className="text-xs text-stone-400 mt-2 max-w-xs mx-auto">
            Offline-First PC Hardware POS, Custom Rig Builder & Multi-Terminal Sync
          </p>
        </div>

        {/* Card */}
        <div className="bg-stone-900/90 border border-stone-800 p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
          {/* Tab Switcher */}
          <div className="flex rounded-lg bg-stone-950 p-1 mb-6 border border-stone-800/80">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!isOnline && (
            <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>You are currently offline. Sign in requires an initial internet connection, or use Local Demo Mode below.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-stone-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Store Manager"
                    className="w-full bg-stone-950/80 border border-stone-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-stone-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@store.com"
                  className="w-full bg-stone-950/80 border border-stone-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-stone-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-stone-950/80 border border-stone-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-stone-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-950/40 cursor-pointer"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Store Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-stone-800">
            <button
              type="button"
              onClick={handleStartOfflineDemo}
              data-testid="offline-demo-btn"
              className="w-full py-2 px-3 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              <span>Try Instant Offline Workspace (No Server Required)</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          Offline PWA with Dexie.js & monotonic cursor synchronization
        </p>
      </div>
    </div>
  );
}
