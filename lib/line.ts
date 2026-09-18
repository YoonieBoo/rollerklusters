// Raw fetch calls against LINE's Messaging API — the surface we need here
// (push a message) is small enough that a dependency isn't worth it.

export function hasLineMessagingConfig() {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

export async function pushLineMessage(lineUserId: string, text: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) return { skipped: true as const };

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn('LINE push failed:', res.status, detail);
    return { skipped: false as const, error: `LINE push failed: ${res.status} ${detail}` };
  }
  return { skipped: false as const };
}
