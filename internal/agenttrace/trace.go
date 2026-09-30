package agenttrace

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"github.com/shyn48/duo/internal/model"
)

const maxEnvelopeBytes int64 = 2 << 20

type Envelope struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Status     string  `json:"status"`
	Source     string  `json:"source"`
	SnapshotID string  `json:"snapshotId"`
	Events     []Event `json:"events"`
}

type Event struct {
	ID        string       `json:"id"`
	Sequence  int          `json:"sequence"`
	Kind      string       `json:"kind"`
	Title     string       `json:"title"`
	Detail    string       `json:"detail"`
	Status    string       `json:"status"`
	Basis     string       `json:"basis"`
	Source    string       `json:"source"`
	TargetIDs []string     `json:"targetIds"`
	Check     *CheckResult `json:"check,omitempty"`
}

type CheckResult struct {
	Command string `json:"command"`
	Passed  int    `json:"passed"`
	Failed  int    `json:"failed"`
	Elapsed string `json:"elapsed"`
}

func Load(path string) (Envelope, error) {
	file, err := os.Open(path)
	if err != nil {
		return Envelope{}, err
	}
	defer file.Close()

	contents, err := io.ReadAll(io.LimitReader(file, maxEnvelopeBytes+1))
	if err != nil {
		return Envelope{}, fmt.Errorf("read agent turn envelope: %w", err)
	}
	if int64(len(contents)) > maxEnvelopeBytes {
		return Envelope{}, fmt.Errorf("agent turn envelope exceeds %d bytes", maxEnvelopeBytes)
	}

	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	var envelope Envelope
	if err := decoder.Decode(&envelope); err != nil {
		return Envelope{}, fmt.Errorf("decode agent turn envelope: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return Envelope{}, fmt.Errorf("agent turn envelope must contain one JSON object")
	}
	if err := Validate(envelope); err != nil {
		return Envelope{}, err
	}
	return envelope, nil
}

func Validate(envelope Envelope) error {
	if strings.TrimSpace(envelope.ID) == "" || strings.TrimSpace(envelope.Title) == "" || strings.TrimSpace(envelope.Status) == "" {
		return fmt.Errorf("agent turn id, title, and status are required")
	}
	if strings.TrimSpace(envelope.Source) == "" {
		return fmt.Errorf("agent turn source is required")
	}
	if strings.TrimSpace(envelope.SnapshotID) == "" {
		return fmt.Errorf("agent turn snapshotId is required")
	}
	if len(envelope.Events) == 0 {
		return fmt.Errorf("agent turn must contain at least one event")
	}

	ids := make(map[string]struct{}, len(envelope.Events))
	sequences := make(map[int]struct{}, len(envelope.Events))
	for _, event := range envelope.Events {
		if strings.TrimSpace(event.ID) == "" || strings.TrimSpace(event.Title) == "" || strings.TrimSpace(event.Detail) == "" {
			return fmt.Errorf("agent event id, title, and detail are required")
		}
		if _, exists := ids[event.ID]; exists {
			return fmt.Errorf("duplicate agent event id %q", event.ID)
		}
		ids[event.ID] = struct{}{}
		if event.Sequence <= 0 {
			return fmt.Errorf("agent event %q sequence must be positive", event.ID)
		}
		if _, exists := sequences[event.Sequence]; exists {
			return fmt.Errorf("duplicate agent event sequence %d", event.Sequence)
		}
		sequences[event.Sequence] = struct{}{}
		if strings.TrimSpace(event.Status) == "" || strings.TrimSpace(event.Source) == "" {
			return fmt.Errorf("agent event %q status and source are required", event.ID)
		}
		switch event.Kind {
		case "tool", "patch", "check":
			if event.Basis != "observed" {
				return fmt.Errorf("agent event %q kind %q must use observed basis", event.ID, event.Kind)
			}
		case "claim":
			if event.Basis != "claimed" {
				return fmt.Errorf("agent event %q claim must use claimed basis", event.ID)
			}
		default:
			return fmt.Errorf("agent event %q has unsupported kind %q", event.ID, event.Kind)
		}
		seenTargets := make(map[string]struct{}, len(event.TargetIDs))
		for _, targetID := range event.TargetIDs {
			if strings.TrimSpace(targetID) == "" {
				return fmt.Errorf("agent event %q has an empty target id", event.ID)
			}
			if _, exists := seenTargets[targetID]; exists {
				return fmt.Errorf("agent event %q repeats target %q", event.ID, targetID)
			}
			seenTargets[targetID] = struct{}{}
		}
		if event.Kind == "check" {
			if event.Check == nil || strings.TrimSpace(event.Check.Command) == "" {
				return fmt.Errorf("agent check event %q requires check.command", event.ID)
			}
			if event.Check.Passed < 0 || event.Check.Failed < 0 {
				return fmt.Errorf("agent check event %q counts must be non-negative", event.ID)
			}
			if event.Status != "passed" && event.Status != "failed" {
				return fmt.Errorf("agent check event %q status must be passed or failed", event.ID)
			}
			if event.Status == "passed" && event.Check.Failed > 0 {
				return fmt.Errorf("agent check event %q cannot pass with failed checks", event.ID)
			}
		} else if event.Kind == "claim" {
			if event.Status != "claimed" {
				return fmt.Errorf("agent claim event %q status must be claimed", event.ID)
			}
			if event.Check != nil {
				return fmt.Errorf("agent event %q includes check data for non-check kind", event.ID)
			}
		} else if event.Check != nil {
			return fmt.Errorf("agent event %q includes check data for non-check kind", event.ID)
		}
	}
	return nil
}

func Attach(snapshot model.Snapshot, envelope Envelope) (model.Snapshot, error) {
	if err := Validate(envelope); err != nil {
		return model.Snapshot{}, err
	}
	if err := validateTargets(snapshot, envelope); err != nil {
		return model.Snapshot{}, err
	}

	attached := cloneSnapshot(snapshot)
	freshness := snapshotFreshness(envelope.SnapshotID, snapshot.SnapshotID)
	attached.AgentTurn.ID = envelope.ID
	attached.AgentTurn.Title = envelope.Title
	attached.AgentTurn.Status = envelope.Status
	attached.AgentTurn.Source = envelope.Source
	attached.AgentEvents = make([]model.AgentEvent, 0, len(envelope.Events))

	events := append([]Event(nil), envelope.Events...)
	sort.Slice(events, func(i, j int) bool {
		if events[i].Sequence == events[j].Sequence {
			return events[i].ID < events[j].ID
		}
		return events[i].Sequence < events[j].Sequence
	})

	evidenceIDs := make(map[string]struct{}, len(attached.Evidence)+len(events))
	for _, item := range attached.Evidence {
		evidenceIDs[item.ID] = struct{}{}
	}
	candidateIndexesByNode := indexCandidatesByNode(attached.Candidates)

	checkCount := 0
	checkPassed := 0
	checkFailed := 0
	checkCommands := make([]string, 0)
	checkElapsed := "—"
	checkHadFailure := false
	candidateVerification := make(map[int]string)

	for _, event := range events {
		targetIDs := append([]string{}, event.TargetIDs...)
		candidateIndexes := affectedCandidateIndexes(candidateIndexesByNode, targetIDs)
		eventEvidenceIDs := make([]string, 0, 1)

		switch event.Kind {
		case "tool", "check":
			evidenceID := "agent-" + event.ID
			if _, exists := evidenceIDs[evidenceID]; exists {
				return model.Snapshot{}, fmt.Errorf("agent event evidence id %q already exists", evidenceID)
			}
			evidenceIDs[evidenceID] = struct{}{}
			kind := "agent-tool"
			if event.Kind == "check" {
				kind = "test"
			}
			attached.Evidence = append(attached.Evidence, model.Evidence{
				ID:        evidenceID,
				Kind:      kind,
				Title:     event.Title,
				Detail:    event.Detail,
				Status:    event.Status,
				Basis:     event.Basis,
				Source:    event.Source,
				Freshness: freshness,
				TargetIDs: targetIDs,
			})
			eventEvidenceIDs = append(eventEvidenceIDs, evidenceID)
			for _, index := range candidateIndexes {
				attached.Candidates[index].EvidenceIDs = appendUnique(attached.Candidates[index].EvidenceIDs, evidenceID)
			}
		case "patch":
			eventEvidenceIDs = supportingDiffEvidenceIDs(attached.Evidence, targetIDs)
		case "claim":
			eventEvidenceIDs = supportingCandidateEvidenceIDs(attached.Candidates, candidateIndexes)
			attached.AgentTurn.CompletionClaim = event.Detail
		}

		agentEvent := model.AgentEvent{
			ID:          event.ID,
			Sequence:    event.Sequence,
			Kind:        event.Kind,
			Title:       event.Title,
			Detail:      event.Detail,
			Status:      event.Status,
			Basis:       event.Basis,
			Source:      event.Source,
			Freshness:   freshness,
			TargetIDs:   targetIDs,
			EvidenceIDs: eventEvidenceIDs,
		}
		attached.AgentEvents = append(attached.AgentEvents, agentEvent)
		if event.Kind == "check" && freshness == "current" {
			checkCount++
			checkPassed += event.Check.Passed
			checkFailed += event.Check.Failed
			if event.Status == "failed" {
				checkHadFailure = true
			}
			checkCommands = append(checkCommands, event.Check.Command)
			if checkCount == 1 && strings.TrimSpace(event.Check.Elapsed) != "" {
				checkElapsed = event.Check.Elapsed
			} else if checkCount > 1 {
				checkElapsed = "multiple"
			}
			for _, index := range candidateIndexes {
				status := event.Status
				if status == "failed" || candidateVerification[index] == "" {
					candidateVerification[index] = status
				}
			}
		}
	}

	for index, verification := range candidateVerification {
		attached.Candidates[index].Verification = verification
	}
	if checkCount > 0 {
		status := "passed"
		if checkHadFailure {
			status = "attention"
		}
		command := checkCommands[0]
		if len(checkCommands) > 1 {
			command = fmt.Sprintf("%d recorded checks", len(checkCommands))
		}
		attached.Verification = model.Verification{Status: status, Passed: checkPassed, Failed: checkFailed, Command: command, Elapsed: checkElapsed}
	}
	return attached, nil
}

func cloneSnapshot(snapshot model.Snapshot) model.Snapshot {
	cloned := snapshot
	cloned.Nodes = append([]model.Node{}, snapshot.Nodes...)
	cloned.Edges = append([]model.Edge{}, snapshot.Edges...)
	cloned.Evidence = append([]model.Evidence{}, snapshot.Evidence...)
	for index := range cloned.Evidence {
		cloned.Evidence[index].TargetIDs = append([]string{}, snapshot.Evidence[index].TargetIDs...)
	}
	cloned.AgentEvents = append([]model.AgentEvent{}, snapshot.AgentEvents...)
	for index := range cloned.AgentEvents {
		cloned.AgentEvents[index].TargetIDs = append([]string{}, snapshot.AgentEvents[index].TargetIDs...)
		cloned.AgentEvents[index].EvidenceIDs = append([]string{}, snapshot.AgentEvents[index].EvidenceIDs...)
	}
	cloned.Candidates = append([]model.ReviewCandidate{}, snapshot.Candidates...)
	for index := range cloned.Candidates {
		cloned.Candidates[index].EvidenceIDs = append([]string{}, snapshot.Candidates[index].EvidenceIDs...)
		cloned.Candidates[index].NodeIDs = append([]string{}, snapshot.Candidates[index].NodeIDs...)
	}
	return cloned
}

func snapshotFreshness(recorded, current string) string {
	if strings.TrimSpace(recorded) == "" || strings.TrimSpace(current) == "" {
		return "unknown"
	}
	if recorded == current {
		return "current"
	}
	return "stale"
}

func validateTargets(snapshot model.Snapshot, envelope Envelope) error {
	nodes := make(map[string]struct{}, len(snapshot.Nodes))
	for _, node := range snapshot.Nodes {
		nodes[node.ID] = struct{}{}
	}
	for _, event := range envelope.Events {
		for _, targetID := range event.TargetIDs {
			if _, exists := nodes[targetID]; !exists {
				return fmt.Errorf("agent event %q references unknown graph target %q", event.ID, targetID)
			}
		}
	}
	return nil
}

func indexCandidatesByNode(candidates []model.ReviewCandidate) map[string][]int {
	result := make(map[string][]int)
	for index, candidate := range candidates {
		for _, nodeID := range candidate.NodeIDs {
			result[nodeID] = append(result[nodeID], index)
		}
	}
	return result
}

func affectedCandidateIndexes(indexesByNode map[string][]int, targetIDs []string) []int {
	seen := make(map[int]struct{})
	result := make([]int, 0)
	for _, targetID := range targetIDs {
		for _, index := range indexesByNode[targetID] {
			if _, exists := seen[index]; exists {
				continue
			}
			seen[index] = struct{}{}
			result = append(result, index)
		}
	}
	sort.Ints(result)
	return result
}

func supportingDiffEvidenceIDs(evidence []model.Evidence, targetIDs []string) []string {
	targetSet := make(map[string]struct{}, len(targetIDs))
	for _, targetID := range targetIDs {
		targetSet[targetID] = struct{}{}
	}
	result := make([]string, 0)
	for _, item := range evidence {
		if item.Kind != "diff" {
			continue
		}
		for _, targetID := range item.TargetIDs {
			if _, exists := targetSet[targetID]; exists {
				result = appendUnique(result, item.ID)
				break
			}
		}
	}
	return result
}

func supportingCandidateEvidenceIDs(candidates []model.ReviewCandidate, indexes []int) []string {
	result := make([]string, 0)
	for _, index := range indexes {
		for _, evidenceID := range candidates[index].EvidenceIDs {
			result = appendUnique(result, evidenceID)
		}
	}
	return result
}

func appendUnique(values []string, value string) []string {
	for _, current := range values {
		if current == value {
			return values
		}
	}
	return append(values, value)
}
