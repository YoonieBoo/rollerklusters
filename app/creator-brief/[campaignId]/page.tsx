'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  downloadCreatorBriefPdf,
  getCreatorBriefExportData,
  type CreatorBriefDocument,
} from '@/lib/creator-brief-export';

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="border-t border-slate-200 py-8">
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
      {title}
    </h2>
    <div className="mt-4 text-[15px] leading-7 text-slate-700">{children}</div>
  </section>
);

const ListContent = ({ items }: { items: string[] }) => {
  const cleanItems = items.filter(Boolean);

  if (cleanItems.length === 0) {
    return <p>To be confirmed.</p>;
  }

  return (
    <ul className="space-y-2">
      {cleanItems.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
};

export default function CreatorBriefPage() {
  const params = useParams();
  const campaignId = Array.isArray(params.campaignId)
    ? params.campaignId[0]
    : params.campaignId;
  const [brief, setBrief] = useState<CreatorBriefDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchBrief = async () => {
      if (!campaignId) {
        setErrorMessage('Campaign not found');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage(null);
        setBrief(await getCreatorBriefExportData(campaignId));
      } catch (error) {
        console.error('Creator brief fetch error:', error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load this creator brief.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrief();
  }, [campaignId]);

  const handleExportPdf = async () => {
    if (!brief) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadCreatorBriefPdf(brief);
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-white px-6 py-12 text-slate-950">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-slate-500">Loading creator brief...</p>
        </div>
      </main>
    );
  }

  if (errorMessage || !brief) {
    return (
      <main className="min-h-screen bg-white px-6 py-12 text-slate-950">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-red-600">Unable to open creator brief</p>
          <p className="mt-2 text-sm text-slate-500">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10 lg:py-14">
        <div className="mb-10 flex flex-col gap-4 border-b border-slate-200 pb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              RollerKluster Creator Brief
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-slate-950">
              {brief.campaignName}
            </h1>
            <div className="mt-6 grid gap-5 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Brand / Client
                </p>
                <p className="mt-2 text-slate-900">{brief.clientName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Campaign Timeline
                </p>
                <p className="mt-2 text-slate-900">{brief.timeline}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Status
                </p>
                <p className="mt-2 capitalize text-slate-900">{brief.status}</p>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={handleExportPdf}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
        </div>

        <Section title="Campaign Goal">
          <p>{brief.campaignGoal}</p>
        </Section>

        <Section title="Target Audience">
          <p>{brief.targetAudience}</p>
        </Section>

        <Section title="Content Direction">
          <p>{brief.contentDirection}</p>
          {brief.platforms.length > 0 && (
            <p className="mt-4 text-slate-600">
              Platforms: {brief.platforms.join(', ')}
            </p>
          )}
        </Section>

        <Section title="Key Messages">
          <ListContent items={brief.keyMessages} />
        </Section>

        <Section title="Brand Rules">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-950">Do</p>
              <div className="mt-3">
                <ListContent items={brief.brandRulesDo} />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Do not</p>
              <div className="mt-3">
                <ListContent items={brief.brandRulesDont} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Hashtags & Mentions">
          <div className="space-y-4">
            <p>
              <span className="font-medium text-slate-950">Hashtags:</span>{' '}
              {brief.hashtags.length > 0 ? brief.hashtags.join(' ') : 'To be confirmed.'}
            </p>
            <p>
              <span className="font-medium text-slate-950">Mentions:</span>{' '}
              {brief.mentions.length > 0 ? brief.mentions.join(' ') : 'To be confirmed.'}
            </p>
          </div>
        </Section>

        <Section title="Call To Action">
          <p>{brief.callToAction}</p>
        </Section>

        <Section title="Submission Deadline">
          <p>{brief.submissionDeadline}</p>
        </Section>

        <Section title="Approval Notes">
          <p>{brief.approvalNotes}</p>
        </Section>

        <Section title="Contact / Support">
          <p>{brief.contactSupport}</p>
        </Section>
      </div>
    </main>
  );
}
