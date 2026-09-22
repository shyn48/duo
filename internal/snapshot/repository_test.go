package snapshot

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/shyn48/duo/internal/model"
)

func TestLoadRepositoryUsesWorkingTreeAndDependencyFanout(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "go.mod", "module example.com/demo\n\ngo 1.18\n")
	writeTestFile(t, root, "internal/a/a.go", "package a\n\nfunc Existing() {}\n")
	writeTestFile(t, root, "internal/b/b.go", "package b\n\nimport \"example.com/demo/internal/a\"\n\nfunc Use() { a.Existing() }\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "internal/a/a.go", "package a\n\nfunc Existing() {}\n\nfunc Added() {}\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("resolve temp repository root: %v", err)
	}
	if snapshot.Repository.Name != filepath.Base(root) {
		t.Fatalf("repository name = %q, want %q", snapshot.Repository.Name, filepath.Base(root))
	}
	if snapshot.Repository.Root != resolvedRoot {
		t.Fatalf("repository root = %q, want %q", snapshot.Repository.Root, resolvedRoot)
	}
	if snapshot.Repository.Revision == "" {
		t.Fatal("repository revision is empty")
	}
	if snapshot.AgentTurn.ChangedFiles != 1 || !strings.Contains(snapshot.AgentTurn.Title, "Working tree") {
		t.Fatalf("unexpected agent turn: %+v", snapshot.AgentTurn)
	}

	candidate := findCandidate(t, snapshot.Candidates, "internal/a/a.go")
	if candidate.FanOut != 1 {
		t.Fatalf("fan-out = %d, want 1", candidate.FanOut)
	}
	if candidate.PublicContractImpact != 0 || candidate.BoundaryCrossings != 0 {
		t.Fatalf("unsupported policy signals must remain zero in repository ingestion: %+v", candidate)
	}
	if candidate.DiffLines == 0 {
		t.Fatal("diff lines should be populated")
	}
	if candidate.Verification != "unknown" {
		t.Fatalf("verification = %q, want unknown", candidate.Verification)
	}

	assertNodeStatus(t, snapshot, "internal/a/a.go", "changed")
	assertNodeStatus(t, snapshot, "internal/b/b.go", "related")
	if !hasEdge(snapshot, "internal/b/b.go", "internal/a/a.go") {
		t.Fatalf("expected dependent edge internal/b/b.go -> internal/a/a.go, got %+v", snapshot.Edges)
	}
	if len(snapshot.Evidence) != 1 || snapshot.Evidence[0].TargetID != "internal/a/a.go" || !strings.Contains(snapshot.Evidence[0].Detail, "working tree") {
		t.Fatalf("unexpected evidence: %+v", snapshot.Evidence)
	}
}

func TestLoadRepositoryFallsBackToLatestCommitWhenClean(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "go.mod", "module example.com/demo\n\ngo 1.18\n")
	writeTestFile(t, root, "README.md", "baseline\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "README.md", "baseline\nlatest change\n")
	git(t, root, "add", "README.md")
	git(t, root, "commit", "-m", "document latest change")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	if snapshot.AgentTurn.ChangedFiles != 1 || snapshot.AgentTurn.Title != "Latest commit: document latest change" {
		t.Fatalf("unexpected agent turn: %+v", snapshot.AgentTurn)
	}
	if snapshot.AgentTurn.ID != "commit-"+snapshot.Repository.Revision {
		t.Fatalf("agent turn id = %q, revision = %q", snapshot.AgentTurn.ID, snapshot.Repository.Revision)
	}
	if len(snapshot.Evidence) != 1 || !strings.Contains(snapshot.Evidence[0].Detail, "latest commit") {
		t.Fatalf("unexpected evidence: %+v", snapshot.Evidence)
	}
	assertNodeStatus(t, snapshot, "README.md", "changed")
}

func TestLoadRepositoryIncludesUntrackedFiles(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "README.md", "baseline\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")
	writeTestFile(t, root, "notes.txt", "one\ntwo\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	candidate := findCandidate(t, snapshot.Candidates, "notes.txt")
	if candidate.DiffLines != 2 {
		t.Fatalf("untracked diff lines = %d, want 2", candidate.DiffLines)
	}
	assertNodeStatus(t, snapshot, "notes.txt", "changed")
}

func TestLoadRepositoryFindsTypeScriptDependents(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "src/a.ts", "export const value = 1;\n")
	writeTestFile(t, root, "src/b.ts", "import { value } from './a';\nexport const doubled = value * 2;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "src/a.ts", "export const value = 2;\nexport const label = 'atlas';\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	candidate := findCandidate(t, snapshot.Candidates, "src/a.ts")
	if candidate.FanOut != 1 {
		t.Fatalf("fan-out = %d, want 1", candidate.FanOut)
	}
	if candidate.PublicContractImpact != 0 || candidate.BoundaryCrossings != 0 {
		t.Fatalf("unsupported policy signals must remain zero in repository ingestion: %+v", candidate)
	}
	assertNodeStatus(t, snapshot, "src/b.ts", "related")
	if !hasEdge(snapshot, "src/b.ts", "src/a.ts") {
		t.Fatalf("expected TypeScript dependent edge src/b.ts -> src/a.ts, got %+v", snapshot.Edges)
	}
}

func TestLoadRepositoryIgnoresIgnoredSourceFiles(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, ".gitignore", "generated/\n")
	writeTestFile(t, root, "src/a.ts", "export const value = 1;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "src/a.ts", "export const value = 2;\n")
	writeTestFile(t, root, "generated/consumer.ts", "import { value } from '../src/a';\nconsole.log(value);\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	candidate := findCandidate(t, snapshot.Candidates, "src/a.ts")
	if candidate.FanOut != 0 {
		t.Fatalf("ignored source affected fan-out: %+v", candidate)
	}
	for _, node := range snapshot.Nodes {
		if node.ID == "generated/consumer.ts" {
			t.Fatalf("ignored source leaked into graph: %+v", node)
		}
	}
}

func TestLoadRepositoryDoesNotResolveIgnoredTypeScriptImportTarget(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, ".gitignore", "src/ignored.ts\n")
	writeTestFile(t, root, "src/main.ts", "export const value = 1;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "src/main.ts", "import { ignored } from './ignored';\nexport const value = ignored;\n")
	writeTestFile(t, root, "src/ignored.ts", "export const ignored = 1;\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	for _, node := range snapshot.Nodes {
		if node.ID == "src/ignored.ts" {
			t.Fatalf("ignored TypeScript import target leaked into graph: %+v", snapshot.Nodes)
		}
	}
	if hasEdge(snapshot, "src/main.ts", "src/ignored.ts") {
		t.Fatalf("ignored TypeScript target produced dependency edge: %+v", snapshot.Edges)
	}
}

func TestTypeScriptDependencyLexerIgnoresCommentsAndStrings(t *testing.T) {
	contents := []byte(`
// import { ignored } from './commented'
/* export { ignored } from './blocked' */
const fake = "require('./string')";
const template = ` + "`import { fake } from './template'`" + `;
const regex = /import fake from '.\/regex'/gi;
if (ok) /import fake from '.\/after-control'/.test(value);
if (ok) {} /import fake from '.\/after-block'/.test(value);
class Example {} /import fake from '.\/after-class'/.test(value);
interface Shape {} /import fake from '.\/after-interface'/.test(value);
enum Choice {} /import fake from '.\/after-enum'/.test(value);
@decorator
class Decorated {} /import fake from '.\/after-decorated-class'/.test(value);
	@decorators.audit({ enabled: true })
	export abstract class Audited {} /import fake from '.\/after-decorator-call'/.test(value);
	export const enum Mode {} /import fake from '.\/after-const-enum'/.test(value);
	export {}; declare global { interface Window { atlas: boolean } } /import fake from '.\/after-declare-global'/.test(value);
	import { a } from './static';
export { b } from "./exported";
const c = require('./required');
const d = import('./dynamic');
`)
	got := tsDependencySpecifiers(contents)
	want := []string{"./dynamic", "./exported", "./required", "./static"}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("TypeScript dependencies = %q, want %q", got, want)
	}
}

func TestLoadRepositoryResolvesBaselineTypeScriptFromRenamedDirectory(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "src/old/dep.ts", "export const dep = 1;\n")
	writeTestFile(t, root, "src/old/main.ts", "import { dep } from './dep';\nexport const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\nexport const five = 5;\nexport const six = 6;\nexport const seven = 7;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	if err := os.MkdirAll(filepath.Join(root, "src/new"), 0o755); err != nil {
		t.Fatalf("create renamed directory: %v", err)
	}
	git(t, root, "mv", "src/old/main.ts", "src/new/main.ts")
	writeTestFile(t, root, "src/new/main.ts", "export const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\nexport const five = 5;\nexport const six = 6;\nexport const seven = 7;\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load renamed TypeScript source: %v", err)
	}
	findCandidate(t, snapshot.Candidates, "src/new/main.ts")
	if !hasEdge(snapshot, "src/new/main.ts", "src/old/dep.ts") {
		t.Fatalf("baseline dependency was not resolved from old source directory: %+v", snapshot.Edges)
	}
}

func TestGoModulePathSkipsSymlink(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "go.mod")
	if err := os.WriteFile(outside, []byte("module example.com/outside\n"), 0o644); err != nil {
		t.Fatalf("write external go.mod: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("symlink go.mod: %v", err)
	}
	if got := goModulePath(root); got != "" {
		t.Fatalf("goModulePath followed symlink: %q", got)
	}
}

func TestLoadRepositorySkipsUntrackedSymlink(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "README.md", "baseline\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	outside := filepath.Join(t.TempDir(), "outside.ts")
	if err := os.WriteFile(outside, []byte("export const secret = 1;\n"), 0o644); err != nil {
		t.Fatalf("write outside file: %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "linked.ts")); err != nil {
		t.Fatalf("create untracked symlink: %v", err)
	}

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	for _, candidate := range snapshot.Candidates {
		if candidate.ID == "linked.ts" {
			t.Fatalf("untracked symlink became review candidate: %+v", candidate)
		}
	}
}

func TestLoadRepositoryPreservesDeletedDependencyFromLatestCommit(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "go.mod", "module example.com/demo\n\ngo 1.18\n")
	writeTestFile(t, root, "internal/a/a.go", "package a\n\nfunc Value() int { return 1 }\n")
	writeTestFile(t, root, "internal/b/b.go", "package b\n\nimport \"example.com/demo/internal/a\"\n\nfunc Use() int { return a.Value() }\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	if err := os.Remove(filepath.Join(root, "internal/a/a.go")); err != nil {
		t.Fatalf("delete dependency: %v", err)
	}
	writeTestFile(t, root, "internal/b/b.go", "package b\n\nfunc Use() int { return 0 }\n")
	git(t, root, "add", "-A")
	git(t, root, "commit", "-m", "remove package a")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	candidate := findCandidate(t, snapshot.Candidates, "internal/a/a.go")
	if candidate.FanOut != 1 {
		t.Fatalf("deleted dependency fan-out = %d, want 1", candidate.FanOut)
	}
	if !hasEdge(snapshot, "internal/b/b.go", "internal/a/a.go") {
		t.Fatalf("expected pre-change dependency edge for deleted file, got %+v", snapshot.Edges)
	}
}

func TestLoadRepositoryUsesBaselineGoModulePathForRemovedDependency(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "go.mod", "module example.com/old\n\ngo 1.18\n")
	writeTestFile(t, root, "a/a.go", "package a\n\nfunc Value() int { return 1 }\n")
	writeTestFile(t, root, "b/b.go", "package b\n\nimport \"example.com/old/a\"\n\nfunc Use() int { return a.Value() }\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")

	writeTestFile(t, root, "go.mod", "module example.com/new\n\ngo 1.18\n")
	if err := os.Remove(filepath.Join(root, "a/a.go")); err != nil {
		t.Fatalf("delete package a: %v", err)
	}
	writeTestFile(t, root, "b/b.go", "package b\n\nfunc Use() int { return 0 }\n")
	git(t, root, "add", "-A")
	git(t, root, "commit", "-m", "rename module and remove a")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	candidate := findCandidate(t, snapshot.Candidates, "a/a.go")
	if candidate.FanOut != 1 {
		t.Fatalf("deleted old-module dependency fan-out = %d, want 1", candidate.FanOut)
	}
	if !hasEdge(snapshot, "b/b.go", "a/a.go") {
		t.Fatalf("expected baseline old-module dependency edge, got %+v", snapshot.Edges)
	}
}

func TestLoadRepositoryUsesFirstParentForMergeCommit(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "README.md", "baseline\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")
	baseBranch := git(t, root, "branch", "--show-current")

	git(t, root, "checkout", "-b", "feature")
	writeTestFile(t, root, "feature.txt", "feature\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "feature change")

	git(t, root, "checkout", baseBranch)
	writeTestFile(t, root, "main.txt", "main\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "main change")
	git(t, root, "merge", "--no-ff", "feature", "-m", "merge feature")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	if snapshot.AgentTurn.Title != "Latest commit: merge feature" {
		t.Fatalf("unexpected merge turn: %+v", snapshot.AgentTurn)
	}
	findCandidate(t, snapshot.Candidates, "feature.txt")
}

func TestLoadRepositoryCollapsesWorkingTreeRename(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "src/old.ts", "export const one = 1;\nexport const two = 2;\nexport const three = 3;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")
	git(t, root, "mv", "src/old.ts", "src/new.ts")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load renamed working tree: %v", err)
	}
	if snapshot.AgentTurn.ChangedFiles != 1 || len(snapshot.Candidates) != 1 {
		t.Fatalf("rename should be one changed file: turn=%+v candidates=%+v", snapshot.AgentTurn, snapshot.Candidates)
	}
	candidate := findCandidate(t, snapshot.Candidates, "src/new.ts")
	if candidate.DiffLines != 0 {
		t.Fatalf("pure rename diff lines = %d, want 0", candidate.DiffLines)
	}
	if len(snapshot.Evidence) != 1 || !strings.Contains(snapshot.Evidence[0].Detail, "src/old.ts → src/new.ts") {
		t.Fatalf("rename evidence did not preserve old/new path: %+v", snapshot.Evidence)
	}
}

func TestLoadRepositoryCollapsesCleanCommitRename(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "src/old.ts", "export const one = 1;\nexport const two = 2;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")
	git(t, root, "mv", "src/old.ts", "src/new.ts")
	git(t, root, "commit", "-m", "rename source")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load renamed commit: %v", err)
	}
	if snapshot.AgentTurn.ChangedFiles != 1 || len(snapshot.Candidates) != 1 {
		t.Fatalf("committed rename should be one changed file: turn=%+v candidates=%+v", snapshot.AgentTurn, snapshot.Candidates)
	}
	candidate := findCandidate(t, snapshot.Candidates, "src/new.ts")
	if candidate.DiffLines != 0 {
		t.Fatalf("committed pure rename diff lines = %d, want 0", candidate.DiffLines)
	}
}

func TestLoadRepositoryReadsCleanRootCommit(t *testing.T) {
	root := initTestRepository(t)
	writeTestFile(t, root, "first.txt", "first commit\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "first commit")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load root commit repository: %v", err)
	}
	if snapshot.AgentTurn.Title != "Latest commit: first commit" || snapshot.AgentTurn.ChangedFiles != 1 {
		t.Fatalf("unexpected root commit turn: %+v", snapshot.AgentTurn)
	}
	findCandidate(t, snapshot.Candidates, "first.txt")
	if snapshot.Edges == nil {
		t.Fatal("empty dependency graph must serialize as [] rather than null")
	}
}

func TestLoadRepositoryPreservesWhitespaceInGitPaths(t *testing.T) {
	root := initTestRepository(t)
	path := " spaced\nname.ts "
	writeTestFile(t, root, path, "export const value = 1;\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "baseline")
	writeTestFile(t, root, path, "export const value = 2;\n")

	snapshot, err := LoadRepository(root)
	if err != nil {
		t.Fatalf("load repository: %v", err)
	}
	findCandidate(t, snapshot.Candidates, path)
}

func TestLoadRepositoryRejectsNonGitDirectory(t *testing.T) {
	if _, err := LoadRepository(t.TempDir()); err == nil {
		t.Fatal("expected non-git directory error")
	}
}

func initTestRepository(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	git(t, root, "init")
	git(t, root, "config", "user.email", "atlas@example.com")
	git(t, root, "config", "user.name", "Atlas Test")
	return root
}

func writeTestFile(t *testing.T, root, name, contents string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func git(t *testing.T, root string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, output)
	}
	return strings.TrimSpace(string(output))
}

func findCandidate(t *testing.T, candidates []model.ReviewCandidate, id string) model.ReviewCandidate {
	t.Helper()
	for _, candidate := range candidates {
		if candidate.ID == id {
			return candidate
		}
	}
	t.Fatalf("candidate %q not found: %+v", id, candidates)
	return model.ReviewCandidate{}
}

func assertNodeStatus(t *testing.T, snapshot model.Snapshot, id, status string) {
	t.Helper()
	for _, node := range snapshot.Nodes {
		if node.ID == id {
			if node.Status != status {
				t.Fatalf("node %q status = %q, want %q", id, node.Status, status)
			}
			return
		}
	}
	t.Fatalf("node %q not found: %+v", id, snapshot.Nodes)
}

func hasEdge(snapshot model.Snapshot, from, to string) bool {
	for _, edge := range snapshot.Edges {
		if edge.From == from && edge.To == to {
			return true
		}
	}
	return false
}
