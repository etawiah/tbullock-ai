// Loads the live menu from the bartender API and renders it (escaped).
// Fetch menu from bartender worker
async function loadMenu() {
  try {
    const response = await fetch('/api/menu');
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      renderMenu(data.items);
    }
  } catch (error) {
    console.error('Failed to load menu:', error);
  }
}

// Menu text comes from the API; escape it so it can never run as HTML/script.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMenu(items) {
  const container = document.querySelector('.container');
  const spiritIcons = {
    vodka: '🍸',
    gin: '🌿',
    rum: '🏝️',
    tequila: '🌮',
    whiskey: '🥃',
    brandy: '🍷',
    liqueur: '🎨',
    wine: '🍇',
    beer: '🍺',
    mixer: '💧',
    other: '🔥'
  };

  // Group items by primarySpirit
  const grouped = {};
  items.forEach(item => {
    const spirit = item.primarySpirit || 'other';
    if (!grouped[spirit]) grouped[spirit] = [];
    grouped[spirit].push(item);
  });

  // Clear existing drinks (keep header)
  const drinksContainer = container.querySelector('.drinks-container') || container;
  const existingDrinks = drinksContainer.querySelectorAll('.category, .separator');
  existingDrinks.forEach(el => el.remove());

  // Render by spirit type
  const spiritOrder = ['vodka', 'gin', 'rum', 'tequila', 'whiskey', 'brandy', 'liqueur', 'wine', 'beer', 'mixer', 'other'];

  spiritOrder.forEach(spirit => {
    if (!grouped[spirit]) return;

    const categoryHtml = `
      <div class="category">
        <div class="category-header">
          <span class="category-icon">${spiritIcons[spirit]}</span>
          <h2 class="category-name">${spirit.charAt(0).toUpperCase() + spirit.slice(1)}</h2>
        </div>
        ${grouped[spirit].map(item => `
          <div class="drink">
            <div class="drink-name">${escapeHtml(item.name)}</div>
            <div class="drink-description">${escapeHtml(item.description)}</div>
          </div>
        `).join('')}
      </div>
      <div class="separator"></div>
    `;

    const footer = container.querySelector('.footer');
    footer.insertAdjacentHTML('beforebegin', categoryHtml);
  });
}

// Load menu on page load
document.addEventListener('DOMContentLoaded', loadMenu);
