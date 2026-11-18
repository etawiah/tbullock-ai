# Menu Editor System Explained

## 1. Menu Item Status Fields

### **Active** ✅
- The drink is **available** and shown on barmenu.tawiah.net
- Guests can see it and ask you to make it
- Use this for drinks you have all ingredients for

### **Unavailable** ⚠️ (temporarily_unavailable)
- The drink is **temporarily out** but still exists on the menu
- Shown in Menu Editor but NOT on barmenu.tawiah.net
- Use this when:
  - You're out of a key ingredient
  - The base spirit is depleted
  - You're temporarily not making it
- Guests won't see it, but you can quickly re-enable when ready

### **Retired** 🗑️
- The drink is **permanently removed** from circulation
- Shown in Menu Editor but NOT on barmenu.tawiah.net
- Use this for drinks you no longer want to offer
- Kept in history for rollback/reference but not guest-facing

### **Red X Button** ❌
- **Completely removes** the drink from the menu (not just marked retired)
- Use this to delete items you added by mistake
- Difference from "Retired":
  - **Red X**: Gone from menu entirely (can add it back later if needed)
  - **Retired**: Stays in menu history, not shown to guests
  - **Unavailable**: Shown but greyed out to guests

---

## 2. Version Control System

### **How Many Versions Are Saved?**

Every time you click "Save & Publish Menu", a new snapshot is created. Currently you have:

```
menu:snapshot:v1    ← Initial bootstrap (your 12 original recipes)
menu:snapshot:v2    ← Your first edit
menu:snapshot:v3    ← Your second edit
menu:live           ← Current active menu (v3)
```

**All versions are kept forever** - they act as automatic backups. This means:
- ✅ You can rollback to ANY previous version anytime
- ✅ No version limit (storage is cheap)
- ✅ Full audit trail of what changed

**How Versions Work**:
1. You edit menu → Make changes → Click "Save & Publish"
2. System:
   - Increments version: 3 → 4
   - Saves changes to `menu:live` with version=4
   - Creates `menu:snapshot:v4` as backup
   - Returns: "Menu saved! (v4)"
3. Guests immediately see v4
4. You can rollback to v1/v2/v3 anytime via "Show Versions" dropdown

---

## 3. Description Field Issue

### **Current Problem**

When you add a recipe to the menu, the description is set to the first 100 characters of the **instructions field**:

```javascript
// Current code (line 101 in MenuEditor.jsx)
description: recipe.instructions ? recipe.instructions.substring(0, 100) : ''
```

**Example**:
- Recipe: "Pallini & Tonic"
- Instructions: "Add all ingredients in a tumbler glass filled with ice..."
- Menu shows: "Add all ingredients in a tumbler glass filled with ice..." ❌ (shows instructions, not a description)

**Why original menu items have different descriptions**:
- The 12 bootstrapped items were hardcoded with descriptions like "A crafted vodka cocktail"
- New recipes added via UI use instructions instead (wrong!)

### **What Should Happen**

When a recipe is created in the Favorites section, it should have TWO separate fields:

1. **Instructions** (current) - Step-by-step how to make it
2. **Menu Description** (NEW) - Short, guest-friendly description

**Example**:
- **Recipe Name**: Pallini & Tonic
- **Instructions**: Add all ingredients in a tumbler glass filled with ice and garnish with lemon slice. Aromatic bitters (optional)
- **Menu Description**: A bright, refreshing Limoncello and tonic with a citrus twist ← This appears on guest menu

---

## 4. Spirit Type Detection Issue

### **Current Problem**

"Pallini & Tonic" went to **'Other'** instead of **'Liqueur'** because:

```javascript
// Current code (line 102 in MenuEditor.jsx)
const primarySpirit = (recipe.primarySpirit || 'other').toLowerCase();
```

The recipe doesn't have a `primarySpirit` field set, so it defaults to 'other'.

**Why Liqueur would be better**:
- Pallini Limoncello is clearly a liqueur/cordial
- But the Favorites editor doesn't have a spirit type selector

### **What Should Happen**

When creating/editing a recipe in Favorites, you should be able to set the "Primary Spirit" which maps to:
- vodka
- gin
- rum
- tequila
- whiskey
- brandy
- **liqueur** ← for cordials, amaretto, limoncello, etc.
- wine
- beer
- mixer
- other

---

## 5. What Needs to Change

### **Option A: Quick Fix (For Menu Description)**
Add a menu description field to each recipe:

**In Favorites Editor** (when creating/editing a recipe):
```
Recipe Name: [Pallini & Tonic]
Instructions: [Add all ingredients...]
Menu Description: [A bright, refreshing Limoncello and tonic with a citrus twist]
Primary Spirit: [Liqueur]
Glass: [Tumbler]
Garnish: [lemon slice]
```

**In Menu Editor** (when adding to menu):
- Uses the "Menu Description" field instead of truncating instructions
- Uses the "Primary Spirit" for categorization

### **Option B: Full Fix (What Option C Includes)**
All of above PLUS:
- Allow editing menu description directly in Menu Editor (not just when creating recipe)
- Edit recipe name/primary spirit in Menu Editor
- Full edit modal (current code only toggles status)
- Draft/Publish workflow

---

## 6. Data Flow Comparison

### **Current (Broken) Flow**:
```
Favorites Create
├── Name: "Pallini & Tonic"
├── Instructions: "Add all..."
└── No primarySpirit field
    ↓
Menu Add
├── Description = instructions.substring(0, 100) ❌ WRONG
├── primarySpirit = 'other' ❌ WRONG
└── Shown on menu as "Add all ingredients in a tumbler..." ❌
```

### **Fixed Flow**:
```
Favorites Create
├── Name: "Pallini & Tonic"
├── Menu Description: "A bright, refreshing Limoncello and tonic..." ✅
├── Instructions: "Add all..."
└── Primary Spirit: "Liqueur" ✅
    ↓
Menu Add
├── Description = "A bright, refreshing Limoncello and tonic..." ✅
├── primarySpirit = "Liqueur" ✅
├── Shown as "Liqueur" section in menu ✅
└── Display text is menu-friendly ✅
```

---

## 7. Implementation Roadmap

### **For Option C (Draft/Publish + Better Editing)**:

**Phase 1: Add Recipe Fields** (30 min)
- Add `menuDescription` field to recipe data structure
- Add `primarySpirit` selector to Favorites editor
- Migrate existing recipes to have these fields

**Phase 2: Update Menu Editor** (1 hour)
- Use `menuDescription` instead of instructions
- Use `primarySpirit` for sorting
- Add full edit modal for all fields

**Phase 3: Add Draft/Publish Workflow** (2 hours)
- Separate draft from live menus
- Add save draft / publish buttons
- Add preview mode

**Total for Option C: ~3.5 hours**

---

## 8. Why This Matters

### **For You**:
- Recipes display correctly to guests (descriptions instead of instructions)
- Categories make sense (Limoncello in Liqueur, not Other)
- You can edit menu descriptions without going back to Favorites

### **For Guests**:
- Menu reads beautifully: "A bright, refreshing Limoncello and tonic..."
- Instead of: "Add all ingredients in a tumbler glass filled with ice..."
- Categories are correct and organized

---

## Summary

| Item | Current | Issue | Needed |
|------|---------|-------|--------|
| **Status dropdown** | Active/Unavailable/Retired | Works correctly | ✅ No change |
| **Red X button** | Removes from menu | Works correctly | ✅ No change |
| **Versions saved** | Unlimited (v1, v2, v3...) | Works correctly | ✅ No change |
| **Description field** | Uses instructions | Shows wrong text to guests | ❌ Add menuDescription |
| **Spirit categorization** | Defaults to 'other' | Pallini in wrong category | ❌ Add primarySpirit selector |
| **Edit modal** | Status only | Can't edit name/description/spirit in menu editor | ❌ Add full edit form |
| **Draft/Publish** | Publish immediately | No preview/staging | ❌ Add workflow |

---

## Ready to Proceed?

Once you confirm these explanations are clear, we can implement Option C which includes:
1. ✅ Menu description field in Favorites + Menu Editor
2. ✅ Primary spirit selector
3. ✅ Full edit modal in Menu Editor
4. ✅ Draft/Publish workflow with preview
