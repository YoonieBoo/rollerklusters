'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

type AuthMode = 'login' | 'signup';
type SupabaseRow = Record<string, unknown>;

const UNIVERSITIES = [
  'Assumption University',
  'Khon Kaen University',
  'Chiang Mai University',
] as const;

const AU_CAMPAIGN_MANAGER_TYPES = ['General', 'DDI'] as const;

const getSupabaseErrorDetails = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return {
      message: 'Unknown Supabase error',
      code: undefined,
      status: undefined,
    };
  }

  const supabaseError = error as {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
  };

  return {
    message: supabaseError.message ?? supabaseError.name ?? 'Unknown Supabase error',
    code: supabaseError.code,
    status: supabaseError.status,
  };
};

const logProfileSyncWarning = (label: string, error: unknown) => {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  if (error && typeof error === 'object') {
    const supabaseError = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };

    console.warn(label, {
      message: supabaseError.message,
      code: supabaseError.code,
      details: supabaseError.details,
      hint: supabaseError.hint,
    });
    return;
  }

  console.warn(label, error);
};

const getAuthUserDisplayName = (user: User, fallbackEmail: string) => {
  const metadataDisplayName = user.user_metadata?.display_name;
  const metadataFullName = user.user_metadata?.full_name;

  if (typeof metadataDisplayName === 'string' && metadataDisplayName.trim()) {
    return metadataDisplayName.trim();
  }

  if (typeof metadataFullName === 'string' && metadataFullName.trim()) {
    return metadataFullName.trim();
  }

  return user.email ?? fallbackEmail;
};

const getAuthUserMetadataString = (user: User, key: string) => {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const isMissingColumnError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const supabaseError = error as { code?: string; message?: string };

  return (
    supabaseError.code === 'PGRST204' ||
    supabaseError.message?.toLowerCase().includes('column') === true
  );
};

const createUserProfile = async (profile: {
  id: string;
  email: string;
  name: string;
  role: string;
  university: string | null;
  campaign_manager_type: string | null;
}) => {
  const { data, error } = await supabase
    .from('users')
    .insert(profile)
    .select('*')
    .maybeSingle();

  if (!error) {
    return data as SupabaseRow | null;
  }

  if (!isMissingColumnError(error)) {
    throw error;
  }

  logProfileSyncWarning('User profile insert fallback used:', error);

  const fallbackProfile = {
    id: profile.id,
    email: profile.email,
    full_name: profile.name,
    created_at: new Date().toISOString(),
  };

  const fallbackResult = await supabase
    .from('users')
    .insert(fallbackProfile)
    .select('*')
    .maybeSingle();

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return fallbackResult.data as SupabaseRow | null;
};

const ensureUserProfile = async (user: User, fallbackEmail: string) => {
  const email = user.email ?? fallbackEmail;
  const name = getAuthUserDisplayName(user, fallbackEmail);

  const { data: existingProfile, error: profileFetchError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileFetchError) {
    throw profileFetchError;
  }

  if (existingProfile) {
    console.log('User row found:', { userId: user.id, email });
    return existingProfile as SupabaseRow;
  }

  const createdProfile = await createUserProfile({
    id: user.id,
    email,
    name,
    role: 'admin',
    university: getAuthUserMetadataString(user, 'university'),
    campaign_manager_type: getAuthUserMetadataString(user, 'campaign_manager_type'),
  });

  console.log('User row created:', { userId: user.id, email, role: 'admin' });

  return createdProfile;
};

const syncUserProfile = async (user: User, fallbackEmail: string) => {
  try {
    await ensureUserProfile(user, fallbackEmail);
  } catch (error) {
    logProfileSyncWarning('Optional user profile sync skipped:', error);
  }
};

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [university, setUniversity] = useState('');
  const [campaignManagerType, setCampaignManagerType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch('/');

    let isMounted = true;

    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (data.session) {
        router.replace('/');
        return;
      }

      setIsCheckingSession(false);
    };

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();

    const trimmedEmail = email.trim();
    const submittedPassword = password;
    const trimmedName = fullName.trim();

    if (!trimmedEmail) {
      setErrorMessage('Email is required');
      return;
    }

    if (!submittedPassword) {
      setErrorMessage('Password is required');
      return;
    }

    if (submittedPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    if (mode === 'signup' && !trimmedName) {
      setErrorMessage('Full name is required');
      return;
    }

    if (mode === 'signup' && !university) {
      setErrorMessage('University is required');
      return;
    }

    if (mode === 'signup' && university === 'Assumption University' && !campaignManagerType) {
      setErrorMessage('Campaign manager type is required for Assumption University');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: submittedPassword,
        });

        if (error) {
          const errorDetails = getSupabaseErrorDetails(error);

          console.error('Supabase login error:', {
            email: trimmedEmail,
            ...errorDetails,
          });

          setErrorMessage(
            errorDetails.message === 'Invalid login credentials'
              ? 'Unable to log in. Check your email and password.'
              : `Unable to log in: ${errorDetails.message}`
          );
          setIsSubmitting(false);
          return;
        }

        if (data.user) {
          console.log('Supabase auth success:', {
            userId: data.user.id,
            email: data.user.email ?? trimmedEmail,
          });

          void syncUserProfile(data.user, trimmedEmail);
        }

        router.replace('/');
        console.log('Redirect success:', { path: '/' });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: submittedPassword,
        options: {
          data: {
            display_name: trimmedName,
            full_name: trimmedName,
            university,
            campaign_manager_type:
              university === 'Assumption University' ? campaignManagerType : null,
          },
          emailRedirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        },
      });

      if (error) {
        const errorDetails = getSupabaseErrorDetails(error);

        console.error('Supabase sign up error:', {
          email: trimmedEmail,
          ...errorDetails,
        });

        setErrorMessage(`Unable to create account: ${errorDetails.message}`);
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        console.log('Supabase auth success:', {
          userId: data.user.id,
          email: data.user.email ?? trimmedEmail,
        });

        void syncUserProfile(data.user, trimmedEmail);
      }

      if (data.session) {
        router.replace('/');
        console.log('Redirect success:', { path: '/' });
        return;
      }

      setPassword('');
      setSuccessMessage('Account created. Check your email to confirm your sign up.');
      setIsSubmitting(false);
    } catch (error) {
      console.error('Auth submit error:', error);
      setErrorMessage('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">Checking session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <style>
        {`
          @keyframes authGradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }

          @keyframes authPatternSlide {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(36px, -36px, 0); }
          }

          .auth-gradient-panel {
            background: linear-gradient(135deg, #0f3f9c 0%, #1d4ed8 48%, #38bdf8 100%);
            background-size: 180% 180%;
            animation: authGradientShift 12s ease-in-out infinite;
          }

          .auth-motion-pattern {
            background-image:
              linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px);
            background-size: 36px 36px;
            animation: authPatternSlide 18s linear infinite;
          }
        `}
      </style>

      <div className="grid min-h-screen w-full bg-white lg:grid-cols-[55fr_45fr]">
        <section className="auth-gradient-panel relative hidden overflow-hidden text-white lg:flex lg:min-h-screen lg:px-14 lg:pt-24 xl:px-20 xl:pt-28">
          <div className="auth-motion-pattern absolute inset-0 opacity-40" />
          <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -right-24 top-24 h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl" />

          <div className="relative z-10 w-full max-w-[30rem]">
            <p className="text-sm font-medium text-blue-100">Campaign operations</p>
            <h1 className="mt-4 text-3xl font-medium leading-[1.14] tracking-normal text-white xl:text-[2.35rem]">
              Manage creator campaigns in one focused workspace.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-blue-50/90">
              Plan briefs, review creator submissions, and export campaign reports without switching tools.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center border-slate-100 bg-white px-5 py-10 sm:px-8 lg:border-l lg:px-12 xl:px-16">
          <div className="mx-auto w-full max-w-md">
            <div>
              <p className="text-sm font-semibold text-primary">
                {mode === 'login' ? 'Log in' : 'Sign up'}
              </p>
              <h2 className="mt-3 text-[2rem] font-semibold leading-tight tracking-normal text-slate-950">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
                {mode === 'login'
                  ? 'Log in to continue managing campaigns, briefs, reviews, and reports.'
                  : 'Set up your account so your team can start managing campaign work.'}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 rounded-full border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                  mode === 'login'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                onClick={() => {
                  setMode('login');
                  resetMessages();
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                  mode === 'signup'
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                onClick={() => {
                  setMode('signup');
                  resetMessages();
                }}
              >
                Create account
              </button>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="fullName">
                    Full name
                  </label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Alex Johnson"
                    disabled={isSubmitting}
                    autoComplete="name"
                    className="h-12 rounded-xl border-slate-300 px-3.5 text-sm shadow-none transition focus-visible:ring-2 focus-visible:ring-blue-500/20"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    This name appears in your workspace.
                  </p>
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="university">
                    University
                  </label>
                  <Select
                    value={university}
                    onValueChange={(value) => {
                      setUniversity(value);
                      if (value !== 'Assumption University') {
                        setCampaignManagerType('');
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="university" className="h-12 w-full rounded-xl border-slate-300 px-3.5 text-sm shadow-none">
                      <SelectValue placeholder="Select your university" />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIVERSITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {mode === 'signup' && university === 'Assumption University' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="campaignManagerType">
                    Campaign manager type
                  </label>
                  <Select
                    value={campaignManagerType}
                    onValueChange={setCampaignManagerType}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="campaignManagerType" className="h-12 w-full rounded-xl border-slate-300 px-3.5 text-sm shadow-none">
                      <SelectValue placeholder="Select campaign manager type" />
                    </SelectTrigger>
                    <SelectContent>
                      {AU_CAMPAIGN_MANAGER_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  disabled={isSubmitting}
                  autoComplete="email"
                  className="h-12 rounded-xl border-slate-300 px-3.5 text-sm shadow-none transition focus-visible:ring-2 focus-visible:ring-blue-500/20"
                />
                <p className="text-xs leading-5 text-slate-500">
                  Use the email connected to your campaign team.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 6 characters"
                    disabled={isSubmitting}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="h-12 rounded-xl border-slate-300 px-3.5 pr-12 text-sm shadow-none transition focus-visible:ring-2 focus-visible:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  {mode === 'login'
                    ? 'Enter the password for your RollerKluster account.'
                    : 'Choose a password with at least 6 characters.'}
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm font-medium text-red-700">{errorMessage}</p>
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                  <p className="text-sm font-medium text-green-700">{successMessage}</p>
                </div>
              )}

              <Button
                className="h-12 w-full rounded-xl text-sm font-semibold shadow-sm"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? mode === 'login'
                    ? 'Logging in...'
                    : 'Creating account...'
                  : mode === 'login'
                  ? 'Log in'
                  : 'Create account'}
                <ArrowRight size={16} />
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              {mode === 'login' ? 'New to RollerKluster?' : 'Already have an account?'}{' '}
              <button
                type="button"
                className="font-semibold text-primary hover:text-blue-800"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  resetMessages();
                }}
              >
                {mode === 'login' ? 'Create an account' : 'Log in instead'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
