# Decision: TypeScript Adoption Strategy

**Date:** 2026-09-24
**Status:** Accepted

## Context

The Forge frontend is currently implemented in plain JavaScript (ES5+ features used, but no TypeScript). The migration to React + TypeScript requires a strategy for introducing TypeScript to the codebase without disrupting existing functionality.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Full TypeScript Rewrite** | Rewrite entire codebase to TypeScript simultaneously, replacing `public/app.js` with `.tsx` files | - Clean break<br>- All files typed from the start<br>- No mixed-mode complexity | - Massive initial effort<br>- Risk of introducing bugs in unrelated areas<br>- Long merge conflicts if working in parallel |
| **B: Incremental Adoption (recommended)** | Add TypeScript gradually: start with new files, then port existing one at a time. Use `// @ts-check` for gradual checking | - Lower initial effort<br>- Can run JS and TS side-by-side<br>- Immediate value (typed new features)<br>- Easier to review diffs | - Mixed `.js` and `.tsx` in repo initially<br>- Need `typescript-tsconfig` careful configuration<br>- Some legacy patterns may be harder to type later |
| **C: Type Definition Files Only** | Keep JS files, add `.d.ts` type declaration files for APIs | - Minimal changes<br>- Can type external APIs without changing internals | - Doesn't type internal code<br>- False sense of safety<br>- Still have JS runtime errors |

### Decision

**Option B: Incremental Adoption (recommended)**

**Strategy:**
1. **Phase 1** (Weeks 1-2): Set up TypeScript config alongside existing JS. Add `// @ts-check` comments to existing `app.js` to start catching errors. Create `tsconfig.json` with `checkJS: true`.
2. **Phase 2** (Weeks 3-4): Port the first component to `.tsx` - likely the simplest component (e.g., `Button.tsx` or `MetricTile.tsx`). Verify the build works.
3. **Phase 3** (Weeks 5-6): Port page specifications one at a time: `dashboard.md` → `projects.md` → `project-detail.md`, etc. Each port adds type definitions for the API responses.
4. **Phase 4** (Weeks 7-8): Once all pages are ported, replace `public/app.js` with the React + TS implementation. Remove `// @ts-check` from original files or keep for transitional period.
5. **Phase 5** (Ongoing): All new code written in TypeScript. Gradual cleanup of type annotations.

**Why this approach:**
- **Risk mitigation**: Can revert individual ported files if issues arise
- **Incremental value**: Each page ported immediately provides type safety for that page's API interactions
- **Team familiarity**: Developers can learn TypeScript incrementally rather than all at once
- **Build continuity**: Existing `npm start` / `npm run build` continues working throughout
- **Test isolation**: Can write tests for ported pages without testing the entire app at once

**TypeScript Config Key Settings:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true, // until ready to compile
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true, // recommended for TSX
    "noFallthroughCaseInSwitch": true
  },
  "include": ["src", "declarations", "*.test.*"],
  "exclude": ["node_modules", "dist"]
}
```

### Consequences

**Positive:**
- Zero-risk introduction - can take 8 weeks without breaking existing functionality
- Immediate type safety for new features as they're added
- Existing `app.js` continues working throughout the migration
- Team can learn at their own pace
- No pressure to complete full rewrite in single sprint

**Negative:**
- Mixed `.js` and `.tsx` in repo for ~8 weeks
- Need to maintain both `tsconfig.json` and existing build config temporarily
- Some JSDoc patterns may need updating to TS annotations
- Slight overhead of maintaining type annotations as code evolves

### Related Decisions

- **Decision 001**: UI Library Selection (Radix UI + RHF + Zod) - see `001-ui-library.md`
- **Decision 003**: Data Fetching Strategy - React Query vs manual fetch (see `003-data-fetching.md`)
- **Decision 004**: State Management Approach (see `004-state-management.md`)

### References

- TypeScript Handbook: https://www.typescript-handbook.com/
- React TypeScript Cheatsheet: https://react-typescript-cheatsheet.github.io/
- Existing `public/app.js` structure and patterns
- PRD §14 Data Model - defines the JSON shapes types will need to cover

**Status:** Accepted — Incremental adoption strategy over ~8-week period. No disruption to existing functionality.