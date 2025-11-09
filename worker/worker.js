// Cloudflare Worker - Handles AI requests and inventory management
// Frontend (bartender.tawiah.net) is protected by Cloudflare Access
// Worker endpoints trust authenticated requests from the protected frontend

const flavorNotesCache = new Map();

async function callGemini(payload, env) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Gemini error ${response.status}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }
  return await response.json();
}

async function callGroq(messages, env, options = {}) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || 'llama-3-70b-8192',
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 400,
      messages
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Groq error ${response.status}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }
  return await response.json();
}

function extractGeminiText(data) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text.trim() : '';
}

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
        const forceProvider = url.searchParams.get('provider') || 'auto';
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

              const shouldUseGroqFirst = forceProvider.toLowerCase() === 'groq';

              const tryGemini = async () => {
                const geminiPayload = {
                  contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                  }],
                  generationConfig: {
                    temperature: 0.6,
                    maxOutputTokens: 160,
                  }
                };

                const geminiData = await callGemini(geminiPayload, env);
                const text = extractGeminiText(geminiData);
                if (!text) {
                  throw new Error('Gemini returned empty flavor notes');
                }
                return text;
              };

              const tryGroq = async () => {
                const groqData = await callGroq([
                  { role: 'system', content: 'You are a spirits sommelier who writes short tasting notes.' },
                  { role: 'user', content: prompt }
                ], env, { temperature: 0.6, maxTokens: 160 });
                const text = (groqData?.choices?.[0]?.message?.content || '').trim();
                if (!text) {
                  throw new Error('Groq returned empty flavor notes');
                }
                return text;
              };

              const runProviders = async () => {
                if (shouldUseGroqFirst) {
                  try {
                    return await tryGroq();
                  } catch (groqError) {
                    console.error(`Groq (forced) flavor note error for ${friendlyName}:`, groqError.status, groqError.body || groqError.message);
                    throw groqError;
                  }
                }

                try {
                  return await tryGemini();
                } catch (geminiError) {
                  console.error(`Gemini flavor note error for ${friendlyName}:`, geminiError.status, geminiError.body || geminiError.message);
                  if (geminiError.status === 429) {
                    console.error('Gemini quota exceeded – using Groq fallback');
                  }
                  return await tryGroq();
                }
              };

              flavorNotes = await runProviders();

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

      // Route: Get custom recipes
      if (url.pathname === '/api/recipes' && request.method === 'GET') {
        const recipes = await env.BARTENDER_KV.get('recipes', { type: 'json' }) || [];
        return new Response(JSON.stringify({ recipes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Save custom recipes
      if (url.pathname === '/api/recipes' && request.method === 'POST') {
        const { recipes } = await request.json();
        await env.BARTENDER_KV.put('recipes', JSON.stringify(recipes));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Get shopping list
      if (url.pathname === '/api/shopping' && request.method === 'GET') {
        const shopping = await env.BARTENDER_KV.get('shopping', { type: 'json' }) || [];
        return new Response(JSON.stringify({ shopping }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Save shopping list
      if (url.pathname === '/api/shopping' && request.method === 'POST') {
        const { shopping } = await request.json();
        await env.BARTENDER_KV.put('shopping', JSON.stringify(shopping));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Get favorites
      if (url.pathname === '/api/favorites' && request.method === 'GET') {
        const favorites = await env.BARTENDER_KV.get('favorites', { type: 'json' }) || [];
        return new Response(JSON.stringify({ favorites }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Save favorites
      if (url.pathname === '/api/favorites' && request.method === 'POST') {
        const { favorites } = await request.json();
        await env.BARTENDER_KV.put('favorites', JSON.stringify(favorites));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Get chat history
      if (url.pathname === '/api/chat-history' && request.method === 'GET') {
        const chatHistory = await env.BARTENDER_KV.get('chatHistory', { type: 'json' }) || [];
        return new Response(JSON.stringify({ chatHistory }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Save chat history
      if (url.pathname === '/api/chat-history' && request.method === 'POST') {
        const { chatHistory } = await request.json();
        await env.BARTENDER_KV.put('chatHistory', JSON.stringify(chatHistory));
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Route: Chat with AI bartender
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        try {
          const { message, inventory, chatHistory } = await request.json();

        // Build system prompt with bartender expertise
        const systemPrompt = `You are a bartender AI assistant. When asked for a drink, your job is to:
1. Find the recipe and provide it immediately using the customer's available ingredients
2. Tell them exactly how to make it with what they have
3. If you need to substitute ingredients, state the substitutions clearly

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

NON-NEGOTIABLE RULES:
1. When asked for a drink by name, IMMEDIATELY provide the recipe. DO NOT ask questions about what they mean or want more context. Just give the recipe.
2. If you don't know a specific drink name, DO NOT ask clarifying questions. Instead, IMMEDIATELY suggest 2-3 similar classic drinks you can make from their inventory.
3. If they're missing key ingredients, state what's missing and suggest a close substitute using what they have OR suggest a different drink entirely.
4. NEVER have conversations about beauty, aesthetics, or philosophy. Just give recipes.
5. Keep responses UNDER 150 words unless providing a recipe.
6. ALWAYS list what tools and glassware they need from their available inventory.
7. After giving a recipe, ask if they made it so you can update inventory.

MANDATORY RESPONSE FORMAT:
When user asks for a drink, respond in EXACTLY this format:

Drink: [Name]

Ingredients:
- [amount] [ingredient] (Available: [X ml])
[If substitution needed: **Substitution:** Using [X] instead of [Y]]

Tools:
- [list from inventory]

Garnish:
- [garnish items from inventory]

Instructions:
1. [step by step]

Did you make this drink? Let me know so I can update your inventory!

WRONG - NEVER DO THIS:
User: "Make me a beautiful"
Bad Response: "Ah, 'beautiful'! I love that. A truly beautiful drink isn't just about taste..."
Bad Response: "What kind of beauty are you envisioning? Visually stunning? Aromatic?"
Bad Response: "Could you tell me more about the Beautiful you're thinking of?"

CORRECT - ALWAYS DO THIS:
User: "Make me a beautiful"
Good Response: "I don't have a recipe for 'Beautiful'. Here are similar elegant cocktails I can make:

1. **Cosmopolitan** - vodka, triple sec, cranberry, lime
2. **Aviation** - gin, maraschino, lemon, crème de violette
3. **French 75** - gin, lemon, simple syrup, champagne

Which would you like?"

User: "Make me an Old Fashioned"
Good Response: "Drink: Old Fashioned

Ingredients:
- 2 oz Uncle Nearest 1856 (Available: 750 ml)
- 0.25 oz Simple Syrup (Available: 125 ml)
- 2-3 dashes Angostura Orange Bitters (Available: 100 ml)

Tools:
- Mixing glass
- Bar spoon
- Jigger

Garnish:
- Orange peel twist
- Maraschino cherry

Instructions:
1. Add simple syrup and bitters to mixing glass
2. Add whiskey and ice
3. Stir 30 seconds
4. Strain into glass with fresh ice
5. Express orange peel over drink and add cherry

Did you make this drink?"
`;

        const recentHistory = chatHistory.slice(-6);
        const geminiContents = [
          {
            role: 'user',
            parts: [{ text: systemPrompt }]
          },
          ...recentHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          })),
          {
            role: 'user',
            parts: [{ text: message }]
          }
        ];

        const groqMessages = [
          { role: 'system', content: systemPrompt },
          ...recentHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          })),
          { role: 'user', content: message }
        ];

        const geminiPayload = {
          contents: geminiContents,
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        };

        let aiResponse = '';

        try {
          const geminiData = await callGemini(geminiPayload, env);
          aiResponse = extractGeminiText(geminiData);
          if (!aiResponse) {
            throw new Error('Gemini returned empty response');
          }
        } catch (geminiError) {
          console.error('Gemini chat error:', geminiError.status, geminiError.body || geminiError.message);
          if (geminiError.status === 429) {
            console.error('Gemini quota exceeded – using Groq fallback');
          }
          try {
            const groqData = await callGroq(groqMessages, env, { temperature: 0.3, maxTokens: 1024 });
            aiResponse = (groqData?.choices?.[0]?.message?.content || '').trim();
          } catch (groqError) {
            console.error('Groq chat error:', groqError.status, groqError.body || groqError.message);
            return new Response(
              JSON.stringify({ error: 'AI service unavailable. Please try again.' }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }
        }

        if (!aiResponse) {
          return new Response(
            JSON.stringify({ error: 'AI service unavailable. Please try again.' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

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
        } catch (chatError) {
          console.error('Chat endpoint error:', chatError);
          console.error('Chat error details:', {
            message: chatError.message,
            stack: chatError.stack,
            name: chatError.name
          });
          return new Response(
            JSON.stringify({
              error: 'Failed to process chat request. The AI service might be temporarily unavailable. Please try again.',
              details: chatError.message
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
      }

      return new Response('Not Found', { 
        status: 404,
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker Error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        url: url.pathname
      });
      return new Response(
        JSON.stringify({
          error: 'An unexpected error occurred. Please try again or rephrase your request.',
          details: error.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }
};
