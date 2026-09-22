package review

import (
	"context"
	"reflect"
	"testing"

	"github.com/shyn48/duo/internal/model"
)

func TestDeterministicProviderRanksHighImpactFailedBoundaryChangeFirst(t *testing.T) {
	provider := NewDeterministicProvider()
	input := model.ReviewState{
		SnapshotID: "turn-001",
		Candidates: []model.ReviewCandidate{
			{
				ID:                   "api-handler",
				Label:                "API handler",
				DiffLines:            12,
				FanOut:               2,
				BoundaryCrossings:    0,
				PublicContractImpact: 1,
				Verification:         "passed",
				EvidenceIDs:          []string{"diff-api", "test-api"},
			},
			{
				ID:                   "payments",
				Label:                "Payments boundary",
				DiffLines:            8,
				FanOut:               5,
				BoundaryCrossings:    2,
				PublicContractImpact: 1,
				Verification:         "failed",
				EvidenceIDs:          []string{"diff-payments", "test-payments"},
			},
		},
	}

	got, err := provider.RankReviewTargets(context.Background(), input)
	if err != nil {
		t.Fatalf("rank review targets: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d targets, want 2", len(got))
	}
	if got[0].ID != "payments" {
		t.Fatalf("first target = %q, want payments", got[0].ID)
	}
	if got[0].JudgmentSource != "deterministic" {
		t.Fatalf("judgment source = %q, want deterministic", got[0].JudgmentSource)
	}
	if got[0].Confidence <= 0 || len(got[0].EvidenceIDs) != 2 {
		t.Fatalf("first target did not preserve confidence/evidence: %+v", got[0])
	}
}

func TestDeterministicProviderDoesNotMutateInput(t *testing.T) {
	provider := NewDeterministicProvider()
	input := model.ReviewState{Candidates: []model.ReviewCandidate{{ID: "one", Label: "One"}}}
	before := input.Candidates[0]
	_, err := provider.RankReviewTargets(context.Background(), input)
	if err != nil {
		t.Fatalf("rank review targets: %v", err)
	}
	if !reflect.DeepEqual(input.Candidates[0], before) {
		t.Fatalf("provider mutated input")
	}
}

func TestDeterministicProviderUsesStableIDOrderForEquivalentScores(t *testing.T) {
	provider := NewDeterministicProvider()
	input := model.ReviewState{Candidates: []model.ReviewCandidate{
		{ID: "z-diff", Label: "Diff", DiffLines: 3},
		{ID: "a-fanout", Label: "Fan-out", FanOut: 1},
	}}

	got, err := provider.RankReviewTargets(context.Background(), input)
	if err != nil {
		t.Fatalf("rank review targets: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d targets, want 2", len(got))
	}
	if got[0].ID != "a-fanout" || got[1].ID != "z-diff" {
		t.Fatalf("equivalent scores were not ordered by ID: %+v", got)
	}
}
