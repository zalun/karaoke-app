# HomeKaraoke Design System

This document describes the design language, color palette, typography, and component patterns used in the HomeKaraoke desktop application. It serves as a reference for maintaining visual consistency and can be used as a foundation for the website design.

---

## Table of Contents

1. [Color Palette](#color-palette)
2. [Typography](#typography)
3. [Spacing & Layout](#spacing--layout)
4. [Animations](#animations)
5. [Component Patterns](#component-patterns)
6. [Icons](#icons)

---

## Color Palette

HomeKaraoke uses a dark theme optimized for low-light karaoke environments.

### Background Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `gray-900` | `#111827` | Main application background |
| `gray-800` | `#1f2937` | Panels, cards, dialogs, controls |
| `gray-700` | `#374151` | Input backgrounds, hover states, secondary panels |
| `gray-700/50` | `rgba(55, 65, 81, 0.5)` | Subtle backgrounds, folder items |
| `gray-700/30` | `rgba(55, 65, 81, 0.3)` | Very subtle backgrounds, info boxes |
| `gray-600` | `#4b5563` | Buttons, borders, disabled states |
| `black/50` | `rgba(0, 0, 0, 0.5)` | Modal overlays |
| `black/70` | `rgba(0, 0, 0, 0.7)` | Video overlays (NextSongOverlay) |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `white` | `#ffffff` | Primary text, headings |
| `gray-200` | `#e5e7eb` | Secondary text, button text |
| `gray-300` | `#d1d5db` | Tertiary text, artist names |
| `gray-400` | `#9ca3af` | Muted text, timestamps, icons |
| `gray-500` | `#6b7280` | Placeholder text, disabled text, labels |

### Accent Colors

#### Blue (Primary Actions)
| Token | Hex | Usage |
|-------|-----|-------|
| `blue-400` | `#60a5fa` | Links, active icons |
| `blue-500` | `#3b82f6` | Progress bars, focus rings, countdown circles |
| `blue-600` | `#2563eb` | Primary buttons, toggle switches (on) |
| `blue-700` | `#1d4ed8` | Primary button hover |

#### Green (Local/Success)
| Token | Hex | Usage |
|-------|-----|-------|
| `green-400` | `#4ade80` | Success text, local mode icons |
| `green-500` | `#22c55e` | Local mode toggle, folder icons |
| `green-600` | `#16a34a` | Local mode buttons |
| `green-700` | `#15803d` | Local mode button hover |

#### Yellow (Favorites/Warnings)
| Token | Hex | Usage |
|-------|-----|-------|
| `yellow-400` | `#facc15` | Warning text |
| `yellow-500` | `#eab308` | Favorite stars, persistent singer indicators |
| `yellow-600` | `#ca8a04` | Warning indicators |
| `yellow-900/30` | `rgba(113, 63, 18, 0.3)` | Warning backgrounds |

#### Red (Destructive/Errors)
| Token | Hex | Usage |
|-------|-----|-------|
| `red-400` | `#f87171` | Error text, remove/delete hover |
| `red-500` | `#ef4444` | Error icons |
| `red-900/90` | `rgba(127, 29, 29, 0.9)` | Error notification backgrounds |

### Notification Type Colors

Each notification type has a coordinated color scheme:

```
Error:    bg-red-900/90,    text-red-200,    icon-red-400
Warning:  bg-yellow-900/90, text-yellow-200, icon-yellow-400
Success:  bg-green-900/90,  text-green-200,  icon-green-400
Info:     bg-blue-900/90,   text-blue-200,   icon-blue-400
```

---

## Typography

### Font Stack

```css
font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
```

Inter is the primary font, with system fonts as fallbacks. The font is loaded with these optimizations:
- Font weight: 400 (regular)
- Line height: 1.5
- Font synthesis: none
- Text rendering: optimizeLegibility
- Antialiased rendering

### Font Sizes

| Class | Size | Usage |
|-------|------|-------|
| `text-2xl` | 1.5rem (24px) | App name, large headings |
| `text-xl` | 1.25rem (20px) | Section headings |
| `text-lg` | 1.125rem (18px) | Dialog titles, section headers |
| `text-sm` | 0.875rem (14px) | Body text, buttons, inputs |
| `text-xs` | 0.75rem (12px) | Captions, labels, timestamps |

### Font Weights

| Class | Weight | Usage |
|-------|--------|-------|
| `font-bold` | 700 | App name, version numbers |
| `font-medium` | 500 | Headings, labels, song titles |
| Regular (default) | 400 | Body text |

### Text Utilities

- `truncate` - Single line with ellipsis overflow
- `uppercase tracking-wide` - Section labels (e.g., "Session Singers")

---

## Spacing & Layout

### Base Spacing Scale

HomeKaraoke uses Tailwind's default spacing scale (1 unit = 0.25rem = 4px):

| Token | Value | Common Usage |
|-------|-------|--------------|
| `0.5` | 2px | Tight gaps |
| `1` | 4px | Icon gaps |
| `1.5` | 6px | Small padding |
| `2` | 8px | Standard gaps, small padding |
| `3` | 12px | Medium padding |
| `4` | 16px | Large padding, section margins |
| `6` | 24px | Content area padding |

### Layout Patterns

#### Main Application
```
Full height: h-screen
Background: bg-gray-900
Text: text-white
Layout: flex flex-col
```

#### Panels/Cards
```
Background: bg-gray-800
Border: border border-gray-700
Radius: rounded-lg
Padding: p-3 to p-6
```

#### Dialogs/Modals
```
Overlay: fixed inset-0 bg-black/50
Container: bg-gray-800 rounded-lg shadow-xl border border-gray-700
Width: w-[700px] (settings), max-w-2xl (notifications)
Max height: max-h-[80vh]
```

#### List Items
```
Background: bg-gray-700 hover:bg-gray-600
Selected: bg-gray-600 ring-2 ring-blue-500
Padding: p-2 to p-3
Radius: rounded (list items), rounded-lg (cards)
```

---

## Animations

### Tailwind Custom Animations

```javascript
// tailwind.config.js
animation: {
  "fade-in": "fadeIn 0.3s ease-out",
  "fade-out": "fadeOut 0.3s ease-in",
}

keyframes: {
  fadeIn: {
    "0%": { opacity: "0", transform: "scale(0.95)" },
    "100%": { opacity: "1", transform: "scale(1)" },
  },
  fadeOut: {
    "0%": { opacity: "1", transform: "scale(1)" },
    "100%": { opacity: "0", transform: "scale(0.95)" },
  },
}
```

### CSS Custom Animations

```css
/* Notification slide animations */
@keyframes slide-up {
  from { opacity: 0; transform: translateY(100%); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slide-down {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(100%); }
}

.animate-slide-up { animation: slide-up 0.3s ease-out; }
.animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
```

### Built-in Tailwind Animations

- `animate-spin` - Loading spinners
- `transition-colors` - Color transitions (300ms default)
- `transition-all` - General transitions
- `transition-transform` - Transform-only transitions

### Transition Duration

Default transition: `transition-colors` (150ms)

---

## Component Patterns

### Buttons

#### Primary Button
```html
<button class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
  Primary Action
</button>
```

#### Secondary Button
```html
<button class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
  Secondary Action
</button>
```

#### Disabled Button
```html
<button class="px-4 py-2 bg-gray-600 text-gray-400 rounded cursor-not-allowed" disabled>
  Disabled
</button>
```

#### Icon Button
```html
<button class="w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-gray-700 text-gray-400 hover:text-white">
  <Icon size={16} />
</button>
```

#### Destructive Button (Hover)
```html
<button class="text-gray-400 hover:text-red-400 transition-colors">
  Delete
</button>
```

#### Play/Pause Button (Circular)
```html
<button class="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 transition-colors">
  Play
</button>
```

### Form Inputs

#### Text Input
```html
<input
  type="text"
  class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg
         text-white placeholder-gray-400
         focus:outline-none focus:border-blue-500"
/>
```

#### Select Input
```html
<select class="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500">
  <option>Option 1</option>
</select>
```

#### Checkbox
```html
<input
  type="checkbox"
  class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
/>
```

#### Toggle Switch
```html
<button class="relative w-11 h-6 rounded-full transition-colors bg-blue-600">
  <span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform translate-x-5" />
</button>
```

### Cards & List Items

#### Queue Item
```html
<div class="flex gap-2 p-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors cursor-grab">
  <span class="w-6 text-gray-400">1.</span>
  <div class="flex-1 min-w-0">
    <p class="text-sm truncate">Song Title</p>
    <p class="text-xs text-gray-400 truncate">Artist Name</p>
  </div>
  <button class="text-gray-400 hover:text-green-400">Play</button>
  <button class="text-gray-400 hover:text-red-400">Remove</button>
</div>
```

#### Selected State
```html
<div class="... bg-gray-600 ring-2 ring-blue-500">
```

#### Dragging State
```html
<div class="... bg-gray-700 shadow-lg ring-2 ring-blue-500 opacity-50">
```

### Dialogs

#### Modal Structure
```html
<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div class="bg-gray-800 rounded-lg w-[700px] max-h-[80vh] shadow-xl border border-gray-700 flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-700">
      <h3 class="text-lg font-medium text-white">Dialog Title</h3>
      <button class="text-gray-400 hover:text-white transition-colors">
        <X size={20} />
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      Content here
    </div>

    <!-- Footer -->
    <div class="flex justify-end p-4 border-t border-gray-700">
      <button class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">
        Done
      </button>
    </div>
  </div>
</div>
```

### Dropdowns

#### Dropdown Container
```html
<div class="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[200px] z-[9999]">
  <div class="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide">
    Section Label
  </div>
  <button class="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 transition-colors">
    <span class="text-sm text-gray-200">Item</span>
  </button>
</div>
```

### Notifications

#### Toast Notification
```html
<div class="fixed bottom-0 left-4 right-4 z-[9999] animate-slide-up">
  <div class="bg-blue-900/90 rounded-t-2xl p-4 shadow-xl backdrop-blur max-w-2xl mx-auto">
    <div class="flex items-center gap-3">
      <Icon class="w-5 h-5 text-blue-400" />
      <p class="flex-1 text-sm text-blue-200">Message</p>
      <button class="text-blue-400 hover:text-white transition-colors">
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
```

### Overlays

#### Video Overlay (Next Song)
```html
<div class="absolute bottom-4 right-4 z-20 bg-black/70 backdrop-blur-sm text-white px-4 py-3 rounded-lg max-w-xs">
  <p class="text-xs text-gray-400">Up next</p>
  <p class="text-sm font-medium truncate">Song Title</p>
  <p class="text-xs text-gray-300 truncate">Artist</p>
  <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
    <span class="text-lg font-bold">5</span>
  </div>
</div>
```

### Avatars

#### Singer Avatar (SingerAvatar component)
```html
<!-- Sizes: sm (w-6 h-6), md (w-8 h-8), lg (w-10 h-10) -->
<div
  class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
  style="background-color: #colorFromSinger"
>
  A  <!-- First letter of name -->
</div>
```

#### Avatar Stack (overlapping)
```html
<div class="flex -space-x-1">
  <Avatar class="ring-1 ring-gray-700" />
  <Avatar class="ring-1 ring-gray-700" />
  <div class="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-gray-300 ring-1 ring-gray-700">
    +3
  </div>
</div>
```

### Singer Chip
```html
<div class="inline-flex items-center gap-1.5 rounded-full bg-gray-800 border border-gray-700 px-2 py-1">
  <Avatar size="sm" />
  <span class="text-sm text-gray-200">Name</span>
  <button class="text-gray-400 hover:text-gray-200 transition-colors">
    <X size={14} />
  </button>
</div>
```

### Progress Bar
```html
<div class="h-2 bg-gray-700 rounded-full cursor-pointer hover:h-3 transition-all">
  <div class="h-full bg-blue-500 rounded-full" style="width: 45%"></div>
</div>
```

### Loading States

#### Spinner
```html
<div class="w-8 h-8 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
```

#### Loading Overlay
```html
<div class="absolute inset-0 bg-gray-900/50 rounded-lg flex items-center justify-center z-10">
  <div class="animate-spin ..."></div>
</div>
```

---

## Icons

HomeKaraoke uses [Lucide React](https://lucide.dev/) for icons. Common icon sizes:

| Size | Usage |
|------|-------|
| 10-12 | Inline indicators (Star in text) |
| 14-16 | Buttons, list items |
| 18-20 | Dialog headers, navigation |
| 32-48 | Empty states, error states |

### Commonly Used Icons

- **Navigation**: Search, List, HardDrive, Settings, Info
- **Player**: Play, Pause, SkipBack, SkipForward, Volume2, VolumeX
- **Actions**: Plus, X, Check, Trash2, RefreshCw, ExternalLink
- **Status**: AlertCircle, AlertTriangle, CheckCircle, Star
- **Users**: Users, UserPlus
- **Files**: FolderOpen, FolderPlus

---

## Summary

The HomeKaraoke design system emphasizes:

1. **Dark Theme**: Optimized for low-light environments typical of karaoke settings
2. **Clear Hierarchy**: Distinct background levels (gray-900 > gray-800 > gray-700)
3. **Semantic Colors**: Blue for primary actions, green for local/success, yellow for favorites, red for errors
4. **Consistent Spacing**: Standardized padding and margins throughout
5. **Subtle Animations**: Smooth 300ms transitions for state changes
6. **Accessibility**: Clear focus states, sufficient color contrast, aria labels

The design language balances functionality with visual appeal, creating an interface that's easy to use in a party/karaoke environment while maintaining a modern, polished appearance.
