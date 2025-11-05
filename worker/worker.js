// Cloudflare Worker - Handles AI requests and inventory management
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route: Get inventory
      if (url.pathname === '/api/inventory' && request.method === 'GET') {
        const inventory = await env.BARTENDER_KV.get('inventory', { type: 'json' }) || [];
        return new Response(JSON.stringify({ inventory }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Save inventory (requires PIN)
      if (url.pathname === '/api/inventory' && request.method === 'POST') {
        // Check for PIN in header
        const providedPin = request.headers.get('x-inventory-pin');
        const requiredPin = env.INVENTORY_WRITE_PIN;

        if (!providedPin || !requiredPin || providedPin !== requiredPin) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Invalid or missing PIN' }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const { inventory } = await request.json();
        await env.BARTENDER_KV.put('inventory', JSON.stringify(inventory));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Enrich inventory with flavor notes
      if (url.pathname === '/api/enrich-inventory' && request.method === 'POST') {
        const { inventory } = await request.json();

        // Find items that need enrichment (missing flavor notes)
        const itemsToEnrich = inventory.filter(item =>
          item.name && !item.flavorNotes && item.type !== 'Other'
        );

        // Only enrich up to 5 items at a time to avoid rate limits
        const enrichBatch = itemsToEnrich.slice(0, 5);

        // Enrich each item with Gemini API
        const enrichedItems = await Promise.all(
          enrichBatch.map(async (item) => {
            try {
              const prompt = `Provide a brief (2-3 sentence) flavor profile for "${item.name}" ${item.type}. Focus on tasting notes, aroma, and best uses in cocktails. Be concise and specific.`;

              const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${env.GEMINI_API_KEY}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{
                      role: 'user',
                      parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                      temperature: 0.7,
                      maxOutputTokens: 256,
                    }
                  })
                }
              );

              if (geminiResponse.ok) {
                const geminiData = await geminiResponse.json();
                const flavorNotes = geminiData.candidates[0].content.parts[0].text.trim();
                return { ...item, flavorNotes };
              }
            } catch (error) {
              console.error(`Failed to enrich ${item.name}:`, error);
            }
            return item;
          })
        );

        // Merge enriched items back into inventory
        const enrichedInventory = inventory.map(item => {
          const enriched = enrichedItems.find(e => e.name === item.name);
          return enriched || item;
        });

        return new Response(JSON.stringify({ inventory: enrichedInventory }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Chat with AI bartender
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        const { message, inventory, chatHistory } = await request.json();

        // Build system prompt with bartender expertise
        const systemPrompt = `You are an expert bartender and mixologist. You help users create drinks, suggest recipes, and manage their home bar inventory.

CURRENT BAR INVENTORY:
${inventory.length > 0
  ? inventory.map(item => {
      const typeLabel = item.type ? `${item.type}: ` : ''
      const nameLabel = item.name || 'Unnamed bottle'
      const proofLabel = item.proof ? `${item.proof} proof` : 'proof unknown'
      const sizeLabel = item.bottleSizeMl ? `${item.bottleSizeMl} ml bottle` : 'bottle size unknown'
      const remainingLabel = item.amountRemaining ? `${item.amountRemaining} ml remaining` : 'remaining amount unknown'
      const notesLabel = item.flavorNotes ? `Notes: ${item.flavorNotes}` : ''
      return `- ${typeLabel}${nameLabel} | ${proofLabel} | ${sizeLabel} | ${remainingLabel}${notesLabel ? ` | ${notesLabel}` : ''}`
    }).join('\n')
  : 'No items in inventory'}

INSTRUCTIONS:
1. When suggesting drinks, ALWAYS cross-reference Amount Remaining (ml) and highlight if an ingredient is low or missing.
2. Include Tools and Garnishes in suggestions - mention specific tools/garnishes they have or recommend ones to get.
3. If a recipe uses items from the bar, calculate whether the remaining ml covers the recipe and call out any shortages.
4. After giving a recipe, ALWAYS ask: "Did you make this drink? Let me know so I can update your inventory!"
5. When user confirms they made a drink (e.g., "yes", "I made 2", "yes but used pineapple instead of OJ"):
   - Calculate ingredient amounts used (multiply by number of servings if specified)
   - Account for any substitutions they mention
   - Respond with: "Great! I'll update your inventory:"
   - Then add a special marker: [INVENTORY_UPDATE] followed by JSON with format:
     [INVENTORY_UPDATE]{"updates":[{"name":"Whiskey","subtract":60},{"name":"Vermouth","subtract":30}]}
6. Provide exact measurements and clear instructions.
7. For batch recipes (e.g., "for 4 people"), scale ingredients proportionally.
8. Suggest garnishes and tools from their inventory when possible.

Example format for drink recipes:
Drink: [Drink Name]
Ingredients:
- X oz [ingredient] (Available: Y ml)
Tools: [mention tools they have or need]
Garnish: [mention garnishes they have or suggest]

Instructions:
1. Step by step
2. Clear method

Glass: [type]

Did you make this drink? Let me know so I can update your inventory!
`;

        // Build conversation history for context
        const conversationHistory = chatHistory.slice(-6).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));

        // Add current message
        conversationHistory.push({
          role: 'user',
          parts: [{ text: message }]
        });

        // Call Gemini API
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: systemPrompt }]
                },
                ...conversationHistory
              ],
              generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
              }
            })
          }
        );

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error('Gemini API Error:', errorText);
          return new Response(
            JSON.stringify({ error: 'AI service unavailable. Please check your API key.' }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const geminiData = await geminiResponse.json();
        let aiResponse = geminiData.candidates[0].content.parts[0].text;

        // Check if AI is indicating inventory should be updated
        let updatedInventory = null;
        const updateMarker = '[INVENTORY_UPDATE]';

        if (aiResponse.includes(updateMarker)) {
          try {
            // Extract the inventory update JSON
            const markerIndex = aiResponse.indexOf(updateMarker);
            const jsonStart = markerIndex + updateMarker.length;
            const jsonEnd = aiResponse.indexOf('}', jsonStart) + 1;
            const updateJson = aiResponse.substring(jsonStart, jsonEnd);
            const updateData = JSON.parse(updateJson);

            // Remove the marker and JSON from the user-facing response
            aiResponse = aiResponse.substring(0, markerIndex) + aiResponse.substring(jsonEnd);

            // Apply updates to inventory
            updatedInventory = inventory.map(item => {
              const update = updateData.updates.find(u =>
                item.name.toLowerCase().includes(u.name.toLowerCase()) ||
                u.name.toLowerCase().includes(item.name.toLowerCase())
              );

              if (update && update.subtract) {
                const currentAmount = parseFloat(item.amountRemaining) || 0;
                const newAmount = Math.max(0, currentAmount - update.subtract);
                return { ...item, amountRemaining: String(newAmount) };
              }

              return item;
            });

            // Save updated inventory to KV
            if (updatedInventory) {
              await env.BARTENDER_KV.put('inventory', JSON.stringify(updatedInventory));
            }
          } catch (error) {
            console.error('Error parsing inventory update:', error);
            // If parsing fails, just continue without updating
          }
        }

        return new Response(JSON.stringify({
          response: aiResponse.trim(),
          updatedInventory: updatedInventory
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }
};
