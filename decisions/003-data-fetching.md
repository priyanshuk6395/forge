# Decision: Data Fetching Strategy

**Date:** 2026-09-24
**Status:** Accepted

## Context

The Forge frontend currently uses a custom `api()` helper function in `public/app.js` for all data fetching, with manual polling for deployment status. The React + TypeScript migration requires a decision on the data fetching strategy.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: React Query (TanStack Query)** | Use `@tanstack/react-query` for data fetching, caching, invalidation, and polling | - Built-in caching, stale-while-revalidate<br>- Automatic refetch on window focus<br>- Built-in pagination support<br>- DevTools for inspecting queries<br>- Handles loading/error states<br>- Simplifies polling patterns (deployment status) | - ~5KB gzipped additional bundle<br>- New dependency pattern (vs current zero-deps approach)<br>- Need to learn query keys, refetch strategies |
| **B: SWR (stale-while-revalidate)** | Use `swr` hook for data fetching | - Similar features to React Query<br>- Smaller ecosystem<br>- Good for simple use cases | - Less actively maintained than React Query<br>- Fewer features (no built-in pagination helper)<br>- Community shifting toward React Query |
| **C: Manual fetch with useEffect** | Keep current pattern: `useEffect` + `fetch` + `setState`, manual polling with `setTimeout` | - Zero additional dependencies<br>- Full control over every aspect<br>- Familiar pattern from current `app.js` | - Manual caching management<br>- Manual loading/error state handling<br>- Manual polling setup/teardown (deployment pollers in `state.pollers`)<br>- Easy to introduce memory leaks (forgotten timers)<br>- Harder to share data between components |
| **D: Relay (GraphQL)** | Use GraphQL with Relay framework | - Strong typing end-to-end<br>- Optimistic updates<br>- Built-in caching | - Overkill for REST JSON API<br>- Significant learning curve<br>- Requires GraphQL server setup<br>- Over-engineering for Forge's needs |

### Decision

**Option A: React Query (@tanstack/react-query)**

**Why:**
1. **Polling made easy**: The deployment polling pattern currently in `app.js` (setTimeout with 1200ms/1800ms intervals, state management in `state.pollers`, cleanup on status change) becomes trivial with React Query's `refetchInterval`. The deployment building status check (`if (dep.status === 'building')`) becomes `refetchInterval: dep.status === 'building' ? 1800 : false`.
2. **Caching**: React Query automatically caches API responses. The dashboard data that doesn't change frequently, the project lists, server lists — all benefit from automatic caching without extra code.
3. **Stale-while-revalidate**: Data shown immediately from cache, then refreshed in background. Great for dashboard metrics that don't need instant updates.
4. **Refetch on window focus**: Users returning to the app after tab/window switch get fresh data automatically.
5. **DevTools**: Browser devtools panel shows all queries, cache status, fetch status. Excellent for debugging.
6. **Query invalidation**: `queryClient.invalidateQueries(['projects'])` replaces the pattern of `setState` after mutations (create project, delete server, etc.). Simple, predictable.
7. **TypeScript support**: First-class TypeScript types for query keys and return values.
8. **Background refetching**: Keeps data fresh even when user is on another tab, then updates when they return.

**Implementation Pattern:**
```typescript
// Instead of:
useEffect(() => {
  const poll = setInterval(() => fetchDep(), 1800);
  return () => clearInterval(poll);
}, []);

// Use React Query:
const { data, isLoading, refetch } = useQuery({
  queryKey: ['deployment', projectId],
  queryFn: fetchDep,
  refetchInterval: depStatus === 'building' ? 1800 : false,
  refetchIntervalInBackground: true,
});
```

**What replaces existing patterns:**
- `state.pollers` object → React Query query cache
- Manual `setTimeout`/`clearInterval` → `refetchInterval`
- `api()` helper + `fetch()` → `useQuery` + `useMutation`
- `toast()` on success/failure → `onSuccess`/`onError` callbacks on mutations
- `queryClient.invalidateQueries()` after mutations → `queryClient.invalidateQueries()` calls

**What's kept the same:**
- `/api/dashboard`, `/api/projects`, `/api/servers`, etc. endpoints
- `credentials: 'same-origin'` header
- `X-Forge-Client: 1` header
- `toast()` success/error messages
- General API shape (just the data fetching mechanism changes)

### Consequences

**Positive:**
- Drastically less boilerplate for data fetching
- Built-in loading, error, and empty states
- Automatic caching reduces API calls (better performance)
- Polling for deployment status becomes 3 lines instead of 15+
- Query DevTools greatly accelerate debugging
- Type-safe query keys and return values
- Easy background refetching
- Standard pattern across all pages (consistency benefit)

**Negative:**
- ~5KB gzipped additional bundle (the one new dependency that adds meaningful value)
- Need to learn React Query patterns (query keys, refetchInterval, invalidation)
- One more dependency in `package.json`
- Existing `api()` helper function becomes unused (can be removed after full migration)
- `state.pollers` management code becomes obsolete

### Related Decisions

- **Decision 001**: UI Library Selection - Radix UI + React Hook Form + Zod (see `001-ui-library.md`)
- **Decision 002**: TypeScript Adoption Strategy (see `002-typescript-strategy.md`)
- **Decision 004**: State Management Approach - how React Query state interacts with React state (see `004-state-management.md`)

### References

- React Query Documentation: https://tanstack.com/query/v4
- React Query Examples: https://tanstack.com/query/v4/examples
- Existing `api()` function in `public/app.js` lines 42-64
- Deployment polling pattern: `app.js` lines 660-691 (pollDeployment function)
- Current `state.pollers` management: `app.js` lines 270-277 (state object)

**Status:** Accepted — React Query will be introduced alongside the React + TypeScript migration. The `api()` helper and manual polling patterns will be gradually replaced. No breaking changes to API endpoints.