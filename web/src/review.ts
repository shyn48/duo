import type { Evidence, ReviewTarget, Snapshot } from './types';

export function selectTarget(targets: ReviewTarget[], targetId: string): ReviewTarget | undefined {
  return targets.find((target) => target.id === targetId);
}

export function evidenceForTarget(snapshot: Snapshot, target: ReviewTarget): Evidence[] {
  const ids = new Set(target.evidenceIds);
  return snapshot.evidence.filter((evidence) => ids.has(evidence.id));
}

export function reviewActionLabel(action: 'approve' | 'revise' | 'reject'): string {
  if (action === 'revise') return 'Request revision';
  if (action === 'reject') return 'Reject';
  return 'Approve';
}
