# Decision: State Management Approach

**Date:** 2026-09-24
**Status:** Accepted

## Context

The Forge frontend currently uses a global `state` object in `public/app.js` to manage application state (`user`, `projects`, `servers`, `currentProjectId`, `currentTab`, `pollers`). The React + TypeScript migration requires deciding on the state management approach.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: React Query + Local Component State (recommended)** | Use React Query for server state (data from APIs), React `useState`/ `useReducer` for UI local state. Global `state` object largely replaced. | - React Query handles server caching, syncing, fetching<br>- Local state for UI flags, modals, form state<br>- No global mutable object shared across components<br>- Testable component isolation<br>- Matches React patterns | - Need to determine what moves from global state to React Query<br>- Some global reads (e.g., `state.user.username`) need to become `useSelector` or component prop |
| **B: Redux Toolkit** | Introduce Redux Toolkit for global state management | - Single source of truth<br>- DevTools for state inspection<br>- Time-travel debugging<br>- Good for complex app state | - Significant boilerplate even with RTK<br>- Additional ~15KB gzipped dependency<br>- Overkill for Forge's state shape<br>- Learning curve for reducers, actions<br>- Another global mutable store (similar to current `state` object but in Redux store) |
| **C: Keep Global `state` Object** | Simply convert the `state` object to TypeScript types, keep using it across components via context or prop drilling | - Minimal changes to existing code<br>- No new dependencies<br>- Obvious where state lives (one object) | - Loses React Query caching benefits<br>- Manual loading/error state management<br>- Manual polling management (replaces `state.pollers`)<br>- Still a global mutable object (same risks as before)<br>- Doesn't leverage React's state management strengths<br>- State sparses across components, need context or prop drilling anyway |
| **D: Zustand or Jotai** | Lightweight state management libraries | - Less boilerplate than Redux<br>- Good TypeScript support<br>- Smaller than Redux | - Still new dependency (~5KB)<br>- Still another state store pattern<br>- Solves same problems Redux solves, just lighter<br>- Still need to decide what goes in vs out of store |

### Decision

**Option A: React Query + Local Component State (recommended)**

**Strategy:**
1. **Server State → React Query**: All API data (`/dashboard`, `/projects`, `/servers`, `/audit`, `/settings`, `/api/projects/{id}`, etc.) moves to React Query queries/mutations.
   - `state.projects` → `useQuery(['projects'])`
   - `state.servers` → `useQuery(['servers'])`
   - `state.user` → Auth state managed by React Query or component state
   - Deployment polling → `refetchInterval` on deployment query

2. **UI Local State → React `useState`/`useReducer`**: Components manage their own UI state.
   - Open/closed modals → `useState(false)`
   - Form input values → `useState('')` + React Hook Form
   - Current tab (`currentTab`) → `useState('releases')` within `ProjectDetail` component
   - Sidebar open/closed (`mobileNavOpen`) → `useState(false)`
   - Form submission status → `useState('idle')` + `useReducer`

3. **Global State Elimination**: The `state` object in `app.js` is phased out.
   - `state.user` → Auth context or React Query user query
   - `state.projects` → `useQuery(['projects']).data`
   - `state.servers` → `useQuery(['servers']).data`
   - `state.currentProjectId` → `useParams()` or route-based
   - `state.currentTab` → component-local state within `ProjectDetail`
   - `state.pollers` → React Query `refetchInterval` cleanup

4. **TypeScript Types**: Replace `state` object interface with TypeScript interfaces for:
   - React Query query keys
   - Component prop interfaces
   - UseQueryReturnValue types

**Data Flow Patterns:**

**Before (global state):**
```javascript
// In app.js
state.projects = await api('/projects');
 // Later, somewhere else:
$$('.nav-item[data-nav="projects"]').forEach(n => n.classList.toggle('active', n.dataset.nav === 'projects'));
// And:
$$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === 'projects'));
```

**After (React Query + local state):**
```tsx
// In Dashboard component:
const { data: projects, isLoading } = useQuery(['projects'], fetchProjects);
// In JSX:
{isLoading ? <Skeleton /> : <ProjectTable projects={projects} />}
// In ProjectDetail component:
const { data: project } = useQuery(['project', projectId], fetchProject);
// Tab state:
const [currentTab, setCurrentTab] = useState('releases');
// JSX:
<Tabs defaultValue="releases" values={['releases', 'logs', 'secrets', 'settings']} onValueChange={setCurrentTab}>
```

**Component Communication:**
- Parent → Child: Props drilling or React Context if truly global
- Child → Parent: Callback functions or React Query `queryClient.invalidateQueries()`
- Sibling components: React Query cache (shared queries) or React Context

**TypeScript Interfaces Needed:**
```typescript
// Replace: interface State { user: null | User; projects: Project[]; ... }
interface UseProjectsQuery {
  data: Project[] | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface UseProjectQuery {
  data: Project | null;
  isLoading: boolean;
  refetch: () => void;
}
```

### Consequences

**Positive:**
- Leverages React's built-in state management strengths
- React Query handles the hardest problems (caching, polling, refetching, staleness)
- No global mutable state = fewer bugs from unexpected state mutations
- Component isolation = easier testing (mock queries, not global state)
- TypeScript types per query vs. one giant `state` interface
- Gradual migration - can keep `state` object during transition, move pieces one at a time
- No Redux/RTK boilerplate overhead
- Better performance: only components using specific data re-render when that data changes

**Negative:**
- Need to map existing `state.*` properties to either React Query or local state
- `state.pollers` management needs to convert to React Query `refetchInterval`
- `state.user` authentication state needs deliberate placement (Auth context? React Query? Component state?)
- Some state still needs to be shared across components - need to decide between Context vs. props vs. React Query shared queries
- Learning curve for teams unfamiliar with React Query patterns

### Related Decisions

- **Decision 001**: UI Library Selection - Radix UI + React Hook Form + Zod (see `001-ui-library.md`)
- **Decision 002**: TypeScript Adoption Strategy (see `002-typescript-strategy.md`)
- **Decision 003**: Data Fetching Strategy - React Query (see `003-data-fetching.md`)

### References

- React Query vs State Management Guide: https://tanstack.com/query/v4/docs/guides/react-query-and-state
- Existing `state` object in `public/app.js` lines 270-277
- Current usage patterns: `state.user`, `state.projects`, `state.servers`, `state.currentProjectId`, `state.currentTab`, `state.pollers`
- React Context API: https://react.dev/reference/React/createContext

**Status:** Accepted — React Query + local component state strategy. The global `state` object from `app.js` will be gradually replaced over the migration period. No Redux or similar library introduced.