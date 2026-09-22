import { describe, expect, it } from 'vitest';
import { decisionForTarget, evidenceForTarget, reviewActionLabel, selectTarget, targetForNode } from './review';
import type { ReviewDecision, Snapshot, ReviewTarget } from './types';

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

  it('resolves related graph nodes to the review target that owns them', () => {
    const relatedTargets: ReviewTarget[] = [
      { ...targets[0], nodeIds: ['payments', 'domain', 'adapters'] },
      { ...targets[0], id: 'api', label: 'API', rank: 2, nodeIds: ['api'] },
    ];

    expect(targetForNode(relatedTargets, 'domain')?.id).toBe('payments');
    expect(targetForNode(relatedTargets, 'api')?.id).toBe('api');
    expect(targetForNode(relatedTargets, 'missing')).toBeUndefined();
  });

  it('does not infer a graph relationship from a target ID collision', () => {
    const collisionTarget: ReviewTarget = { ...targets[0], id: 'domain', nodeIds: ['payments'] };
    expect(targetForNode([collisionTarget], 'domain')).toBeUndefined();
  });

  it('keeps review decisions scoped to their target and uses the latest one', () => {
    const decisions: ReviewDecision[] = [
      { id: 'd1', targetId: 'payments', decision: 'revise', reason: '', createdAt: '2026-09-22T10:00:00Z' },
      { id: 'd2', targetId: 'api', decision: 'approve', reason: '', createdAt: '2026-09-22T10:01:00Z' },
      { id: 'd3', targetId: 'payments', decision: 'approve', reason: '', createdAt: '2026-09-22T10:02:00Z' },
    ];

    expect(decisionForTarget(decisions, 'payments')?.id).toBe('d3');
    expect(decisionForTarget(decisions, 'api')?.id).toBe('d2');
    expect(decisionForTarget(decisions, 'tests')).toBeUndefined();
  });
});
