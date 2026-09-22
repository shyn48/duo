package review

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/shyn48/duo/internal/model"
)

type JudgmentProvider interface {
	RankReviewTargets(context.Context, model.ReviewState) ([]model.ReviewTarget, error)
}

type DeterministicProvider struct{}

func NewDeterministicProvider() DeterministicProvider { return DeterministicProvider{} }

func (DeterministicProvider) RankReviewTargets(_ context.Context, input model.ReviewState) ([]model.ReviewTarget, error) {
	targets := make([]model.ReviewTarget, 0, len(input.Candidates))
	for _, candidate := range input.Candidates {
		score := score(candidate)
		targets = append(targets, model.ReviewTarget{
			ID:             candidate.ID,
			Label:          candidate.Label,
			Kind:           candidate.Kind,
			Score:          score,
			Reason:         reason(candidate),
			Confidence:     1,
			JudgmentSource: "deterministic",
			Signals: model.ReviewSignals{
				DiffLines:            candidate.DiffLines,
				FanOut:               candidate.FanOut,
				BoundaryCrossings:    candidate.BoundaryCrossings,
				PublicContractImpact: candidate.PublicContractImpact,
				Verification:         candidate.Verification,
			},
			EvidenceIDs: append([]string(nil), candidate.EvidenceIDs...),
			NodeIDs:     append([]string(nil), candidate.NodeIDs...),
		})
	}
	sort.SliceStable(targets, func(i, j int) bool {
		if targets[i].Score == targets[j].Score {
			return targets[i].ID < targets[j].ID
		}
		return targets[i].Score > targets[j].Score
	})
	for i := range targets {
		targets[i].Rank = i + 1
	}
	return targets, nil
}

func score(candidate model.ReviewCandidate) float64 {
	result := float64(candidate.DiffLines)*0.05 + float64(candidate.FanOut)*0.15
	result += float64(candidate.BoundaryCrossings) * 2
	result += float64(candidate.PublicContractImpact) * 1.5
	switch strings.ToLower(candidate.Verification) {
	case "failed":
		result += 2
	case "unknown", "":
		result += 0.5
	}
	return result
}

func reason(candidate model.ReviewCandidate) string {
	parts := make([]string, 0, 4)
	if candidate.BoundaryCrossings > 0 {
		parts = append(parts, fmt.Sprintf("%d boundary crossing(s)", candidate.BoundaryCrossings))
	}
	if candidate.FanOut > 0 {
		parts = append(parts, fmt.Sprintf("fan-out %d", candidate.FanOut))
	}
	if candidate.PublicContractImpact > 0 {
		parts = append(parts, "public contract impact")
	}
	if strings.EqualFold(candidate.Verification, "failed") {
		parts = append(parts, "verification failed")
	}
	if len(parts) == 0 {
		return "Review changed evidence and direct dependents"
	}
	return "Review first: " + strings.Join(parts, " · ")
}
