# OC Page & Character Moderation — Improvement Plan

This plan aligns the **OC page** (`oc-page.html`), **Create Character** (`character-create.html`), and **Character Moderation** (`character-moderation.html`) with the rest of the dashboard: SEO, icons, layout, and formatting.

---

## 1. SEO

### 1.1 Current state

| Page | description | favicon | theme-color | og:* | canonical | JSON-LD |
|------|-------------|---------|-------------|------|-----------|---------|
| **index** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **privacy / contact** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **oc-page** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **character-create** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **character-moderation** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 1.2 Changes

**All three pages**

- Add **Open Graph**: `og:title`, `og:description`, `og:type`, `og:url`, `og:image` (use `https://tinglebot.xyz/images/tingleicon.png` like index).
- Add **canonical** `<link rel="canonical" href="https://tinglebot.xyz/...">`:
  - OC: canonical depends on slug (e.g. `/oc/:slug`) — use current URL or base OC URL as appropriate.
  - Create: `https://tinglebot.xyz/character-create` (or `/character-create.html` if that’s the canonical route).
  - Moderation: `https://tinglebot.xyz/character-moderation` (or `.html` variant).
- Add **JSON-LD** (same Organization snippet as `index` / `privacy`) for consistency.

**Character-moderation only**

- Add `<meta name="description" content="...">` (e.g. “Moderate pending OC character submissions for Tinglebot.”).
- Add `<link rel="icon" type="image/png" href="/images/tingleicon.png">`.
- Add `<meta name="theme-color" content="#00A3DA">`.
- Use same `viewport` as other pages:  
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.

**Sitemap (optional)**

- If these routes are meant to be crawlable, add them to `sitemap.xml` with suitable `changefreq` and `priority` (e.g. moderation lower priority, create/OC similar to other app pages).

---

## 2. Icons

### 2.1 Font Awesome

- **Standard**: Use the same Font Awesome **kit** as the dashboard (`https://kit.fontawesome.com/262000d25d.js`).
- **Character-moderation** currently uses **cdnjs** (`font-awesome/6.4.0`). Replace with the kit so icons and versions match.

### 2.2 Icon usage

- **OC page**: Already uses Font Awesome (e.g. stats, gear, links). Ensure any new UI elements (buttons, sections) use icons consistently.
- **Character-create**: Section titles and buttons already use icons. Keep that pattern for any new sections/actions.
- **Character-moderation**:
  - Add icons to **detail labels** in character cards (e.g. Age, Height, Pronouns, Race, Village, Job, App Link) so they match OC page “detail-item” style (e.g. `fa-user`, `fa-ruler`, `fa-info`, `fa-dragon`, `fa-home`, `fa-briefcase`, `fa-link`).
  - Ensure **modals** and **empty/error states** use the same icon style as the rest of the dashboard.

### 2.3 Favicon

- All three pages should use `/images/tingleicon.png` as favicon (moderation currently has none).

---

## 3. Formatting & Layout

### 3.1 Page structure

**Character-moderation**

- Wrap main content in `<main id="main-content">` and use it as the primary landmark (like OC and character-create).
- Add a **skip link**:  
  `<a href="#main-content" class="skip-link">Skip to main content</a>`  
  (match `index` / OC / character-create).

### 3.2 Topbar consistency

Use the same topbar pattern across all three standalone pages:

| Element | OC | Create | Moderation | Action |
|--------|----|--------|------------|--------|
| Skip link | ✓ | ✓ | ✗ | Add to moderation |
| Back link | “Back” | “Back” | “Back to Dashboard” | Use **“Back”** everywhere; optional `aria-label="Back to Dashboard"` |
| Breadcrumb | Dynamic | “Create Character” | “Character Moderation” | Keep; ensure styling matches |
| Bot status | ✓ | ✗ | ✗ | Add to **create** and **moderation** |
| Notification container | ✓ | ✗ | ✗ | Add to **create** and **moderation** |
| User menu | ✓ | ✓ | ✓ | Same structure (avatar + username); moderation currently uses `src=""` for avatar — use `/images/ankleicon.png` as default like others |

### 3.3 Buttons

- **Dashboard / OC / Create** use `btn btn-primary`, `btn btn-secondary`, etc. (`buttons.css`).
- **Moderation** uses `button button--glass`, `button--danger`. Either:
  - **Option A**: Switch moderation to `btn btn-primary` / `btn btn-secondary` / `btn btn-danger` (or equivalent) so all character-related pages share the same button system, or  
  - **Option B**: Keep `button--*` but ensure they’re styled in `buttons.css` and look consistent with the rest of the dashboard.

Recommendation: **Option A** for consistency.

### 3.4 Containers & width

- **OC**: `oc-page-container` — `max-width: 95%`.
- **Create**: `character-create-container` — `max-width: 1200px`.
- **Moderation**: `moderation-container` — `max-width: 1400px`.

Unify approach:

- Use a **shared max-width** (e.g. `1200px` or `1400px`) and **consistent horizontal padding** for these standalone pages, or
- At least use the same **scale** (e.g. all `max-width: 1200px` with `margin: 0 auto` and same padding). Adjust OC from `95%` to a pixel max-width if you want alignment with create/moderation.

### 3.5 CSS & asset paths

- **Character-create** uses **relative** paths (`css/...`, `js/...`). This can break depending on routing (e.g. `/character-create` vs `/character-create.html`).
- **OC** and **moderation** use **absolute** paths (`/css/...`, `/js/...`).

**Action**: Use **absolute** paths for all shared assets (CSS, JS, images) on create as well, matching OC and moderation.

### 3.6 Moderation-specific layout

- Move `moderation-container` **inside** `<main id="main-content">`.
- Use the same **main** / **topbar** layout as OC and character-create (topbar + main, no sidebar).
- Reuse or mirror **body class** patterns (e.g. `character-moderation-page`) for overrides, and ensure `--main-padding` and other variables match the rest of the dashboard.

---

## 4. Optional Enhancements

- **Preload / dns-prefetch**: Like `index`, add `preload` for critical CSS and `dns-prefetch` for Font Awesome (and any other third-party origins).
- **`data-theme`**: Index uses `data-theme="dark"` on `<html>`. OC and create use it; ensure moderation does too if theme switching is global.
- **Animations**: Dashboard loads `animations.css`. If OC/create/moderation use similar transitions or loading states, consider including it for consistency.

---

## 5. Implementation order

1. **SEO** (all three): meta description, favicon, theme-color, og, canonical, JSON-LD. Fix moderation viewport.
2. **Icons**: Switch moderation to FA kit; add icons to moderation detail labels and any missing UI.
3. **Formatting**:
   - Moderation: add skip link, `<main>`, align topbar (back label, bot status, notifications, default avatar).
   - Create: absolute asset paths; add bot status + notification container.
   - Buttons: unify on `btn` classes (or explicitly align `button--*` styles).
4. **Containers**: Unify max-width and padding for OC, create, and moderation.
5. **Polish**: Preload/dns-prefetch, `data-theme`, animations, sitemap, if desired.

---

## 6. Files to touch

| File | Changes |
|------|--------|
| `oc-page.html` | SEO (og, canonical, JSON-LD) |
| `character-create.html` | SEO; absolute paths; bot status + notification container; optional preload |
| `character-moderation.html` | Full SEO; FA kit; skip link + `<main>`; topbar parity; default avatar; optional `data-theme` |
| `character-moderation` (inline JS) | Wire notification container if added; ensure avatar fallback |
| `character.css` | Moderation container inside main; optional shared standalone-page rules |
| `oc-page.css` | Optional container max-width tweak |
| `sitemap.xml` | Optional entries for create / OC / moderation |

---

## 7. Quick reference: index.html head pattern

Use this as the template for **meta, link, and JSON-LD** on OC, create, and moderation:

```html
<meta name="description" content="..." />
<meta property="og:title" content="..." />
<meta property="og:description" content="..." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://tinglebot.xyz/..." />
<meta property="og:image" content="https://tinglebot.xyz/images/tingleicon.png" />
<link rel="icon" type="image/png" href="/images/tingleicon.png" />
<meta name="theme-color" content="#00A3DA" />
<link rel="canonical" href="https://tinglebot.xyz/..." />
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Organization", "name": "Tinglebot Dashboard", "url": "https://tinglebot.xyz/", "logo": "https://tinglebot.xyz/images/tingleicon.png", "description": "..." }
</script>
```

Adapt `description`, `og:url`, and `canonical` per page.
