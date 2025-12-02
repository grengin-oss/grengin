## Design System: Apple Liquid Glass Theme

The website implements Apple's **Liquid Glass** design language, inspired by iOS/macOS translucent UI. This creates a premium, modern aesthetic with depth and sophistication.

### Core Principle: Strict Layering Hierarchy

Following Apple's Liquid Glass guidelines, **glass effects are reserved for the navigation layer only**. Content uses solid surfaces to create maximum visual clarity and hierarchy.

```
Layer 1 (Background):   Base background (dark or light)
Layer 2 (Navigation):   GLASS - Header, Footer, Dropdowns (blur + translucent)
Layer 3 (Buttons):      GLASS - Interactive CTAs that float above content
Layer 4 (Content):      SOLID - Sections, Cards (no blur, opaque backgrounds)
Layer 5 (Labels):       PLAIN - Badges, Tags (no glass treatment)
```

This hierarchy ensures the navigation layer clearly "floats" above content, while content remains readable and performant.

### Layer Treatments

#### Navigation Layer (Glass)

The header, footer, and dropdowns use glass effects to appear floating above the page:

| Element | Class | Effect |
|---------|-------|--------|
| Header | `nav-glass` | 24px blur, translucent gradient |
| Footer | `footer-glass` | 24px blur, top border |
| Dropdowns | `nav-dropdown-glass` | 20px blur, elevated shadow |

#### Button Layer (Glass)

Buttons retain glass effects as interactive elements that "pop" from the content:

| Button | Class | Usage |
|--------|-------|-------|
| Primary | `btn-accent` | Main CTAs |
| Secondary | `btn-glass` | Alternative actions |

#### Content Layer (Solid)

Content sections and cards use **solid surfaces** with no blur:

| Element | Class | Description |
|---------|-------|-------------|
| Elevated sections | `surface-elevated` | Prominent content blocks |
| Cards | `surface-card` | Static content cards |
| Interactive cards | `surface-card-interactive` | Hoverable cards with lift effect |
| Subtle containers | `surface-subtle` | Low-emphasis backgrounds |
| Icon containers | `surface-accent` | Accent-colored icon boxes |

#### Label Layer (Plain)

Labels and badges have no glass treatment - just solid backgrounds:

| Element | Class | Description |
|---------|-------|-------------|
| Accent labels | `label-accent` | Highlighted badges (no blur) |
| Stat labels | `label-stat` | Statistical indicators |

### Corner Shapes (Squircles)

Use **continuous corner radius** (squircle shape) for a softer, more organic feel:

- Large panels: `rounded-2xl` (16px)
- Cards: `rounded-xl` (12px)
- Buttons: `rounded-md` (6px) to `rounded-lg` (8px)
- Pills/tags: `rounded-md` (6px)

### CSS Variables

All color values, shadows, and transitions are defined in `src/styles/global.css`:

- **Surface variables** (`--surface-*`): Solid backgrounds, borders, and shadows for content
- **Glass variables** (`--glass-*`): Translucent backgrounds and blur effects for navigation
- **Accent variables** (`--color-accent-*`): Brand colors for buttons and highlights

Both light (`:root`) and dark (`.dark`) themes are defined there.

### Implementation Guidelines

#### When to Use Glass

✅ **DO use glass for:**
- Header navigation
- Footer
- Dropdown menus
- Buttons and CTAs
- Modal overlays

❌ **DON'T use glass for:**
- Content sections
- Cards
- Labels/badges
- Static containers

#### Creating New Components

**For content components:**
1. Use `surface-*` classes instead of `glass-*`
2. No `backdrop-filter` or blur effects
3. Use solid shadows for depth

**For navigation components:**
1. Use `nav-glass`, `footer-glass`, or `nav-dropdown-glass`
2. Include `backdrop-filter: blur()`
3. Use glass shadows and borders

### Performance Benefits

The strict hierarchy significantly improves performance:

- **Reduced blur layers** - Glass only on navigation (always visible) and buttons
- **No stacking blur** - Content sections don't compound blur effects
- **Mobile-friendly** - Solid content is lightweight on lower-powered devices
- **Better readability** - Solid backgrounds ensure consistent text contrast

### Accessibility

- Solid content surfaces provide reliable contrast ratios
- Navigation glass uses adequate opacity for text legibility
- Labels are plain for maximum readability
- Maintain WCAG 2.1 AA contrast ratios (4.5:1 for normal text)
