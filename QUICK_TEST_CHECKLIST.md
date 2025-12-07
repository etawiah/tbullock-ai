# Quick Test Checklist - Inventory Availability Fix

**Quick validation of the 4 changes**

---

## Test 1: Stock Level Indicator (2 min)

**Goal:** Verify absolute 120ml threshold for "Critical" level

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Add bottle: Vodka, 750ml full | Shows "🟢 Good" | |
| 2 | Remove 1oz 15 times (~450ml) | Still shows "🟢 Good" (medium levels) | |
| 3 | Remove 1oz 8 more times (~240ml more) | Shows "🟡 Low" (< 25%) | |
| 4 | Remove 1oz 4 more times (~120ml total) | Switches to "🔴 Critical" | |
| 5 | Add small 200ml bottle, fill to 200ml | Shows "🟢 Good" despite <120ml | |
| 6 | Remove 200ml bottle to 100ml | Shows "🔴 Critical" at <120ml | |

✅ **Pass if:** Critical level switches at 120ml for all bottle sizes

---

## Test 2: Fresh Bottle Discovery (5 min)

**Goal:** Recipe shows available after adding fresh replacement

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Find a recipe with single ingredient (e.g., Daiquiri - Rum) | Shows "✓ Available" | |
| 2 | Click "Make This Drink" | Recipe made, inventory updated | |
| 3 | Check Favorites again | Recipe shows "✓ Available" (Rum has 250ml left) | |
| 4 | Make drink 2 more times | Rum depleted to 0ml | |
| 5 | Check Favorites | Recipe shows "✗ Missing" | |
| 6 | Add new bottle: "Bacardi Rum, 750ml" | Fresh bottle in inventory | |
| 7 | Check Favorites **without page refresh** | Recipe shows "✓ Available" | |

✅ **Pass if:** Step 7 shows available immediately

---

## Test 3: Multiple Options Filtering (5 min)

**Goal:** UI picks best bottle with sufficient ml

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Create two Rum bottles: | | |
|  | - Bacardi: 750ml at 50ml remaining | | |
|  | - Mount Gay: 750ml at 500ml remaining | | |
| 2 | Find recipe needing 45ml Rum | Shows "✓ Available" (Mount Gay can cover) | |
| 3 | Click "Make This Drink" | Bottle selection dialog appears | |
| 4 | Check which bottle is highlighted/selected | Mount Gay selected (has enough ml) | |
| 5 | Accept and make drink | Mount Gay inventory reduced | |
| 6 | Check Bacardi inventory | Untouched (wasn't used) | |

✅ **Pass if:** Mount Gay selected, not Bacardi

---

## Test 4: Reset After Making Drink (5 min)

**Goal:** Each attempt starts fresh, not stuck to previous selection

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Same setup as Test 3 | Two Rum bottles, Bacardi low | |
| 2 | Click "Make This Drink" | Bottle selection dialog | |
| 3 | Select Bacardi (deliberately pick low one) | Dialog accepts selection | |
| 4 | **Don't make drink yet** - close dialog | Selection saved | |
| 5 | Open dialog again | Bacardi still selected | |
| 6 | Make drink with Bacardi | Inventory updated, Bacardi at 20ml | |
| 7 | Check Favorites | Recipe shows "✗ Missing" (Bacardi can't cover) | |
| 8 | Click "Make This Drink" again | Bottle dialog appears | |
| 9 | Check which bottle is selected | Mount Gay selected (fresh check, not stale Bacardi) | |

✅ **Pass if:** Step 9 shows Mount Gay selected (fresh availability check)

---

## Test 5: Pantry Items (3 min)

**Goal:** Garnish/bitters don't need ml validation

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Find recipe needing: Rum + Lime Wheel | Shows "✓ Available" | |
| 2 | Go to Inventory, find Lime Wheel | Check amount (likely just "In Stock" string) | |
| 3 | Click "Make This Drink" | Recipe made successfully | |
| 4 | Check Inventory - Lime Wheel amount | Still shows "In Stock" (not decremented) | |

✅ **Pass if:** Pantry items stay "In Stock" and don't get ml-checked

---

## Test 6: Full Workflow (10 min)

**Goal:** End-to-end test of all behaviors together

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Go to Inventory | See your bottles | |
| 2 | Go to Favorites | Multiple recipes visible | |
| 3 | Find recipe with mixed ingredients (spirits + garnish) | Shows availability status | |
| 4 | Make drink 1 | Alert shows what was used | |
| 5 | Check stock levels | All bottles decreased | |
| 6 | Go back to Favorites | Recipe still shows correct availability | |
| 7 | Make drink 2 (same recipe) | Uses available bottles | |
| 8 | Check stock levels | Further reduced | |
| 9 | Add new bottle of main ingredient | Refresh Favorites | |
| 10 | Recipe shows available again | Correct! | |

✅ **Pass if:** All steps succeed smoothly

---

## Known Pass Criteria

- ✅ Build succeeds with no errors
- ✅ No console errors when making drinks
- ✅ Stock levels update after each drink
- ✅ Recipes reflect latest availability without page refresh
- ✅ User selection in dialogs respected (even for low bottles)
- ✅ Dialog cleared on next attempt (fresh selection)

---

## Known Acceptable Issues

- ⚠️ If inventory modal is open while making drink, it doesn't auto-refresh (user can close/reopen)
- ⚠️ If two people make drinks simultaneously, race conditions possible (single-user app, not relevant)
- ⚠️ Very old browsers without ES6 Promises may have issues (not supported anyway)

---

## Quick Rollback

If needed to revert all 4 changes:

```bash
git revert a7de7c7
```

This will create a new commit undoing the changes while keeping history.

---

**Total Test Time:** ~30 minutes for full validation
**Minimum Test Time:** ~10 minutes for critical paths (Tests 1, 2, 4)

