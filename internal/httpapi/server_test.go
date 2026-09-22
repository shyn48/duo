package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shyn48/duo/internal/model"
	"github.com/shyn48/duo/internal/review"
)

func TestServerExposesHealthAndRankedSnapshot(t *testing.T) {
	snapshot := model.Snapshot{
		Repository: model.Repository{ID: "fixture", Name: "vpay-backend", Revision: "abc123"},
		AgentTurn:  model.AgentTurn{ID: "turn-001", Title: "Add idempotent payment retries", Status: "review"},
		Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments", DiffLines: 20, FanOut: 4, BoundaryCrossings: 1, Verification: "failed"}},
	}
	server := NewServer(snapshot, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	res, err := http.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want 200", res.StatusCode)
	}

	res, err = http.Get(ts.URL + "/api/snapshot")
	if err != nil {
		t.Fatalf("snapshot request: %v", err)
	}
	defer res.Body.Close()
	var payload struct {
		Snapshot      model.Snapshot       `json:"snapshot"`
		ReviewTargets []model.ReviewTarget `json:"reviewTargets"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if len(payload.ReviewTargets) != 1 || payload.ReviewTargets[0].ID != "payments" {
		t.Fatalf("unexpected review targets: %+v", payload.ReviewTargets)
	}
}

func TestServerRecordsReviewDecision(t *testing.T) {
	server := NewServer(model.Snapshot{Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments"}}}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	body := `{"targetId":"payments","decision":"revise","reason":"Review the retry boundary"}`
	res, err := http.Post(ts.URL+"/api/review-decisions", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("decision request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("decision status = %d, want 201", res.StatusCode)
	}
	if got := server.Decisions()[0].Decision; got != "revise" {
		t.Fatalf("decision = %q, want revise", got)
	}
	_ = context.Background()
}

func TestServerRejectsUnsupportedMethods(t *testing.T) {
	server := NewServer(model.Snapshot{}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/health", nil)
	if err != nil {
		t.Fatalf("create health request: %v", err)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("health request: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("health status = %d, want 405", res.StatusCode)
	}
}

func TestServerRejectsTrailingJSONAndUnknownTarget(t *testing.T) {
	server := NewServer(model.Snapshot{Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments"}}}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	for name, body := range map[string]string{
		"trailing JSON":  `{"targetId":"payments","decision":"approve"}{}`,
		"unknown target": `{"targetId":"missing","decision":"approve"}`,
	} {
		t.Run(name, func(t *testing.T) {
			res, err := http.Post(ts.URL+"/api/review-decisions", "application/json", strings.NewReader(body))
			if err != nil {
				t.Fatalf("decision request: %v", err)
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("decision status = %d, want 400", res.StatusCode)
			}
		})
	}
}

func TestServerCreatesUniqueDecisionIDs(t *testing.T) {
	server := NewServer(model.Snapshot{Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments"}}}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	for i := 0; i < 2; i++ {
		res, err := http.Post(ts.URL+"/api/review-decisions", "application/json", strings.NewReader(`{"targetId":" payments ","decision":"APPROVE"}`))
		if err != nil {
			t.Fatalf("decision request %d: %v", i, err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("decision status %d = %d, want 201", i, res.StatusCode)
		}
	}

	decisions := server.Decisions()
	if len(decisions) != 2 {
		t.Fatalf("got %d decisions, want 2", len(decisions))
	}
	if decisions[0].ID == decisions[1].ID {
		t.Fatalf("decision IDs must be unique: %q", decisions[0].ID)
	}
	if decisions[0].TargetID != "payments" || decisions[0].Decision != "approve" {
		t.Fatalf("decision was not normalized: %+v", decisions[0])
	}
}

func TestServerRejectsUnsafeDecisionRequestBoundaries(t *testing.T) {
	server := NewServer(model.Snapshot{Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments"}}}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	t.Run("content type", func(t *testing.T) {
		res, err := http.Post(ts.URL+"/api/review-decisions", "text/plain", strings.NewReader(`{"targetId":"payments","decision":"approve"}`))
		if err != nil {
			t.Fatalf("decision request: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusUnsupportedMediaType {
			t.Fatalf("decision status = %d, want 415", res.StatusCode)
		}
	})

	t.Run("foreign origin", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/review-decisions", strings.NewReader(`{"targetId":"payments","decision":"approve"}`))
		if err != nil {
			t.Fatalf("create decision request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", "https://example.com")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("decision request: %v", err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("decision status = %d, want 403", res.StatusCode)
		}
	})
}

func TestSnapshotResponseDoesNotExposeRankingCandidates(t *testing.T) {
	server := NewServer(model.Snapshot{
		AgentTurn:  model.AgentTurn{ID: "turn-001"},
		Candidates: []model.ReviewCandidate{{ID: "payments", Label: "Payments"}},
	}, review.NewDeterministicProvider())
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	res, err := http.Get(ts.URL + "/api/snapshot")
	if err != nil {
		t.Fatalf("snapshot request: %v", err)
	}
	defer res.Body.Close()
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode snapshot response: %v", err)
	}
	var publicSnapshot map[string]json.RawMessage
	if err := json.Unmarshal(payload["snapshot"], &publicSnapshot); err != nil {
		t.Fatalf("decode public snapshot: %v", err)
	}
	if _, exists := publicSnapshot["candidates"]; exists {
		t.Fatalf("snapshot response exposed internal ranking candidates")
	}
}

type mutatingProvider struct{}

func (mutatingProvider) RankReviewTargets(_ context.Context, input model.ReviewState) ([]model.ReviewTarget, error) {
	input.Candidates[0].Label = "mutated"
	input.Candidates[0].EvidenceIDs[0] = "mutated-evidence"
	input.Candidates[0].NodeIDs[0] = "mutated-node"
	return nil, nil
}

func TestServerProtectsSnapshotFromProviderMutation(t *testing.T) {
	snapshot := model.Snapshot{Candidates: []model.ReviewCandidate{{
		ID:          "payments",
		Label:       "Payments",
		EvidenceIDs: []string{"evidence-1"},
		NodeIDs:     []string{"payments"},
	}}}
	server := NewServer(snapshot, mutatingProvider{})
	req := httptest.NewRequest(http.MethodGet, "/api/snapshot", nil)
	res := httptest.NewRecorder()

	server.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d, want 200", res.Code)
	}
	got := server.snapshot.Candidates[0]
	if got.Label != "Payments" || got.EvidenceIDs[0] != "evidence-1" || got.NodeIDs[0] != "payments" {
		t.Fatalf("provider mutated authoritative snapshot: %+v", got)
	}
}
