#!/usr/bin/env bash
# Duo Task Board — Simple file-based task state management
# Usage: task-board.sh <command> [args]

set -euo pipefail

DUO_DIR=".duo"
TASKS_FILE="$DUO_DIR/tasks.json"

usage() {
    echo "Usage: task-board.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init                              Create .duo directory and empty task board"
    echo "  add <id> <assignee> <description> Add a task (assignee: human|ai)"
    echo "  update <id> <status>              Update task status (todo|in_progress|review|done)"
    echo "  assign <id> <assignee>            Reassign task (human|ai)"
    echo "  show                              Display current task board"
    echo "  clear                             Remove .duo directory"
    exit 1
}

init() {
    mkdir -p "$DUO_DIR"
    if [ ! -f "$TASKS_FILE" ]; then
        echo '{"tasks":[],"created_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "$TASKS_FILE"
        echo "✅ Duo task board initialized"
    else
        echo "⚠️  Task board already exists. Use 'clear' first to reset."
    fi
}

add_task() {
    local id="$1"
    local assignee="$2"
    shift 2
    local description="$*"

    if [[ "$assignee" != "human" && "$assignee" != "ai" ]]; then
        echo "Error: assignee must be 'human' or 'ai'"
        exit 1
    fi

    local icon="🤖"
    [[ "$assignee" == "human" ]] && icon="🧑"

    # Use python3 for JSON manipulation (available on most systems)
    python3 -c "
import json, sys
with open('$TASKS_FILE', 'r') as f:
    data = json.load(f)
data['tasks'].append({
    'id': '$id',
    'assignee': '$assignee',
    'description': '''$description''',
    'status': 'todo'
})
with open('$TASKS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
"
    echo "$icon Task $id added: $description"
}

update_status() {
    local id="$1"
    local status="$2"

    if [[ "$status" != "todo" && "$status" != "in_progress" && "$status" != "review" && "$status" != "done" ]]; then
        echo "Error: status must be todo|in_progress|review|done"
        exit 1
    fi

    python3 -c "
import json
with open('$TASKS_FILE', 'r') as f:
    data = json.load(f)
found = False
for task in data['tasks']:
    if task['id'] == '$id':
        task['status'] = '$status'
        found = True
        break
if not found:
    print(f'Error: task $id not found')
    exit(1)
with open('$TASKS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
"
    echo "✅ Task $id → $status"
}

reassign() {
    local id="$1"
    local assignee="$2"

    if [[ "$assignee" != "human" && "$assignee" != "ai" ]]; then
        echo "Error: assignee must be 'human' or 'ai'"
        exit 1
    fi

    python3 -c "
import json
with open('$TASKS_FILE', 'r') as f:
    data = json.load(f)
found = False
for task in data['tasks']:
    if task['id'] == '$id':
        task['assignee'] = '$assignee'
        found = True
        break
if not found:
    print(f'Error: task $id not found')
    exit(1)
with open('$TASKS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
"
    local icon="🤖"
    [[ "$assignee" == "human" ]] && icon="🧑"
    echo "$icon Task $id reassigned to $assignee"
}

show() {
    if [ ! -f "$TASKS_FILE" ]; then
        echo "No task board found. Run 'init' first."
        exit 1
    fi

    python3 -c "
import json

with open('$TASKS_FILE', 'r') as f:
    data = json.load(f)

tasks = data['tasks']
if not tasks:
    print('📋 Task board is empty')
    exit(0)

status_icons = {'todo': '⬜', 'in_progress': '🔵', 'review': '🟡', 'done': '✅'}

human_tasks = [t for t in tasks if t['assignee'] == 'human']
ai_tasks = [t for t in tasks if t['assignee'] == 'ai']

print('📋 Duo Task Board')
print('─' * 40)

if human_tasks:
    print('\n🧑 HUMAN:')
    for t in human_tasks:
        icon = status_icons.get(t['status'], '⬜')
        print(f\"  {icon} [{t['id']}] {t['description']} ({t['status']})\")

if ai_tasks:
    print('\n🤖 AI:')
    for t in ai_tasks:
        icon = status_icons.get(t['status'], '⬜')
        print(f\"  {icon} [{t['id']}] {t['description']} ({t['status']})\")

done = sum(1 for t in tasks if t['status'] == 'done')
total = len(tasks)
print(f'\n── Progress: {done}/{total} tasks complete ──')
"
}

clear_board() {
    if [ -d "$DUO_DIR" ]; then
        rm -rf "$DUO_DIR"
        echo "🗑️  Duo task board cleared"
    else
        echo "No task board to clear"
    fi
}

# Main dispatch
[[ $# -lt 1 ]] && usage

case "$1" in
    init)    init ;;
    add)     [[ $# -lt 4 ]] && usage; add_task "${@:2}" ;;
    update)  [[ $# -lt 3 ]] && usage; update_status "$2" "$3" ;;
    assign)  [[ $# -lt 3 ]] && usage; reassign "$2" "$3" ;;
    show)    show ;;
    clear)   clear_board ;;
    *)       usage ;;
esac
