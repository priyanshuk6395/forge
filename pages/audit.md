# Audit (React + TypeScript)

## Purpose (Updated)

The Audit page displays a log of all infrastructure-changing operations that have occurred within the Forge instance. It serves as the primary accountability and troubleshooting tool, showing who did what, when, and with what result. This page is essential for compliance, debugging unexpected behavior, and understanding the history of the Forge instance. Per the PRG §9.25, every infrastructure-changing operation must be recorded.

Built with **React + TypeScript + React Query**, replacing the vanilla JS `app.js` `loadAudit()` function.

## User Goal

- Browse the audit log of all operations
- Understand when events occurred (time ago)
- Identify who performed each action (actor)
- See what action was taken (action description)
- Understand the result of each operation (success/failure pill)
- Search/filter for specific events (enhanced from original)
- Determine if any actions require follow-up
- Navigate back to the main interface

## Layout (React Components)

### Header Section

- **Component**: `<Panel><h2>Audit log</h2></Panel>`
- **Purpose**: Section title
- **Content**: `<h2>Audit log</h2>` - section title (18px, font-weight 600)

### Audit List Area

- **Component**: `<AuditTable events={events} />`
- **Content**: HTML table with columns per event:
  - **When** (time ago, e.g., "2h ago", "3d ago")
  - **Actor** (who performed the action)
  - **Action** (what was done, in monospaced code font for readability)
  - **Result** (success/failure pill: green/success or red/danger)
- **Table styling**:
  - Hover: background var(--surface-raised) on rows
  - No alternating striping needed (each row has result pill)
  - Result pill has color coding: success → green, failure → red

### Empty State

- **When no events exist**:
  - `<p>No activity recorded yet.</p>` or enhanced version
  - Could show subtle guidance: "Operations are recorded as you deploy, connect servers, change settings, etc."
- **Visual**: Centered text, uses existing `.empty-state` styles or custom panel text

## Data Fetching (React Query)

```typescript
function useAudit() {
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const res = await fetch('/api/audit', {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to fetch audit log');
      return res.json(); // array of event objects
    },
    staleTime: 120000, // 2 minutes - audit events change less frequently
  });

  return { events, isLoading, refetch };
}
```

### Type Definitions

```typescript
interface AuditEvent {
  ts: string; // ISO timestamp
  actor: string; // username who performed the action
  action: string; // description of what was done
  result: 'success' | 'danger'; // outcome of the operation
}
```

## Components

### AuditTable

```typescript
interface AuditEventRowProps {
  event: AuditEvent;
}

function AuditEventRow({ event }: AuditEventRowProps) => {
  const timeAgo = formatTimeAgo(event.ts); // use date-fns or similar
  const resultClass = `pill pill-${event.result}`; // pill-success / pill-danger
  
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-raised cursor-pointer">
      <td className="text-text-muted text-sm">{{ timeAgo }}</td>
      <td className="font-medium">{{ event.actor }}</td>
      <td>
        <code className="text-text mono text-sm">{{ event.action }}</code>
      </td>
      <td><span className={resultClass} /></td>
    </tr>
  );
};
```

### EmptyState (Audit-specific)

```typescript
function AuditEmptyState() {
  return (
    <div className="text-center py-12 text-text-secondary">
      <p>No activity recorded yet.</p>
      <p className="text-text-muted text-sm mt-2">
        Operations are recorded as you deploy, connect servers, change settings, etc.
      </p>
    </div>
  );
};
```

## Interactions

### Row Hover

- **`tr:hover`**: background var(--surface-raised)
- **Cursor**: pointer on row elements
- **Visual feedback**: Hover affordance

### Sorting / Filtering (Enhancement)

- **Current implementation**: No sorting or filtering (events shown in received order)
- **Enhancement opportunity**: Could add column headers that sort ascending/descending, or a search input to filter by actor/action
- **Not critical** for MVP; the page shows recent activity clearly without sorting

### Row Click

- **No row navigation** currently; actions are informational only
- **Click** could potentially expand row or navigate to details, but not implemented
- **Focus**: Keyboard users can tab through rows

### Empty State

- When no audit events exist:
  - Display: `<p>No activity recorded yet.</p>` within the audit area
  - Or: custom panel with message
  - CTA: None particularly; this is informational page
  - Visual: Consistent with other empty states in the app

## Motion

### Table Row Hover

- `tr:hover` background: var(--surface-raised)
- Transition: 120ms ease (inherited from general transition speeds)
- No abrupt color changes

### Empty State Appearance

- Instant appearance when no data received
- No animation needed

### Reduced Motion

- Table row hover effect respects reduced media query
- No essential animation on this page
- Skeleton animation respects reduced motion (0.001ms duration if skeletons were used)

## Responsive Behavior

### Desktop (1440px+, 1280px+)

- Full audit table with all 4 columns (When, Actor, Action, Result) visible
- Horizontal scroll not needed (4 columns fits well on desktop)
- Result pills clearly visible
- No wrapping needed

### Laptop (1024px+)

- Table columns visible
- May be somewhat cramped but functional
- Result pills remain readable

### Tablet (768px+)

- Table may feel cramped with 4 columns
- Consider: horizontal scroll via `.table-wrap` or stack layout
- Current implementation: horizontal scroll available via `overflow-x: auto` on `.table-wrap`
- All columns still accessible via scroll

### Mobile Small (430px+)

- Table: horizontal scroll essential; 4 columns becomes difficult to read
- Consider: should we show only key columns (When + Result) on mobile?
- Or: prioritize columns and hide less critical (Actor or Action may be truncated)
- Result pills: still visible and important
- Horizontal scroll: user swipes/scrolls left to see all columns

### Mobile Smallest (375px-, 390px-)

- Horizontal scroll possible but awkward for extended use
- Consider: on narrowest mobile, show simplified view (maybe just "When" and "Result" columns)
- Or: emphasize that this is a rarely-viewed page on mobile
- Result pills: still tap-target accessible

### Empty State Responsiveness

- `.empty-state` or message centers well on mobile
- Padding adjusts, text remains readable
- No CTAs needed

## Loading State

### Initial Data Load

- **Audit list area**: Shows skeleton loader
  - React Query default `isLoading` state
  - Could be enhanced with table row-shaped skeletons
- **Empty state**: Not shown until data confirms no events exist
- **Breadcrumb**: "Audit" shown in topbar

### API Data Fetch (`/audit`)

- **GET /audit** - Returns list of audit events
- **Response**: Array of event objects with `ts`, `actor`, `action`, `result` fields
- **Response time**: Should be fast (< 300ms) - reads from JSON file store
- **No pagination**: Returns all events at once (acceptable for typical event counts: 10-100 typical)

### Error State

- **API failure** (`/audit`):
  - Show error message where table would be
  - Current code: if error, `root.innerHTML = '<p>No activity recorded yet.</p>';` (misleading - should show error)
  - Could enhance: show "Could not load audit log: {err.message}"
- **Current pattern**: `catch (err) { root.innerHTML = '<p>No activity recorded yet.</p>'; }` - should be improved

## Empty State

### When No Audit Events Exist

- **Message**: "No activity recorded yet."
- **Visual**: Centered text, could use `.empty-state` styles or custom panel
- **Context**: Indicates the Forge instance is new or no operations have been logged yet
- **Tone**: Informative, not discouraging

### Recommended Enhancement

Consider showing subtle guidance: "Operations are recorded as you deploy, connect servers, change settings, etc." This sets expectation and encourages users to interact with other Forge features.

### Distinction from Other Empty States

Similar to other pages, this should distinguish from "no projects" and "no servers" empty states:
- "No projects yet" → "Connect a GitHub repo and a server to deploy your first app."
- "No servers yet" → "Connect any Linux box over SSH, or have Forge provision one on AWS."
- "No activity recorded yet" → This is expected for new instances; will populate as you use Forge

## Accessibility (React + ARIA)

### Keyboard Navigation

- Tab reaches table rows (`<tr>` elements)
- Arrow keys: within table, move focus row by row (if implemented) or tab through
- Enter on row: no navigation (informational page)
- Focus order: follows DOM order within table

### Focus States

- `*:focus-visible` (2px solid var(--accent-strong), outline-offset 2px) on focusable elements
- Table row focus: could add `tabindex="0"` to `<tr>` if focusable, or rely on child elements
- Hover + focus distinction: `:hover` is mouse-only, `:focus-visible` is keyboard

### Semantic HTML

- `<table>` element for tabular data (When, Actor, Action, Result)
- `<thead>` with `<th>` for column headers: When, Actor, Action, Result
- `<tbody>` with `<tr>` for audit event rows
- `<td>` for data cells
- `<span class="hint">` for time ago formatting
- `<code>` for action description (monospaced)
- `<p>` for empty state message
- `.pill` for result color coding
- Empty state `<h3>` and `<p>` if used

### Contrast

- Table text (var --text #e8e6e1) against table backgrounds
- Time ago hint text (var --text-muted #9ca1a8) against var(--surface-raised) - acceptable for secondary text
- Action description text: should have sufficient contrast (monospaced, but still text)
- Result pill colors: success green (#7cae8a) and danger red (#d5715a) against var(--surface-raised) - should meet contrast
- Hover background var(--surface-raised) against var(--text) - should be sufficient

### Screen-Reader Structure

- Table headers announced (`<th>` elements provide column context: When, Actor, Action, Result)
- Row data announced in sequence per screen reader
- Time ago: announced as supplementary info (e.g., "two hours ago")
- Action description: announced as code/monospaced text
- Result pill: announced with color name (e.g., "success", "danger") or just the text content
- Empty state: "No activity recorded yet." announced as paragraph
- No interactive elements beyond informational display

### Accessible Forms

- Not applicable - this is a read-only display page
- No forms, inputs, or buttons that require accessibility treatment (beyond the table structure itself)

### Reduced Motion

- Table row hover effect respects reduced media query
- No essential animation on this page
- Skeleton animation respects reduced motion (0.001ms duration)

### Live Region (Enhancement)

- Not critical for this read-only page
- Could add `aria-live="polite"` to table if dynamic updates were added later
- Not currently needed

## Performance (React + React Query)

### API Endpoint

- **GET /audit** - Returns list of audit events
- **Response**: Array of event objects with `ts` (timestamp), `actor`, `action`, `result` fields
- **Response time**: Should be fast (< 300ms) - reads from JSON file store
- **No pagination**: Returns all events at once (acceptable for typical event counts: 10-100 typical)

### Table Rendering

- One `<tr>` per audit event, 4 `<td>` per row
- Typical event count: 10-50 events for a moderately used instance
- Performance is fine for typical ranges
- Direct DOM manipulation, no virtual DOM

### Memory

- Audit events stored transiently (display only, not retained in state like projects/servers)
- No per-event event listeners
- No timers or polling needed for audit page

### Bundle Impact

- React 18 + React DOM: ~100KB gzipped
- @tanstack/react-query: ~5KB gzipped
- Custom components: minimal
- CSS in existing `styles.css` - table styles, empty state, pills already defined
- No additional HTTP requests beyond the API call

## Implementation Notes

### Existing Code Port

The audit page is ported from `app.js` `loadAudit()` function (lines 1031-1055). Key mappings:

**Already mapped:**
- API call to `/audit` ✅
- Rendering table with When, Actor, Action, Result columns ✅
- Empty state when no events exist ✅
- Result pill coloring (success=green, failure=red) ✅
- Time ago formatting via `timeAgo()` ✅
- Skeleton loading states ✅

**New (React + TS + React Query):**
- `useQuery` hook for data fetching
- TypeScript types for all data shapes
- React component structure (JSX vs innerHTML)
- Component-based architecture (AuditTable component vs one big function)
- React Query for caching and stale-while-revalidate

**Enhancements from React version:**
- React Query handles data caching and refetching (staleTime: 2min vs no caching before)
- Type safety across the component
- Better error handling and retry logic
- Easy cache invalidation and refetching
- Improved testability with @testing-library/react
- Enhanced error display (original showed misleading "No activity recorded yet." on error)

**Improvements:**
- Error handling: Improved from original "show misleading 'No activity recorded yet.'" to proper error message display
- Table striping: Can easily add `tr:nth-child(even)` for improved readability
- Action monospaced: `<code>` element with consistent monospaced styling
- Time ago: Consistent `formatTimeAgo` function using date-fns or similar

### API Contract

The `/audit` API endpoint should return JSON with this shape:

```json
[
  {
    "ts": "2026-09-20T14:30:00Z",
    "actor": "username",
    "action": "production deployment",
    "result": "success" | "danger"
  }
]
```

Or the format that the existing code expects. Key fields: `ts`, `actor`, `action`, `result`.

### Component Integration

- **Audit table**: Should use the established `.table` / `.table-wrap` pattern
- **Result pills**: Should reference CSS variables var(--success)/var(--danger) consistently
- **Time ago**: Should use `formatTimeAgo()` helper and `.hint` class consistently
- **Table headers**: Should have consistent styling from design system (font-size: 11.5px, color var(--text-muted), padding 8px 10px, border-bottom 1px var(--border))
- **Skeletons**: Could be enhanced with table-row-shaped skeletons for better preview

### Visual Refinements to Apply

1. **Table striping**: Add `tr:nth-child(even) { background: var(--surface-raised); }` for improved readability
2. **Result pill consistency**: Ensure pills use same `.pill` component as other pages (12px, border-radius 999px, etc.)
3. **Time ago formatting**: Ensure `.hint` class (12px, color var(--text-muted)) is used consistently
4. **Action monospaced**: Ensure `<code>` has consistent monospaced font-size (11-12px) and color
5. **Table headers**: Should have consistent font-size (11.5px), color (var(--text-muted)), padding (8px 10px), border-bottom (1px var(--border))
6. **Error handling**: Improve error message display when API fails (don't show misleading "No activity recorded yet.")
7. **Header typography**: `<h2>Audit log</h2>` should have consistent size with other page headers (18px, font-weight 600)

### Testing Checklist (React + TS + React Query)

- [ ] Audit page loads with audit data
- [ ] Empty state shown when no events exist
- [ ] Result pills color-code correctly (success=green, failure=red)
- [ ] Time ago formatting is correct (e.g., "2h ago", "3d ago")
- [ ] Table hover background changes
- [ ] Horizontal scroll available on `.table-wrap` if needed at narrow widths
- [ ] Skeleton loading shown before API resolves
- [ ] Error message shown when API fails (currently shows misleading "No activity recorded yet.")
- [ ] Focus-visible outlines on interactive elements
- [ ] Table grid responsive at mobile breakpoints
- [ ] Breadcrumb shows "Audit" when on this page
- [ ] Pills have sufficient contrast
- [ ] Time ago hint text is readable but secondary
- [ ] Action description text is readable (monospaced, proper size)
- [ ] Column headers are clear (When, Actor, Action, Result)
- [ ] Empty state message is clear and informative
- [ ] TypeScript types compile without errors

## Visual References

- Original implementation in `app.js` `loadAudit()` function (lines 1031-1055)
- Design tokens in `public/styles.css` `:root` variables
- IBM Plex Sans / IBM Plex Mono font stack
- Color palette from existing styles.css (dark theme default)
- Audit log patterns from infrastructure platforms (GitHub audit, AWS CloudTrail-inspired)
- Table row hover patterns from admin dashboards
- Result pill patterns from other Forge pages (projects, servers)
- Time ago formatting patterns from throughout the application (dashboard, projects, etc.)
- Table column header styling from existing UI