'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  LogOut,
  Menu,
  X,
  FileText,
  CheckSquare,
  Users,
  UserPlus,
  UserCog,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import {
  toText,
} from '@/lib/workflow-updates';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: FolderOpen },
  { href: '/creators', label: 'Onboarded Creators', icon: Users },
  { href: '/campaign-managers', label: 'Campaign Managers', icon: UserCog },
  { href: '/creator-signups', label: 'Creator Details', icon: UserPlus },
  { href: '/briefs', label: 'Briefs', icon: FileText },
  { href: '/reviews', label: 'Reviews', icon: CheckSquare },
];

const SIGNUP_COUNT_REFRESH_INTERVAL_MS = 15000;
const SIGNUP_COUNT_PAGE_SIZE = 1000;
const CREATOR_COUNT_REFRESH_INTERVAL_MS = 15000;
const CREATOR_COUNT_PAGE_SIZE = 1000;
const CAMPAIGN_MANAGER_COUNT_REFRESH_INTERVAL_MS = 15000;
const CAMPAIGN_MANAGER_COUNT_PAGE_SIZE = 1000;

type SupabaseRow = Record<string, unknown>;

const logOptionalProfileWarning = (label: string, error: unknown) => {
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creatorCount, setCreatorCount] = useState(0);
  const [signupCount, setSignupCount] = useState(0);
  const [campaignManagerCount, setCampaignManagerCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error || !data.session?.user) {
        router.replace('/auth');
        setIsCheckingAuth(false);
        return;
      }

      setUser(data.session.user);
      setIsCheckingAuth(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        router.replace('/auth');
        return;
      }

      setUser(session.user);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setProfileName(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          logOptionalProfileWarning('Optional user profile fetch skipped:', error);
        }

        const profile = data as SupabaseRow | null;

        setProfileName(toText(profile?.name) || toText(profile?.full_name) || null);
      } catch (error) {
        logOptionalProfileWarning('Optional user profile fetch issue:', error);
        setProfileName(null);
      }
    };

    fetchUserProfile();
  }, [user]);

  const fetchCreatorCount = async () => {
    if (!user) {
      setCreatorCount(0);
      return;
    }

    try {
      const creators: SupabaseRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * CREATOR_COUNT_PAGE_SIZE;
        const to = from + CREATOR_COUNT_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('creator_profiles')
          .select('id')
          .range(from, to);

        if (error) {
          console.error('Creator count fetch error:', error);
          setCreatorCount(0);
          return;
        }

        const pageRows = (data ?? []) as SupabaseRow[];
        creators.push(...pageRows);

        if (pageRows.length < CREATOR_COUNT_PAGE_SIZE) {
          break;
        }
      }

      setCreatorCount(creators.length);
    } catch (error) {
      console.error('Creator count fetch issue:', error);
      setCreatorCount(0);
    }
  };

  const fetchSignupCount = async () => {
    if (!user) {
      setSignupCount(0);
      return;
    }

    try {
      const signups: SupabaseRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * SIGNUP_COUNT_PAGE_SIZE;
        const to = from + SIGNUP_COUNT_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('creator_signups')
          .select('id')
          .range(from, to);

        if (error) {
          console.error('Creator signup count fetch error:', error);
          setSignupCount(0);
          return;
        }

        const pageRows = (data ?? []) as SupabaseRow[];
        signups.push(...pageRows);

        if (pageRows.length < SIGNUP_COUNT_PAGE_SIZE) {
          break;
        }
      }

      setSignupCount(signups.length);
    } catch (error) {
      console.error('Creator signup count fetch issue:', error);
      setSignupCount(0);
    }
  };

  const isCampaignManagerSignup = (signup: SupabaseRow) => {
    const roleText = [
      signup.signup_type,
      signup.role_label,
      signup.primary_creative_focus,
    ]
      .map(toText)
      .join(' ')
      .toLowerCase();

    return (
      roleText.includes('campaign-manager') ||
      roleText.includes('campaign manager')
    );
  };

  const fetchCampaignManagerCount = async () => {
    if (!user) {
      setCampaignManagerCount(0);
      return;
    }

    try {
      const campaignManagers: SupabaseRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * CAMPAIGN_MANAGER_COUNT_PAGE_SIZE;
        const to = from + CAMPAIGN_MANAGER_COUNT_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('creator_signups')
          .select('id, signup_type, role_label, primary_creative_focus')
          .range(from, to);

        if (error) {
          console.error('Campaign manager signup count fetch error:', error);
          setCampaignManagerCount(0);
          return;
        }

        const pageRows = (data ?? []) as SupabaseRow[];
        campaignManagers.push(...pageRows.filter(isCampaignManagerSignup));

        if (pageRows.length < CAMPAIGN_MANAGER_COUNT_PAGE_SIZE) {
          break;
        }
      }

      setCampaignManagerCount(campaignManagers.length);
    } catch (error) {
      console.error('Campaign manager signup count fetch issue:', error);
      setCampaignManagerCount(0);
    }
  };

  useEffect(() => {
    fetchCreatorCount();
    fetchSignupCount();
    fetchCampaignManagerCount();
  }, [pathname, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshVisibleCreatorCount = () => {
      if (document.visibilityState === 'visible') {
        fetchCreatorCount();
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleCreatorCount,
      CREATOR_COUNT_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleCreatorCount);
    document.addEventListener('visibilitychange', refreshVisibleCreatorCount);

    const channel = supabase
      .channel('creator-profiles-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_profiles' },
        () => {
          fetchCreatorCount();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleCreatorCount);
      document.removeEventListener('visibilitychange', refreshVisibleCreatorCount);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshVisibleCampaignManagerCount = () => {
      if (document.visibilityState === 'visible') {
        fetchCampaignManagerCount();
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleCampaignManagerCount,
      CAMPAIGN_MANAGER_COUNT_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleCampaignManagerCount);
    document.addEventListener('visibilitychange', refreshVisibleCampaignManagerCount);

    const channel = supabase
      .channel('campaign-manager-signups-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => {
          fetchCampaignManagerCount();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleCampaignManagerCount);
      document.removeEventListener('visibilitychange', refreshVisibleCampaignManagerCount);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshVisibleSignupCount = () => {
      if (document.visibilityState === 'visible') {
        fetchSignupCount();
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleSignupCount,
      SIGNUP_COUNT_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleSignupCount);
    document.addEventListener('visibilitychange', refreshVisibleSignupCount);

    const channel = supabase
      .channel('creator-signups-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => {
          fetchSignupCount();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleSignupCount);
      document.removeEventListener('visibilitychange', refreshVisibleSignupCount);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getUserInitials = () => {
    const fullName = profileName || toText(user?.user_metadata?.full_name);
    const label = fullName || user?.email || 'User';

    return label
      .split(/[ @.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  };

  const getUserName = () =>
    profileName || toText(user?.user_metadata?.full_name) || user?.email || 'Account';

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Supabase logout error:', error);
    }

    router.replace('/auth');
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-border bg-card px-6 py-5 text-center shadow-xs">
          <p className="text-sm font-medium text-foreground">Loading RollerKluster</p>
          <p className="mt-1 text-xs text-muted-foreground">Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-border bg-card px-6 py-5 text-center shadow-xs">
          <p className="text-sm font-medium text-foreground">Redirecting to login</p>
          <p className="mt-1 text-xs text-muted-foreground">Please sign in to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-w-0 bg-background">
      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-dvh w-[min(18rem,calc(100vw-2rem))] bg-sidebar border-r border-sidebar-border shadow-sm md:relative md:w-64
          transition-all duration-300 z-50 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Close button on mobile */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 hover:bg-sidebar-accent rounded-md"
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2 mt-4 md:mt-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden bg-sidebar-primary shadow-sm">
            <img
              src="/logo%20pic.PNG"
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <span className="font-semibold text-sidebar-foreground">RollerKluster</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                    ${
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-xs'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }
                  `}
                >
                  <Icon size={20} />
                  <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                  {item.href === '/creators' && creatorCount > 0 && (
                    <span className="flex h-5 min-w-5 max-w-16 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[10px] font-semibold leading-none text-white tabular-nums">
                      {creatorCount.toLocaleString()}
                    </span>
                  )}
                  {item.href === '/campaign-managers' && campaignManagerCount > 0 && (
                    <span className="flex h-5 min-w-5 max-w-16 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[10px] font-semibold leading-none text-white tabular-nums">
                      {campaignManagerCount.toLocaleString()}
                    </span>
                  )}
                </button>
              </Link>
            );
          })}

        </nav>

        {/* User profile */}
        <div className="p-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-sidebar-accent-foreground">
                {getUserInitials()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {getUserName()}
              </p>
            </div>
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
            onClick={handleLogout}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 md:hidden z-40"
        />
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-30 rounded-lg border border-border bg-card p-2 shadow-sm hover:bg-muted md:hidden"
          aria-label="Open sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl px-3 pb-5 pt-14 sm:px-5 md:px-6 md:pt-6 lg:px-7 lg:pb-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
