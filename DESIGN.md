# Second Room — Design Documentation

This document outlines the design conventions, visual language, and UI/UX logic for the Second Room website. It serves as a guide for maintaining brand consistency across all pages and components.

---

## 1. Visual Identity & Philosophy

The design of Second Room follows a "Trust Shapes Capital" philosophy: a balance of institutional-grade professionalism and bespoke advisory sophistication.

- **Minimalism:** Clean layouts with ample whitespace.
- **Sophistication:** Use of serif typography for high-level branding and narrative elements.
- **Interactivity:** Subtle reveal-on-scroll animations and hover states to create a "living" digital experience.

---

## 2. Typography

The project uses a tiered typography system to distinguish between functional and narrative content.

| Font Family | Usage | Characteristics |
| --- | --- | --- |
| **Glacial Indifference** | Primary Body & Headings | Geometric sans-serif; clean, modern, institutional. |
| **Playfair Display** | Branding & Accent Titles | Elegant serif; used for "Playfair" text, kickers, and hero titles. |
| **Caveat** | Decorative (Member Names) | Handwriting style; adds a personal touch to the Circle section. |
| **System Sans-serif** | Fallback | `system-ui, -apple-system, Segoe UI, Roboto, etc.` |

### Type Scales
- **Base Font Size:** `18px` (scaled to `16px` on mobile).
- **H1:** `clamp(2.4rem, 5vw, 4rem)` — Light weight (400) with 0.2px letter-spacing.
- **H2:** `clamp(1.6rem, 3.2vw, 2.2rem)` — Light weight (400).
- **Body:** Line-height `1.6` for readability; `-webkit-font-smoothing: antialiased`.

---

## 3. Color Palette

The palette is grounded in high-contrast neutrals with a single warm accent color.

| Color | Value | Variable | Usage |
| --- | --- | --- | --- |
| **Core Black** | `#0f0f0f` | `--text` | Primary text and dark UI elements. |
| **Terracotta** | `#dc5f45` | `--accent` | Brand accent, links, and specific section backgrounds. |
| **Muted Grey** | `#5a5a5a` | `--muted` | Subtext, navigation links, and footer. |
| **Deep Border** | `#222222` | `--border` | Subtle UI boundaries. |
| **Pure White** | `#ffffff` | `--bg` | Main background and card surfaces. |
| **Soft Grey** | `#fafafa` | N/A | Hover states and alternate section backgrounds. |

---

## 4. Layout & Grid Systems

### Containers
- **Default Max-Width:** `1100px` (`--maxw`).
- **Contact Page:** `1280px` (to accommodate dense grids).
- **About Page:** `1240px` (for wider storytelling).

### Section Spacing
- Standard vertical padding: `54px 0`.
- Service detail pages often use a `92%` - `94%` fluid width on smaller screens.

### Responsive Breakpoints
- **Desktop/Tablet:** `> 860px`.
- **Mobile (Collapse):** `< 860px` — Grids typically switch from 2/3 columns to 1 column.
- **Small Mobile:** `< 720px` — Header switches to a fullscreen glassmorphism menu.

---

## 5. UI Components & Conventions

### Buttons
- **Shape:** Pill-shaped (`border-radius: 28px`).
- **Style:** Border-based (1.5px), transparent background.
- **Interactions:** Subtle lift (`translateY(-1px)`) and soft shadow on hover.

### Cards (Offerings)
- **Hover Effects:** Images scale slightly (`1.035`) with increased saturation.
- **Visual Cues:** A `>` arrow overlay appears in the bottom right of media containers on hover.

### Navigation
- **Sticky Header:** Stays at the top of the viewport (`z-index: 10`).
- **Active State:** Indicates current page with bold text and `var(--text)` color.

### Lists
- **Custom Bullets:** Solid dots (`•`) positioned in a left gutter to ensure text aligns flush.
- **Line Height:** Tightened to `1.2` for grid-based descriptions; loosened to `1.7` for dense service lists.

---

## 6. Motion & Animation

### Reveal-on-Scroll
- Powered by `IntersectionObserver`.
- **Class:** `.reveal` (initial state: `opacity: 0`, `translateY(14px)`).
- **Staggered Delays:** `.reveal-delay-1` (0.08s), `.reveal-delay-2` (0.16s), etc.

### Hover Transitions
- Default duration: `0.2s` to `0.35s`.
- Easing: `ease` or `ease-out`.

---

## 7. Assets & Media

- **Logos:** Served as high-quality JPEGs/PNGs from `Assets/`.
- **Founder Photos:** Circular crops (`border-radius: 50%`) with a subtle terracotta border.
- **Hero Video:** Autoplay, muted, and looped to provide ambient movement without distraction.

---

## 8. Development Guidelines

1. **One Stylesheet:** All global styles live in `styles.css`.
2. **Page-Specific CSS:** For unique one-off tweaks, use a `<style>` block within the specific HTML file to avoid global namespace pollution.
3. **No Build Step:** Author plain, semantic HTML. Use CSS variables for color and sizing consistency.
4. **Mobile First:** Ensure all new components are tested down to `320px` width.
