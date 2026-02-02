# Task Classification Heuristics

## Principles

Assignment isn't just about fun vs boring. Consider:
1. **Understanding** — Will the human learn something important about the codebase by doing this?
2. **Quality** — Does this task benefit from human judgment and domain knowledge?
3. **Enjoyment** — Is this the kind of code that feels rewarding to write?
4. **Efficiency** — Would AI be significantly faster with no quality loss?

A task goes to the human when 2+ of the first three are true. It goes to AI when #4 is true and #1-3 are weak.

## Default Assignment Rules

### 🧑 Human (understanding + quality + enjoyment)
- Core business logic and algorithms
- Architecture and design pattern decisions
- Complex state management
- Security-sensitive code (auth flows, crypto, permissions)
- Performance-critical hot paths
- Data model design
- API contract design
- Complex conditional logic / edge case handling
- Integration points between systems (human needs to understand how things connect)
- Code that will be debugged later (if you wrote it, you can debug it)

### 🤖 AI (efficiency, low learning value)
- Type/struct/interface definitions from an agreed design
- Test scaffolding and standard test cases
- Config files, environment variables, wiring
- Database migrations from an agreed schema
- Route registration, handler glue code
- Mock implementations for tests
- Documentation and comment updates
- Import organization, formatting
- Dependency updates (go.mod, package.json)
- CI/CD config changes
- Copy-paste adaptations ("same as X but for Y")
- Boilerplate that follows an established project pattern

### Context-dependent (ask the human)
- CSS/styling — some love it, some hate it
- Test writing — some find it satisfying
- Database queries — simple = AI, complex = depends
- Error handling patterns — first implementation = human, repeated = AI
- Refactoring — fun refactor = human, mechanical rename = AI

## Strategic Assignment

### For codebase understanding:
When the human is newer to a codebase, bias toward giving them tasks that touch core systems even if AI would be faster. Understanding > speed for these.

### For code quality:
Tasks involving business rules, domain logic, or user-facing behavior should lean human. These are where "correct" depends on context an AI might not fully grasp.

### For enjoyment:
If in doubt, ask: "Would you enjoy writing this?" A motivated engineer writes better code.

## Override Mechanism

If the human expresses preferences, respect them for the session:
- "I like writing tests" → assign tests to human
- "I hate config" → always assign config to AI
- "Give me the hard stuff" → maximize interesting tasks for human
- "I want to understand the auth system" → assign auth tasks to human even if tedious

## Splitting Large Tasks

When a single task is too big, split at the interesting/tedious boundary:

**Example: "Implement Apple OAuth service"**
- 🧑 Human: JWT verification logic, JWKS key matching, claims extraction
- 🤖 AI: Struct definitions, interface boilerplate, error wrapping, cache scaffolding

**Example: "Add user profile page"**
- 🧑 Human: State management, API integration logic, form validation
- 🤖 AI: Component boilerplate, TypeScript types, CSS/layout, test stubs

The human gets the part that requires *thinking*. The AI gets the part that requires *typing*.
