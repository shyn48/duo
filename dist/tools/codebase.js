/**
 * Codebase Knowledge Management — Persistent architecture/pattern documentation
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const CODEBASE_TEMPLATE = `# Codebase Knowledge

> This file persists across Duo sessions. Update it when you discover important patterns, architecture decisions, or gotchas.

## Architecture
<!-- High-level architecture overview -->

## Key Patterns
<!-- Common patterns used in this codebase -->

## Important Files
<!-- Key files and their purposes -->

## Gotchas & Warnings
<!-- Things that tripped you up or are non-obvious -->

## Conventions
<!-- Coding conventions, naming patterns, etc. -->
`;
/**
 * Read CODEBASE.md from .duo directory. Creates template if doesn't exist.
 */
export async function readCodebaseKnowledge(stateDir) {
    const codebasePath = join(stateDir, "CODEBASE.md");
    if (!existsSync(codebasePath)) {
        await writeFile(codebasePath, CODEBASE_TEMPLATE);
        return { content: CODEBASE_TEMPLATE, isNew: true };
    }
    const content = await readFile(codebasePath, "utf-8");
    return { content, isNew: false };
}
/**
 * Append updates to CODEBASE.md
 */
export async function appendCodebaseKnowledge(stateDir, updates) {
    const codebasePath = join(stateDir, "CODEBASE.md");
    // Read existing content
    let content;
    if (existsSync(codebasePath)) {
        content = await readFile(codebasePath, "utf-8");
    }
    else {
        content = CODEBASE_TEMPLATE;
    }
    const timestamp = new Date().toISOString().split("T")[0];
    const additions = [];
    if (updates.architecture) {
        additions.push(`\n### Added ${timestamp}\n${updates.architecture}`);
        content = insertInSection(content, "## Architecture", additions.pop());
    }
    if (updates.patterns && updates.patterns.length > 0) {
        const patternsText = updates.patterns.map(p => `- ${p}`).join("\n");
        content = insertInSection(content, "## Key Patterns", `\n${patternsText}`);
    }
    if (updates.files && updates.files.length > 0) {
        const filesText = updates.files.map(f => `- \`${f.path}\` — ${f.purpose}`).join("\n");
        content = insertInSection(content, "## Important Files", `\n${filesText}`);
    }
    if (updates.gotchas && updates.gotchas.length > 0) {
        const gotchasText = updates.gotchas.map(g => `- ⚠️ ${g}`).join("\n");
        content = insertInSection(content, "## Gotchas & Warnings", `\n${gotchasText}`);
    }
    if (updates.conventions && updates.conventions.length > 0) {
        const conventionsText = updates.conventions.map(c => `- ${c}`).join("\n");
        content = insertInSection(content, "## Conventions", `\n${conventionsText}`);
    }
    await writeFile(codebasePath, content);
    return codebasePath;
}
/**
 * Insert content after a section header, before the next section or end of file.
 */
function insertInSection(content, sectionHeader, newContent) {
    const lines = content.split("\n");
    const sectionIndex = lines.findIndex(line => line.startsWith(sectionHeader));
    if (sectionIndex === -1) {
        // Section not found, append at end
        return content + "\n" + sectionHeader + "\n" + newContent;
    }
    // Find next section (## header) or end
    let insertIndex = sectionIndex + 1;
    for (let i = sectionIndex + 1; i < lines.length; i++) {
        if (lines[i].startsWith("## ")) {
            insertIndex = i;
            break;
        }
        insertIndex = i + 1;
    }
    // Insert before the next section
    lines.splice(insertIndex, 0, newContent);
    return lines.join("\n");
}
//# sourceMappingURL=codebase.js.map