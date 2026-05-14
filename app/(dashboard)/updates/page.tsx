'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, FileText, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import {
  fetchWorkflowUpdates,
  formatWorkflowUpdateDate,
  getWorkflowUpdateDestination,
  workflowUpdateStorageKey,
  type WorkflowUpdate,
} from '@/lib/workflow-updates';

export default function UpdatesPage() {
  const router = useRouter();
  const [updates, setUpdates] = useState<WorkflowUpdate[]>([]);
  const [readUpdateIds, setReadUpdateIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedReadIds = window.localStorage.getItem(workflowUpdateStorageKey);

    if (savedReadIds) {
      try {
        setReadUpdateIds(JSON.parse(savedReadIds));
      } catch {
        setReadUpdateIds([]);
      }
    }
  }, []);

  const loadUpdates = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setUpdates(await fetchWorkflowUpdates(supabase));
    } catch (error) {
      console.error('Updates page fetch error:', error);
      setErrorMessage('Unable to load updates right now.');
      setUpdates([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUpdates();
  }, []);

  const unreadCount = useMemo(
    () => updates.filter((update) => !readUpdateIds.includes(update.id)).length,
    [readUpdateIds, updates]
  );

  const saveReadUpdateIds = (ids: string[]) => {
    setReadUpdateIds(ids);
    window.localStorage.setItem(workflowUpdateStorageKey, JSON.stringify(ids));
  };

  const markAllRead = () => {
    saveReadUpdateIds(Array.from(new Set([...readUpdateIds, ...updates.map((item) => item.id)])));
  };

  const openUpdate = (update: WorkflowUpdate) => {
    const destination = getWorkflowUpdateDestination(update);

    saveReadUpdateIds(Array.from(new Set([...readUpdateIds, update.id])));

    if (!destination) {
      setErrorMessage('Unable to open this update.');
      return;
    }

    router.push(destination);
  };

  const getUpdateIcon = (update: WorkflowUpdate) => {
    if (update.title === 'Brief needed') {
      return <FileText size={18} />;
    }

    if (update.title === 'Changes requested') {
      return <MessageSquareText size={18} />;
    }

    return <Bell size={18} />;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workflow items that need attention
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadUpdates} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          {updates.length > 0 && (
            <Button onClick={markAllRead} disabled={unreadCount === 0}>
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{errorMessage}</p>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Attention needed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {unreadCount} unread update{unreadCount === 1 ? '' : 's'}
            </p>
          </div>
          <CheckCircle2 size={18} className="text-green-600" />
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">Loading updates...</p>
          </div>
        ) : updates.length > 0 ? (
          <div className="divide-y divide-border">
            {updates.map((update) => {
              const isUnread = !readUpdateIds.includes(update.id);

              return (
                <button
                  key={update.id}
                  type="button"
                  className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-blue-50 sm:grid-cols-[32px_1fr_auto]"
                  onClick={() => openUpdate(update)}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      isUnread ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {getUpdateIcon(update)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{update.title}</span>
                      {isUnread && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          New
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {update.message}
                    </span>
                    <span className="mt-2 block text-sm font-medium text-primary">
                      {update.workflow === 'brief' ? 'Open brief' : 'Review now'}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground sm:pt-1">
                    {formatWorkflowUpdateDate(update.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No updates right now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Briefs, submissions, and review changes that need attention will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
