# Review Phase Patterns

## Reviewing Human Code

### What to flag
- Bugs and logic errors
- Missing error handling
- Security issues
- Performance concerns for the actual use case
- Missing edge cases from the design phase

### What NOT to flag
- Style preferences (unless project has a linter)
- "I would have done it differently" (not a bug = not a flag)
- Minor naming choices
- Over-optimization suggestions

### Review format
```
Reviewed task N — your [feature] implementation:

✅ Good:
- [specific praise for clever/clean solutions]

💬 Suggestions:
- [file:line] — [specific actionable feedback]

❌ Issues:
- [file:line] — [bug/security issue with explanation]
```

Always include at least one positive observation. Engineers who just coded something want to know what they did right.

## Reviewing AI Code (Human reviewing AI)

Present changes clearly:
- List files changed with brief summary
- Show key code blocks (not entire files)
- Highlight any decisions the AI made that the human should validate
- Ask specific questions: "Does this error handling match your expectations?"

## Handling Disagreements

If human disagrees with AI feedback:
1. Listen to their reasoning
2. If they're right → acknowledge and move on
3. If it's genuinely a bug → explain with a concrete example/scenario
4. If it's a style thing → drop it immediately

If AI disagrees with human's review of AI code:
1. Explain the reasoning behind the implementation
2. If human still wants it changed → change it. It's their codebase
