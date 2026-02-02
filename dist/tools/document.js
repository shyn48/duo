/**
 * Document storage tools — auto-store docs in .duo/docs/
 */
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getStateInstanceAutoLoad } from "../resources.js";
/**
 * Slugify a title for use in filenames.
 */
function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}
/**
 * Ensure the .duo/docs/ directory exists.
 */
export async function ensureDocsDir(stateDir) {
    const docsDir = join(stateDir, "docs");
    if (!existsSync(docsDir)) {
        await mkdir(docsDir, { recursive: true });
    }
    return docsDir;
}
/**
 * Save a document to .duo/docs/ programmatically.
 * Used internally by other tools (design save, integration, etc.).
 */
export async function saveDocument(stateDir, opts) {
    const docsDir = await ensureDocsDir(stateDir);
    const date = new Date().toISOString().slice(0, 10);
    const slug = slugify(opts.title);
    const filename = `${opts.phase}-${date}-${slug}.md`;
    const filePath = join(docsDir, filename);
    const header = [
        "---",
        `title: "${opts.title}"`,
        `phase: ${opts.phase}`,
        `date: ${date}`,
        opts.category ? `category: ${opts.category}` : null,
        "---",
        "",
    ]
        .filter((line) => line !== null)
        .join("\n");
    await writeFile(filePath, header + opts.content);
    return filename;
}
export function registerDocumentTools(server) {
    server.tool("duo_document_save", "Save a document to .duo/docs/ for project documentation. Auto-generates filename with phase and date.", {
        title: z.string().describe("Document title"),
        content: z.string().describe("Document content (markdown)"),
        phase: z
            .string()
            .describe("Session phase (auto-detected from current phase if omitted)")
            .optional(),
        category: z
            .enum(["design", "review", "integration", "reference"])
            .describe("Document category")
            .optional(),
    }, async ({ title, content, phase, category }) => {
        const state = await getStateInstanceAutoLoad();
        if (!state) {
            return {
                content: [
                    { type: "text", text: "No active Duo session." },
                ],
            };
        }
        const effectivePhase = phase ?? state.getPhase();
        const stateDir = state.getStateDir();
        try {
            const filename = await saveDocument(stateDir, {
                title,
                content,
                phase: effectivePhase,
                category,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `📄 Document saved: ${filename}`,
                    },
                ],
            };
        }
        catch (e) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error saving document: ${e.message}`,
                    },
                ],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=document.js.map