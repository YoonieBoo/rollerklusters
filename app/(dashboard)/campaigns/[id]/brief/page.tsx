'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyCampaignBriefRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    if (!campaignId) {
      router.replace('/campaigns');
      return;
    }

    router.replace(`/campaigns/${encodeURIComponent(campaignId)}`);
  }, [campaignId, router]);

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">Opening the campaign brief...</p>
    </div>
  );
}
