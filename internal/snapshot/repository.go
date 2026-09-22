package snapshot

import (
	"bytes"
	"fmt"
	"go/parser"
	"go/token"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/shyn48/duo/internal/model"
)

const maxIngestFileBytes int64 = 4 << 20

type diffStat struct {
	additions    int
	deletions    int
	previousPath string
}

type dependencyAnalysis struct {
	edges    []model.Edge
	incoming map[string]int
	related  map[string]map[string]struct{}
}

type sourceVariant struct {
	contents   []byte
	modulePath string
	sourcePath string
}

type tsTokenKind uint8

const (
	tsIdentifier tsTokenKind = iota
	tsString
	tsNumber
	tsPunctuation
)

type tsToken struct {
	kind  tsTokenKind
	value string
}

func LoadRepository(path string) (model.Snapshot, error) {
	root, err := gitOutput(path, "rev-parse", "--show-toplevel")
	if err != nil {
		return model.Snapshot{}, fmt.Errorf("resolve git repository: %w", err)
	}
	root = filepath.Clean(root)
	revision, err := gitOutput(root, "rev-parse", "--short=12", "HEAD")
	if err != nil {
		return model.Snapshot{}, fmt.Errorf("resolve git revision: %w", err)
	}

	stats, err := workingTreeStats(root)
	if err != nil {
		return model.Snapshot{}, err
	}
	sourceLabel := "working tree"
	title := "Working tree changes"
	turnID := "worktree-" + revision
	baselineRef := "HEAD"
	if len(stats) == 0 {
		stats, err = latestCommitStats(root)
		if err != nil {
			return model.Snapshot{}, err
		}
		subject, subjectErr := gitOutput(root, "log", "-1", "--format=%s")
		if subjectErr != nil {
			return model.Snapshot{}, fmt.Errorf("read latest commit subject: %w", subjectErr)
		}
		sourceLabel = "latest commit"
		title = "Latest commit: " + subject
		turnID = "commit-" + revision
		baselineRef = "HEAD^"
	}

	changedPaths := sortedKeys(stats)
	baselinePaths := make(map[string]string)
	for path, stat := range stats {
		if stat.previousPath != "" && stat.previousPath != path {
			baselinePaths[path] = stat.previousPath
		}
	}
	analysis, err := analyzeDependencies(root, changedPaths, baselineRef, baselinePaths)
	if err != nil {
		return model.Snapshot{}, err
	}

	nodesByID := make(map[string]model.Node, len(changedPaths))
	evidence := make([]model.Evidence, 0, len(changedPaths))
	candidates := make([]model.ReviewCandidate, 0, len(changedPaths))
	for _, path := range changedPaths {
		nodesByID[path] = model.Node{ID: path, Label: path, Kind: "file", Status: "changed", FileCount: 1}
		for relatedPath := range analysis.related[path] {
			if _, changed := stats[relatedPath]; changed {
				continue
			}
			nodesByID[relatedPath] = model.Node{ID: relatedPath, Label: relatedPath, Kind: "file", Status: "related", FileCount: 1}
		}

		stat := stats[path]
		evidenceID := "diff-" + stableID(path)
		detailPath := path
		if stat.previousPath != "" && stat.previousPath != path {
			detailPath = stat.previousPath + " → " + path
		}
		evidence = append(evidence, model.Evidence{
			ID:       evidenceID,
			Kind:     "diff",
			Title:    "Changed " + path,
			Detail:   fmt.Sprintf("%s · +%d −%d · %s", detailPath, stat.additions, stat.deletions, sourceLabel),
			Status:   "changed",
			TargetID: path,
		})

		nodeIDs := []string{path}
		for relatedPath := range analysis.related[path] {
			nodeIDs = append(nodeIDs, relatedPath)
		}
		sort.Strings(nodeIDs[1:])
		candidates = append(candidates, model.ReviewCandidate{
			ID:                   path,
			Label:                path,
			Kind:                 "file",
			DiffLines:            stat.additions + stat.deletions,
			FanOut:               analysis.incoming[path],
			BoundaryCrossings:    0,
			PublicContractImpact: 0,
			Verification:         "unknown",
			EvidenceIDs:          []string{evidenceID},
			NodeIDs:              nodeIDs,
		})
	}

	nodes := make([]model.Node, 0, len(nodesByID))
	for _, node := range nodesByID {
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].ID < nodes[j].ID })

	return model.Snapshot{
		Repository: model.Repository{
			ID:       filepath.Base(root),
			Name:     filepath.Base(root),
			Revision: revision,
			Root:     root,
		},
		AgentTurn: model.AgentTurn{
			ID:           turnID,
			Title:        title,
			Status:       "review",
			ChangedFiles: len(changedPaths),
		},
		Nodes:      nodes,
		Edges:      analysis.edges,
		Evidence:   evidence,
		Candidates: candidates,
		Verification: model.Verification{
			Status:  "unknown",
			Command: "Not run for repository ingestion",
			Elapsed: "—",
		},
	}, nil
}

func workingTreeStats(root string) (map[string]diffStat, error) {
	output, err := gitRawOutput(root, "diff", "-M", "--numstat", "-z", "HEAD", "--")
	if err != nil {
		return nil, fmt.Errorf("read working tree diff: %w", err)
	}
	stats := parseNumstat(output)
	untracked, err := gitRawOutput(root, "ls-files", "--others", "--exclude-standard", "-z")
	if err != nil {
		return nil, fmt.Errorf("read untracked files: %w", err)
	}
	for _, path := range nulSeparatedStrings(untracked) {
		lines, regular, readErr := countRegularFileLines(filepath.Join(root, filepath.FromSlash(path)), maxIngestFileBytes)
		if readErr != nil {
			return nil, fmt.Errorf("inspect untracked file %s: %w", path, readErr)
		}
		if !regular {
			continue
		}
		stats[path] = diffStat{additions: lines}
	}
	return stats, nil
}

func latestCommitStats(root string) (map[string]diffStat, error) {
	parent, parentErr := gitOutput(root, "rev-parse", "--verify", "HEAD^1")
	if parentErr == nil && parent != "" {
		output, err := gitRawOutput(root, "diff", "-M", "--numstat", "-z", parent, "HEAD", "--")
		if err != nil {
			return nil, fmt.Errorf("read latest commit first-parent diff: %w", err)
		}
		return parseNumstat(output), nil
	}
	output, err := gitRawOutput(root, "diff-tree", "--root", "--no-commit-id", "-M", "--numstat", "-z", "-r", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("read root commit diff: %w", err)
	}
	return parseNumstat(output), nil
}

func parseNumstat(output []byte) map[string]diffStat {
	stats := make(map[string]diffStat)
	records := nulSeparatedStrings(output)
	for index := 0; index < len(records); index++ {
		record := records[index]
		parts := strings.SplitN(record, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		additions, _ := strconv.Atoi(parts[0])
		deletions, _ := strconv.Atoi(parts[1])
		if parts[2] == "" && index+2 < len(records) {
			previousPath := filepath.ToSlash(records[index+1])
			path := filepath.ToSlash(records[index+2])
			stats[path] = diffStat{additions: additions, deletions: deletions, previousPath: previousPath}
			index += 2
			continue
		}
		path := filepath.ToSlash(parts[2])
		stats[path] = diffStat{additions: additions, deletions: deletions}
	}
	return stats
}

func analyzeDependencies(root string, changedPaths []string, baselineRef string, baselinePaths map[string]string) (dependencyAnalysis, error) {
	sourceFiles, err := repositorySourceFiles(root)
	if err != nil {
		return dependencyAnalysis{}, err
	}
	knownPaths := make(map[string]struct{}, len(sourceFiles)+len(changedPaths))
	for _, path := range sourceFiles {
		knownPaths[path] = struct{}{}
	}
	for _, path := range changedPaths {
		_, exists := knownPaths[path]
		knownPaths[path] = struct{}{}
		if ext := strings.ToLower(filepath.Ext(path)); ext == ".go" || ext == ".ts" || ext == ".tsx" {
			if !exists {
				sourceFiles = append(sourceFiles, path)
			}
		}
	}
	renameOldToNew := make(map[string]string, len(baselinePaths))
	for path, previousPath := range baselinePaths {
		knownPaths[previousPath] = struct{}{}
		renameOldToNew[previousPath] = path
	}
	sort.Strings(sourceFiles)

	modulePath := goModulePath(root)
	baselineModulePath := modulePath
	if baselineContents := readSourceAtRef(root, "go.mod", baselineRef); len(baselineContents) > 0 {
		if parsed := goModulePathFromContents(baselineContents); parsed != "" {
			baselineModulePath = parsed
		}
	}
	goFilesByDir := make(map[string][]string)
	for _, path := range sourceFiles {
		if filepath.Ext(path) == ".go" && !strings.HasSuffix(path, "_test.go") {
			dir := filepath.ToSlash(filepath.Dir(path))
			goFilesByDir[dir] = append(goFilesByDir[dir], path)
		}
	}
	for _, previousPath := range baselinePaths {
		if filepath.Ext(previousPath) == ".go" && !strings.HasSuffix(previousPath, "_test.go") {
			dir := filepath.ToSlash(filepath.Dir(previousPath))
			goFilesByDir[dir] = append(goFilesByDir[dir], previousPath)
		}
	}

	changed := make(map[string]struct{}, len(changedPaths))
	for _, path := range changedPaths {
		changed[path] = struct{}{}
	}

	allEdges := make(map[string]model.Edge)
	for _, source := range sourceFiles {
		var variants []sourceVariant
		contents, regular, readErr := readRegularFile(filepath.Join(root, filepath.FromSlash(source)), maxIngestFileBytes)
		if readErr != nil {
			return dependencyAnalysis{}, fmt.Errorf("read source file %s: %w", source, readErr)
		}
		if regular && len(contents) > 0 {
			variants = append(variants, sourceVariant{contents: contents, modulePath: modulePath, sourcePath: source})
		}
		if _, sourceChanged := changed[source]; sourceChanged && baselineRef != "" {
			baselinePath := source
			if previousPath := baselinePaths[source]; previousPath != "" {
				baselinePath = previousPath
			}
			if baseline := readSourceAtRef(root, baselinePath, baselineRef); len(baseline) > 0 && (len(variants) == 0 || !bytes.Equal(variants[0].contents, baseline)) {
				variants = append(variants, sourceVariant{contents: baseline, modulePath: baselineModulePath, sourcePath: baselinePath})
			}
		}
		for _, variant := range variants {
			var targets []string
			switch {
			case strings.HasSuffix(source, ".go"):
				targets = goDependencies(variant.contents, variant.modulePath, goFilesByDir)
			case strings.HasSuffix(source, ".ts"), strings.HasSuffix(source, ".tsx"):
				targets = tsDependencies(root, variant.sourcePath, variant.contents, knownPaths)
			}
			for _, target := range targets {
				if currentPath := renameOldToNew[target]; currentPath != "" {
					target = currentPath
				}
				if source == target {
					continue
				}
				key := source + "\x00" + target
				allEdges[key] = model.Edge{From: source, To: target, Kind: "dependency", Status: "related"}
			}
		}
	}

	result := dependencyAnalysis{
		edges:    make([]model.Edge, 0),
		incoming: make(map[string]int),
		related:  make(map[string]map[string]struct{}),
	}
	incomingSources := make(map[string]map[string]struct{})
	for _, edge := range allEdges {
		if _, ok := incomingSources[edge.To]; !ok {
			incomingSources[edge.To] = make(map[string]struct{})
		}
		incomingSources[edge.To][edge.From] = struct{}{}
		_, fromChanged := changed[edge.From]
		_, toChanged := changed[edge.To]
		if !fromChanged && !toChanged {
			continue
		}
		result.edges = append(result.edges, edge)
		if fromChanged {
			addRelated(result.related, edge.From, edge.To)
		}
		if toChanged {
			addRelated(result.related, edge.To, edge.From)
		}
	}
	for path, sources := range incomingSources {
		result.incoming[path] = len(sources)
	}
	sort.Slice(result.edges, func(i, j int) bool {
		if result.edges[i].From == result.edges[j].From {
			return result.edges[i].To < result.edges[j].To
		}
		return result.edges[i].From < result.edges[j].From
	})
	return result, nil
}

func repositorySourceFiles(root string) ([]string, error) {
	output, err := gitRawOutput(root, "ls-files", "-co", "--exclude-standard", "-z")
	if err != nil {
		return nil, fmt.Errorf("list repository files: %w", err)
	}
	files := make([]string, 0)
	for _, path := range nulSeparatedStrings(output) {
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".go" && ext != ".ts" && ext != ".tsx" {
			continue
		}
		files = append(files, filepath.ToSlash(path))
	}
	sort.Strings(files)
	return files, nil
}

func goModulePath(root string) string {
	contents, regular, err := readRegularFile(filepath.Join(root, "go.mod"), maxIngestFileBytes)
	if err != nil || !regular {
		return ""
	}
	return goModulePathFromContents(contents)
}

func goModulePathFromContents(contents []byte) string {
	for _, line := range strings.Split(string(contents), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "module" {
			return fields[1]
		}
	}
	return ""
}

func goDependencies(contents []byte, modulePath string, filesByDir map[string][]string) []string {
	if modulePath == "" {
		return nil
	}
	parsed, err := parser.ParseFile(token.NewFileSet(), "", contents, parser.ImportsOnly)
	if err != nil {
		return nil
	}
	targetSet := make(map[string]struct{})
	for _, importSpec := range parsed.Imports {
		importPath, err := strconv.Unquote(importSpec.Path.Value)
		if err != nil {
			continue
		}
		var relDir string
		switch {
		case importPath == modulePath:
			relDir = "."
		case strings.HasPrefix(importPath, modulePath+"/"):
			relDir = strings.TrimPrefix(importPath, modulePath+"/")
		default:
			continue
		}
		for _, target := range filesByDir[filepath.ToSlash(relDir)] {
			targetSet[target] = struct{}{}
		}
	}
	return sortedKeys(targetSet)
}

func tsDependencies(root, source string, contents []byte, knownPaths map[string]struct{}) []string {
	specifiers := make(map[string]struct{})
	for _, specifier := range tsDependencySpecifiers(contents) {
		if strings.HasPrefix(specifier, ".") {
			specifiers[specifier] = struct{}{}
		}
	}
	var targets []string
	for specifier := range specifiers {
		if target := resolveTSImport(root, source, specifier, knownPaths); target != "" {
			targets = append(targets, target)
		}
	}
	sort.Strings(targets)
	return targets
}

func tsDependencySpecifiers(contents []byte) []string {
	tokens := lexTypeScript(contents)
	specifiers := make(map[string]struct{})
	addString := func(index int) {
		if index >= 0 && index < len(tokens) && tokens[index].kind == tsString {
			specifiers[tokens[index].value] = struct{}{}
		}
	}
	for index, token := range tokens {
		if token.kind != tsIdentifier {
			continue
		}
		switch token.value {
		case "import":
			if index > 0 && tokens[index-1].kind == tsPunctuation && tokens[index-1].value == "." {
				continue
			}
			if index+1 < len(tokens) && tokens[index+1].kind == tsString {
				addString(index + 1)
				continue
			}
			if index+2 < len(tokens) && tokens[index+1].kind == tsPunctuation && tokens[index+1].value == "(" && tokens[index+2].kind == tsString {
				addString(index + 2)
				continue
			}
			addFromSpecifier(tokens, index+1, specifiers)
		case "export":
			addFromSpecifier(tokens, index+1, specifiers)
		case "require":
			if index > 0 && tokens[index-1].kind == tsPunctuation && tokens[index-1].value == "." {
				continue
			}
			if index+2 < len(tokens) && tokens[index+1].kind == tsPunctuation && tokens[index+1].value == "(" && tokens[index+2].kind == tsString {
				addString(index + 2)
			}
		}
	}
	return sortedKeys(specifiers)
}

func addFromSpecifier(tokens []tsToken, start int, specifiers map[string]struct{}) {
	for index := start; index < len(tokens); index++ {
		token := tokens[index]
		if token.kind == tsPunctuation && token.value == ";" {
			return
		}
		if token.kind == tsIdentifier && (token.value == "import" || token.value == "export" || token.value == "const" || token.value == "let" || token.value == "var" || token.value == "function" || token.value == "class") {
			return
		}
		if token.kind == tsIdentifier && token.value == "from" && index+1 < len(tokens) && tokens[index+1].kind == tsString {
			specifiers[tokens[index+1].value] = struct{}{}
			return
		}
	}
}

func lexTypeScript(contents []byte) []tsToken {
	tokens := make([]tsToken, 0)
	for index := 0; index < len(contents); {
		current := contents[index]
		if isTSWhitespace(current) {
			index++
			continue
		}
		if current == '/' && index+1 < len(contents) && contents[index+1] == '/' {
			index += 2
			for index < len(contents) && contents[index] != '\n' {
				index++
			}
			continue
		}
		if current == '/' && index+1 < len(contents) && contents[index+1] == '*' {
			index += 2
			for index+1 < len(contents) && !(contents[index] == '*' && contents[index+1] == '/') {
				index++
			}
			if index+1 < len(contents) {
				index += 2
			}
			continue
		}
		if current == '/' && shouldStartTSRegex(tokens) {
			index = skipTSRegex(contents, index)
			continue
		}
		if current == '`' {
			index = skipTSQuoted(contents, index, current)
			continue
		}
		if current == '\'' || current == '"' {
			value, next := readTSString(contents, index, current)
			tokens = append(tokens, tsToken{kind: tsString, value: value})
			index = next
			continue
		}
		if isTSIdentifierStart(current) {
			start := index
			index++
			for index < len(contents) && isTSIdentifierPart(contents[index]) {
				index++
			}
			tokens = append(tokens, tsToken{kind: tsIdentifier, value: string(contents[start:index])})
			continue
		}
		if current >= '0' && current <= '9' {
			start := index
			index++
			for index < len(contents) && (contents[index] >= '0' && contents[index] <= '9' || contents[index] == '.' || contents[index] == '_') {
				index++
			}
			tokens = append(tokens, tsToken{kind: tsNumber, value: string(contents[start:index])})
			continue
		}
		tokens = append(tokens, tsToken{kind: tsPunctuation, value: string([]byte{current})})
		index++
	}
	return tokens
}

func readTSString(contents []byte, start int, quote byte) (string, int) {
	var value strings.Builder
	for index := start + 1; index < len(contents); index++ {
		current := contents[index]
		if current == '\\' && index+1 < len(contents) {
			index++
			value.WriteByte(contents[index])
			continue
		}
		if current == quote {
			return value.String(), index + 1
		}
		value.WriteByte(current)
	}
	return value.String(), len(contents)
}

func skipTSQuoted(contents []byte, start int, quote byte) int {
	for index := start + 1; index < len(contents); index++ {
		if contents[index] == '\\' && index+1 < len(contents) {
			index++
			continue
		}
		if contents[index] == quote {
			return index + 1
		}
	}
	return len(contents)
}

func shouldStartTSRegex(tokens []tsToken) bool {
	if len(tokens) == 0 {
		return true
	}
	previous := tokens[len(tokens)-1]
	if previous.kind == tsNumber || previous.kind == tsString {
		return false
	}
	if previous.kind == tsIdentifier {
		switch previous.value {
		case "return", "throw", "case", "delete", "void", "typeof", "instanceof", "in", "of", "yield", "await", "else", "do":
			return true
		default:
			return false
		}
	}
	if previous.kind == tsPunctuation {
		switch previous.value {
		case ")":
			return closesTSControlCondition(tokens, len(tokens)-1)
		case "}":
			return closesTSStatementBlock(tokens, len(tokens)-1)
		case "]":
			return false
		default:
			return true
		}
	}
	return true
}

func closesTSControlCondition(tokens []tsToken, closeIndex int) bool {
	openIndex := matchingTSPunctuation(tokens, closeIndex, "(", ")")
	if openIndex <= 0 || tokens[openIndex-1].kind != tsIdentifier {
		return false
	}
	switch tokens[openIndex-1].value {
	case "if", "while", "for", "with", "switch", "catch":
		return true
	default:
		return false
	}
}

func closesTSStatementBlock(tokens []tsToken, closeIndex int) bool {
	openIndex := matchingTSPunctuation(tokens, closeIndex, "{", "}")
	if openIndex < 0 {
		return false
	}
	if openIndex == 0 {
		return true
	}
	if startsTSDeclarationStatement(tokens, openIndex) {
		return true
	}
	previous := tokens[openIndex-1]
	if previous.kind == tsPunctuation {
		switch previous.value {
		case ")", ";", "{", "}", ":":
			return true
		default:
			return false
		}
	}
	if previous.kind == tsIdentifier {
		switch previous.value {
		case "else", "try", "finally", "do":
			return true
		}
	}
	return false
}

func startsTSDeclarationStatement(tokens []tsToken, openIndex int) bool {
	start := tsStatementSegmentStart(tokens, openIndex)
	index := start
	sawDeclare := false
	for index < openIndex {
		if tokens[index].kind == tsPunctuation && tokens[index].value == "@" {
			index = skipTSDecorator(tokens, index+1, openIndex)
			continue
		}
		if tokens[index].kind == tsIdentifier && isTSDeclarationModifier(tokens[index].value) {
			if tokens[index].value == "declare" {
				sawDeclare = true
			}
			index++
			continue
		}
		break
	}
	if index >= openIndex || tokens[index].kind != tsIdentifier {
		return false
	}
	switch tokens[index].value {
	case "class", "interface", "enum", "namespace", "module", "type":
		return true
	case "global":
		return sawDeclare
	default:
		return false
	}
}

func isTSDeclarationModifier(value string) bool {
	switch value {
	case "export", "default", "declare", "abstract", "const":
		return true
	default:
		return false
	}
}

func tsStatementSegmentStart(tokens []tsToken, before int) int {
	parenDepth := 0
	bracketDepth := 0
	braceDepth := 0
	for index := before - 1; index >= 0; index-- {
		if tokens[index].kind != tsPunctuation {
			continue
		}
		switch tokens[index].value {
		case ")":
			parenDepth++
		case "(":
			if parenDepth > 0 {
				parenDepth--
			}
		case "]":
			bracketDepth++
		case "[":
			if bracketDepth > 0 {
				bracketDepth--
			}
		case "}":
			if parenDepth == 0 && bracketDepth == 0 && braceDepth == 0 {
				return index + 1
			}
			braceDepth++
		case "{":
			if braceDepth > 0 {
				braceDepth--
			} else if parenDepth == 0 && bracketDepth == 0 {
				return index + 1
			}
		case ";":
			if parenDepth == 0 && bracketDepth == 0 && braceDepth == 0 {
				return index + 1
			}
		}
	}
	return 0
}

func isTSDeclarationKeyword(value string) bool {
	switch value {
	case "class", "interface", "enum", "namespace", "module", "type":
		return true
	default:
		return false
	}
}

func skipTSDecorator(tokens []tsToken, start, limit int) int {
	parenDepth := 0
	bracketDepth := 0
	braceDepth := 0
	consumed := false
	for index := start; index < limit; index++ {
		token := tokens[index]
		if parenDepth == 0 && bracketDepth == 0 && braceDepth == 0 && consumed {
			if token.kind == tsPunctuation && token.value == "@" {
				return index
			}
			if token.kind == tsIdentifier && (isTSDeclarationModifier(token.value) || isTSDeclarationKeyword(token.value)) {
				return index
			}
		}
		if token.kind == tsPunctuation {
			switch token.value {
			case "(":
				parenDepth++
			case ")":
				if parenDepth > 0 {
					parenDepth--
				}
			case "[":
				bracketDepth++
			case "]":
				if bracketDepth > 0 {
					bracketDepth--
				}
			case "{":
				braceDepth++
			case "}":
				if braceDepth > 0 {
					braceDepth--
				}
			}
		}
		consumed = true
	}
	return limit
}

func matchingTSPunctuation(tokens []tsToken, closeIndex int, open, close string) int {
	depth := 0
	for index := closeIndex; index >= 0; index-- {
		if tokens[index].kind != tsPunctuation {
			continue
		}
		switch tokens[index].value {
		case close:
			depth++
		case open:
			depth--
			if depth == 0 {
				return index
			}
		}
	}
	return -1
}

func skipTSRegex(contents []byte, start int) int {
	inClass := false
	for index := start + 1; index < len(contents); index++ {
		current := contents[index]
		if current == '\\' && index+1 < len(contents) {
			index++
			continue
		}
		if current == '\n' || current == '\r' {
			return start + 1
		}
		if current == '[' {
			inClass = true
			continue
		}
		if current == ']' {
			inClass = false
			continue
		}
		if current == '/' && !inClass {
			index++
			for index < len(contents) && isTSIdentifierPart(contents[index]) {
				index++
			}
			return index
		}
	}
	return start + 1
}

func isTSWhitespace(value byte) bool {
	switch value {
	case ' ', '\t', '\r', '\n', '\f':
		return true
	default:
		return false
	}
}

func isTSIdentifierStart(value byte) bool {
	return value == '_' || value == '$' || value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z'
}

func isTSIdentifierPart(value byte) bool {
	return isTSIdentifierStart(value) || value >= '0' && value <= '9'
}

func resolveTSImport(root, source, specifier string, knownPaths map[string]struct{}) string {
	base := filepath.Clean(filepath.Join(filepath.Dir(filepath.FromSlash(source)), filepath.FromSlash(specifier)))
	candidates := []string{base, base + ".ts", base + ".tsx", filepath.Join(base, "index.ts"), filepath.Join(base, "index.tsx")}
	for _, candidate := range candidates {
		rel := filepath.ToSlash(filepath.Clean(candidate))
		if rel == ".." || strings.HasPrefix(rel, "../") {
			continue
		}
		if _, known := knownPaths[rel]; known {
			return rel
		}
	}
	return ""
}

func readSourceAtRef(root, path, ref string) []byte {
	if ref == "" {
		return nil
	}
	tree, err := gitRawOutput(root, "ls-tree", "-z", ref, "--", path)
	if err != nil || len(tree) == 0 {
		return nil
	}
	record := bytes.SplitN(tree, []byte{0}, 2)[0]
	space := bytes.IndexByte(record, ' ')
	if space <= 0 {
		return nil
	}
	mode := string(record[:space])
	if mode != "100644" && mode != "100755" {
		return nil
	}
	sizeText, err := gitOutput(root, "cat-file", "-s", ref+":"+path)
	if err != nil {
		return nil
	}
	size, err := strconv.ParseInt(sizeText, 10, 64)
	if err != nil || size > maxIngestFileBytes {
		return nil
	}
	cmd := exec.Command("git", "-C", root, "show", ref+":"+path)
	contents, err := cmd.Output()
	if err != nil {
		return nil
	}
	return contents
}

func readRegularFile(path string, maxBytes int64) ([]byte, bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !info.Mode().IsRegular() || info.Size() > maxBytes {
		return nil, false, nil
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, false, err
	}
	return contents, true, nil
}

func countRegularFileLines(path string, maxBytes int64) (int, bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, false, nil
		}
		return 0, false, err
	}
	if !info.Mode().IsRegular() {
		return 0, false, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return 0, false, err
	}
	defer file.Close()
	contents, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return 0, false, err
	}
	if int64(len(contents)) > maxBytes {
		contents = contents[:maxBytes]
	}
	return lineCount(contents), true, nil
}

func addRelated(related map[string]map[string]struct{}, source, target string) {
	if _, ok := related[source]; !ok {
		related[source] = make(map[string]struct{})
	}
	related[source][target] = struct{}{}
}

func gitOutput(root string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

func gitRawOutput(root string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return output, nil
}

func nulSeparatedStrings(output []byte) []string {
	records := bytes.Split(output, []byte{0})
	values := make([]string, 0, len(records))
	for _, record := range records {
		if len(record) > 0 {
			values = append(values, string(record))
		}
	}
	return values
}

func lineCount(contents []byte) int {
	if len(contents) == 0 {
		return 0
	}
	count := bytes.Count(contents, []byte("\n"))
	if contents[len(contents)-1] != '\n' {
		count++
	}
	return count
}

func nonEmptyLines(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	lines := strings.Split(value, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			result = append(result, line)
		}
	}
	return result
}

func stableID(value string) string {
	var hash uint64 = 1469598103934665603
	for i := 0; i < len(value); i++ {
		hash ^= uint64(value[i])
		hash *= 1099511628211
	}
	return fmt.Sprintf("%016x", hash)
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
