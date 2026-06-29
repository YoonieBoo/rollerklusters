import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export type BriefAssistRequest = {
  campaignName: string;
  clientName: string;
  campaignDescription?: string;
  objective?: string;
  targetAudience?: string;
  contentDirection?: string;
  platforms?: string[];
};

export type BriefAssistResult = {
  objective: string;
  targetAudience: string;
  contentDirection: string;
  platforms: string[];
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  hashtags: string[];
  mentions: string[];
  cta: string;
};

const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Twitter', 'Facebook'];

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-openai-api-key-here') {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
  }

  const body = await request.json() as BriefAssistRequest;
  const { campaignName, clientName, campaignDescription, objective, targetAudience, contentDirection, platforms } = body;

  if (!campaignName) {
    return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const existingContext = [
    campaignDescription ? `Campaign description from manager: ${campaignDescription}` : '',
    objective ? `Campaign goal: ${objective}` : '',
    targetAudience ? `Target audience: ${targetAudience}` : '',
    contentDirection ? `Content direction: ${contentDirection}` : '',
    platforms?.length ? `Platforms: ${platforms.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a campaign brief assistant for a creator marketing platform called RollerKluster, operating at AU Creator Campus (Assumption University, Bangkok).

Campaign: "${campaignName}"
Client / Brand: "${clientName || 'Not specified'}"
${existingContext ? `\nContext provided by the campaign manager:\n${existingContext}` : ''}

Generate a complete, professional creator campaign brief for this campaign. The brief will be sent to university student creators on TikTok and Instagram.

Return a JSON object with exactly these fields:
- objective: A clear 2-3 sentence campaign goal statement
- targetAudience: A 2-3 sentence description of the target audience (age, interests, demographics)
- contentDirection: 3-4 sentences on tone, style, and content approach for creators
- platforms: Array of platforms from this list only: ${PLATFORM_OPTIONS.join(', ')} — pick the most relevant 1-3
- keyMessages: Array of 3 specific key messages creators must communicate
- brandRulesDo: Array of 3 specific things creators should do (brand-positive actions)
- brandRulesDont: Array of 3 specific things creators must avoid (brand-negative actions)
- hashtags: Array of 3 relevant campaign hashtags (with # prefix)
- mentions: Array of 1-2 brand account handles to mention (with @ prefix)
- cta: A single clear call-to-action instruction for creators to include

Keep all text concise and actionable. Write as if briefing real student creators.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const result = JSON.parse(raw) as Partial<BriefAssistResult>;

    const validated: BriefAssistResult = {
      objective: result.objective ?? '',
      targetAudience: result.targetAudience ?? '',
      contentDirection: result.contentDirection ?? '',
      platforms: (result.platforms ?? []).filter((p) => PLATFORM_OPTIONS.includes(p)),
      keyMessages: result.keyMessages ?? [],
      brandRulesDo: result.brandRulesDo ?? [],
      brandRulesDont: result.brandRulesDont ?? [],
      hashtags: result.hashtags ?? [],
      mentions: result.mentions ?? [],
      cta: result.cta ?? '',
    };

    return NextResponse.json(validated);
  } catch (error) {
    console.error('OpenAI brief assist error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI assist failed. Please try again.' },
      { status: 500 }
    );
  }
}
