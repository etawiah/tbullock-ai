# Mobile UX Audit Plan: Tom Bullock AI Bartender

## Executive Summary
The tbullock-ai app has **solid mobile foundations** with safe-area awareness, haptic feedback, and pull-to-refresh. However, the layout remains **desktop-first** with several mobile affordances that need refinement for optimal iOS/Android thumb-friendliness and small-screen usability.

---

## 1. CURRENT STATE ANALYSIS

### ✅ What's Already Good
- **Viewport config** (`index.html:5`): Correct `viewport-fit=cover`, prevents zoom on input focus
- **Safe-area support**: `env(safe-area-inset-*)` used in key spots (FAB, chat input, modals)
- **isMobile detection** (`App.jsx:1315`): `window.innerWidth < 768` breakpoint active
- **Haptic feedback**: Integrated throughout (buttons, FAB, swipe gestures)
- **Pull-to-refresh**: Implemented for inventory view
- **Fixed chat input**: Sticky on mobile to prevent keyboard hiding
- **FAB menu**: Accessible quick actions on inventory view
- **Bottom sheet modal**: Add inventory uses slide-up animation

### ⚠️ Current Issues & Pain Points

#### **Layout & Viewport**
- **Root container** (`App.jsx:2064`): `height: 100vh` can clip content on devices with dynamic safe areas
- **Header** (`App.jsx:2070-2238`): Stacked layout with branding + info + 4 tabs is dense on phones < 375px
  - Tabs wrap unexpectedly on portrait mode
  - Tom Bullock info panel takes 3–4 lines, pushing content down
- **Navigation model**: Tabs at top (desktop pattern) not ideal; bottom tab bar is thumb-native

#### **Forms & Modals**
- **Add Inventory Modal** (`App.jsx:474-596`):
  - Grid layout with many field labels not optimized for small viewports
  - Bottle size has inline select (flex: `0 0 80px`) that can overflow on narrow screens
  - Field inputs at `fontSize: isMobile ? '16px' : '14px'` but padding inconsistent
- **Inventory cards** (`App.jsx:3165-3265`):
  - Button groups (e.g., `-1oz`, `-Shot`, `-2oz`) wrap unpredictably
  - Buttons use `minHeight: '44px', minWidth: '44px'` but grouped with `gap: '4px'` → lines wrap aggressively on sub-375px

#### **Inventory View Specific**
- **Type headers** (`App.jsx:3280-3309`): Collapsible sections are good but text-heavy on small screens
- **Item cards** (`App.jsx:3319-3329`): `padding: '12px'` + nested structures create cumulative small-screen bloat
- **Quick adjust buttons**: Grouped without wrapping strategy; text (`-1 oz`) doesn't compress well

#### **Chat View**
- **Message bubbles** (`App.jsx:2302-2316`): Fixed `maxWidth: '80%'` is good, but no left/right margin on very small phones
- **Chat input**: Already fixed/sticky, good; but on iOS with keyboard the entire view can shift

#### **Recipe/Modal Dialogs**
- **RecipeCard bottle selection** (`App.jsx:1113-1162`):
  - Radio buttons with labels work but not optimized for swipe scrolling
  - Modal has `maxHeight: '80vh'` which may cut off content on short screens

#### **Missing Mobile Affordances**
- No explicit **bottom tab bar** (drawer/tab navigation)—header is only nav
- **Pull-to-refresh** only on inventory; chat and recipes lack refresh affordance
- **Swipe navigation** (left/right between views) not implemented, despite mention in CLAUDE.md
- **Haptic feedback** good, but no success/error feedback patterns
- **FAB menu** only on inventory; chat/recipes have no quick-action access

#### **Typography & Density**
- Font sizing conditional (`isMobile ? '12–20px' : '13–18px'`) but lacks unified scale
- Line heights not explicitly set; can be cramped on mobile with system font rendering
- Some labels like "Bottle size" (6px margins) are too small/close together

#### **Touch Targets**
- Most buttons meet 44x44 minimum; however:
  - Inline select dropdowns (Bottle Size unit) are only ~80px wide
  - Checkbox in edit mode (`App.jsx:3335-3348`) is `20x20px` (too small)
  - Type header collapse chevron at `fontSize: '18px'` but not padded adequately

---

## 2. PROPOSED ARCHITECTURE CHANGES

### A. Navigation Restructure (Bottom Tab Bar)

**Rationale**: Tab bar at top is desktop-native; iOS/Android users expect bottom navigation for thumb comfort.

**Changes**:
1. **Move navigation to bottom** on mobile:
   - Keep header as app branding + settings only
   - Create bottom segmented control or tab bar with icons + labels
   - Keep header on desktop (tablet breakpoint ≥ 768px)

2. **Files to modify**:
   - `src/App.jsx` (lines 2061–2238): Refactor main layout
   - Consider new `src/components/BottomTabBar.jsx` for mobile nav

3. **Benefits**:
   - Thumb-friendly, especially for one-handed use
   - Reduces cognitive load (nav not competing with header branding)
   - Matches iOS/Material Design patterns

---

### B. Viewport & Safe-Area Hardening

**Rationale**: Some devices (especially iPhone 14+, foldables, notched Androids) have edge cases with safe areas.

**Changes**:
1. **Replace `height: 100vh`** with `height: 100dvh` (dynamic viewport height):
   - `App.jsx:2064`: Change `height: '100vh'` → `height: '100dvh'`
   - `index.html:45`: Change `height: 100vh` → `height: 100dvh`

2. **Audit all fixed/sticky positioning**:
   - Chat input (`App.jsx:2342`): Ensure `bottom: 0` + `env(safe-area-inset-bottom)` are properly combined
   - FAB positioning (`App.jsx:3713, 3760`): Already good but test on notched devices

3. **Body padding** (`index.html:37–40`):
   - Currently set on body; consider **removing** since most elements should opt-in to safe areas
   - Keep `viewport-fit=cover` for edge-to-edge rendering

---

### C. Header Redesign for Mobile

**Rationale**: 4-tab navigation + branding + info button is too dense on < 360px devices.

**Changes**:
1. **On mobile** (< 768px):
   - **Remove Tom Bullock info button** from header
   - **Simplify branding** to icon only (or icon + "Tom Bullock" as single line)
   - **Move tab navigation to bottom bar**
   - **Keep dark mode toggle** in header (top-right corner)

2. **Tom Bullock info**:
   - Move to a dedicated modal/drawer triggered from about/menu icon
   - Or add as collapsible section in settings (new view)

3. **Files**:
   - `src/App.jsx` (lines 2070–2238): Conditional header layout
   - `src/components/Header.jsx` (new, optional): Extract header logic

---

### D. Form & Modal Optimization

**Rationale**: Forms are cramped; fields need better spacing and predictable wrapping.

#### **Add Inventory Modal Improvements** (`src/App.jsx:447–700+`)

**Changes**:
1. **Single-column stacking on mobile**:
   - Bottle Size (input + select) already flex, but ensure select width is responsive

2. **Field spacing**:
   - Increase vertical gap from `16px` to `20px` on mobile
   - Add `12px` bottom margin to labels for visual breathing room

3. **Responsive font sizing**:
   - Create reusable style object for `isMobile` consistency
   - Use CSS custom properties or shared constants

4. **Input height on mobile**:
   - Ensure minimum `48px` height (not just padding) to meet touch targets
   - All form inputs should have `minHeight: '48px'` on mobile

#### **Recipe/Modal Dialogs** (`src/App.jsx:1039–1200`)

**Changes**:
1. **Bottle selection modal**:
   - Option radio buttons: Increase padding to `16px` (not `12px`)
   - Option labels: Add `flex: 1` to wrap long brand names
   - Modal height: Use `maxHeight: '90vh'` consistently

2. **Modal animation**:
   - Ensure `slideUp` animation doesn't clip on notched devices
   - Test on iPhone 14 Pro Max (Dynamic Island)

---

### E. Inventory & List Optimization

**Rationale**: Dense inventory lists are hard to scan on mobile; button groups wrap unpredictably.

#### **Quick Adjust Buttons** (`src/App.jsx:3227–3235`)

**Changes**:
1. **Button layout**:
   - Current: `display: 'flex', gap: '4px', flexWrap: 'wrap'`
   - Problem: On 320px phones, buttons wrap to 2+ lines, wasting space
   - **Solution**: Use `flex-direction: column` on < 360px, or create pill layout

2. **Button styling**:
   - Increase font size from `11–12px` to `13px` (readable, not cramped)
   - Use shorter labels on mobile: `-1oz` → `-1` (with tooltip/aria-label)
   - Or stack vertically: `flex-direction: isMobile && window.innerWidth < 360 ? 'column' : 'row'`

3. **Shopping list button**:
   - `width: isMobile ? '100%' : 'auto'` is already good
   - Ensure it doesn't overlap quick-adjust buttons on wrapping

#### **Type Headers** (`src/App.jsx:3280–3309`)

**Changes**:
1. **Collapse chevron**: Increase touch target
   - Add `padding: '8px'` around chevron, or increase gap
   - Font size `18px` is good but needs more breathing room

2. **Count badge**: Reduce font size on mobile
   - Current: `fontSize: '14px'`, consider `12px` on < 375px

3. **Type name**: Truncate if too long
   - Add `overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100% - 60px)'`

#### **Item Cards** (`src/App.jsx:3319–3329`)

**Changes**:
1. **Card padding**: Increase from `12px` to `16px` on mobile for better readability
2. **Field layout**:
   - Brand + Name currently stack; ensure wrapping works visually
   - Proof, Size, Amount fields are separate divs—consider grid layout for alignment
3. **Stock badge**: Ensure it doesn't overlap with name text
   - Use `flexWrap: 'wrap'` and ensure badge has `marginLeft: 'auto'` to push right

---

### F. Chat View Enhancements

**Rationale**: Chat is already reasonably mobile-friendly, but needs small tweaks.

**Changes**:
1. **Message bubble width**:
   - Current: `maxWidth: '80%'` is good
   - Add horizontal padding on < 320px: adjust to `maxWidth: '85%'` or `calc(100% - 32px)`

2. **Input area**:
   - Already fixed; test that `env(safe-area-inset-bottom)` works on all devices
   - Consider adding a "keyboard present" detection to adjust content padding dynamically

3. **Loading state**:
   - Ensure loading spinner/text is centered and doesn't shift layout

4. **Swipe gesture** (mentioned in CLAUDE.md but not implemented):
   - Add optional left/right swipe detection to switch views
   - Requires `useRef` for touch start/end tracking

---

### G. FAB Menu & Quick Actions

**Rationale**: FAB is good; expand affordances to other views.

**Changes**:
1. **Current** (`App.jsx:3705–3841`):
   - FAB only visible on inventory view
   - **Expand to chat & recipes** with context-specific actions

2. **Chat FAB actions**:
   - Quick recipe lookup
   - Inventory summary
   - Add a bottle (shortcut to Add Inventory Modal)

3. **Recipes FAB actions**:
   - Create new recipe
   - View ingredients needed

4. **Consistent positioning**:
   - Bottom `calc(16px + env(safe-area-inset-bottom))` if no tab bar
   - If bottom tab bar added, adjust FAB to sit above or integrate into tab bar

---

## 3. DETAILED IMPLEMENTATION ROADMAP

### Phase 1: Foundations (No Breaking Changes)
- [ ] Replace `100vh` with `100dvh` (viewport fix)
- [ ] Upgrade touch targets: checkboxes → `28x28px` minimum
- [ ] Increase form field `minHeight` to `48px`
- [ ] Audit `env(safe-area-inset-*)` usage; test on notched devices

### Phase 2: Layout Optimization
- [ ] Create `BottomTabBar.jsx` component (hidden on desktop)
- [ ] Refactor `App.jsx` main layout to conditionally render top header (desktop) or bottom nav (mobile)
- [ ] Update header for mobile: icon-only branding, remove info button, move to modal
- [ ] Test on breakpoints: 320px, 375px, 390px, 768px+

### Phase 3: Form & Modal Refinement
- [ ] Optimize `AddInventoryModal` field widths and select responsiveness
- [ ] Standardize form field styling (padding, margins, font sizes)
- [ ] Test bottle selection modal on iPhone 14 Pro Max and Android foldables
- [ ] Add `aria-labels` to abbreviated buttons (`-1 oz` labels)

### Phase 4: List & Card Improvements
- [ ] Refactor quick-adjust button layout (vertical stack on < 360px)
- [ ] Increase inventory card padding
- [ ] Improve type header collapse toggle touch target
- [ ] Test inventory grid collapsing on narrow screens

### Phase 5: Advanced Enhancements (Optional)
- [ ] Add swipe gesture navigation (left/right between views)
- [ ] Implement swipe gestures for quick-adjust (swipe down = -1oz, up = +1oz)
- [ ] Extend FAB menu to chat & recipes with context actions
- [ ] Add pull-to-refresh to chat & recipes

### Phase 6: Testing & Validation
- [ ] Chrome DevTools mobile emulation (multiple device profiles)
- [ ] Real device testing: iPhone 12/14/15, Android phones (Samsung, Pixel)
- [ ] Test keyboard appearance/dismissal on both platforms
- [ ] Test safe-area behavior on notched/foldable devices
- [ ] Performance profiling (FPS, jank detection)

---

## 4. SPECIFIC CODE REFERENCES & QUICK FIXES

### 4.1 Replace 100vh with 100dvh

**File**: `index.html` (line 45)
```
OLD: height: 100vh;
NEW: height: 100dvh;
```

**File**: `src/App.jsx` (line 2064)
```
OLD: height: '100vh'
NEW: height: '100dvh'
```

### 4.2 Increase Checkbox Size

**File**: `src/App.jsx` (lines 3335–3348)
```
OLD: style={{ width: '20px', height: '20px' }}
NEW: style={{ width: '28px', height: '28px', cursor: 'pointer' }}
```

### 4.3 Add minHeight to Form Fields

**File**: `src/App.jsx` (lines 450–456)
```
OLD:
const fieldInputStyle = {
  padding: isMobile ? '10px' : '8px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: isMobile ? '16px' : '14px',
  width: '100%'
}

NEW:
const fieldInputStyle = {
  padding: isMobile ? '12px 10px' : '10px 8px',
  minHeight: '48px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: isMobile ? '16px' : '14px',
  width: '100%',
  boxSizing: 'border-box'
}
```

### 4.4 Inventory Card Padding

**File**: `src/App.jsx` (line 3325)
```
OLD: padding: '12px'
NEW: padding: isMobile ? '16px' : '12px'
```

### 4.5 Quick-Adjust Button Responsiveness

**File**: `src/App.jsx` (lines 3220–3236)
- Add `flexDirection: isMobile && window.innerWidth < 360 ? 'column' : 'row'`
- Change button font from `11–12px` to `13px`
- Add aria-labels for abbreviated text

---

## 5. TESTING STRATEGY

### 5.1 Chrome DevTools Mobile Emulation
1. Open Chrome DevTools (F12)
2. Click device toggle (Ctrl+Shift+M)
3. Test profiles:
   - iPhone SE (375×667, no notch)
   - iPhone 14 Pro (393×852, Dynamic Island)
   - Pixel 6a (412×892, tear-drop notch)
   - Samsung Galaxy S21 (360×800, punch-hole)
   - iPad Mini (768×1024, tablet breakpoint)
4. Verify: No horizontal scrolling, safe-area padding correct, touch targets ≥44×44 px, modals not clipped

### 5.2 Real Device Testing Checklist

**Essential Devices**:
- [ ] iPhone 12 (notch, 390px wide)
- [ ] iPhone 14 Pro Max (Dynamic Island, 430px wide)
- [ ] Samsung Galaxy S21 (Android, 360px wide)
- [ ] Pixel 6a (Android, 412px wide)

**Test Cases**:
- [ ] Inventory: Add item, scroll, collapse headers, adjust bottles
- [ ] Chat: Send message, keyboard appears/dismisses, bubbles fit on 320px
- [ ] Forms: Fill Add Inventory Modal without zooming
- [ ] Safe areas: Scroll to bottom; FAB/input not clipped on notched device
- [ ] Keyboard: Input interaction; chat input stays visible above keyboard

### 5.3 Lighthouse Audit
Run Lighthouse in DevTools:
- Target: 90+ Performance, Accessibility
- Check for layout shifts (CLS)
- Verify touch target sizes

---

## 6. OPTIONAL ENHANCEMENTS (Post-MVP)

### 6.1 Swipe Navigation
Implement left/right swipe to switch between Chat ↔ Inventory ↔ Recipes.

### 6.2 Toast Notifications
Replace `alert()` with toast notifications for haptic + visual feedback.

### 6.3 Swipe Gestures for Quick-Adjust
Long-press or swipe on bottle to adjust amount (-1oz, +0.5oz, etc.).

---

## 7. SUMMARY TABLE

| Issue | Severity | File | Line(s) | Fix |
|-------|----------|------|---------|-----|
| `100vh` clips notched devices | High | `App.jsx`, `index.html` | 2064, 45 | Change to `100dvh` |
| Header too dense on mobile | High | `App.jsx` | 2070–2238 | Move tabs to bottom bar |
| Form fields not responsive | Medium | `App.jsx` | 575–595 | Add minHeight, adjust widths |
| Checkbox touch target too small | Medium | `App.jsx` | 3347 | Increase to 28×28px |
| Quick-adjust buttons wrap aggressively | Medium | `App.jsx` | 3221–3236 | Stack vertically on <360px |
| No swipe navigation | Low | `App.jsx` | N/A | Add touch event handlers |
| FAB only on inventory | Low | `App.jsx` | 3705+ | Extend to all views |

---

## 8. ROLLOUT PLAN

1. **Phase 1** (Week 1): Viewport fix, touch targets, form field heights—low-risk, high-impact
2. **Phase 2** (Week 2): Layout optimization, bottom nav structure
3. **Phase 3** (Week 3): Form & modal refinement
4. **Phase 4** (Week 4): Testing on real devices
5. **Phase 5+** (Future): Swipe nav, toasts, advanced gestures

**Next Step**: Start with Phase 1. These are quick wins that stabilize the mobile experience immediately.
