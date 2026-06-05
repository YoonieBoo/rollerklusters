import {
  Campaign,
  Brief,
  Submission,
  Report,
  User,
  DashboardMetrics,
} from './types';

export const currentUser: User = {
  id: 'user-1',
  name: 'Alex Johnson',
  email: 'alex.johnson@rollerkluster.com',
  role: 'admin',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
};

export const campaigns: Campaign[] = [
  {
    id: 'camp-1',
    name: 'Summer Collection Launch 2024',
    client: 'TrendSetters Co.',
    status: 'active',
    briefStatus: 'published',
    reviewStatus: 'in-review',
    reportStatus: 'in-progress',
    submissionsCount: 12,
    submissionsReviewed: 8,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-04-10'),
    description: 'Major summer collection campaign with focus on sustainability',
  },
  {
    id: 'camp-2',
    name: 'Holiday Gift Guide Campaign',
    client: 'Luxury Goods Inc.',
    status: 'active',
    briefStatus: 'approved',
    reviewStatus: 'pending',
    reportStatus: 'draft',
    submissionsCount: 8,
    submissionsReviewed: 3,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-04-12'),
    description: 'Curated gift guide for holiday season targeting premium buyers',
  },
  {
    id: 'camp-3',
    name: 'Product Launch - TechPro X',
    client: 'TechPro Industries',
    status: 'active',
    briefStatus: 'published',
    reviewStatus: 'in-review',
    reportStatus: 'completed',
    submissionsCount: 15,
    submissionsReviewed: 15,
    createdAt: new Date('2023-12-10'),
    updatedAt: new Date('2024-04-08'),
    description: 'Launch campaign for flagship tech product',
  },
  {
    id: 'camp-4',
    name: 'Brand Awareness Initiative',
    client: 'HealthFirst Wellness',
    status: 'draft',
    briefStatus: 'draft',
    reviewStatus: 'pending',
    reportStatus: 'draft',
    submissionsCount: 0,
    submissionsReviewed: 0,
    createdAt: new Date('2024-04-05'),
    updatedAt: new Date('2024-04-13'),
    description: 'Expanding brand awareness across new markets',
  },
  {
    id: 'camp-5',
    name: 'Q2 Social Media Blitz',
    client: 'Fashion Forward Ltd.',
    status: 'completed',
    briefStatus: 'published',
    reviewStatus: 'approved',
    reportStatus: 'completed',
    submissionsCount: 20,
    submissionsReviewed: 20,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-03-30'),
    description: 'Quarterly social media campaign across all platforms',
  },
];

export const briefs: Brief[] = [
  {
    id: 'brief-1',
    campaignId: 'camp-1',
    objective:
      'Showcase the new summer collection while emphasizing eco-friendly materials and sustainable production practices',
    targetAudience: 'Environmentally conscious women ages 25-45, mid to premium budget',
    contentDirection: [
      'Vibrant summer colors',
      'Lifestyle imagery',
      'Behind-the-scenes content',
      'Sustainability focus',
    ],
    platforms: ['Instagram', 'TikTok', 'Pinterest'],
    acceptanceCriteria: {
      keyMessages: [
        'Sustainable fashion for modern living',
        'Premium quality, eco-conscious design',
        'Exclusive summer collection available now',
      ],
      brandRulesDo: [
        'Use brand colors only (coral, sage green, cream)',
        'Show real models and diverse representation',
        'Include lifestyle context',
        'Highlight eco-friendly credentials',
      ],
      brandRulesDont: [
        'Do not use oversaturated colors',
        'Avoid generic stock photography',
        'Never compromise on quality for speed',
        'Do not mention competitors',
      ],
      requiredElements: {
        hashtags: [
          '#SustainableFashion',
          '#SummerCollection2024',
          '#EcoConscious',
        ],
        mentions: ['@TrendSettersCo', '@SustainabilityMatters'],
        cta: 'Shop the collection - Link in bio',
      },
    },
    status: 'published',
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-02-10'),
    createdBy: 'alex.johnson@rollerkluster.com',
  },
  {
    id: 'brief-2',
    campaignId: 'camp-2',
    objective:
      'Create an aspirational holiday gift guide that positions Luxury Goods Inc. as the premier destination for premium gifting',
    targetAudience: 'High-income gift buyers ages 35-65 with luxury spending power',
    contentDirection: [
      'Elegant photography',
      'Curated collections',
      'Price-point stratification',
      'Gift-giving inspiration',
    ],
    platforms: ['Instagram', 'Facebook', 'Email'],
    acceptanceCriteria: {
      keyMessages: [
        'Luxury gifting made elegant',
        'Curated for discerning tastes',
        'Limited edition selections',
      ],
      brandRulesDo: [
        'Use white space effectively',
        'Show product in luxury settings',
        'Emphasize exclusivity',
      ],
      brandRulesDont: [
        'Avoid casual tone',
        'No price comparisons',
        'Never use discount language',
      ],
      requiredElements: {
        hashtags: ['#LuxuryGifting', '#HolidayGuide2024', '#PremiumSelection'],
        mentions: ['@LuxuryGoodsInc'],
        cta: 'Explore the gift guide',
      },
    },
    status: 'approved',
    createdAt: new Date('2024-02-05'),
    updatedAt: new Date('2024-03-01'),
    createdBy: 'alex.johnson@rollerkluster.com',
  },
];

export const submissions: Submission[] = [
  {
    id: 'sub-1',
    campaignId: 'camp-1',
    creatorReference: 'Creator_001 - Sarah Chen',
    submissionLink: 'https://instagram.com/sarahchen_content/p/abc123',
    status: 'approved',
    submittedAt: new Date('2024-03-15'),
    reviewedAt: new Date('2024-03-18'),
    reviewedBy: 'alex.johnson@rollerkluster.com',
  },
  {
    id: 'sub-2',
    campaignId: 'camp-1',
    creatorReference: 'Creator_002 - Marcus Williams',
    submissionLink: 'https://instagram.com/marcuswilliams/p/def456',
    status: 'in-review',
    submittedAt: new Date('2024-03-20'),
  },
  {
    id: 'sub-3',
    campaignId: 'camp-1',
    creatorReference: 'Creator_003 - Jade Martinez',
    submissionLink: 'https://tiktok.com/@jademartinez/video/ghi789',
    status: 'rejected',
    feedback:
      'Content does not align with brand guidelines. Colors are oversaturated. Please revise and resubmit.',
    submittedAt: new Date('2024-03-22'),
    reviewedAt: new Date('2024-03-23'),
    reviewedBy: 'alex.johnson@rollerkluster.com',
  },
  {
    id: 'sub-4',
    campaignId: 'camp-1',
    creatorReference: 'Creator_004 - Alex Rivera',
    submissionLink: 'https://instagram.com/alexrivera_studio/p/jkl012',
    status: 'in-review',
    submittedAt: new Date('2024-03-24'),
  },
  {
    id: 'sub-5',
    campaignId: 'camp-2',
    creatorReference: 'Creator_005 - Emma Thompson',
    submissionLink: 'https://instagram.com/emmathompson_luxury/p/mno345',
    status: 'approved',
    submittedAt: new Date('2024-04-02'),
    reviewedAt: new Date('2024-04-03'),
    reviewedBy: 'alex.johnson@rollerkluster.com',
  },
];

export const reports: Report[] = [
  {
    id: 'report-1',
    campaignId: 'camp-3',
    summary: {
      title: 'Campaign Summary',
      content:
        'The TechPro X product launch campaign successfully reached 2.5M impressions across Instagram, TikTok, and YouTube. Engagement rates exceeded industry benchmarks by 34%, with strong conversion metrics in the premium demographic segment.',
    },
    approvedContent: {
      title: 'Approved Content Delivered',
      content:
        '15 creator submissions approved and published. Total reach: 2.5M impressions. Average engagement rate: 8.2%. Click-through rate to product page: 4.7%. Generated 2,340 qualified leads.',
    },
    pendingIssues: {
      title: 'Pending Issues',
      content:
        'No critical issues. Minor note: Two creators requested payment plan adjustments which have been approved by finance team.',
    },
    keyNotes: {
      title: 'Key Observations',
      content:
        'Tech-focused creators generated highest engagement. Reels format outperformed static posts by 3x. Audience sentiment across all platforms was overwhelmingly positive (94% positive mentions). Recommend similar influencer mix for future tech launches.',
    },
    status: 'completed',
    createdAt: new Date('2024-03-25'),
    updatedAt: new Date('2024-04-08'),
  },
];

export const dashboardMetrics: DashboardMetrics = {
  activeCampaigns: 4,
  brifsCompleted: 6,
  submissionsReviewed: 28,
  reportsGenerated: 5,
  issuesFlagged: 2,
};

export const recentActivity = [
  {
    id: 1,
    type: 'submission_reviewed',
    campaign: 'Summer Collection Launch 2024',
    description: 'Submission from Creator_002 approved',
    timestamp: new Date('2024-04-12T14:30:00'),
  },
  {
    id: 2,
    type: 'brief_updated',
    campaign: 'Product Launch - TechPro X',
    description: 'Campaign report marked as completed',
    timestamp: new Date('2024-04-10T10:15:00'),
  },
  {
    id: 3,
    type: 'campaign_created',
    campaign: 'Brand Awareness Initiative',
    description: 'New campaign created for HealthFirst Wellness',
    timestamp: new Date('2024-04-05T09:45:00'),
  },
];
