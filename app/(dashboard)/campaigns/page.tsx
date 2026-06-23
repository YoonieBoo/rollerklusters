'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, FileDown, Mail, MoreHorizontal, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase/client';
import {
  downloadCampaignReportPdf,
  getCampaignReportExportData,
} from '@/lib/report-export';

type CampaignRow = {
  id: string;
  name: string | null;
  client_name: string | null;
  campaign_start_date?: string | null;
  campaign_end_date?: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};


const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-green-500/10', text: 'text-green-500' },
    draft: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
    completed: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    ready_for_review: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
    'on-hold': { bg: 'bg-red-500/10', text: 'text-red-500' },
  };

  const style = styles[status] || styles.draft;
  const label = status
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <Badge className={`${style.bg} ${style.text} border-0`}>
      {label}
    </Badge>
  );
};

const formatDate = (date: string | null) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingCampaignId, setExportingCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newCampaignStartDate, setNewCampaignStartDate] = useState('');
  const [newCampaignEndDate, setNewCampaignEndDate] = useState('');

  // Post-creation invite prompt
  const [postCreateCampaign, setPostCreateCampaign] = useState<{ id: string; name: string } | null>(null);

  // Push notification state
  const [pushCampaign, setPushCampaign] = useState<CampaignRow | null>(null);
  const [pushTitle, setPushTitle] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushSubscriberCount, setPushSubscriberCount] = useState<number | null>(null);
  const [pushResult, setPushResult] = useState<{ error?: string; success?: string } | null>(null);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Supabase campaigns fetch error:', error);
      setErrorMessage(error.message);
      setCampaigns([]);
    } else {
      setCampaigns(data ?? []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const resetCreateForm = () => {
    setEditingCampaignId(null);
    setNewCampaignName('');
    setNewClientName('');
    setNewCampaignStartDate('');
    setNewCampaignEndDate('');
    setCreateError(null);
  };

  const openEditCampaign = (campaign: CampaignRow) => {
    setActionError(null);
    setActionSuccess(null);
    setCreateError(null);
    setEditingCampaignId(campaign.id);
    setNewCampaignName(campaign.name ?? '');
    setNewClientName(campaign.client_name ?? '');
    setNewCampaignStartDate(campaign.campaign_start_date ?? '');
    setNewCampaignEndDate(campaign.campaign_end_date ?? '');
    setShowCreateDialog(true);
  };

  const handleSaveCampaign = async () => {
    setCreateError(null);
    setActionError(null);
    setActionSuccess(null);

    const campaignName = newCampaignName.trim();
    const clientName = newClientName.trim();

    if (!campaignName) {
      setCreateError('Campaign name is required');
      return;
    }

    if (!clientName) {
      setCreateError('Client name is required');
      return;
    }

    if (
      newCampaignStartDate &&
      newCampaignEndDate &&
      newCampaignEndDate < newCampaignStartDate
    ) {
      setCreateError('End date must be after the start date.');
      return;
    }

    setIsCreating(true);

    const now = new Date().toISOString();
    const timelinePayload = {
      campaign_start_date: newCampaignStartDate || null,
      campaign_end_date: newCampaignEndDate || null,
    };

    if (editingCampaignId) {
      const { error } = await supabase
        .from('campaigns')
        .update({
          name: campaignName,
          client_name: clientName,
          ...timelinePayload,
          updated_at: now,
        })
        .eq('id', editingCampaignId);

      if (error) {
        console.error('Supabase campaign update error:', error);
        setCreateError(error.message);
        setIsCreating(false);
        return;
      }

      await fetchCampaigns();
      resetCreateForm();
      setShowCreateDialog(false);
      setIsCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name: campaignName,
        client_name: clientName,
        ...timelinePayload,
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase campaign insert error:', error);
      setCreateError(error.message);
      setIsCreating(false);
      return;
    }

    const newCampaignId = data?.id;

    if (!newCampaignId) {
      setCreateError('Campaign was created, but the new campaign id was not returned');
      setIsCreating(false);
      return;
    }

    resetCreateForm();
    setShowCreateDialog(false);
    setIsCreating(false);
    setPostCreateCampaign({ id: newCampaignId, name: campaignName });
  };

  const handleDeleteCampaign = (campaign: CampaignRow) => {
    setActionError(null);
    setActionSuccess(null);
    setDeleteError(null);
    setCampaignToDelete(campaign);
  };

  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete) {
      return;
    }

    const campaignId = campaignToDelete.id;

    setIsDeleting(true);
    setDeleteError(null);
    setActionError(null);
    setActionSuccess(null);

    const { data: campaignSubmissions, error: submissionsFetchError } = await supabase
      .from('submissions')
      .select('id')
      .eq('campaign_id', campaignId);

    if (submissionsFetchError) {
      console.error('Supabase campaign submissions fetch before delete error:', submissionsFetchError);
      setDeleteError(submissionsFetchError.message);
      setIsDeleting(false);
      return;
    }

    const submissionIds = (campaignSubmissions ?? []).map((submission) => submission.id);

    if (submissionIds.length > 0) {
      const { error: reviewsDeleteError } = await supabase
        .from('reviews')
        .delete()
        .in('submission_id', submissionIds);

      if (reviewsDeleteError) {
        console.error('Supabase campaign reviews cleanup error:', reviewsDeleteError);
        setDeleteError(reviewsDeleteError.message);
        setIsDeleting(false);
        return;
      }
    }

    const { error: submissionsDeleteError } = await supabase
      .from('submissions')
      .delete()
      .eq('campaign_id', campaignId);

    if (submissionsDeleteError) {
      console.error('Supabase campaign submissions cleanup error:', submissionsDeleteError);
      setDeleteError(submissionsDeleteError.message);
      setIsDeleting(false);
      return;
    }

    const { error: reportsDeleteError } = await supabase
      .from('reports')
      .delete()
      .eq('campaign_id', campaignId);

    if (reportsDeleteError) {
      console.error('Supabase campaign reports cleanup error:', reportsDeleteError);
      setDeleteError(reportsDeleteError.message);
      setIsDeleting(false);
      return;
    }

    const { error: briefsDeleteError } = await supabase
      .from('briefs')
      .delete()
      .eq('campaign_id', campaignId);

    if (briefsDeleteError) {
      console.error('Supabase campaign briefs cleanup error:', briefsDeleteError);
      setDeleteError(briefsDeleteError.message);
      setIsDeleting(false);
      return;
    }

    const { data: deletedCampaigns, error: campaignDeleteError } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id');

    if (campaignDeleteError) {
      console.error('Supabase campaign delete error:', campaignDeleteError);
      setDeleteError(campaignDeleteError.message);
      setIsDeleting(false);
      return;
    }

    if (!deletedCampaigns || deletedCampaigns.length === 0) {
      const noDeleteMessage =
        'Campaign was not deleted. Supabase returned zero deleted rows for this campaign.';
      console.error('Supabase campaign delete returned zero rows:', {
        campaignId,
        campaign: campaignToDelete,
      });
      setDeleteError(noDeleteMessage);
      setIsDeleting(false);
      return;
    }

    await fetchCampaigns();
    setCampaignToDelete(null);
    setIsDeleting(false);
    setActionSuccess('Campaign deleted successfully');
  };

  const openPushDialog = async (campaign: CampaignRow) => {
    setActionError(null);
    setActionSuccess(null);
    setPushCampaign(campaign);
    setPushTitle(campaign.name ?? 'New update');
    setPushMessage('');
    setPushResult(null);
    setPushSubscriberCount(null);

    try {
      const { count } = await supabase
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);
      setPushSubscriberCount(count ?? 0);
    } catch {
      setPushSubscriberCount(0);
    }
  };

  const handleSendPush = async () => {
    if (!pushCampaign) return;

    if (!pushTitle.trim()) {
      setPushResult({ error: 'Title is required.' });
      return;
    }

    setIsSendingPush(true);
    setPushResult(null);

    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: pushCampaign.id,
          title: pushTitle.trim(),
          message: pushMessage.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPushResult({ error: data.error ?? 'Failed to send notification.' });
      } else if (data.sent === 0) {
        setPushResult({ error: 'No subscribers on this campaign yet.' });
      } else {
        setPushResult({
          success: `Delivered to ${data.sent} device${data.sent === 1 ? '' : 's'}.`,
        });
      }
    } catch {
      setPushResult({ error: 'Network error. Please try again.' });
    } finally {
      setIsSendingPush(false);
    }
  };

  const handleExportCampaignReport = async (campaign: CampaignRow) => {
    setActionError(null);
    setActionSuccess(null);
    setExportingCampaignId(campaign.id);

    try {
      const reportData = await getCampaignReportExportData(campaign.id);
      downloadCampaignReportPdf(reportData);
      setActionSuccess('Campaign report exported');
    } catch (error) {
      console.error('Campaign report export error:', error);
      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to export campaign report. Please try again.'
      );
    } finally {
      setExportingCampaignId(null);
    }
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      const campaignName = campaign.name ?? '';
      const clientName = campaign.client_name ?? '';
      const campaignStatus = campaign.status ?? '';

      const matchesSearch =
        campaignName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clientName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || campaignStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Manage and track all your creative campaigns
          </p>
        </div>
        <Button
          onClick={() => {
            resetCreateForm();
            setShowCreateDialog(true);
          }}
          className="gap-2"
        >
          <Plus size={20} />
          New Campaign
        </Button>
      </div>

      {actionError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-500">{actionError}</p>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
          <p className="text-sm text-green-500">{actionSuccess}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-2.5 text-muted-foreground"
          />
          <Input
            type="text"
            placeholder="Search by campaign name or client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full md:w-36 bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="ready_for_review">Ready for Review</SelectItem>
            <SelectItem value="on-hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns table */}
      <Card className="gap-0 border-border bg-transparent py-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading campaigns...</p>
          </div>
        ) : errorMessage ? (
          <div className="p-6 text-center">
            <p className="text-red-500 mb-2">Unable to load campaigns</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        ) : filteredCampaigns.length > 0 ? (
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="h-10 hover:bg-muted/60">
                <TableHead className="py-2">Name</TableHead>
                <TableHead className="py-2">Client</TableHead>
                <TableHead className="py-2">Status</TableHead>
                <TableHead className="py-2">Created</TableHead>
                <TableHead className="py-2">Updated</TableHead>
                <TableHead className="w-28 py-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${campaign.name || 'campaign'}`}
                  className="h-11 cursor-pointer hover:bg-muted/40 border-border"
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      router.push(`/campaigns/${campaign.id}`);
                    }
                  }}
                >
                  <TableCell className="py-2 font-medium text-foreground">
                    {campaign.name || 'Untitled campaign'}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {campaign.client_name || 'N/A'}
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={campaign.status || 'draft'} />
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground text-sm">
                    {formatDate(campaign.created_at)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground text-sm">
                    {formatDate(campaign.updated_at)}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={`Open actions for ${campaign.name || 'campaign'}`}
                          >
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEditCampaign(campaign)}>
                            Edit Campaign
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/briefs?campaign=${encodeURIComponent(campaign.id)}`)}
                          >
                            Open Brief
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/reviews?campaign=${encodeURIComponent(campaign.id)}`)}
                          >
                            Review Submissions
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/reports?campaign=${encodeURIComponent(campaign.id)}`)}
                          >
                            View Report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleExportCampaignReport(campaign)}
                            disabled={exportingCampaignId === campaign.id}
                          >
                            <FileDown size={14} />
                            {exportingCampaignId === campaign.id ? 'Exporting PDF...' : 'Export PDF'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPushDialog(campaign)}>
                            <Bell size={14} />
                            Send Notification
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDeleteCampaign(campaign)}
                          >
                            Delete Campaign
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-2">No campaigns found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </Card>

      {/* Create campaign dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!isCreating) {
            setShowCreateDialog(open);

            if (!open) {
              resetCreateForm();
            }
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {editingCampaignId ? 'Edit Campaign' : 'Create New Campaign'}
            </DialogTitle>
            <DialogDescription>
              {editingCampaignId
                ? 'Update the campaign details used across the workflow.'
                : 'Set up the campaign record your team will use for the brief, review, and report workflow.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Campaign Name
              </label>
              <Input
                placeholder="Summer Creator Launch 2026"
                value={newCampaignName}
                onChange={(event) => setNewCampaignName(event.target.value)}
                className="bg-muted border-border"
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                Internal campaign name used by your team
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Brand or Company
              </label>
              <Input
                placeholder="L’Oréal Thailand"
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                className="bg-muted border-border"
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                The client, brand, or organization running this campaign
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Campaign Timeline
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground block">
                    Start date
                  </label>
                  <Input
                    type="date"
                    value={newCampaignStartDate}
                    onChange={(event) => setNewCampaignStartDate(event.target.value)}
                    className="bg-muted border-border"
                    disabled={isCreating}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground block">
                    End date
                  </label>
                  <Input
                    type="date"
                    value={newCampaignEndDate}
                    min={newCampaignStartDate || undefined}
                    onChange={(event) => setNewCampaignEndDate(event.target.value)}
                    className="bg-muted border-border"
                    disabled={isCreating}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These dates appear in the creator brief PDF.
              </p>
            </div>
            {createError && (
              <p className="text-sm text-red-500">{createError}</p>
            )}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  resetCreateForm();
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveCampaign} disabled={isCreating}>
                {isCreating
                  ? editingCampaignId
                    ? 'Saving...'
                    : 'Creating...'
                  : editingCampaignId
                  ? 'Save Changes'
                  : 'Create Campaign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete campaign dialog */}
      <Dialog
        open={Boolean(campaignToDelete)}
        onOpenChange={(open) => {
          if (!isDeleting && !open) {
            setCampaignToDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Delete campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this campaign? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium text-foreground">
                {campaignToDelete?.name || 'Untitled campaign'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {campaignToDelete?.client_name || 'No brand or company listed'}
              </p>
            </div>
            {deleteError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-sm text-red-500">{deleteError}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCampaignToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteCampaign}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete campaign'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send push notification dialog */}
      <Dialog
        open={Boolean(pushCampaign)}
        onOpenChange={(open) => {
          if (!isSendingPush && !open) {
            setPushCampaign(null);
            setPushResult(null);
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Send Push Notification</DialogTitle>
            <DialogDescription>
              Notify creators who enabled notifications for{' '}
              <span className="font-medium text-foreground">
                {pushCampaign?.name ?? 'this campaign'}
              </span>
              .{' '}
              {pushSubscriberCount !== null && (
                <span>
                  {pushSubscriberCount === 0
                    ? 'No subscribers yet.'
                    : `${pushSubscriberCount} subscriber${pushSubscriberCount === 1 ? '' : 's'}.`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Title
              </label>
              <input
                type="text"
                placeholder="New update on your brief"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                disabled={isSendingPush}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Message
              </label>
              <textarea
                placeholder="Your campaign brief has been updated."
                value={pushMessage}
                onChange={(e) => setPushMessage(e.target.value)}
                disabled={isSendingPush}
                rows={3}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50"
              />
            </div>
            {pushResult?.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-sm text-red-500">{pushResult.error}</p>
              </div>
            )}
            {pushResult?.success && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
                <p className="text-sm text-green-600">{pushResult.success}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setPushCampaign(null); setPushResult(null); }}
                disabled={isSendingPush}
              >
                Cancel
              </Button>
              <Button onClick={handleSendPush} disabled={isSendingPush}>
                {isSendingPush ? 'Sending...' : 'Send Notification'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post-creation invite prompt */}
      <Dialog
        open={Boolean(postCreateCampaign)}
        onOpenChange={(open) => { if (!open) setPostCreateCampaign(null); }}
      >
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Campaign created!</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{postCreateCampaign?.name}</span> is ready.
              Would you like to invite creators now, or set up the brief first?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="w-full gap-2"
              onClick={() => {
                const id = postCreateCampaign?.id;
                setPostCreateCampaign(null);
                if (id) router.push(`/invites?campaign=${encodeURIComponent(id)}`);
              }}
            >
              <Mail size={15} />
              Send invites now
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const id = postCreateCampaign?.id;
                setPostCreateCampaign(null);
                if (id) router.push(`/briefs?campaign=${encodeURIComponent(id)}`);
              }}
            >
              Go to brief editor
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setPostCreateCampaign(null)}
            >
              Later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
