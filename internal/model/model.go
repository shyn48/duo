package model

import "time"

type Repository struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Revision string `json:"revision"`
	Root     string `json:"root,omitempty"`
}

type AgentTurn struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	Source          string `json:"source,omitempty"`
	ChangedFiles    int    `json:"changedFiles"`
	CompletionClaim string `json:"completionClaim,omitempty"`
}

type AgentEvent struct {
	ID          string   `json:"id"`
	Sequence    int      `json:"sequence"`
	Kind        string   `json:"kind"`
	Title       string   `json:"title"`
	Detail      string   `json:"detail"`
	Status      string   `json:"status"`
	Basis       string   `json:"basis"`
	Source      string   `json:"source"`
	Freshness   string   `json:"freshness"`
	TargetIDs   []string `json:"targetIds"`
	EvidenceIDs []string `json:"evidenceIds"`
}

type Node struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	FileCount int    `json:"fileCount"`
}

type Edge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Kind   string `json:"kind"`
	Status string `json:"status"`
}

type Evidence struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Title     string   `json:"title"`
	Detail    string   `json:"detail"`
	Status    string   `json:"status"`
	Basis     string   `json:"basis,omitempty"`
	Source    string   `json:"source,omitempty"`
	Freshness string   `json:"freshness,omitempty"`
	TargetIDs []string `json:"targetIds,omitempty"`
}

type Verification struct {
	Status  string `json:"status"`
	Passed  int    `json:"passed"`
	Failed  int    `json:"failed"`
	Command string `json:"command"`
	Elapsed string `json:"elapsed"`
}

type ReviewCandidate struct {
	ID                   string   `json:"id"`
	Label                string   `json:"label"`
	Kind                 string   `json:"kind,omitempty"`
	DiffLines            int      `json:"diffLines"`
	FanOut               int      `json:"fanOut"`
	BoundaryCrossings    int      `json:"boundaryCrossings"`
	PublicContractImpact int      `json:"publicContractImpact"`
	Verification         string   `json:"verification"`
	EvidenceIDs          []string `json:"evidenceIds"`
	NodeIDs              []string `json:"nodeIds,omitempty"`
}

type ReviewSignals struct {
	DiffLines            int    `json:"diffLines"`
	FanOut               int    `json:"fanOut"`
	BoundaryCrossings    int    `json:"boundaryCrossings"`
	PublicContractImpact int    `json:"publicContractImpact"`
	Verification         string `json:"verification"`
}

type ReviewTarget struct {
	ID             string        `json:"id"`
	Label          string        `json:"label"`
	Kind           string        `json:"kind"`
	Rank           int           `json:"rank"`
	Score          float64       `json:"score"`
	Reason         string        `json:"reason"`
	Confidence     float64       `json:"confidence"`
	JudgmentSource string        `json:"judgmentSource"`
	Signals        ReviewSignals `json:"signals"`
	EvidenceIDs    []string      `json:"evidenceIds"`
	NodeIDs        []string      `json:"nodeIds"`
}

type ReviewState struct {
	SnapshotID string            `json:"snapshotId"`
	Candidates []ReviewCandidate `json:"candidates"`
}

type Snapshot struct {
	SnapshotID   string            `json:"snapshotId"`
	Repository   Repository        `json:"repository"`
	AgentTurn    AgentTurn         `json:"agentTurn"`
	AgentEvents  []AgentEvent      `json:"agentEvents"`
	Nodes        []Node            `json:"nodes"`
	Edges        []Edge            `json:"edges"`
	Evidence     []Evidence        `json:"evidence"`
	Verification Verification      `json:"verification"`
	Candidates   []ReviewCandidate `json:"-"`
}

type ReviewDecision struct {
	ID        string    `json:"id"`
	TargetID  string    `json:"targetId"`
	Decision  string    `json:"decision"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}
