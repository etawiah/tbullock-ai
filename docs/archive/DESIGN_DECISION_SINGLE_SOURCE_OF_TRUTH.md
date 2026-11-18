# Design Decision: Single Source of Truth for Menu Descriptions

## The Problem You Identified

If we allow editing menu descriptions in BOTH places:
1. **Favorites Editor** (when creating recipe)
2. **Menu Editor** (when managing menu)

...we create **two sources of truth** for the same data:

```
Favorites: "Pallini & Tonic"
└── menuDescription: "A bright, refreshing Limoncello and tonic..."

Menu: "Pallini & Tonic"
└── description: "A bright, refreshing Limoncello and tonic..."
```

If you edit the description in Menu Editor, the Favorites version doesn't update. If you edit it in Favorites, the menu version doesn't update. **They can diverge.**

---

## Why This Is Bad

**Scenario**: You edit "Pallini & Tonic" description in Menu Editor
- Description on menu changes ✅
- Description in Favorites stays old ❌
- If you delete the menu item and re-add it later, old description comes back ❌
- Confusing: "Why did it change back?"

**Scenario**: You edit the recipe in Favorites
- Favorites description updates ✅
- Menu doesn't automatically update ❌
- You have to manually re-edit the menu
- Defeats the purpose of having it in the recipe

---

## The Correct Design: Single Source of Truth

There are two valid approaches:

### **Option 1: Description Lives in Favorites Only** (Recommended)

**Data Structure**:
```
Recipe (Favorites)
├── name: "Pallini & Tonic"
├── menuDescription: "A bright, refreshing..." ← ONLY HERE
├── primarySpirit: "liqueur"
├── instructions: "Add all..."
└── ...

Menu Item (derived from recipe)
├── id: "menu-1762711843170"
├── favoriteId: 1762711843170
├── name: "Pallini & Tonic" (pulled from recipe)
├── description: "A bright, refreshing..." (pulled from recipe)
├── primarySpirit: "liqueur" (pulled from recipe)
└── status: "active"
```

**How it works**:
1. You create/edit recipe in Favorites → set menuDescription and primarySpirit there
2. When you add recipe to menu, it pulls those fields from the recipe
3. Menu Editor shows these fields but they're **read-only** (displays where they come from)
4. To edit, you go back to Favorites editor
5. Menu reflects the updated values automatically

**UI in Menu Editor**:
```
Recipe: Pallini & Tonic
├── Description (from Favorites): "A bright, refreshing..." [Click to edit in Favorites]
├── Spirit: Liqueur (from Favorites)
├── Status: Active ← EDITABLE HERE
└── [Remove] [Edit in Favorites]
```

**Advantages**:
- ✅ Single source of truth (Favorites)
- ✅ No divergence possible
- ✅ Edit once, everywhere updates
- ✅ Clear where data comes from
- ✅ Simpler data model

**Disadvantages**:
- ❌ Can't edit menu description without going to Favorites
- ❌ Slightly more navigation

---

### **Option 2: Description Lives in Menu Only**

**Data Structure**:
```
Recipe (Favorites)
├── name: "Pallini & Tonic"
├── primarySpirit: "liqueur" ← ONLY FOR SORTING/CATEGORIZATION
├── instructions: "Add all..."
└── NO menuDescription

Menu Item
├── id: "menu-1762711843170"
├── favoriteId: 1762711843170
├── name: "Pallini & Tonic"
├── description: "A bright, refreshing..." ← ONLY HERE
├── primarySpirit: "liqueur"
└── status: "active"
```

**How it works**:
1. You create recipe in Favorites (only set primarySpirit, no menuDescription)
2. When you add to menu, you're prompted to enter the menu description
3. Menu Editor allows editing description/spirit/name only for this menu item
4. If you delete and re-add the same recipe, you set description again

**UI Flow**:
```
Favorites Editor: Create recipe
├── name, instructions, glass, garnish, tags
├── primarySpirit: [Liqueur] ← For default categorization
└── (NO menu description field)

Add to Menu: Dialog pops up
├── name: "Pallini & Tonic" (pre-filled from recipe)
├── description: [Enter menu description here]
├── primarySpirit: [Liqueur] (pre-filled from recipe)
└── [Add to Menu]

Menu Editor: Manage menu
├── Name: [Editable]
├── Description: [Editable]
├── Spirit: [Editable]
├── Status: [Active/Unavailable/Retired]
└── [Remove]
```

**Advantages**:
- ✅ Can edit menu description directly in Menu Editor
- ✅ Each menu item can have custom description (if same recipe used twice differently)
- ✅ Recipes stay simple (just the basic recipe)

**Disadvantages**:
- ❌ Description only exists in menu, not recipe
- ❌ If you delete menu item, description is lost
- ❌ Two places where primarySpirit could be set (confusing)
- ❌ Slight duplication (name and spirit in both places)

---

## Which Approach for Your Use Case?

### Your actual use case:
- You: ~2 people
- Occasional edits
- One menu (not multiple versions of same drink)
- Want simplicity and no confusion

### Recommendation: **Option 1 - Single Source in Favorites**

**Why**:
1. **Simplicity**: Edit the recipe once, everywhere updates
2. **No divergence**: Impossible to have conflicting descriptions
3. **Clear intent**: "Drink descriptions live in Favorites"
4. **Your use case**: You're not managing multiple menu variants of the same drink
5. **Maintenance**: Easier to understand "where do I edit this?"

**Trade-off you're accepting**:
- You navigate to Favorites to edit menu descriptions (one extra click)
- But you NEVER have two versions out of sync

---

## Implementation Plan for Option 1

### Step 1: Add fields to Recipe
```javascript
Recipe {
  id: 1762711843170,
  name: "Pallini & Tonic",
  menuDescription: "A bright, refreshing Limoncello and tonic with a citrus twist", // NEW
  primarySpirit: "liqueur", // NEW
  instructions: "...",
  glass: "Tumbler",
  garnish: "lemon slice",
  tags: ""
}
```

### Step 2: Update Favorites Editor
- Add "Menu Description" text field when creating/editing recipe
- Add "Primary Spirit" dropdown selector
- Save both to the recipe

### Step 3: Update Menu Editor
- When adding recipe, pull `menuDescription` and `primarySpirit` from recipe
- Display as read-only in menu (show they come from recipe)
- Option: "Edit in Favorites" link to go back and edit there

### Step 4: Update Menu System
- When creating menu item from recipe, always pull these fields from recipe
- If recipe changes, menu reflects it (no manual sync needed)

### Step 5: Migrate Existing Recipes
- For your 12 original recipes: set appropriate menuDescription (you have them in barmenu HTML)
- For Pallini & Tonic, Pallini Spritz, Painkiller: set menuDescription and primarySpirit

---

## Implementation Plan for Option C with Option 1

**Total work**:
1. Add menuDescription + primarySpirit fields to Favorites editor (1 hour)
2. Update Menu Editor to pull from recipe (30 min)
3. Full edit modal + Draft/Publish (2 hours)
4. Migrate existing recipes (30 min)

**Total: ~4 hours** (slightly more than original 3.5 due to migration)

---

## Example: How It Works in Practice

**Day 1: Create Recipe**
```
You: Click Favorites → Create New Recipe
Form:
  Name: "Pallini & Tonic"
  Primary Spirit: [Liqueur]
  Menu Description: "A bright, refreshing Limoncello and tonic with a citrus twist"
  Instructions: "Add all ingredients..."
  Glass: "Tumbler"
  Garnish: "lemon slice"
Click Save
```

**Day 2: Add to Menu**
```
You: Go to Menu Editor → Click "+ Add" on "Pallini & Tonic"
Menu automatically shows:
  Name: Pallini & Tonic
  Description: "A bright, refreshing..." (from Favorites)
  Spirit: Liqueur (from Favorites)
  Status: Active
Guests see: Under "Liqueur" section → "Pallini & Tonic" → "A bright, refreshing..."
```

**Day 15: Want to update description**
```
You: Go to Menu Editor
See: "Description (from Favorites): A bright, refreshing..."
Click: "Edit in Favorites" link
Updated Menu immediately reflects change
```

---

## Conclusion

**Single Source of Truth in Favorites is the right design because**:
1. No possibility of divergence
2. Simpler mental model (edit recipe once)
3. Works perfectly for your use case (one menu, occasional edits)
4. Easier to maintain and understand

**Accept the trade-off**:
- One extra click to navigate to Favorites when editing descriptions
- But guaranteed consistency everywhere

---

Does this make sense? Should we proceed with **Option 1: Single Source in Favorites**?
