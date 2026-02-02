# Design Phase Patterns

## Opening the Design Discussion

Start with an open question, not a leading one:

**Good:**
- "What's your vision for how this should work?"
- "Do you have an approach in mind, or want me to propose one?"
- "Walk me through how you'd architect this"

**Bad:**
- "Here's how we should do it..." (skips human input)
- "The best practice is..." (imposes solution)

## Challenging Designs

When the human's design has issues, challenge constructively:

1. **Acknowledge what's good first** — "The event-driven approach makes sense here"
2. **Ask about the concern** — "How would this handle 10K concurrent users?"
3. **Offer alternative only if they're stuck** — "One pattern that works here is..."
4. **Accept their decision** — If they have a good reason, don't push

### When to Challenge
- Missing edge cases that will cause bugs
- Scalability issues for the project's actual scale (don't over-engineer)
- Security vulnerabilities
- Significantly simpler alternatives exist

### When NOT to Challenge
- Style preferences (tabs vs spaces energy)
- The human clearly has experience with this pattern
- The difference is marginal
- It would derail the conversation

## Reaching Consensus

Signs you've reached a good design:
- Both parties have raised concerns and they've been addressed
- The approach matches the project's scale (not over/under-engineered)
- Edge cases are identified (even if handling is deferred)
- Clear enough to generate a task breakdown

Summarize before moving on:
```
Design agreed:
- [Approach summary]
- [Key decisions]
- [Deferred items]

Moving to planning phase...
```
