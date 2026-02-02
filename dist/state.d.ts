/**
 * Duo State Manager — Persistent task and session state
 */
import type { DuoSession, DuoConfig, Task, TaskAssignee, TaskStatus, SessionPhase, DesignDocument, UserPreferences, SubagentInfo } from "./types.js";
import type { DashboardServer } from "./dashboard/index.js";
export declare class DuoState {
    private session;
    private config;
    private stateDir;
    private dashboard;
    constructor(projectRoot: string, config?: Partial<DuoConfig>);
    setDashboard(dashboard: DashboardServer): void;
    private emitEvent;
    init(): Promise<void>;
    save(): Promise<void>;
    savePreferences(): Promise<void>;
    saveDesign(): Promise<void>;
    getPhase(): SessionPhase;
    setPhase(phase: SessionPhase): Promise<void>;
    setDesign(design: DesignDocument): Promise<void>;
    getDesign(): DesignDocument | null;
    getTasks(): Task[];
    getTask(id: string): Task | undefined;
    addTask(id: string, description: string, assignee: TaskAssignee, files?: string[]): Promise<Task>;
    updateTaskStatus(id: string, status: TaskStatus): Promise<Task>;
    reassignTask(id: string, assignee: TaskAssignee): Promise<Task>;
    setReviewStatus(id: string, status: "pending" | "approved" | "changes_requested", notes?: string): Promise<Task>;
    getPreferences(): UserPreferences;
    addPreference(taskType: string, assignee: TaskAssignee): Promise<void>;
    formatTaskBoard(): string;
    addSubagent(info: SubagentInfo): Promise<void>;
    getSubagents(): SubagentInfo[];
    getStateDir(): string;
    getSession(): DuoSession;
    clear(): Promise<void>;
}
//# sourceMappingURL=state.d.ts.map