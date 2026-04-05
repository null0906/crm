'use client';

import React, { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const callbackUrl = searchParams.get('callbackUrl') ?? '/contacts';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password. Please try again.');
    } else if (result?.ok) {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-2xl p-10',
        'border border-slate-200/60',
        'shadow-[0_20px_60px_rgba(16,24,40,0.10),_0_4px_16px_rgba(16,24,40,0.06)]',
      )}
    >
      <div className="mb-7">
        <h2 className="text-[1.125rem] font-semibold text-slate-900 tracking-tight">Welcome back</h2>
        <p className="text-sm text-slate-400 mt-0.5">Sign in to your SecComply account</p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@seccomply.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="pt-1">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(67,97,238,0.08) 0%, transparent 60%), linear-gradient(160deg, #F7F8FA 0%, #EFF1F5 100%)',
      }}
    >
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8">
          <div
            className={cn(
              'flex items-center justify-center w-11 h-11 rounded-xl mb-4',
              'bg-blue-600',
              'shadow-[0_4px_16px_rgba(67,97,238,0.30),_0_1px_3px_rgba(67,97,238,0.20)]',
            )}
          >
            <Shield className="w-5 h-5 text-white" strokeWidth={1.75} />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">SecComply</h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide mt-0.5">COMMAND CENTER</p>
        </div>

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl p-10 border border-slate-200/60 shadow-[0_20px_60px_rgba(16,24,40,0.10)] text-center text-slate-400 text-sm">
              Loading...
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-center text-[11px] text-slate-400 mt-6 tracking-wide">
          Access restricted to authorised team members only.
        </p>
      </div>
    </div>
  );
}
