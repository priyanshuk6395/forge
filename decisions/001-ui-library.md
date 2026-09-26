# Decision: UI Library Selection

**Date:** 2026-09-24
**Status:** Accepted

## Context

The Forge frontend is currently implemented in vanilla JavaScript with CSS modular styles in `public/styles.css`. The project needs modernization to a React + TypeScript codebase. A decision is needed on whether to introduce a UI component library or maintain custom-built components.

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: No library (custom components)** | Build all components from scratch using CSS variables and vanilla React patterns | - Full control over visual identity<br>- No bundle impact<br>- Consistent with existing design tokens<br>- Maintains the "quiet by default" philosophy | - More initial development effort<br>- Responsibility for accessibility falls on us<br>- No pre-tested primitives |
| **B: Radix UI + React Hook Form + Zod** | Use Radix UI primitives for accessible components, React Hook Form for form state, Zod for schema validation | - Excellent accessibility out of the box<br>- ~15KB Radix + ~7KB RHF + ~3KB Zod = ~25KB total<br>- battle-tested primitives (Dialog, Tabs, Dropdown, Tooltip)<br>- Maintains design system consistency (map to CSS variables)<br>- Good balance of speed and control | - Learning curve for Radix patterns<br>- Still need to build some custom styling<br>- Additional dependencies |
| **C: shadcn/ui (Tailwind-based)** | Use pre-built components from shadcn/ui repository | - Beautiful, polished components immediately<br>- Excellent documentation<br>- Designed for accessibility | - Requires Tailwind CSS adoption<br>- Would need to convert existing CSS variable design to Tailwind config<br>- Heavier bundle impact (~30KB+)<br>- Visual identity may drift from existing Forge brand |
| **D: Mantine** | Full-featured UI kit with many components | - Many components out of the box<br>- Good docs | - Heavy bundle impact (~100KB+)<br>- Opinionated styling hard to customize<br>- Overkill for Forge's needs<br>- Visual style conflicts with existing design |

### Decision

**Option B: Radix UI + React Hook Form + Zod**

**Why:**
1. **Accessibility**: Radix UI primitives (Dialog, Tabs, Dropdown, Tooltip) are built with accessibility best practices - screen reader support, keyboard navigation, focus management. This aligns with Forge's accessibility requirements.
2. **Bundle size**: ~25KB total gzipped is acceptable for the feature set. The existing vanilla JS approach has zero runtime dependencies, but the React + TS migration needs some dependencies anyway (React, React DOM).
3. **Design system consistency**: Radix primitives are unstyled (just have basic DOM structure), so we can map them to our existing CSS variables (`var(--bg)`, `var(--surface)`, etc.) and maintain the exact visual identity established in `styles.css`.
4. **Form handling**: React Hook Form + Zod provides validation that matches the existing ad-hoc patterns but with type safety and better UX.
5. **Future-proof**: These are well-maintained, popular libraries with good TypeScript support.
6. **No visual copying**: We're using the primitives for structure/accessibility, not copying their visual design. The styling will come from our design system.

**What we're NOT using:**
- ❌ shadcn/ui (would force Tailwind adoption and visual style drift)
- ❌ Mantine (too heavy, opinionated styling)
- ❌ No library at all (accessibility risks, duplicated effort on common primitives)

### Consequences

**Positive:**
- Accessible modals, tabs, dropdowns out of the box
- Type-safe form validation
- ~25KB additional bundle (reasonable)
- Consistent visual identity maintained
- Good documentation and community support
- Easy to replace individual primitives later if needs change

**Negative:**
- New dependencies (Radix, RHF, Zod) - but these are well-established
- Slightly larger initial bundle than vanilla JS (but React + TS is being added anyway)
- Need to learn Radix patterns for custom components

### Related Decisions

- **Decision 002**: TypeScript adoption strategy (see `002-typescript-strategy.md`)
- **Decision 003**: Data fetching strategy - React Query vs manual fetch (see `003-data-fetching.md`)
- **Decision 004**: State management approach (see `004-state-management.md`)

### References

- Radix UI Documentation: https://radix-ui.com/docs/primitives/overview
- React Hook Form: https://react-hook-form.com/
- Zod: https://zod.dev/
- Forge Design Tokens: `public/styles.css` `:root` variables
- Accessibility Requirements: PRD §14, §25

**Status:** Accepted — This decision replaces the need to evaluate other UI library options. Custom components will be built on top of Radix UI primitives, mapped to the Forge design system tokens.