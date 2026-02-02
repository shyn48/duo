/**
 * Duo File Watcher — Detects human code changes and maps to tasks
 */
import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
export class DuoWatcher {
    watchers = [];
    projectRoot;
    config;
    callbacks = [];
    debounceTimers = new Map();
    debounceMs = 500;
    running = false;
    constructor(projectRoot, config) {
        this.projectRoot = projectRoot;
        this.config = config;
    }
    /**
     * Register a callback for file changes
     */
    onChange(callback) {
        this.callbacks.push(callback);
    }
    /**
     * Start watching the project directory
     */
    async start() {
        if (this.running)
            return;
        this.running = true;
        // Watch the project root recursively
        try {
            const watcher = watch(this.projectRoot, { recursive: true }, (eventType, filename) => {
                if (!filename)
                    return;
                this.handleChange(eventType, filename);
            });
            this.watchers.push(watcher);
        }
        catch {
            // Fallback: watch individual directories (for systems without recursive support)
            await this.watchDirectoriesRecursive(this.projectRoot);
        }
    }
    /**
     * Stop watching
     */
    stop() {
        this.running = false;
        for (const watcher of this.watchers) {
            watcher.close();
        }
        this.watchers = [];
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
    /**
     * Check if a file change matches any task by file path
     */
    matchTask(filePath, tasks) {
        const relPath = relative(this.projectRoot, filePath);
        return tasks.find((t) => t.files.some((f) => relPath === f ||
            relPath.startsWith(f) ||
            f.endsWith(relPath) ||
            relPath.includes(f)));
    }
    // ── Private ──
    handleChange(eventType, filename) {
        // Check ignore patterns
        if (this.shouldIgnore(filename))
            return;
        // Debounce rapid changes to the same file
        const existing = this.debounceTimers.get(filename);
        if (existing)
            clearTimeout(existing);
        this.debounceTimers.set(filename, setTimeout(() => {
            this.debounceTimers.delete(filename);
            this.emitChange(eventType, filename);
        }, this.debounceMs));
    }
    emitChange(eventType, filename) {
        const change = {
            filePath: join(this.projectRoot, filename),
            relativePath: filename,
            eventType,
            timestamp: new Date().toISOString(),
        };
        for (const cb of this.callbacks) {
            cb(change);
        }
    }
    shouldIgnore(filePath) {
        return this.config.ignorePatterns.some((pattern) => {
            // Simple glob matching
            if (pattern.startsWith("*.")) {
                return filePath.endsWith(pattern.slice(1));
            }
            return filePath.includes(pattern);
        });
    }
    async watchDirectoriesRecursive(dir) {
        const relDir = relative(this.projectRoot, dir);
        if (this.shouldIgnore(relDir))
            return;
        try {
            const watcher = watch(dir, (eventType, filename) => {
                if (!filename)
                    return;
                const relPath = join(relDir, filename);
                this.handleChange(eventType, relPath);
            });
            this.watchers.push(watcher);
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
                    await this.watchDirectoriesRecursive(join(dir, entry.name));
                }
            }
        }
        catch {
            // Directory may not exist or be inaccessible
        }
    }
}
//# sourceMappingURL=watcher.js.map