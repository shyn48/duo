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
import { evidenceForTarget, reviewActionLabel, selectTarget } from './review';
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
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  useEffect(() => {
    loadSnapshot()
      .then((data) => {
        setPayload(data);
        if (data.reviewTargets[0]) setSelectedId(data.reviewTargets[0].id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load snapshot'))
      .finally(() => setLoading(false));
  }, []);

  const selectedTarget = useMemo(
    () => (payload ? selectTarget(payload.reviewTargets, selectedId) ?? payload.reviewTargets[0] : undefined),
    [payload, selectedId],
  );
  const selectedEvidence = payload && selectedTarget ? evidenceForTarget(payload.snapshot, selectedTarget) : [];

  async function handleDecision(action: 'approve' | 'revise') {
    if (!selectedTarget || decisionBusy) return;
    setDecisionBusy(true);
    try {
      const next = await submitReviewDecision(
        selectedTarget.id,
        action,
        action === 'revise' ? 'Review the highlighted evidence before another agent pass.' : 'Reviewed the prioritized evidence.',
      );
      setDecision(next);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to save review decision');
    } finally {
      setDecisionBusy(false);
    }
  }

  if (loading) return <div className="loading-screen"><div className="loading-mark"><Sparkles size={18} /></div><span>Loading change map…</span></div>;
  if (error || !payload) return <div className="error-screen"><AlertTriangle size={20} /><div><strong>Atlas could not load this turn.</strong><span>{error ?? 'No snapshot returned.'}</span></div></div>;

  const { snapshot, reviewTargets } = payload;
  const selectedNodeIds = new Set(selectedTarget?.nodeIds ?? []);

  return (
    <div className="atlas-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><Sparkles size={16} strokeWidth={2.6} /></div><span>Duo Atlas</span></div>
        <button className="repo-switcher" type="button"><span className="repo-glyph"><GitBranch size={14} /></span><span className="repo-meta"><strong>{snapshot.repository.name}</strong><small>Local repository</small></span><ChevronDown size={15} /></button>
        <div className="nav-group">
          <span className="nav-caption">Workspace</span>
          {navItems.map(({ label, icon: Icon, active }) => <button key={label} className={`nav-item ${active ? 'active' : ''}`} type="button"><Icon size={16} /><span>{label}</span>{label === 'Tests' && snapshot.verification.failed > 0 ? <span className="nav-count danger">{snapshot.verification.failed}</span> : null}</button>)}
        </div>
        <div className="sidebar-bottom">
          <div className="agent-card"><div className="agent-avatar"><Command size={14} /></div><div><span>Agent turn</span><strong>Review in progress</strong></div><CircleDot size={12} className="live-dot" /></div>
          <button className="nav-item" type="button"><ShieldCheck size={16} /><span>Constraints</span></button>
          <button className="nav-item" type="button"><MoreHorizontal size={16} /><span>Settings</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="crumbs"><span>Repositories</span><span>/</span><strong>{snapshot.repository.name}</strong><span>/</span><span>Agent turn</span></div><div className="topbar-actions"><button className="icon-button" type="button" aria-label="Search"><Search size={17} /></button><button className="shortcut" type="button"><Command size={12} /><span>K</span></button><button className="avatar-button" type="button">S</button></div></header>

        <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> Agent turn · {snapshot.agentTurn.id}</div><h1>Architecture change map</h1><p>{snapshot.agentTurn.title}</p></div><div className="intro-meta"><span className="status-pill review"><span /> In review</span><span className="revision">{snapshot.repository.revision}</span><button className="icon-button" type="button" aria-label="More options"><MoreHorizontal size={17} /></button></div></section>

        <div className="workspace-grid">
          <section className="map-column">
            <div className="panel map-panel"><div className="panel-heading"><div><span className="section-kicker">System view</span><h2>Change map</h2></div><div className="map-heading-meta"><span>{snapshot.nodes.length} components</span><span className="divider-dot" /><span>{snapshot.agentTurn.changedFiles} files changed</span></div></div>
              <div className="graph-canvas">
                <svg className="graph-lines" viewBox="0 0 760 360" preserveAspectRatio="none" aria-hidden="true"><path d="M160 95 C250 95 275 90 345 112" /><path d="M438 142 C510 142 520 116 580 93" /><path d="M438 175 C500 210 525 234 595 248" /><path d="M360 150 C302 204 260 227 190 246" /></svg>
                <GraphNode node={findNode(snapshot.nodes, 'api')} className="node-api" selected={selectedNodeIds.has('api')} onClick={setSelectedId} />
                <GraphNode node={findNode(snapshot.nodes, 'domain')} className="node-domain" selected={selectedNodeIds.has('domain')} onClick={setSelectedId} />
                <GraphNode node={findNode(snapshot.nodes, 'payments')} className="node-payments" selected={selectedNodeIds.has('payments')} onClick={setSelectedId} />
                <GraphNode node={findNode(snapshot.nodes, 'adapters')} className="node-adapters" selected={selectedNodeIds.has('adapters')} onClick={setSelectedId} />
                <GraphNode node={findNode(snapshot.nodes, 'tests')} className="node-tests" selected={selectedNodeIds.has('tests')} onClick={setSelectedId} />
                <div className="graph-legend"><span><i className="legend-dot changed" /> Changed</span><span><i className="legend-dot related" /> Related</span><span><i className="legend-dot unchanged" /> Unchanged</span></div><div className="graph-controls"><button type="button">−</button><span>100%</span><button type="button">+</button><button type="button">Fit</button></div>
              </div>
              <div className="map-footer"><div className="workflow"><WorkflowStep label="Plan" done /><WorkflowStep label="Edit" done /><WorkflowStep label="Tests" done={snapshot.verification.failed === 0} warning={snapshot.verification.failed > 0} /><WorkflowStep label="Review" active /></div><span className="footer-revision"><GitBranch size={13} /> {snapshot.repository.revision}</span></div>
            </div>
            <div className="panel review-queue"><div className="panel-heading compact"><div><span className="section-kicker">Human review</span><h2>Review first</h2></div><span className="queue-caption">{reviewTargets.length} prioritized targets</span></div><div className="queue-list">{reviewTargets.map((target) => <ReviewRow key={target.id} target={target} selected={target.id === selectedTarget?.id} onClick={() => setSelectedId(target.id)} />)}</div></div>
          </section>

          <aside className="panel evidence-panel"><div className="evidence-header"><div><span className="section-kicker">Selected target</span><h2>Evidence</h2></div><span className="confidence-chip"><Sparkles size={12} /> {selectedTarget?.judgmentSource === 'jev' ? 'Jev judgment' : 'Deterministic baseline'}</span></div>{selectedTarget ? <><div className="selected-target"><div className="target-icon"><Layers3 size={18} /></div><div><h3>{selectedTarget.label}</h3><span>Priority #{selectedTarget.rank} · {selectedTarget.kind}</span></div><span className="priority-badge">Medium</span></div><div className="reason-box"><span>Why review this first</span><strong>{selectedTarget.reason}</strong></div><SignalGrid target={selectedTarget} /><div className="evidence-section"><div className="subsection-heading"><h3>Linked evidence</h3><span>{selectedEvidence.length} items</span></div><div className="evidence-list">{selectedEvidence.map((item) => <EvidenceRow key={item.id} item={item} />)}</div></div><div className="verification-card"><div className="verification-icon"><CheckCircle2 size={17} /></div><div><span>Verification</span><strong>{snapshot.verification.passed} passed · {snapshot.verification.failed} failed</strong><small>{snapshot.verification.command} · {snapshot.verification.elapsed}</small></div></div><div className="decision-area">{decision ? <div className={`decision-confirmation ${decision.decision}`}><CheckCircle2 size={16} /><span>{decision.decision === 'revise' ? 'Revision requested' : 'Review approved'}</span></div> : <><button className="revision-button" type="button" disabled={decisionBusy} onClick={() => void handleDecision('revise')}><MessageSquareReply size={16} /> {reviewActionLabel('revise')}</button><button className="approve-button" type="button" disabled={decisionBusy} onClick={() => void handleDecision('approve')}><Check size={16} /> {reviewActionLabel('approve')}</button></>}</div></> : <div className="empty-selection">Select a review target to inspect its evidence.</div>}</aside>
        </div>
      </main>
    </div>
  );
}

function findNode(nodes: Node[], id: string): Node {
  return nodes.find((node) => node.id === id) ?? { id, label: id, kind: 'component', status: 'unchanged', fileCount: 0 };
}

function GraphNode({ node, className, selected, onClick }: { node: Node; className: string; selected: boolean; onClick: (id: string) => void }) {
  return <button className={`graph-node ${className} ${node.status} ${selected ? 'selected' : ''}`} type="button" onClick={() => onClick(node.id)}><span className="node-status"><span /></span><strong>{node.label}</strong><small>{node.fileCount} files</small></button>;
}

function WorkflowStep({ label, done, active, warning }: { label: string; done?: boolean; active?: boolean; warning?: boolean }) {
  return <div className={`workflow-step ${active ? 'active' : ''} ${warning ? 'warning' : ''}`}><span className="workflow-icon">{done ? <Check size={12} /> : warning ? <AlertTriangle size={12} /> : <CircleDot size={12} />}</span><span>{label}</span></div>;
}

function ReviewRow({ target, selected, onClick }: { target: ReviewTarget; selected: boolean; onClick: () => void }) {
  return <button className={`review-row ${selected ? 'selected' : ''}`} type="button" onClick={onClick}><span className="rank-number">{String(target.rank).padStart(2, '0')}</span><span className="review-row-main"><strong>{target.label}</strong><small>{target.reason}</small></span><span className={`review-row-status ${target.signals.verification}`}>{target.signals.verification === 'failed' ? <AlertTriangle size={13} /> : <ArrowUpRight size={13} />}</span><ArrowDownRight size={14} className="row-arrow" /></button>;
}

function SignalGrid({ target }: { target: ReviewTarget }) {
  const signals = [['Diff', `${target.signals.diffLines} lines`], ['Fan-out', `${target.signals.fanOut} dependents`], ['Boundary', `${target.signals.boundaryCrossings} crossing${target.signals.boundaryCrossings === 1 ? '' : 's'}`], ['Contract', target.signals.publicContractImpact ? 'Public API' : 'Internal']];
  return <div className="signal-grid">{signals.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function EvidenceRow({ item }: { item: Evidence }) {
  const icon = item.kind === 'test' ? <TestTube2 size={14} /> : item.kind === 'constraint' ? <ShieldCheck size={14} /> : <FileCode2 size={14} />;
  return <div className="evidence-row"><span className={`evidence-icon ${item.status}`}>{icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={14} className="evidence-arrow" /></div>;
}

export default App;
