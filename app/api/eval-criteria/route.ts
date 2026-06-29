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

  const prompt = `You are helping a campaign manager review creator video submissions. Based on the brief below, write a simple checklist they can use during review.

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
- acceptanceCriteria: Array of 4-5 short, plain-English rules the video MUST follow to be approved. Start each with a verb. Example: "Shows the product being used", "Includes the hashtag at least once", "Ends with the call to action"
- goodContentExamples: Array of 4-5 short sentences describing what a good video looks like. Write like you are describing it to a colleague. Example: "The creator feels genuine and relaxed, not scripted", "The product is clearly shown and looks appealing"
- badContentExamples: Array of 4-5 short sentences describing what would get a video rejected. Example: "The creator never shows or mentions the product", "The tone feels too formal for the target audience"
- edgeCases: Array of 3-5 short sentences about tricky situations to watch out for. Example: "Video looks good but the CTA is missing at the end", "Creator mentions a competitor brand by name"

Use short, simple sentences. No jargon. Write as if texting a teammate what to look for. Be specific to this campaign.`;

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
