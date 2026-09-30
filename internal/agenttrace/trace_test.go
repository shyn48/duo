package agenttrace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/shyn48/duo/internal/model"
)

func TestLoadAndAttachRecordedTurnLinksEventsToReviewTargets(t *testing.T) {
	envelope, err := Load(filepath.Join("..", "..", "fixtures", "agent-turn.slice3.json"))
	if err != nil {
		t.Fatalf("load recorded turn: %v", err)
	}

	snapshot := model.Snapshot{
		SnapshotID: "worktree-slice3-demo-state",
		Repository: model.Repository{ID: "duo-atlas", Name: "duo-atlas", Revision: "slice3-demo"},
		AgentTurn:  model.AgentTurn{ID: "repo-turn", Title: "Working tree changes", Status: "review", ChangedFiles: 2},
		Nodes: []model.Node{
			{ID: "internal/snapshot/repository.go", Label: "internal/snapshot/repository.go", Kind: "file", Status: "changed", FileCount: 1},
			{ID: "web/src/App.tsx", Label: "web/src/App.tsx", Kind: "file", Status: "changed", FileCount: 1},
		},
		Evidence: []model.Evidence{
			{ID: "diff-repository", Kind: "diff", Title: "Repository diff", Status: "changed", TargetIDs: []string{"internal/snapshot/repository.go"}},
			{ID: "diff-app", Kind: "diff", Title: "App diff", Status: "changed", TargetIDs: []string{"web/src/App.tsx"}},
		},
		Candidates: []model.ReviewCandidate{
			{ID: "internal/snapshot/repository.go", Label: "internal/snapshot/repository.go", Kind: "file", EvidenceIDs: []string{"diff-repository"}, NodeIDs: []string{"internal/snapshot/repository.go"}},
			{ID: "web/src/App.tsx", Label: "web/src/App.tsx", Kind: "file", EvidenceIDs: []string{"diff-app"}, NodeIDs: []string{"web/src/App.tsx"}},
		},
	}

	attached, err := Attach(snapshot, envelope)
	if err != nil {
		t.Fatalf("attach recorded turn: %v", err)
	}
	if attached.AgentTurn.ID != "slice3-recorded-turn" || attached.AgentTurn.Source != "chat-on-steroids" {
		t.Fatalf("unexpected agent turn: %+v", attached.AgentTurn)
	}
	if attached.SnapshotID != "worktree-slice3-demo-state" {
		t.Fatalf("repository snapshot id changed during trace attachment: %q", attached.SnapshotID)
	}
	if attached.AgentTurn.CompletionClaim == "" {
		t.Fatal("completion claim was not kept on the turn")
	}
	if len(attached.AgentEvents) != 4 {
		t.Fatalf("agent event count = %d, want 4", len(attached.AgentEvents))
	}
	if attached.AgentEvents[0].Sequence != 10 || attached.AgentEvents[3].Kind != "claim" {
		t.Fatalf("events were not normalized into sequence order: %+v", attached.AgentEvents)
	}
	for _, event := range attached.AgentEvents {
		if event.Freshness != "current" {
			t.Fatalf("event %q freshness = %q, want current", event.ID, event.Freshness)
		}
		if len(event.EvidenceIDs) == 0 {
			t.Fatalf("event %q is missing linked evidence", event.ID)
		}
	}

	repositoryCandidate := candidateByID(t, attached.Candidates, "internal/snapshot/repository.go")
	if len(repositoryCandidate.EvidenceIDs) != 3 {
		t.Fatalf("repository evidence ids = %+v, want Git diff plus tool/check evidence", repositoryCandidate.EvidenceIDs)
	}
	appCandidate := candidateByID(t, attached.Candidates, "web/src/App.tsx")
	if len(appCandidate.EvidenceIDs) != 2 {
		t.Fatalf("app evidence ids = %+v, want Git diff plus check evidence", appCandidate.EvidenceIDs)
	}
	claim := attached.AgentEvents[len(attached.AgentEvents)-1]
	if claim.Kind != "claim" || len(claim.EvidenceIDs) == 0 {
		t.Fatalf("claim should reference supporting evidence without becoming evidence itself: %+v", claim)
	}
	for _, item := range attached.Evidence {
		if item.ID == "agent-claim-slice3" {
			t.Fatalf("completion claim became review evidence: %+v", item)
		}
	}
}

func TestAttachUsesObservedChecksForVerificationWithoutPromotingClaims(t *testing.T) {
	envelope := Envelope{
		ID: "turn-1", Title: "Verify change", Status: "review", Source: "test-adapter", SnapshotID: "worktree-abc123-state",
		Events: []Event{
			{ID: "check", Sequence: 1, Kind: "check", Title: "Go tests", Detail: "go test ./...", Status: "failed", Basis: "observed", Source: "shell", TargetIDs: []string{"a.go"}, Check: &CheckResult{Command: "go test ./...", Passed: 12, Failed: 1, Elapsed: "2s"}},
			{ID: "claim", Sequence: 2, Kind: "claim", Title: "Agent completion", Detail: "Everything passes now.", Status: "claimed", Basis: "claimed", Source: "agent", TargetIDs: []string{"a.go"}},
		},
	}
	snapshot := model.Snapshot{
		SnapshotID: "worktree-abc123-state",
		Repository: model.Repository{Revision: "abc123"},
		AgentTurn:  model.AgentTurn{ID: "repo-turn", ChangedFiles: 1},
		Nodes:      []model.Node{{ID: "a.go", Label: "a.go", Kind: "file", Status: "changed", FileCount: 1}},
		Candidates: []model.ReviewCandidate{{ID: "a.go", Label: "a.go", Kind: "file", NodeIDs: []string{"a.go"}}},
	}

	attached, err := Attach(snapshot, envelope)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if attached.Verification.Status != "attention" || attached.Verification.Passed != 12 || attached.Verification.Failed != 1 {
		t.Fatalf("verification was not derived from observed check: %+v", attached.Verification)
	}
	if attached.AgentTurn.CompletionClaim != "Everything passes now." {
		t.Fatalf("completion claim = %q", attached.AgentTurn.CompletionClaim)
	}
	for _, item := range attached.Evidence {
		if item.ID == "agent-claim" {
			t.Fatalf("claim must not be inserted as observed evidence: %+v", item)
		}
	}
}

func TestAttachMarksRecordedEventsStaleWhenSnapshotMoved(t *testing.T) {
	envelope := Envelope{
		ID: "turn-1", Title: "Recorded", Status: "review", Source: "test-adapter", SnapshotID: "worktree-old-state",
		Events: []Event{{ID: "tool", Sequence: 1, Kind: "tool", Title: "Read file", Detail: "read a.go", Status: "observed", Basis: "observed", Source: "read", TargetIDs: []string{"a.go"}}},
	}
	snapshot := model.Snapshot{
		SnapshotID: "worktree-new-state",
		Repository: model.Repository{Revision: "new-revision"},
		AgentTurn:  model.AgentTurn{ID: "repo-turn"},
		Nodes:      []model.Node{{ID: "a.go", Label: "a.go", Kind: "file", Status: "changed", FileCount: 1}},
		Candidates: []model.ReviewCandidate{{ID: "a.go", Label: "a.go", Kind: "file"}},
	}

	attached, err := Attach(snapshot, envelope)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if got := attached.AgentEvents[0].Freshness; got != "stale" {
		t.Fatalf("freshness = %q, want stale", got)
	}
	if got := evidenceByID(t, attached.Evidence, "agent-tool").Freshness; got != "stale" {
		t.Fatalf("evidence freshness = %q, want stale", got)
	}
}

func TestValidateRejectsClaimReportedAsObserved(t *testing.T) {
	envelope := Envelope{
		ID: "turn-1", Title: "Bad claim", Status: "review", Source: "test-adapter", SnapshotID: "worktree-abc-state",
		Events: []Event{{ID: "claim", Sequence: 1, Kind: "claim", Title: "Done", Detail: "All tests pass", Status: "claimed", Basis: "observed", Source: "agent"}},
	}
	if err := Validate(envelope); err == nil {
		t.Fatal("expected observed claim to be rejected")
	}
}

func TestAttachRejectsUnknownGraphTarget(t *testing.T) {
	envelope := Envelope{
		ID: "turn-1", Title: "Bad target", Status: "review", Source: "test-adapter", SnapshotID: "snapshot-1",
		Events: []Event{{ID: "tool", Sequence: 1, Kind: "tool", Title: "Read missing", Detail: "read missing.go", Status: "observed", Basis: "observed", Source: "read", TargetIDs: []string{"missing.go"}}},
	}
	snapshot := model.Snapshot{SnapshotID: "snapshot-1", AgentTurn: model.AgentTurn{ID: "repo-turn"}, Nodes: []model.Node{{ID: "a.go"}}}
	if _, err := Attach(snapshot, envelope); err == nil {
		t.Fatal("expected unknown graph target to be rejected")
	}
}

func TestFailedCheckWithoutFailureCountStillBlocksVerification(t *testing.T) {
	envelope := Envelope{
		ID: "turn-1", Title: "Compile failure", Status: "review", Source: "test-adapter", SnapshotID: "snapshot-1",
		Events: []Event{{ID: "check", Sequence: 1, Kind: "check", Title: "Build", Detail: "go build failed", Status: "failed", Basis: "observed", Source: "shell", TargetIDs: []string{"a.go"}, Check: &CheckResult{Command: "go build ./..."}}},
	}
	snapshot := model.Snapshot{
		SnapshotID: "snapshot-1",
		AgentTurn:  model.AgentTurn{ID: "repo-turn"},
		Nodes:      []model.Node{{ID: "a.go"}},
		Candidates: []model.ReviewCandidate{{ID: "a.go", NodeIDs: []string{"a.go"}}},
	}
	attached, err := Attach(snapshot, envelope)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if attached.Verification.Status != "attention" || attached.Candidates[0].Verification != "failed" {
		t.Fatalf("failed check was promoted incorrectly: verification=%+v candidate=%+v", attached.Verification, attached.Candidates[0])
	}
}

func TestLoadRejectsEnvelopeLargerThanLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "large.json")
	body := `{"id":"turn","title":"large","status":"review","source":"test","snapshotId":"snap","events":[{"id":"tool","sequence":1,"kind":"tool","title":"read","detail":"x","status":"observed","basis":"observed","source":"read","targetIds":[]}]}`
	contents := body + strings.Repeat(" ", int(maxEnvelopeBytes)-len(body)+1)
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write large envelope: %v", err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected oversized envelope to be rejected")
	}
}

func candidateByID(t *testing.T, candidates []model.ReviewCandidate, id string) model.ReviewCandidate {
	t.Helper()
	for _, candidate := range candidates {
		if candidate.ID == id {
			return candidate
		}
	}
	t.Fatalf("candidate %q not found", id)
	return model.ReviewCandidate{}
}

func evidenceByID(t *testing.T, evidence []model.Evidence, id string) model.Evidence {
	t.Helper()
	for _, item := range evidence {
		if item.ID == id {
			return item
		}
	}
	t.Fatalf("evidence %q not found", id)
	return model.Evidence{}
}
