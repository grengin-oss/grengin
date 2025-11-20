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

### Core Principles
Our UI follows Apple's **Liquid Glass** design language: translucent, refractive surfaces that adapt to context while preserving content focus.

**Key concepts:**
- Dynamic material that reflects/refracts underlying content in real-time
- Adaptive behavior responding to background (light/dark, busy/simple)
- Contextual transformation to enhance focus, not distract
- Optical separation through lensing, shadows, selective tinting (not hard borders)

### Material Philosophy
- **Material, not decoration**: Use glass for chrome (toolbars, panels, menus), not primary content
- **Clarity first**: Maintain strong contrast; adjust translucency based on background complexity
- **Dynamic adaptation**: Elements flip between light/dark based on what's behind them
- **Platform coherence**: Rounded rectangles, soft separators, layered depth

### Visual Separation (Instead of Borders)
**Use:**
- Lensing effects (light bending around edges)
- Dynamic shadows (more prominent when background reduces glass distinguishability)
- Selective tinting (sparingly)
- Contrast adaptation (content inside glass adapts for legibility)

**Avoid:**
- Hard border strokes (glass provides boundaries via refracted light and shadow)

### Glass Variants

**Regular Variant (Recommended Default):**
- More adaptive and robust across varying backgrounds
- Auto-adjusts to light/dark content dynamically
- Use for navigation, controls, toolbars where background varies

**Clear Variant (Conditional):**
- More transparent, less material presence
- Requires background dimming for legibility
- Use for media-rich overlays with bold, high-contrast content
- Avoid in low-contrast or mismatched light/dark contexts

### Best Practices

**✅ Do:**
- Use Liquid Glass in navigation/control layers that float above content
- Use Regular variant for most cases
- Ensure text and icons adapt (light/dark) based on background
- Use proper shadows and highlights to communicate edges
- Support accessibility settings (Increased Contrast, Reduced Transparency)
- Apply to chrome elements: toolbars, panels, menus, tab bars, controls

**❌ Avoid:**
- Putting Liquid Glass behind content that needs to be read
- Glass on glass stacking
- Mixing Regular and Clear variants in same UI context
- Using Clear variant without proper dimming/contrast
- Text over transparent glass without contrast adaptation
- Inline styles (use CSS classes and variables)
- Creating arbitrary colors (use design token variables)
- Skipping accessibility considerations
- Hardcoding values (use CSS variables)

### Implementation

**Layering Hierarchy:**
1. Content layer (opaque, high contrast)
2. Glass chrome layer (navigation, controls)
3. Interaction layer (hover states, focus indicators)

**Adaptive Behavior:**
- Background detection: analyze underlying content complexity
- Contrast adjustment: automatically flip light/dark variants
- Shadow intensity: increase depth when separation needed
- Accessibility respect: honor user preferences

**Responsive Adaptation:**
- Mobile: Reduce blur, increase contrast for touch targets
- Desktop: Full lensing effects, subtle hover states
- High contrast mode: Stronger shadows, reduced transparency
- Reduced motion: Static glass properties, no dynamic adaptation

---

## Code Style Requirements

### CSS
- **No inline styles** - always use CSS classes and variables
- Use CSS design token variables for colors and values
- Always include accessibility media queries:
  - `@media (prefers-contrast: high)`
  - `@media (prefers-reduced-motion: reduce)`
  - `@media (prefers-reduced-transparency: reduce)`
- Test responsive breakpoints at 768px and 480px
- Use CSS variables for consistency

### TypeScript
- Maintain type safety throughout
- Use proper TypeScript interfaces and types
- Leverage Svelte 5's type inference with `$props()`

---

## Summary Checklist

When working on this project, remember:
- [ ] Use pnpm for all package operations
- [ ] Never run dev server or suggest doing so
- [ ] Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- [ ] Use `$props()` for component props
- [ ] Use property handlers (`onclick`) not `on:click`
- [ ] Use callback props not `createEventDispatcher`
- [ ] Use snippets and `{@render}` not `<slot>`
- [ ] Apply Liquid Glass principles to UI chrome (not content)
- [ ] Use CSS classes/variables, never inline styles
- [ ] Support accessibility preferences
- [ ] Maintain clear visual hierarchy (avoid glass on glass)
