// Cloudflare Worker - Handles AI requests and inventory management
// Frontend (bartender.tawiah.net) is protected by Cloudflare Access
// Worker endpoints trust authenticated requests from the protected frontend

const flavorNotesCache = new Map();

const sanitizeSecret = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '');
};

const hasGeminiKey = (env) => Boolean(sanitizeSecret(env.GEMINI_API_KEY));
const hasGroqKey = (env) => Boolean(sanitizeSecret(env.GROQ_API_KEY));

const MAX_INVENTORY_ITEMS = 60;
const MAX_INVENTORY_CHARS = 6000;
const MAX_NOTES_LENGTH = 160;

const formatProviderError = (error) => {
  if (!error) return 'Unknown error';
  const status = typeof error.status !== 'undefined' ? `status ${error.status}` : '';
  if (error.body) return `${status} ${error.body}`.trim();
  if (error.message) return `${status} ${error.message}`.trim();
  return status || 'Unknown error';
};

const cleanText = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const formatInventoryForPrompt = (inventory = []) => {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return 'No items in inventory';
  }

  const trimmedItems = inventory.slice(0, MAX_INVENTORY_ITEMS);
  const inventoryLines = trimmedItems.map((item) => {
    const typeLabel = item.type ? `${cleanText(item.type)}: ` : '';
    const nameLabel = cleanText(item.name || 'Unnamed bottle');
    const brandLabel = item.brand ? `${cleanText(item.brand)} ` : '';
    const proofLabel = item.proof ? `${cleanText(item.proof)} proof` : 'proof unknown';
    const sizeLabel = item.bottleSizeMl ? `${cleanText(item.bottleSizeMl)} ml` : 'size unknown';
    const remainingLabel = item.amountRemaining ? `${cleanText(item.amountRemaining)} ml remaining` : 'remaining amount unknown';
    const notesLabel = item.flavorNotes
      ? `Notes: ${cleanText(item.flavorNotes).slice(0, MAX_NOTES_LENGTH)}`
      : '';

    return `- ${typeLabel}${brandLabel}${nameLabel} | ${proofLabel} | ${sizeLabel} | ${remainingLabel}${notesLabel ? ` | ${notesLabel}` : ''}`;
  }).join('\\n');

  let text = inventoryLines;
  if (text.length > MAX_INVENTORY_CHARS) {
    text = `${text.slice(0, MAX_INVENTORY_CHARS)}...`;
  }

  const omittedCount = Math.max(0, inventory.length - trimmedItems.length);
  if (omittedCount > 0) {
    text += `\\n...and ${omittedCount} more items not shown`;
  }

  return text;
};

const getGroqModel = (env, hint = 'instant') => {
  const instantDefault = sanitizeSecret(env.GROQ_MODEL) || 'llama-3.1-8b-instant';
  const versatileDefault = sanitizeSecret(env.GROQ_MODEL_VERSATILE) || instantDefault;
  if (hint === 'versatile' && versatileDefault) {
    return versatileDefault;
  }
  return instantDefault;
};

const shouldUseVersatileChat = (message = '', chatHistory = []) => {
  const combined = [message, ...chatHistory.slice(-2).map(entry => entry?.content || '')]
    .join(' ')
    .toLowerCase();

  const heavyKeywords = [
    'menu', 'pairing', 'pairings', 'substitution', 'substitute', 'swap',
    'alternative', 'cost', 'pricing', 'per drink', 'calorie', 'calories',
    'nutrition', 'batch', 'scaling', 'scale', 'plan', 'planning', 'regional',
    'style', 'theme', 'zero-proof', 'mocktail', 'family', 'json', 'schema',
    'table', 'shopping list', 'inventory update', 'detailed steps', 'constraints'
  ];

  const quickKeywords = [
    'glassware', 'convert', 'conversion', 'abv', 'math', 'falernum',
    'what to do with', 'autocomplete', 'quick', 'simple', 'fast'
  ];

  const hasHeavyKeyword = heavyKeywords.some(keyword => combined.includes(keyword));
  const hasQuickKeyword = quickKeywords.some(keyword => combined.includes(keyword));
  const isLongPrompt = combined.length > 600 || (message && message.split(/\s+/).length > 120);

  if (hasHeavyKeyword || isLongPrompt) return true;
  if (hasQuickKeyword) return false;
  return false;
};

async function callGemini(payload, env) {
  const apiKey = sanitizeSecret(env.GEMINI_API_KEY);
  if (!apiKey) {
    const error = new Error('Gemini API key not configured');
    error.status = 401;
    throw error;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
  const apiKey = sanitizeSecret(env.GROQ_API_KEY);
  if (!apiKey) {
    const error = new Error('Groq API key not configured');
    error.status = 401;
    throw error;
  }
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const model = options.modelOverride || getGroqModel(env, options.modelHint);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
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
        const debugMode = url.searchParams.get('debug') === '1';
        const { inventory } = await request.json();
        const debugTrace = [];

        const recordTrace = (itemName, provider, outcome, detail) => {
          if (!debugMode) return;
          debugTrace.push({
            item: itemName || 'Unnamed item',
            provider,
            outcome,
            detail
          });
        };

        if (!Array.isArray(inventory)) {
          return new Response(JSON.stringify({ inventory: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Attach client indexes so we can re-map confidently
        const indexedInventory = inventory.map((item, index) => ({ ...item, __index: index }));

        const skippedTypes = new Set(['tool', 'other']);
        const itemsThatNeedNotes = indexedInventory.filter(item => {
          if (skippedTypes.has((item.type || '').toLowerCase())) {
            return false;
          }
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
                recordTrace(friendlyName, 'gemini', 'success', `Generated ${text.length} chars`);
                return text;
              };

              const tryGroq = async () => {
                const groqData = await callGroq([
                  { role: 'system', content: 'You are a spirits sommelier who writes short tasting notes.' },
                  { role: 'user', content: prompt }
                ], env, { temperature: 0.6, maxTokens: 160, modelHint: 'instant' });
                const text = (groqData?.choices?.[0]?.message?.content || '').trim();
                if (!text) {
                  throw new Error('Groq returned empty flavor notes');
                }
                recordTrace(friendlyName, 'groq', 'success', `Generated ${text.length} chars`);
                return text;
              };

              const runProviders = async () => {
                const providerOrder = (() => {
                  const order = [];
                  if (shouldUseGroqFirst) {
                    if (hasGroqKey(env)) order.push('groq');
                    if (hasGeminiKey(env)) order.push('gemini');
                  } else {
                    if (hasGeminiKey(env)) order.push('gemini');
                    if (hasGroqKey(env)) order.push('groq');
                  }
                  return order;
                })();

                if (providerOrder.length === 0) {
                  const message = 'No AI providers configured. Please set GEMINI_API_KEY or GROQ_API_KEY.';
                  recordTrace(friendlyName, 'none', 'error', message);
                  throw new Error(message);
                }

                const errors = [];

                for (const provider of providerOrder) {
                  try {
                    if (provider === 'gemini') {
                      return await tryGemini();
                    }
                    return await tryGroq();
                  } catch (error) {
                    const providerName = provider === 'gemini' ? 'Gemini' : 'Groq';
                    const formatted = formatProviderError(error);
                    errors.push(`${providerName}: ${formatted}`);
                    recordTrace(friendlyName, provider, 'error', formatted);

                    if (error.status === 429) {
                      console.error(`${providerName} rate limit exceeded for ${friendlyName}`);
                    } else if (error.status >= 500) {
                      console.error(`${providerName} server error ${error.status} for ${friendlyName}`);
                    } else {
                      console.error(`${providerName} error for ${friendlyName}:`, error.status, error.body || error.message);
                    }
                  }
                }

                throw new Error(`All AI providers failed for ${friendlyName}: ${errors.join('; ')}`);
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

        const responseBody = { inventory: enrichedInventory };
        if (debugMode) {
          responseBody.debug = {
            requestedItems: indexedInventory.length,
            itemsNeedingNotes: itemsThatNeedNotes.length,
            itemsEnriched: enrichedItems.length,
            trace: debugTrace
          };
        }

        return new Response(JSON.stringify(responseBody), {
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
        const inventoryPrompt = formatInventoryForPrompt(inventory || []);
        const systemPrompt = `You are a bartender AI assistant. When asked for a drink, your job is to:
1. Find the recipe and provide it immediately using the customer's available ingredients
2. Tell them exactly how to make it with what they have
3. If you need to substitute ingredients, state the substitutions clearly

CURRENT BAR INVENTORY:
${inventoryPrompt}

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

        const recentHistory = Array.isArray(chatHistory) ? chatHistory.slice(-6) : [];
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
        const providerOrder = [];
        if (hasGeminiKey(env)) providerOrder.push('gemini');
        if (hasGroqKey(env)) providerOrder.push('groq');

        if (providerOrder.length === 0) {
          return new Response(
            JSON.stringify({
              error: 'AI providers are not configured. Please add GEMINI_API_KEY or GROQ_API_KEY.',
              details: 'No AI providers configured'
            }),
            {
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }

        const prefersVersatile = shouldUseVersatileChat(message, chatHistory || []);
        const groqOptions = {
          temperature: prefersVersatile ? 0.4 : 0.3,
          maxTokens: prefersVersatile ? 1500 : 900,
          modelHint: prefersVersatile ? 'versatile' : 'instant'
        };

        const providerErrors = [];

        for (const provider of providerOrder) {
          try {
            if (provider === 'gemini') {
              const geminiData = await callGemini(geminiPayload, env);
              aiResponse = extractGeminiText(geminiData);
              if (!aiResponse) {
                throw new Error('Gemini returned empty response');
              }
              break;
            } else {
              console.log(`Using Groq chat with ${prefersVersatile ? 'versatile' : 'instant'} model`);
              const groqData = await callGroq(groqMessages, env, groqOptions);
              aiResponse = (groqData?.choices?.[0]?.message?.content || '').trim();
              if (!aiResponse) {
                throw new Error('Groq returned empty response');
              }
              break;
            }
          } catch (providerError) {
            const providerName = provider === 'gemini' ? 'Gemini' : 'Groq';
            const formattedError = formatProviderError(providerError);
            providerErrors.push(`${providerName}: ${formattedError}`);

            if (providerError.status === 429) {
              console.error(`${providerName} chat rate limit exceeded`);
            } else if (providerError.status >= 500) {
              console.error(`${providerName} chat server error ${providerError.status}`);
            } else {
              console.error(`${providerName} chat error:`, providerError.status, providerError.body || providerError.message);
            }
          }
        }

        if (!aiResponse) {
          return new Response(
            JSON.stringify({
              error: 'AI service unavailable. Please try again.',
              details: providerErrors.join('; ')
            }),
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

      // ========== MENU ENDPOINTS ==========

      // GET /api/menu - Public menu (no auth required)
      if (url.pathname === '/api/menu' && request.method === 'GET') {
        try {
          const menu = await env.BARTENDER_KV.get('menu:live', { type: 'json' });

          if (!menu) {
            return new Response(JSON.stringify({
              id: 'menu-primary',
              items: [],
              version: 0,
              updatedAt: new Date().toISOString()
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Filter to active items only for public menu
          const publicItems = menu.items.filter(item => item.status === 'active').map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            primarySpirit: item.primarySpirit,
            tags: item.tags || []
          }));

          return new Response(JSON.stringify({
            id: menu.id,
            items: publicItems,
            version: menu.version,
            updatedAt: menu.updatedAt
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Menu GET error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to load menu',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // POST /api/menu - Save menu (admin only, requires Cloudflare Access)
      if (url.pathname === '/api/menu' && request.method === 'POST') {
        try {
          const body = await request.json();
          const { items, version } = body;

          // Validate menu structure
          if (!Array.isArray(items)) {
            return new Response(JSON.stringify({
              error: 'Invalid menu structure',
              details: 'items must be an array'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Get current menu to check version
          const currentMenu = await env.BARTENDER_KV.get('menu:live', { type: 'json' }) || {
            id: 'menu-primary',
            items: [],
            version: 0
          };

          // Optimistic concurrency control: if version doesn't match, reject
          if (version && version !== currentMenu.version) {
            return new Response(JSON.stringify({
              error: 'Version conflict',
              details: `Expected version ${currentMenu.version}, got ${version}`,
              currentVersion: currentMenu.version
            }), {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Create new menu with incremented version
          const newVersion = currentMenu.version + 1;
          const userEmail = request.headers.get('cf-access-authenticated-user-email') || 'system';

          const newMenu = {
            id: 'menu-primary',
            items: items.map((item, idx) => ({
              ...item,
              version: item.version || 1,
              updatedAt: new Date().toISOString(),
              updatedBy: userEmail
            })),
            version: newVersion,
            updatedAt: new Date().toISOString(),
            updatedBy: userEmail
          };

          // Save to menu:live
          await env.BARTENDER_KV.put('menu:live', JSON.stringify(newMenu));

          // Create snapshot
          await env.BARTENDER_KV.put(
            `menu:snapshot:v${newVersion}`,
            JSON.stringify(newMenu)
          );

          return new Response(JSON.stringify({
            success: true,
            message: 'Menu saved successfully',
            version: newVersion,
            updatedAt: newMenu.updatedAt
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Menu POST error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to save menu',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // GET /api/menu/admin - Full menu for admin (requires Cloudflare Access)
      if (url.pathname === '/api/menu/admin' && request.method === 'GET') {
        try {
          const menu = await env.BARTENDER_KV.get('menu:live', { type: 'json' });

          if (!menu) {
            return new Response(JSON.stringify({
              id: 'menu-primary',
              items: [],
              version: 0,
              updatedAt: new Date().toISOString()
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          return new Response(JSON.stringify(menu), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Menu admin GET error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to load admin menu',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // GET /api/menu/snapshots - List available menu snapshots (admin only)
      if (url.pathname === '/api/menu/snapshots' && request.method === 'GET') {
        try {
          const currentMenu = await env.BARTENDER_KV.get('menu:live', { type: 'json' });
          const snapshots = [];

          // Try to load snapshots (we'll check up to 20 versions back)
          for (let i = currentMenu?.version || 0; i >= Math.max(1, (currentMenu?.version || 1) - 20); i--) {
            try {
              const snapshot = await env.BARTENDER_KV.get(`menu:snapshot:v${i}`, { type: 'json' });
              if (snapshot) {
                snapshots.push({
                  version: i,
                  updatedAt: snapshot.updatedAt,
                  updatedBy: snapshot.updatedBy,
                  itemCount: snapshot.items?.length || 0
                });
              }
            } catch (e) {
              // Snapshot doesn't exist, continue
            }
          }

          return new Response(JSON.stringify({
            snapshots: snapshots.sort((a, b) => b.version - a.version)
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Snapshots error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to load snapshots',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      // POST /api/menu/rollback/{version} - Restore menu snapshot (admin only)
      if (url.pathname.match(/^\/api\/menu\/rollback\/\d+$/) && request.method === 'POST') {
        try {
          const version = parseInt(url.pathname.split('/').pop());
          const snapshot = await env.BARTENDER_KV.get(`menu:snapshot:v${version}`, { type: 'json' });

          if (!snapshot) {
            return new Response(JSON.stringify({
              error: 'Snapshot not found',
              details: `No snapshot exists for version ${version}`
            }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          // Get current menu to get next version
          const currentMenu = await env.BARTENDER_KV.get('menu:live', { type: 'json' }) || {
            version: 0
          };
          const newVersion = currentMenu.version + 1;
          const userEmail = request.headers.get('cf-access-authenticated-user-email') || 'system';

          // Create restored menu with new version
          const restoredMenu = {
            ...snapshot,
            version: newVersion,
            updatedAt: new Date().toISOString(),
            updatedBy: userEmail
          };

          // Save as new version
          await env.BARTENDER_KV.put('menu:live', JSON.stringify(restoredMenu));
          await env.BARTENDER_KV.put(
            `menu:snapshot:v${newVersion}`,
            JSON.stringify(restoredMenu)
          );

          return new Response(JSON.stringify({
            success: true,
            message: `Restored from version ${version}`,
            restoredFromVersion: version,
            newVersion: newVersion,
            updatedAt: restoredMenu.updatedAt
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.error('Rollback error:', error);
          return new Response(JSON.stringify({
            error: 'Failed to rollback menu',
            details: error.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
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
