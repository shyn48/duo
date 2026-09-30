import type { AgentEvent, Evidence, ReviewDecision, ReviewTarget, Snapshot } from './types';

export function selectTarget(targets: ReviewTarget[], targetId: string): ReviewTarget | undefined {
  return targets.find((target) => target.id === targetId);
}

export function evidenceForTarget(snapshot: Snapshot, target: ReviewTarget): Evidence[] {
  const ids = new Set(target.evidenceIds);
  return snapshot.evidence.filter((evidence) => ids.has(evidence.id));
}

export function eventsForTarget(events: AgentEvent[], target: ReviewTarget): AgentEvent[] {
  const nodeIds = new Set(target.nodeIds);
  return events.filter((event) => event.targetIds.some((nodeId) => nodeIds.has(nodeId)));
}

export function targetForNode(targets: ReviewTarget[], nodeId: string): ReviewTarget | undefined {
  return targets.find((target) => target.nodeIds.includes(nodeId));
}

export function decisionForTarget(decisions: ReviewDecision[], targetId: string): ReviewDecision | undefined {
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    if (decisions[index].targetId === targetId) return decisions[index];
  }
  return undefined;
}

export function reviewActionLabel(action: 'approve' | 'revise' | 'reject'): string {
  if (action === 'revise') return 'Request revision';
  if (action === 'reject') return 'Reject';
  return 'Approve';
}
