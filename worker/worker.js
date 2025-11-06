// Cloudflare Worker - Handles AI requests and inventory management
// Frontend (bartender.tawiah.net) is protected by Cloudflare Access
// Worker endpoints trust authenticated requests from the protected frontend

const flavorNotesCache = new Map();

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

      // Route: Save inventory
      // Frontend is protected by Cloudflare Access, so we trust authenticated requests
      if (url.pathname === '/api/inventory' && request.method === 'POST') {
        const { inventory } = await request.json();
        await env.BARTENDER_KV.put('inventory', JSON.stringify(inventory));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Enrich inventory with flavor notes
      if (url.pathname === '/api/enrich-inventory' && request.method === 'POST') {
        const { inventory } = await request.json();

        if (!Array.isArray(inventory)) {
          return new Response(JSON.stringify({ inventory: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Attach client indexes so we can re-map confidently
        const indexedInventory = inventory.map((item, index) => ({ ...item, __index: index }));

        const itemsThatNeedNotes = indexedInventory.filter(item => {
          const hasName = item.name && item.name.trim().length > 0;
          const hasNotes = item.flavorNotes && item.flavorNotes.trim().length > 0;
          return hasName && !hasNotes;
        });

        if (itemsThatNeedNotes.length === 0) {
          return new Response(JSON.stringify({ inventory }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Only enrich up to 5 items per request to stay inside the free tier comfortably
        const enrichBatch = itemsThatNeedNotes.slice(0, 5);

        const enrichedItems = [];

        for (const item of enrichBatch) {
          try {
            const keyParts = [
              (item.type || '').toLowerCase(),
              (item.name || '').toLowerCase(),
              item.proof || '',
              item.bottleSizeMl || ''
            ];
            const cacheKey = keyParts.join('|');

            let flavorNotes = flavorNotesCache.get(cacheKey);

            if (!flavorNotes) {
              const friendlyName = item.name || 'this spirit';
              const friendlyType = item.type || 'spirit';
              const proofText = item.proof ? `${item.proof} proof` : 'proof unspecified';
              const bottleText = item.bottleSizeMl ? `${item.bottleSizeMl} ml bottle` : 'bottle size unspecified';

              const prompt = `Write two concise sentences (max 45 words total) describing the flavor profile for ${friendlyName}, a ${friendlyType} (${proofText}, ${bottleText}). Mention aroma, palate, and finish, and optionally suggest a classic cocktail style it shines in. No marketing fluff or bullet points.`;

              const geminiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-001:generateContent?key=${env.GEMINI_API_KEY}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{
                      role: 'user',
                      parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                      temperature: 0.6,
                      maxOutputTokens: 160,
                    }
                  })
                }
              );

              if (!geminiResponse.ok) {
                throw new Error(`Gemini returned ${geminiResponse.status}`);
              }

              const geminiData = await geminiResponse.json();
              const candidate = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              flavorNotes = (candidate || '').trim();

              if (flavorNotes) {
                // Keep cache from growing indefinitely
                if (flavorNotesCache.size > 200) {
                  flavorNotesCache.clear();
                }
                flavorNotesCache.set(cacheKey, flavorNotes);
              }
            }

            if (flavorNotes) {
              enrichedItems.push({ index: item.__index, flavorNotes });
            }
          } catch (error) {
            console.error(`Failed to enrich ${item.name || 'item'}:`, error);
          }
        }

        const enrichedInventory = indexedInventory.map(item => {
          const enriched = enrichedItems.find(e => e.index === item.__index);
          if (enriched) {
            const { __index, ...rest } = item;
            return { ...rest, flavorNotes: enriched.flavorNotes };
          }

          const { __index, ...rest } = item;
          return rest;
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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-001:generateContent?key=${env.GEMINI_API_KEY}`,
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
