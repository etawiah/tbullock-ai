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

      // Route: Save inventory
      if (url.pathname === '/api/inventory' && request.method === 'POST') {
        const { inventory } = await request.json();
        await env.BARTENDER_KV.put('inventory', JSON.stringify(inventory));
        return new Response(JSON.stringify({ success: true }), {
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
2. If a recipe uses items from the bar, calculate whether the remaining ml covers the recipe and call out any shortages.
3. When the user says they made a drink, list the milliliter amounts to subtract so they can update the inventory manually.
4. Provide exact measurements and clear instructions.
5. Suggest alternatives when ingredients are low or missing.
6. Be friendly, conversational, and enthusiastic about drinks.
7. For batch recipes (e.g., "for 4 people"), scale ingredients proportionally.

Example format for drink recipes:
Drink: [Drink Name]
Ingredients:
- X oz [ingredient] (Available: Y ml)
- X oz [ingredient] (Available: Y ml)

Instructions:
1. Step by step
2. Clear method
3. Garnish suggestion

Inventory impact:
- Subtract Z ml [ingredient]

Glass: [type]
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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${env.GEMINI_API_KEY}`,
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
        const aiResponse = geminiData.candidates[0].content.parts[0].text;

        // Check if AI is indicating inventory should be updated
        // (In a more sophisticated version, you could parse this)
        return new Response(JSON.stringify({ 
          response: aiResponse,
          // updatedInventory: null // Could implement auto-update here
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
