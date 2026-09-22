export type Status = 'changed' | 'related' | 'unchanged';

export interface Repository {
  id: string;
  name: string;
  revision: string;
  root?: string;
}

export interface AgentTurn {
  id: string;
  title: string;
  status: string;
  changedFiles: number;
  completionClaim?: string;
}

export interface Node {
  id: string;
  label: string;
  kind: string;
  status: Status;
  fileCount: number;
}

export interface Edge {
  from: string;
  to: string;
  kind: string;
  status: string;
}

export interface Evidence {
  id: string;
  kind: string;
  title: string;
  detail: string;
  status: string;
  targetId?: string;
}

export interface Verification {
  status: string;
  passed: number;
  failed: number;
  command: string;
  elapsed: string;
}

export interface Snapshot {
  repository: Repository;
  agentTurn: AgentTurn;
  nodes: Node[];
  edges: Edge[];
  evidence: Evidence[];
  verification: Verification;
}

export interface ReviewSignals {
  diffLines: number;
  fanOut: number;
  boundaryCrossings: number;
  publicContractImpact: number;
  verification: string;
}

export interface ReviewTarget {
  id: string;
  label: string;
  kind: string;
  rank: number;
  score: number;
  reason: string;
  confidence: number;
  judgmentSource: string;
  signals: ReviewSignals;
  evidenceIds: string[];
  nodeIds: string[];
}

export interface ReviewDecision {
  id: string;
  targetId: string;
  decision: string;
  reason: string;
  createdAt: string;
}

export interface SnapshotPayload {
  snapshot: Snapshot;
  reviewTargets: ReviewTarget[];
  decisions: ReviewDecision[];
}
