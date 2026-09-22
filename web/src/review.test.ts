import { describe, expect, it } from 'vitest';
import { evidenceForTarget, reviewActionLabel, selectTarget } from './review';
import type { Snapshot, ReviewTarget } from './types';

const snapshot: Snapshot = {
  repository: { id: 'fixture', name: 'vpay-backend', revision: 'abc123' },
  agentTurn: { id: 'turn-001', title: 'Add retries', status: 'review', changedFiles: 2 },
  nodes: [],
  edges: [],
  evidence: [
    { id: 'diff-payments', kind: 'diff', title: 'Payment diff', detail: '+8 -2', status: 'changed', targetId: 'payments' },
    { id: 'test-payments', kind: 'test', title: 'Payment tests', detail: '1 failed', status: 'failed', targetId: 'payments' },
  ],
  verification: { status: 'attention', passed: 1, failed: 1, command: 'go test ./...', elapsed: '1s' },
};

const targets: ReviewTarget[] = [
  {
    id: 'payments', label: 'Payments', kind: 'component', rank: 1, score: 4.2,
    reason: 'Review first', confidence: 1, judgmentSource: 'deterministic',
    signals: { diffLines: 8, fanOut: 2, boundaryCrossings: 1, publicContractImpact: 0, verification: 'failed' },
    evidenceIds: ['diff-payments', 'test-payments'], nodeIds: ['payments'],
  },
];

describe('review surface helpers', () => {
  it('selects a target and resolves its evidence in source order', () => {
    const target = selectTarget(targets, 'payments');
    expect(target?.id).toBe('payments');
    expect(evidenceForTarget(snapshot, target!)).toHaveLength(2);
    expect(evidenceForTarget(snapshot, target!)[1].status).toBe('failed');
  });

  it('uses explicit labels for human review actions', () => {
    expect(reviewActionLabel('revise')).toBe('Request revision');
    expect(reviewActionLabel('approve')).toBe('Approve');
  });
});
