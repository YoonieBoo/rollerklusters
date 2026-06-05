export type CampaignStatus = 'active' | 'draft' | 'completed' | 'on-hold';
export type BriefStatus = 'draft' | 'in-review' | 'approved' | 'published';
export type ReviewStatus = 'pending' | 'in-review' | 'approved' | 'rejected';
export type ReportStatus = 'draft' | 'in-progress' | 'completed';

export interface Campaign {
  id: string;
  name: string;
  client: string;
  status: CampaignStatus;
  briefStatus: BriefStatus;
  reviewStatus: ReviewStatus;
  reportStatus: ReportStatus;
  submissionsCount: number;
  submissionsReviewed: number;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
}

export interface AcceptanceCriteria {
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  requiredElements: {
    hashtags?: string[];
    mentions?: string[];
    cta?: string;
  };
}

export interface Brief {
  id: string;
  campaignId: string;
  objective: string;
  targetAudience: string;
  contentDirection: string[];
  platforms: string[];
  acceptanceCriteria: AcceptanceCriteria;
  status: BriefStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Submission {
  id: string;
  campaignId: string;
  creatorReference: string;
  submissionLink: string;
  status: ReviewStatus;
  feedback?: string;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

export interface ReportSection {
  title: string;
  content: string;
}

export interface Report {
  id: string;
  campaignId: string;
  summary: ReportSection;
  approvedContent: ReportSection;
  pendingIssues: ReportSection;
  keyNotes: ReportSection;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'reviewer';
  avatar?: string;
}

export interface DashboardMetrics {
  activeCampaigns: number;
  brifsCompleted: number;
  submissionsReviewed: number;
  reportsGenerated: number;
  issuesFlagged: number;
}
