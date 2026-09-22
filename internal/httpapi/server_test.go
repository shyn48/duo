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
	server := NewServer(model.Snapshot{}, review.NewDeterministicProvider())
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
