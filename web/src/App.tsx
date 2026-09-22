import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Code2,
  Command,
  FileCode2,
  Files,
  GitBranch,
  Layers3,
  MessageSquareReply,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  TestTube2,
} from 'lucide-react';
import { loadSnapshot, submitReviewDecision } from './api';
import { decisionForTarget, evidenceForTarget, reviewActionLabel, selectTarget, targetForNode } from './review';
import type { Evidence, Node, ReviewDecision, ReviewTarget, SnapshotPayload } from './types';
import './styles.css';

const navItems = [
  { label: 'Overview', icon: Layers3 },
  { label: 'Change map', icon: GitBranch, active: true },
  { label: 'Agent activity', icon: Activity },
  { label: 'Files', icon: Files },
  { label: 'Tests', icon: TestTube2 },
  { label: 'Decisions', icon: ShieldCheck },
];

function App() {
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [selectedId, setSelectedId] = useState('payments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [decisionBusyTargetId, setDecisionBusyTargetId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<{ targetId: string; message: string } | null>(null);

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  async function refreshSnapshot() {
    setLoading(true);
    setError(null);
    try {
      const data = await loadSnapshot();
      setPayload(data);
      setDecisions(data.decisions ?? []);
      setSelectedId(data.reviewTargets[0]?.id ?? '');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to load snapshot');
    } finally {
      setLoading(false);
    }
  }

  const selectedTarget = useMemo(
    () => (payload ? selectTarget(payload.reviewTargets, selectedId) ?? payload.reviewTargets[0] : undefined),
    [payload, selectedId],
  );
  const selectedEvidence = payload && selectedTarget ? evidenceForTarget(payload.snapshot, selectedTarget) : [];
  const selectedDecision = selectedTarget ? decisionForTarget(decisions, selectedTarget.id) : undefined;

  async function handleDecision(action: 'approve' | 'revise') {
    if (!selectedTarget || decisionBusyTargetId) return;
    const target = selectedTarget;
    setDecisionError(null);
    setDecisionBusyTargetId(target.id);
    try {
      const next = await submitReviewDecision(
        target.id,
        action,
        action === 'revise' ? 'Review the highlighted evidence before another agent pass.' : 'Reviewed the prioritized evidence.',
      );
      setDecisions((current) => [...current, next]);
    } catch (reason: unknown) {
      setDecisionError({ targetId: target.id, message: reason instanceof Error ? reason.message : 'Unable to save review decision' });
    } finally {
      setDecisionBusyTargetId(null);
    }
  }

  if (loading) return <div className="loading-screen"><div className="loading-mark"><Sparkles size={18} /></div><span>Loading change map…</span></div>;
  if (error || !payload) return <div className="error-screen"><AlertTriangle size={20} /><div><strong>Atlas could not load this turn.</strong><span>{error ?? 'No snapshot returned.'}</span><button className="retry-button" type="button" onClick={() => void refreshSnapshot()}>Retry</button></div></div>;

  const { snapshot, reviewTargets } = payload;
  const selectedNodeIds = new Set(selectedTarget?.nodeIds ?? []);
  const graphLayout = layoutGraph(snapshot.nodes);
  const graphPositions = graphLayout.positions;
  const verificationUnknown = snapshot.verification.status.toLowerCase() === 'unknown';
  const verificationPassed = snapshot.verification.status.toLowerCase() === 'passed' && snapshot.verification.failed === 0;
  const graphNodeSummary = `${snapshot.nodes.length} ${snapshot.nodes.every((node) => node.kind === 'file') ? `file${snapshot.nodes.length === 1 ? '' : 's'}` : `component${snapshot.nodes.length === 1 ? '' : 's'}`}`;

  function selectGraphNode(nodeId: string) {
    const target = targetForNode(reviewTargets, nodeId);
    if (target) {
      setDecisionError(null);
      setSelectedId(target.id);
    }
  }

  return (
    <div className="atlas-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><Sparkles size={16} strokeWidth={2.6} /></div><span>Duo Atlas</span></div>
        <button className="repo-switcher" type="button" disabled><span className="repo-glyph"><GitBranch size={14} /></span><span className="repo-meta"><strong>{snapshot.repository.name}</strong><small>Local repository</small></span><ChevronDown size={15} /></button>
        <div className="nav-group">
          <span className="nav-caption">Workspace</span>
          {navItems.map(({ label, icon: Icon, active }) => <button key={label} className={`nav-item ${active ? 'active' : ''}`} type="button" disabled aria-current={active ? 'page' : undefined}><Icon size={16} /><span>{label}</span>{label === 'Tests' && snapshot.verification.failed > 0 ? <span className="nav-count danger">{snapshot.verification.failed}</span> : null}</button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="agent-card"><div className="agent-avatar"><Command size={14} /></div><div><span>Agent turn</span><strong>{formatStatus(snapshot.agentTurn.status)}</strong></div><CircleDot size={12} className="live-dot" /></div>
          <button className="nav-item" type="button" disabled><ShieldCheck size={16} /><span>Constraints</span></button>
          <button className="nav-item" type="button" disabled><MoreHorizontal size={16} /><span>Settings</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="crumbs"><span>Repositories</span><span>/</span><strong>{snapshot.repository.name}</strong><span>/</span><span>Agent turn</span></div><div className="topbar-actions"><button className="icon-button" type="button" aria-label="Search" disabled><Search size={17} /></button><button className="shortcut" type="button" disabled><Command size={12} /><span>K</span></button><button className="avatar-button" type="button" disabled>S</button></div></header>

        <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> Agent turn · {snapshot.agentTurn.id}</div><h1>Architecture change map</h1><p>{snapshot.agentTurn.title}</p></div><div className="intro-meta"><span className="status-pill review"><span /> {formatStatus(snapshot.agentTurn.status)}</span><span className="revision">{snapshot.repository.revision}</span><button className="icon-button" type="button" aria-label="More options" disabled><MoreHorizontal size={17} /></button></div></section>

        <div className="workspace-grid">
          <section className="map-column">
            <div className="panel map-panel"><div className="panel-heading"><div><span className="section-kicker">System view</span><h2>Change map</h2></div><div className="map-heading-meta"><span>{graphNodeSummary}</span><span className="divider-dot" /><span>{snapshot.agentTurn.changedFiles} files changed</span></div></div>
              <div className="graph-canvas" style={{ minHeight: `${graphLayout.height}px` }}>
                <svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {snapshot.edges.map((edge, index) => {
                    const from = graphPositions.get(edge.from);
                    const to = graphPositions.get(edge.to);
                    if (!from || !to) return null;
                    return <line key={`${edge.from}-${edge.to}-${edge.kind}-${index}`} className={edge.status} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
                  })}
                </svg>
                {snapshot.nodes.map((node) => {
                  const position = graphPositions.get(node.id)!;
                  return <GraphNode key={node.id} node={node} position={position} selected={selectedNodeIds.has(node.id)} onClick={selectGraphNode} enabled={Boolean(targetForNode(reviewTargets, node.id))} />;
                })}
                {snapshot.nodes.length > 0 ? <div className="graph-legend"><span><i className="legend-dot changed" /> Changed</span><span><i className="legend-dot related" /> Related</span><span><i className="legend-dot unchanged" /> Unchanged</span></div> : <div className="empty-graph">No graph nodes in this snapshot.</div>}
              </div>
              <div className="map-footer"><div className="workflow"><WorkflowStep label="Plan" /><WorkflowStep label="Edit" /><WorkflowStep label="Tests" done={snapshot.verification.status === 'passed' && snapshot.verification.failed === 0} warning={snapshot.verification.status === 'attention' || snapshot.verification.failed > 0} /><WorkflowStep label="Review" active={snapshot.agentTurn.status.toLowerCase() === 'review'} /></div><span className="footer-revision"><GitBranch size={13} /> {snapshot.repository.revision}</span></div>
            </div>
            <div className="panel review-queue"><div className="panel-heading compact"><div><span className="section-kicker">Human review</span><h2>Review first</h2></div><span className="queue-caption">{reviewTargets.length} prioritized targets</span></div><div className="queue-list">{reviewTargets.length > 0 ? reviewTargets.map((target) => <ReviewRow key={target.id} target={target} selected={target.id === selectedTarget?.id} onClick={() => setSelectedId(target.id)} />) : <div className="empty-queue">No review targets in this snapshot.</div>}</div></div>
          </section>

          <aside className="panel evidence-panel"><div className="evidence-header"><div><span className="section-kicker">Selected target</span><h2>Evidence</h2></div><span className="confidence-chip"><Sparkles size={12} /> {selectedTarget?.judgmentSource === 'jev' ? 'Jev judgment' : 'Deterministic baseline'}{selectedTarget ? ` · ${Math.round(selectedTarget.confidence * 100)}% confidence` : ''}</span></div>{selectedTarget ? <><div className="selected-target"><div className="target-icon"><Layers3 size={18} /></div><div><h3>{selectedTarget.label}</h3><span>Priority #{selectedTarget.rank} · {selectedTarget.kind}</span></div><span className="priority-badge">Score {selectedTarget.score.toFixed(1)}</span></div><div className="reason-box"><span>Why review this first</span><strong>{selectedTarget.reason}</strong></div><SignalGrid target={selectedTarget} /><div className="evidence-section"><div className="subsection-heading"><h3>Linked evidence</h3><span>{selectedEvidence.length} items</span></div><div className="evidence-list">{selectedEvidence.map((item) => <EvidenceRow key={item.id} item={item} />)}</div></div><div className={`verification-card ${verificationUnknown ? 'unknown' : verificationPassed ? 'passed' : 'attention'}`}><div className="verification-icon">{verificationUnknown ? <Clock3 size={17} /> : verificationPassed ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</div><div><span>Verification · {snapshot.verification.status}</span><strong>{verificationUnknown ? 'Not run' : `${snapshot.verification.passed} passed · ${snapshot.verification.failed} failed`}</strong><small>{snapshot.verification.command} · {snapshot.verification.elapsed}</small></div></div><div className="decision-area">{selectedDecision ? <div className={`decision-confirmation ${selectedDecision.decision}`} role="status"><CheckCircle2 size={16} /><span>{selectedDecision.decision === 'revise' ? 'Revision requested' : selectedDecision.decision === 'reject' ? 'Review rejected' : 'Review approved'}</span></div> : <><button className="revision-button" type="button" disabled={decisionBusyTargetId !== null} onClick={() => void handleDecision('revise')}><MessageSquareReply size={16} /> {reviewActionLabel('revise')}</button><button className="approve-button" type="button" disabled={decisionBusyTargetId !== null} onClick={() => void handleDecision('approve')}><Check size={16} /> {reviewActionLabel('approve')}</button>{decisionError?.targetId === selectedTarget.id ? <div className="decision-error" role="alert">{decisionError.message}</div> : null}</>}</div></> : <div className="empty-selection">Select a review target to inspect its evidence.</div>}</aside>
        </div>
      </main>
    </div>
  );
}

function formatStatus(status: string): string {
  const normalized = status.replace(/[-_]+/g, ' ').trim();
  if (!normalized) return 'Unknown';
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

type GraphPosition = { x: number; y: number };
type GraphLayout = { positions: Map<string, GraphPosition>; height: number };

function layoutGraph(nodes: Node[]): GraphLayout {
  const positions = new Map<string, GraphPosition>();
  if (nodes.length === 0) return { positions, height: 386 };
  if (nodes.length > 8) {
	const columns = 2;
    const rows = Math.ceil(nodes.length / columns);
    const rowHeight = 86;
    const height = Math.max(386, rows * rowHeight + 60);
    nodes.forEach((node, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      positions.set(node.id, {
        x: ((column + 0.5) / columns) * 100,
        y: (((row + 0.5) * rowHeight) / height) * 100,
      });
    });
    return { positions, height };
  }
  const centerX = 50;
  const centerY = 46;
  const radiusX = 26;
  const radiusY = 30;
  nodes.forEach((node, index) => {
    if (nodes.length === 1) {
      positions.set(node.id, { x: centerX, y: centerY });
      return;
    }
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / nodes.length;
    positions.set(node.id, { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY });
  });
  return { positions, height: 386 };
}

function GraphNode({ node, position, selected, enabled, onClick }: { node: Node; position: GraphPosition; selected: boolean; enabled: boolean; onClick: (id: string) => void }) {
  return <button className={`graph-node ${node.status} ${selected ? 'selected' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} type="button" title={node.label} aria-pressed={selected} disabled={!enabled} onClick={() => onClick(node.id)}><span className="node-status"><span /></span><strong>{node.label}</strong><small>{node.kind === 'file' ? 'File' : `${node.fileCount} file${node.fileCount === 1 ? '' : 's'}`}</small></button>;
}

function WorkflowStep({ label, done, active, warning }: { label: string; done?: boolean; active?: boolean; warning?: boolean }) {
  return <div className={`workflow-step ${done ? 'done' : ''} ${active ? 'active' : ''} ${warning ? 'warning' : ''}`}><span className="workflow-icon">{done ? <Check size={12} /> : warning ? <AlertTriangle size={12} /> : <CircleDot size={12} />}</span><span>{label}</span></div>;
}

function ReviewRow({ target, selected, onClick }: { target: ReviewTarget; selected: boolean; onClick: () => void }) {
  const verificationIcon = target.signals.verification === 'failed' ? <AlertTriangle size={13} /> : target.signals.verification === 'passed' ? <CheckCircle2 size={13} /> : <Clock3 size={13} />;
  return <button className={`review-row ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={onClick}><span className="rank-number">{String(target.rank).padStart(2, '0')}</span><span className="review-row-main"><strong>{target.label}</strong><small>{target.reason}</small></span><span className={`review-row-status ${target.signals.verification}`}>{verificationIcon}</span><ArrowDownRight size={14} className="row-arrow" /></button>;
}

function SignalGrid({ target }: { target: ReviewTarget }) {
  const signals = target.kind === 'file'
    ? [['Diff', `${target.signals.diffLines} lines`], ['Fan-out', `${target.signals.fanOut} dependents`], ['Boundary', 'Not assessed'], ['Contract', 'Not assessed']]
    : [['Diff', `${target.signals.diffLines} lines`], ['Fan-out', `${target.signals.fanOut} dependents`], ['Boundary', `${target.signals.boundaryCrossings} crossing${target.signals.boundaryCrossings === 1 ? '' : 's'}`], ['Contract', target.signals.publicContractImpact ? 'Public API' : 'Internal']];
  return <div className="signal-grid">{signals.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function EvidenceRow({ item }: { item: Evidence }) {
  const icon = item.kind === 'test' ? <TestTube2 size={14} /> : item.kind === 'constraint' ? <ShieldCheck size={14} /> : <FileCode2 size={14} />;
  return <div className="evidence-row"><span className={`evidence-icon ${item.status}`}>{icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={14} className="evidence-arrow" /></div>;
}

export default App;
