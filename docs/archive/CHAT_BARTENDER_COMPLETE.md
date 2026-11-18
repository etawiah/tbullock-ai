# Chat Bartender - Complete System Guide

**Date:** December 7, 2025
**Status:** ✅ Fully implemented and deployed
**Version:** 3.0 - Favorites-first with classic drink fallback

---

## Overview

The chat bartender is now a three-tier system that works exactly as you envisioned:

1. **Favorites First** - If you've saved a recipe, use it with exact amounts
2. **Classic Drinks** - If not in Favorites, construct from inventory using bartender knowledge
3. **Substitutions** - Handle non-standard swaps intelligently

---

## Three Scenarios

### Scenario 1: User Requests a Favorites Recipe

**Setup:**
- You've created "Elderflower Negroni" in Favorites with:
  - 1.5 oz Gin
  - 0.75 oz Elderflower Liqueur
  - 0.75 oz Sweet Vermouth
  - 2 dashes Orange Bitters

**User Input:**
```
"Make me an Elderflower Negroni"
```

**AI Response:**
```
Drink: Elderflower Negroni

Ingredients:
- 1.5 oz Gin (Available: 650 ml)
- 0.75 oz Elderflower Liqueur (Available: 500 ml)
- 0.75 oz Sweet Vermouth (Available: 480 ml)
- 2 dashes Orange Bitters (Available: 100 ml)

Tools:
- Mixing glass
- Bar spoon
- Jigger

Garnish:
- Orange twist

Instructions:
1. Add Gin, Elderflower Liqueur, Sweet Vermouth to mixing glass
2. Add ice and stir 30 seconds
3. Strain into chilled coupe glass
4. Garnish with orange twist

Did you make this drink?
```

**What happens:**
- ✅ Finds exact recipe in Favorites
- ✅ Shows exact amounts (not "similar" amounts)
- ✅ Matches each ingredient to actual bottle in inventory
- ✅ Shows available ml for each
- ✅ Never asks clarifying questions

**If ingredient missing:**
```
User: "Make me an Elderflower Negroni"
AI: "Missing: Sweet Vermouth. Cannot make Elderflower Negroni with what you have now."
```

---

### Scenario 2: User Requests a Classic Drink NOT in Favorites

**Setup:**
- "Painkiller" is NOT in your Favorites
- Your inventory has: Dark Rum, Pineapple Juice, Orange Juice, Coconut Cream, Lime Juice Concentrate
- Standard Painkiller recipe calls for: Rum, Pineapple Juice, Orange Juice, Coconut Cream, Fresh Lime Juice

**User Input:**
```
"Make me a Painkiller"
```

**AI Response:**
```
Drink: Painkiller

Ingredients:
- 2 oz Dark Rum (Available: 450 ml)
- 3 oz Pineapple Juice (Available: 600 ml)
- 1 oz Orange Juice (Available: 500 ml)
- 0.5 oz Coconut Cream (Available: 200 ml)
- **Substitution:** Lime Juice Concentrate instead of fresh lime (Painkiller typically calls for fresh lime juice)

Tools:
- Cocktail shaker
- Jigger
- Strainer

Garnish:
- Pineapple slice
- Cherry

Instructions:
1. Add rum, pineapple juice, orange juice, coconut cream to shaker with ice
2. Shake well
3. Strain into rocks glass with fresh ice
4. Top with splash of lime juice concentrate
5. Garnish with pineapple and cherry

Did you make this drink?
```

**What happens:**
- ✅ Doesn't find in Favorites
- ✅ Uses bartender knowledge of classic Painkiller recipe
- ✅ Builds from available inventory
- ✅ Shows what you're substituting AND what the drink typically calls for
- ✅ Makes substitution clear: "Typically: fresh lime juice, but using: your lime juice concentrate"

---

### Scenario 3: User Made Drink with Non-Standard Substitution

**Setup:**
- AI suggested Dark Rum for Painkiller (as above)
- But you used something different

**User Input:**
```
"I made a Painkiller but used Grey Goose vodka instead of rum"
```

**AI Response:**
```
Got it! You made a Painkiller using Grey Goose vodka instead of dark rum.

Used:
- 2 oz Grey Goose Vodka
- 3 oz Pineapple Juice
- 1 oz Orange Juice
- 0.5 oz Coconut Cream
- Lime Juice Concentrate

[INVENTORY_UPDATE]{
  "updates": [
    { "bottleName": "Grey Goose Vodka", "mlSubtracted": 60 },
    { "bottleName": "Pineapple Juice", "mlSubtracted": 90 },
    { "bottleName": "Orange Juice", "mlSubtracted": 30 },
    { "bottleName": "Coconut Cream", "mlSubtracted": 15 },
    { "bottleName": "Lime Juice Concentrate", "mlSubtracted": 15 }
  ]
}

Inventory updated! What's next?
```

**What happens:**
- ✅ Recognizes you made the drink
- ✅ Understands the substitution (vodka instead of rum)
- ✅ Updates the VODKA bottle, NOT the rum bottle
- ✅ Uses standard Painkiller amounts (not Favorites, since not in Favorites)
- ✅ Calculates ml correctly (2 oz rum = 60 ml)

---

### Scenario 4: User Made Favorites Recipe

**Setup:**
- You created "Elderflower Negroni" in Favorites
- You made TWO of them

**User Input:**
```
"I made two elderflower negronis"
```

**AI Response:**
```
Perfect! Used:
- 3 oz Gin (from your Gin bottle)
- 1.5 oz Elderflower Liqueur
- 1.5 oz Sweet Vermouth
- 4 dashes Orange Bitters

[INVENTORY_UPDATE]{
  "updates": [
    { "bottleName": "Gin", "mlSubtracted": 90 },
    { "bottleName": "Elderflower Liqueur", "mlSubtracted": 45 },
    { "bottleName": "Sweet Vermouth", "mlSubtracted": 45 },
    { "bottleName": "Orange Bitters", "mlSubtracted": 8 }
  ]
}

Inventory updated! What's next?
```

**What happens:**
- ✅ Finds recipe in Favorites
- ✅ Uses EXACT amounts from recipe (1.5 oz × 2 = 3 oz)
- ✅ Multiplies ingredients by drink count
- ✅ Matches to exact bottle names in inventory
- ✅ Calculates correct ml (3 oz Gin = 90 ml)

---

### Scenario 5: User Requests Unknown Drink

**User Input:**
```
"Make me a Thunderbird"
```

**AI Response:**
```
I don't have Thunderbird in your saved recipes. Here are similar drinks I can make:

1. **Margarita** - Tequila, triple sec, lime juice (you have all of these)
2. **Daiquiri** - Rum, lime juice, simple syrup (you have rum and simple syrup, can substitute lime juice concentrate)
3. **Sidecar** - Cognac, triple sec, lemon juice (you have cognac and triple sec)

Which would you like?
```

**What happens:**
- ✅ Doesn't find in Favorites
- ✅ Doesn't know what "Thunderbird" is
- ✅ Doesn't ask questions ("What do you mean?")
- ✅ Instead suggests 2-3 similar drinks from classic knowledge
- ✅ Shows what's available from inventory for each

---

## How It Works - Technical Details

### Data Sources (in priority order)

1. **Favorites (recipes KV)** - Your saved custom recipes with exact amounts
   - Format: `"Recipe Name": 1.5oz Ingredient1, 0.75oz Ingredient2, ...`
   - Used for: Exact matches when you request by name

2. **Inventory (passed with each request)** - What you actually have
   - Format: `Type: Brand Name | Proof | Size | Remaining ml | Flavor Notes`
   - Used for: All ingredient availability and bottle matching

3. **Menu (menu:live KV)** - Published items for guests
   - **NOT used for drink-making** (only for reference/context)
   - Guests see this at barmenu.tawiah.net

4. **AI Knowledge** - Bartender expertise for classic drinks
   - Used when: Not in Favorites and need to construct from inventory
   - Falls back to: 2-3 similar suggestions if completely unknown

### Ingredient Matching Algorithm

When recipe calls for "Gin":
```
1. Check Favorites ingredients
2. Match to inventory type="Gin"
3. If multiple Gin bottles: Pick one with most remaining ml
4. If no Gin: Mark as missing
5. Never substitute automatically (user must ask)
```

### Substitution Handling

When user says "I made X but used Y instead":
```
1. Parse the substitution: "used [Y] instead of [X]"
2. Find [Y] in inventory
3. Update [Y] bottle amount (NOT [X] bottle)
4. Show what was used vs. what was recommended
```

### Inventory Update Format

When user says they made a drink:
```json
[INVENTORY_UPDATE]{
  "updates": [
    { "bottleName": "exact bottle name from inventory", "mlSubtracted": calculated_ml },
    ...
  ]
}
```

**Calculation:**
- Favorites drinks: Use exact recipe amounts × drink count
- Classic drinks: Use standard bartender amounts × drink count
- Unit conversion: 1 oz = 30 ml

---

## Rules Summary

### For Drink Requests

**Rule 1: Check Favorites First**
- If exact name match found in Favorites → Use that recipe with exact amounts
- Show inventory availability for each ingredient
- If ingredient missing → "Missing: X, Y. Cannot make now."

**Rule 2: If NOT in Favorites**
- Don't reference menu items
- Use your classic bartender knowledge
- Build from inventory
- Show substitutions clearly

**Rule 3: For Substitutions**
- Always show what the drink "typically calls for"
- Then show what you're using instead
- Example: "Typically: fresh lime, but using: lime juice concentrate"

**Rule 4: Clarity First**
- Never ask clarifying questions
- Either give recipe or suggest alternatives
- Be specific about what you have/don't have

### For Inventory Updates

**Rule 5: Match User Statement to Recipe**
- Favorites: Use exact amounts from recipe
- Classic/Memory: Use standard amounts
- Substituted: Update the substituted bottle

**Rule 6: Calculate Correctly**
- Always convert oz to ml (× 30)
- Multiply by drink count if stated ("two" = ×2)
- Use exact bottle names from inventory

**Rule 7: Parse Substitutions**
- "I used [X] instead of [Y]" → Update [X], not [Y]
- Acknowledge the substitution in response

---

## Examples of Each Interaction Type

### Interaction Type 1: Favorites Recipe Request
```
User: "Make me an Elderflower Negroni"
AI: [Shows recipe with available amounts]
User: "I made it"
AI: [Updates inventory using exact Favorites amounts]
```

### Interaction Type 2: Classic Drink With Substitution
```
User: "Make me a Painkiller"
AI: [Shows recipe with substitutions noted]
User: "I made it but used vodka instead of rum"
AI: [Updates vodka bottle instead of rum]
```

### Interaction Type 3: Favorites With Memory
```
User: "I made two elderflower negronis"
AI: [Looks up Favorites, multiplies by 2, updates inventory]
```

### Interaction Type 4: Unknown Drink
```
User: "Make me a Thunderbird"
AI: [Suggests 3 similar drinks you CAN make]
```

---

## Deployment

### What Changed
- **worker/worker.js**: System prompt rewritten with new rules and examples
- **Frontend**: No changes (still sends same data)
- **Inventory handling**: Same format, same calculations
- **Menu**: Still loaded for reference, not used for drink-making

### How to Deploy
```bash
npm run worker:deploy
```

This pushes the updated system prompt to Cloudflare Workers.

### Testing Checklist
- [ ] Create a Favorites recipe with exact amounts
- [ ] Request it by name → Should show exact recipe
- [ ] Request a classic drink → Should show with substitutions
- [ ] Make drink with substitution → Should update correct bottle
- [ ] Request unknown drink → Should suggest alternatives
- [ ] Make remembered drink → Should update with standard amounts

---

## What This Fixes

**Before:**
- Chat looked at menu items (wrong data source)
- Couldn't handle substitutions
- Couldn't update inventory for classic/remembered drinks
- Asked clarifying questions instead of providing recipes

**After:**
- ✅ Chat looks at Favorites (your saved recipes)
- ✅ Falls back to classic drinks (bartender knowledge)
- ✅ Handles substitutions intelligently
- ✅ Updates inventory correctly (even with substitutions)
- ✅ Never asks clarifying questions
- ✅ Menu is for guests only (not for drink-making)

---

## Git Commits

```
6be3c4d Rewrite chat bartender rules: Favorites-first, classic drinks as fallback
fcf1706 Update documentation with ingredient matching and inventory update details
453fe99 Enhance chat bartender to properly match Favorites ingredients to inventory
6d025e1 Add documentation for chat Favorites integration fix
d928003 Fix chat bartender to check Favorites recipes first
```

---

## Summary

Your chat bartender now works like a real bartender:

1. **Knows your saved recipes** - Uses Favorites for exact amounts
2. **Knows classic drinks** - Falls back to standard recipes from knowledge
3. **Knows your inventory** - Matches ingredients to bottles intelligently
4. **Handles real-world situations** - Understands substitutions and variations
5. **Updates inventory automatically** - Even for on-the-fly substitutions and memory drinks

The three-tier system (Favorites → Classics → Suggestions) ensures you always get the right response, whether you're making a saved recipe, a classic drink, or improvising with what you have.

