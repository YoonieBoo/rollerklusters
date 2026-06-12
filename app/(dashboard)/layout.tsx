'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  LogOut,
  Menu,
  X,
  Bell,
  FileText,
  CheckSquare,
  Users,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import {
  fetchWorkflowUpdates,
  toText,
  workflowUpdateStorageKey,
  type WorkflowUpdate,
} from '@/lib/workflow-updates';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: FolderOpen },
  { href: '/creators', label: 'Creators', icon: Users },
  { href: '/creator-signups', label: 'Signups', icon: UserPlus },
  { href: '/briefs', label: 'Briefs', icon: FileText },
  { href: '/reviews', label: 'Reviews', icon: CheckSquare },
];

const hiddenSignupId = 'f6f0a00b-094e-4921-b50d-14d6ff6a5fbe';
const hiddenSignupEmail = 'nangnommaung@gmail.com';

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
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<WorkflowUpdate[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [signupCount, setSignupCount] = useState(0);

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
    const savedReadIds = window.localStorage.getItem(workflowUpdateStorageKey);

    if (savedReadIds) {
      try {
        setReadNotificationIds(JSON.parse(savedReadIds));
      } catch {
        setReadNotificationIds([]);
      }
    }
  }, []);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setProfileName(null);
        setProfileRole(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, email, created_at')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          logOptionalProfileWarning('Optional user profile fetch skipped:', error);
        }

        const profile = data as SupabaseRow | null;

        setProfileName(toText(profile?.full_name) || null);
        setProfileRole(null);
      } catch (error) {
        logOptionalProfileWarning('Optional user profile fetch issue:', error);
        setProfileName(null);
        setProfileRole(null);
      }
    };

    fetchUserProfile();
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) {
      return;
    }

    try {
      setNotifications(await fetchWorkflowUpdates(supabase));
    } catch (error) {
      console.error('Notifications fetch error:', error);
      setNotifications([]);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [pathname, user]);

  const fetchSignupCount = async () => {
    if (!user) {
      setSignupCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('creator_signups')
        .select('id', { count: 'exact', head: true })
        .neq('id', hiddenSignupId)
        .neq('email', hiddenSignupEmail);

      if (error) {
        console.error('Creator signup count fetch error:', error);
        setSignupCount(0);
        return;
      }

      setSignupCount(count ?? 0);
    } catch (error) {
      console.error('Creator signup count fetch issue:', error);
      setSignupCount(0);
    }
  };

  useEffect(() => {
    fetchSignupCount();
  }, [pathname, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

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
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !readNotificationIds.includes(notification.id)
      ).length,
    [notifications, readNotificationIds]
  );

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
                  {item.href === '/creator-signups' && signupCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[10px] font-semibold leading-none text-white">
                      {signupCount > 9 ? '9+' : signupCount}
                    </span>
                  )}
                </button>
              </Link>
            );
          })}

          <Link href="/updates">
            <button
              onClick={() => setSidebarOpen(false)}
              className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === '/updates'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-xs'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Bell size={20} />
              <span className="flex-1 text-left">Updates</span>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </Link>
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
              <p className="text-xs text-sidebar-accent-foreground truncate">
                {profileRole || 'Admin'}
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
