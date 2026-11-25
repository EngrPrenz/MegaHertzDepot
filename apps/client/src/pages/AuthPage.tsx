import { useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { Lock, Mail, User, AlertCircle, ArrowLeft, ArrowRight, WifiOff } from 'lucide-react';
import { MegaHertzLogo } from '../components/MegaHertzLogo.js';
import { ThemeToggleButton } from '../components/ThemeToggleButton.js';

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
  const [inviteCode, setInviteCode] = useState('');
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
      const body =
        mode === 'login'
          ? { email, password }
          : {
              email,
              password,
              name,
              ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

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
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between gap-2">
          {onBackToStorefront ? (
            <button
              type="button"
              onClick={onBackToStorefront}
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Return to Online Store</span>
            </button>
          ) : (
            <span />
          )}
          <ThemeToggleButton />
        </div>

        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-2">
            <MegaHertzLogo variant="stacked" size="xl" showSubtitle={false} />
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs mx-auto">
            Staff Portal for Gilmore Branch POS, Inventory Audit & Sync
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-carbon border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 rounded-lg shadow-sm">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 rounded-md bg-zinc-100 dark:bg-carbon-elevated p-1 mb-5 border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
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
              className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-rose-950/60 border border-red-200 dark:border-rose-800 text-red-800 dark:text-rose-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-rose-400 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>{error}</span>
            </div>
          )}

          {!isOnline && (
            <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" strokeWidth={1.75} />
              <span>
                You are offline. Signing in requires an initial connection, or use Instant Offline
                Workspace below.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label
                  htmlFor="staff-auth-name"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400"
                    strokeWidth={1.75}
                  />
                  <input
                    id="staff-auth-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Store Manager"
                    className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-zinc-950 dark:focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label
                  htmlFor="staff-auth-invite"
                  className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
                >
                  Staff Invite Code
                </label>
                <input
                  id="staff-auth-invite"
                  type="password"
                  autoComplete="off"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Required for production staff signup"
                  className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3.5 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-zinc-950 dark:focus:border-amber-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="staff-auth-email"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400"
                  strokeWidth={1.75}
                />
                <input
                  id="staff-auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@store.com"
                  className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-zinc-950 dark:focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="staff-auth-password"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400"
                  strokeWidth={1.75}
                />
                <input
                  id="staff-auth-password"
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white dark:bg-carbon-elevated border border-zinc-300 dark:border-zinc-700 rounded px-3.5 pl-9 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-zinc-950 dark:focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white active:bg-zinc-900 disabled:opacity-50 text-white dark:text-zinc-950 rounded-md text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Store Account'}</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </>
              )}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleStartOfflineDemo}
                data-testid="offline-demo-btn"
                className="w-full py-2 px-3 rounded-md bg-white dark:bg-carbon-elevated hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" strokeWidth={1.75} />
                <span>Try Instant Offline Workspace (No Server Required)</span>
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 mt-5">
          Local-first POS storage powered by IndexedDB with automatic delta sync
        </p>
      </div>
    </div>
  );
}
