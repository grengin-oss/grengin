# Grengin App - Development Instructions

## Project Context

This is a client-side Svelte 5 application using Vite + TypeScript. All package management uses **pnpm** exclusively.

## Hard Rules

### Package Management
- **Always use pnpm** for all package operations
- Never use npm, yarn, or bun
- If external documentation uses other package managers, translate commands to pnpm equivalents

### Development Server
- **Never run or suggest running the dev server**
- Do not execute `pnpm dev`, `pnpm preview`, `vite`, or any server/preview commands
- Assume the developer runs the application manually in their own terminal
- You may check, lint, type-check, build, or test via pnpm commands

### Allowed Operations
- `pnpm install` - Install dependencies
- `pnpm build` - Build the project
- `pnpm test` - Run tests
- `pnpm lint` - Lint the codebase
- `pnpm type-check` or `pnpm check` - Type checking

---

## Svelte 5 Best Practices

This project uses **Svelte 5** (not Svelte 4). Version 5 has an overhauled syntax and reactivity system.

### Reactivity (Runes)
**Do:**
- Use `$state` for reactive state
- Use `$derived` for pure derivations
- Use `$effect` for side-effects (runs after DOM updates, not during SSR)

**Don't:**
- Rely on implicit top-level `let` reactivity
- Use `$:` statements (deprecated)
```svelte
<!-- ✅ Correct (Svelte 5) -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log(`Count is now ${count}`);
  });
</script>

<!-- ❌ Avoid (Svelte 4 style) -->
<script lang="ts">
  let count = 0;
  $: doubled = count * 2;
  $: console.log(`Count is now ${count}`);
</script>
```

### Props
**Do:**
- Declare props via `$props()` with destructuring, renaming, defaults, and rest

**Don't:**
- Use `export let`, `$$props`, or `$$restProps`
```svelte
<!-- ✅ Correct -->
<script lang="ts">
  let { class: klass = '', id, ...rest } = $props();
</script>

<!-- ❌ Avoid -->
<script lang="ts">
  export let class = '';
  export let id;
</script>
```

### DOM Events
**Do:**
- Use property handlers: `onclick`, `oninput`, etc.
- Use `onclickcapture={...}` for capture phase
- Place local handlers **after** spreads to avoid being overwritten

**Don't:**
- Use `on:click` syntax
- Use modifiers like `|once`, `|preventDefault` (implement in handler instead)
- Duplicate event attributes on one element
```svelte
<!-- ✅ Correct -->
<button onclick={() => console.log('clicked')}>Click</button>
<input oninput={(e) => handleInput(e.target.value)} />

<!-- ❌ Avoid -->
<button on:click={() => console.log('clicked')}>Click</button>
<button on:click|preventDefault={handleClick}>Click</button>
```

### Component Communication
**Do:**
- Accept **callback props** instead of dispatching custom events

**Don't:**
- Use `createEventDispatcher` (deprecated in Svelte 5)
```svelte
<!-- ✅ Correct -->
<script lang="ts">
  let { save }: { save?: (x: T) => void } = $props();

  function handleSave() {
    save?.(data);
  }
</script>

<!-- ❌ Avoid -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleSave() {
    dispatch('save', data);
  }
</script>
```

### Event Bubbling/Forwarding
**Do:**
- Accept the corresponding prop and pass it through
- Use `$props()` spread for bulk forwarding

**Don't:**
- Use `<button on:click>` forwarding syntax
```svelte
<!-- ✅ Correct -->
<script lang="ts">
  let { onclick, ...rest } = $props();
</script>
<button {onclick} {...rest}>Click</button>

<!-- ❌ Avoid -->
<button on:click {...$$restProps}>Click</button>
```

### Composition (Snippets, Not Slots)
**Do:**
- Use **snippets** and `{@render ...}`
- Accept default content via `children` prop

**Don't:**
- Use `<slot>` or named slots (deprecated in Svelte 5)
```svelte
<!-- ✅ Correct -->
<script lang="ts">
  let { children } = $props();
</script>
<div class="wrapper">
  {@render children?.()}
</div>

<!-- ❌ Avoid -->
<div class="wrapper">
  <slot />
</div>
```

---

## UI Design Guidelines - Liquid Glass

This project implements Apple's **Liquid Glass** design language. Glass effects are **reserved for the navigation layer only** — content uses solid surfaces to maximize clarity, performance, and accessibility.

### Layering Hierarchy
```
Layer 1 (Background):   Base background (dark or light)
Layer 2 (Navigation):   GLASS — Header, Footer, Dropdowns (blur + translucent)
Layer 3 (Buttons):      GLASS — Interactive CTAs that float above content
Layer 4 (Content):      SOLID — Sections, Cards (no blur, opaque backgrounds)
Layer 5 (Labels):       PLAIN — Badges, Tags (no glass treatment)
```

### CSS Classes by Layer

#### Navigation Layer (Glass)

| Element   | Class                 | Effect                      |
|-----------|-----------------------|-----------------------------|
| Header    | `nav-glass`           | 24px blur, translucent gradient |
| Footer    | `footer-glass`        | 24px blur, top border       |
| Dropdowns | `nav-dropdown-glass`  | 20px blur, elevated shadow  |

#### Button Layer (Glass)

| Button    | Class        | Usage              |
|-----------|--------------|--------------------|
| Primary   | `btn-accent` | Main CTAs          |
| Secondary | `btn-glass`  | Alternative actions|

#### Content Layer (Solid — No Blur)

| Element            | Class                      | Description                     |
|--------------------|----------------------------|---------------------------------|
| Elevated sections  | `surface-elevated`         | Prominent content blocks        |
| Cards              | `surface-card`             | Static content cards            |
| Interactive cards  | `surface-card-interactive` | Hoverable cards with lift effect|
| Subtle containers  | `surface-subtle`           | Low-emphasis backgrounds        |
| Icon containers    | `surface-accent`           | Accent-colored icon boxes       |

#### Label Layer (Plain — No Glass)

| Element       | Class         | Description              |
|---------------|---------------|--------------------------|
| Accent labels | `label-accent`| Highlighted badges       |
| Stat labels   | `label-stat`  | Statistical indicators   |

### Corner Shapes (Squircles)

Use continuous corner radius for softer, organic shapes:

| Element       | Class         | Radius |
|---------------|---------------|--------|
| Large panels  | `rounded-2xl` | 16px   |
| Cards         | `rounded-xl`  | 12px   |
| Buttons       | `rounded-md` to `rounded-lg` | 6–8px |
| Pills/tags    | `rounded-md`  | 6px    |

### CSS Variables

All design tokens are defined in `src/styles/global.css`:

- `--surface-*` — Solid backgrounds, borders, shadows for content
- `--glass-*` — Translucent backgrounds and blur for navigation
- `--color-accent-*` — Brand colors for buttons and highlights

Both light (`:root`) and dark (`.dark`) themes are defined there.

### When to Use Glass

✅ **DO use glass for:**
- Header navigation (`nav-glass`)
- Footer (`footer-glass`)
- Dropdown menus (`nav-dropdown-glass`)
- Buttons and CTAs (`btn-accent`, `btn-glass`)
- Modal overlays

❌ **DON'T use glass for:**
- Content sections (use `surface-*`)
- Cards (use `surface-card`)
- Labels/badges (use `label-*`)
- Static containers

### Creating New Components

**For content components:**
1. Use `surface-*` classes (never `glass-*`)
2. No `backdrop-filter` or blur effects
3. Use solid shadows for depth

**For navigation components:**
1. Use `nav-glass`, `footer-glass`, or `nav-dropdown-glass`
2. Include `backdrop-filter: blur()`
3. Use glass shadows and borders

### Performance Notes

The strict hierarchy improves performance:
- Glass only on navigation (always visible) and buttons
- No stacking blur effects in content
- Solid content is lightweight on mobile
- Consistent text contrast on solid backgrounds

---

## Code Style Requirements

### CSS
- **No inline styles** — always use CSS classes and variables
- Use design token variables from `src/styles/global.css`
- Always include accessibility media queries:
  - `@media (prefers-contrast: high)}` — Stronger shadows, reduced transparency
  - `@media (prefers-reduced-motion: reduce)` — Static properties, no animations
  - `@media (prefers-reduced-transparency: reduce)` — Fallback to solid surfaces
- Test responsive breakpoints at 768px and 480px
- Mobile: Reduce blur intensity, increase contrast for touch targets

### TypeScript
- Maintain type safety throughout
- Use proper TypeScript interfaces and types
- Leverage Svelte 5's type inference with `$props()`

---

## Summary Checklist

When working on this project:

- [ ] Use pnpm for all package operations
- [ ] Never run dev server or suggest doing so
- [ ] Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- [ ] Use `$props()` for component props
- [ ] Use property handlers (`onclick`) not `on:click`
- [ ] Use callback props not `createEventDispatcher`
- [ ] Use snippets and `{@render}` not `<slot>`
- [ ] Apply glass classes (`nav-glass`, `btn-glass`) only to navigation/buttons
- [ ] Use `surface-*` classes for content (no blur)
- [ ] Use `label-*` classes for badges/tags (plain, no glass)
- [ ] Reference `src/styles/global.css` for design tokens
- [ ] No inline styles — use CSS classes and variables
- [ ] Support accessibility preferences via media queries
- [ ] Maintain WCAG 2.1 AA contrast ratios (4.5:1 for normal text)