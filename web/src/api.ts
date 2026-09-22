import type { ReviewDecision, SnapshotPayload } from './types';

export async function loadSnapshot(): Promise<SnapshotPayload> {
  const response = await fetch('/api/snapshot');
  if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
  return response.json() as Promise<SnapshotPayload>;
}

export async function submitReviewDecision(
  targetId: string,
  decision: 'approve' | 'revise' | 'reject',
  reason: string,
): Promise<ReviewDecision> {
  const response = await fetch('/api/review-decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId, decision, reason }),
  });
  if (!response.ok) throw new Error(`Review decision failed (${response.status})`);
  return response.json() as Promise<ReviewDecision>;
}
