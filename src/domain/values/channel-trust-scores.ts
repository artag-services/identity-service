export const CHANNEL_TRUST_SCORES: Record<string, number> = {
  instagram: 0.95,
  slack: 0.95,
  email: 0.90,
  notion: 0.80,
  whatsapp: 0.70,
  facebook: 0.75,
  tiktok: 0.70,
}

export function getTrustScore(channel: string): number {
  return CHANNEL_TRUST_SCORES[channel] ?? 0.5
}
