/* @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { SnapshotPayload } from './types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const payload: SnapshotPayload = {
  snapshot: {
    repository: { id: 'fixture', name: 'demo-repo', revision: 'abc123' },
    agentTurn: { id: 'turn-001', title: 'Review empty graph', status: 'blocked', changedFiles: 0 },
    nodes: [],
    edges: [],
    evidence: [],
    verification: { status: 'attention', passed: 3, failed: 1, command: 'go test ./...', elapsed: '2s' },
  },
  reviewTargets: [{
    id: 'payments',
    label: 'Payments',
    kind: 'component',
    rank: 1,
    score: 2.5,
    reason: 'Review first',
    confidence: 0.82,
    judgmentSource: 'deterministic',
    signals: { diffLines: 3, fanOut: 1, boundaryCrossings: 0, publicContractImpact: 0, verification: 'failed' },
    evidenceIds: [],
    nodeIds: [],
  }],
  decisions: [],
};

let root: Root | null = null;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

async function renderApp() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Atlas app states', () => {
  it('renders server-owned turn status, confidence, and a graph empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse(payload)));
    const container = await renderApp();

    expect(container.textContent).toContain('Blocked');
    expect(container.textContent).toContain('82% confidence');
    expect(container.textContent).toContain('No graph nodes in this snapshot.');
    expect(container.querySelector('.workflow-step.active')).toBeNull();
  });

  it('can retry a transient snapshot load failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('server offline'))
      .mockResolvedValueOnce(okResponse(payload));
    vi.stubGlobal('fetch', fetchMock);
    const container = await renderApp();

    const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Retry'));
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Architecture change map');
  });
});
