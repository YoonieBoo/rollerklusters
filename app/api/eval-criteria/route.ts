import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export type EvalCriteriaRequest = {
  campaignName: string;
  objective: string;
  targetAudience: string;
  contentDirection: string;
  platforms: string[];
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  cta: string;
};

export type EvalCriteriaResult = {
  acceptanceCriteria: string[];
  goodContentExamples: string[];
  badContentExamples: string[];
  edgeCases: string[];
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-openai-api-key-here') {
    return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
  }

  const body = await request.json() as EvalCriteriaRequest;
  const { campaignName, objective, targetAudience, contentDirection, platforms, keyMessages, brandRulesDo, brandRulesDont, cta } = body;

  if (!campaignName || !objective) {
    return NextResponse.json({ error: 'Campaign name and objective are required.' }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `You are a campaign quality reviewer at a creator marketing platform (AU Creator Campus, Bangkok). Based on the campaign brief below, generate clear evaluation criteria for reviewing creator content submissions.

Campaign: "${campaignName}"
Objective: ${objective}
Target Audience: ${targetAudience}
Content Direction: ${contentDirection}
Platforms: ${platforms.join(', ')}
Key Messages: ${keyMessages.join(' | ')}
Brand Do Rules: ${brandRulesDo.join(' | ')}
Brand Don't Rules: ${brandRulesDont.join(' | ')}
Call to Action: ${cta}

Return a JSON object with exactly these fields:
- acceptanceCriteria: Array of 4-5 specific, measurable requirements that content MUST meet to be approved (e.g., "Must mention the campaign hashtag at least once", "Product must be shown in use for at least 3 seconds")
- goodContentExamples: Array of 4-5 concrete descriptions of what approved content looks like for this specific campaign (reference the brand, audience, and tone)
- badContentExamples: Array of 4-5 descriptions of content that would be rejected, with specific reasons tied to this brief (not generic)
- edgeCases: Array of 3-5 specific edge cases reviewers must watch for with this campaign (e.g., "Creator mentions competitor products", "CTA placed at beginning instead of end", "Tone mismatch with ${targetAudience} audience")

Be specific to this campaign — reference the brand, audience, platforms, and tone. Do not give generic advice. Write for a campaign manager reviewing real student creator submissions.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const result = JSON.parse(raw) as Partial<EvalCriteriaResult>;

    const validated: EvalCriteriaResult = {
      acceptanceCriteria: Array.isArray(result.acceptanceCriteria) ? result.acceptanceCriteria : [],
      goodContentExamples: Array.isArray(result.goodContentExamples) ? result.goodContentExamples : [],
      badContentExamples: Array.isArray(result.badContentExamples) ? result.badContentExamples : [],
      edgeCases: Array.isArray(result.edgeCases) ? result.edgeCases : [],
    };

    return NextResponse.json(validated);
  } catch (error) {
    console.error('eval-criteria error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate evaluation criteria.' },
      { status: 500 }
    );
  }
}
