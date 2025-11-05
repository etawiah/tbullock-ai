import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

// Read and parse CSV
const csvContent = readFileSync('./home_bar_inventory.csv', 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true
});

// Convert bottle size string to ml
function parseBottleSize(sizeStr) {
  if (!sizeStr) return '';
  sizeStr = sizeStr.trim().toLowerCase();

  // Already in ml
  if (sizeStr.includes('ml')) {
    return sizeStr.replace('ml', '').trim();
  }

  // Liters to ml
  if (sizeStr.includes('l')) {
    const liters = parseFloat(sizeStr.replace('l', ''));
    return String(Math.round(liters * 1000));
  }

  return '';
}

// Convert fractional amount to ml
function calculateRemainingAmount(bottleSizeMl, amountStr) {
  if (!bottleSizeMl || !amountStr) return '';

  const size = parseFloat(bottleSizeMl);
  if (isNaN(size)) return '';

  amountStr = amountStr.trim().toLowerCase();

  if (amountStr === 'full bottle') return String(size);
  if (amountStr === '3/4 bottle') return String(Math.round(size * 0.75));
  if (amountStr === 'half bottle') return String(Math.round(size * 0.5));
  if (amountStr === '1/4 bottle') return String(Math.round(size * 0.25));

  // If it's already a number
  const parsed = parseFloat(amountStr);
  if (!isNaN(parsed)) return String(parsed);

  return '';
}

// Map spirit types to standardized names
function mapSpiritType(section, type) {
  if (!type) return 'Other';

  type = type.trim();

  // Section-based categorization
  if (section === 'Wines & Aperitifs') {
    if (type.includes('Dry') || type.includes('Sweet')) return 'Vermouth';
    return 'Wine';
  }

  if (section === 'Beer') return 'Beer';
  if (section === 'Mixers & Non-Alcoholic') return 'Mixer';
  if (section === 'Fresh & Garnishes') return 'Garnish';
  if (section === 'Syrups') return 'Syrup';
  if (section === 'Bitters') return 'Bitters';
  if (section === 'Tools & Equipment') return 'Tool';

  // Spirits - Direct matches
  const typeMap = {
    'Vodka': 'Vodka',
    'Cognac': 'Cognac',
    'Whiskey': 'Whiskey',
    'Rum': 'Rum',
    'Scotch': 'Scotch',
    'Gin': 'Gin',
    'Tequila': 'Tequila',
    'Brandy': 'Brandy',
    'Bourbon': 'Bourbon',
    'Rye': 'Rye',
    'Mezcal': 'Mezcal'
  };

  if (typeMap[type]) return typeMap[type];

  // Liqueurs map to "Liqueur"
  if (type.includes('Creme') || type.includes('Curacao') ||
      type.includes('Fruit') || type.includes('Nut') ||
      type.includes('Schnapps') || type.includes('Ready-to-Drink')) {
    return 'Liqueur';
  }

  if (type.includes('Absinthe') || type.includes('Anise')) {
    return 'Aperitif';
  }

  return 'Liqueur';
}

// Convert CSV records to app inventory format
const inventory = records
  .filter(record => {
    const section = record.Section || '';
    const name = record.Name || '';
    // Include all relevant sections, exclude empty rows
    return name.trim() !== '' && (
      section === 'Spirits' ||
      section === 'Liqueurs & Specialty' ||
      section === 'Wines & Aperitifs' ||
      section === 'Beer' ||
      section === 'Mixers & Non-Alcoholic' ||
      section === 'Fresh & Garnishes' ||
      section === 'Syrups' ||
      section === 'Bitters' ||
      section === 'Tools & Equipment'
    );
  })
  .map(record => {
    const section = record.Section || '';
    const bottleSizeMl = parseBottleSize(record['Bottle Size']);
    const amountRemaining = calculateRemainingAmount(bottleSizeMl, record['Amount Remaining']);
    const notes = record.Notes || '';

    // For garnishes, check "In Stock" from Notes column
    let inStock = true;
    let additionalNotes = '';
    if (section === 'Fresh & Garnishes' && notes) {
      inStock = notes.toLowerCase().includes('yes');
      additionalNotes = notes.replace(/In Stock: (Yes|No)\.?\s*/i, '').trim();
    }

    // For tools, they're either there or not (no quantity)
    const isAvailable = section === 'Tools & Equipment' ? true : (inStock || amountRemaining !== '');

    return {
      type: mapSpiritType(section, record.Type),
      name: record.Name || 'Unnamed',
      proof: record['ABV % (normalized)'] ? String(Math.round(parseFloat(record['ABV % (normalized)']) * 2)) : '',
      bottleSizeMl: bottleSizeMl,
      amountRemaining: section === 'Tools & Equipment' ? '' : (section === 'Fresh & Garnishes' && inStock ? 'In Stock' : amountRemaining),
      flavorNotes: record['Flavor Notes / Profile'] || additionalNotes || '',
      available: isAvailable
    };
  })
  .filter(item => item.name !== 'Unnamed'); // Remove any invalid entries

// Write to JSON file
writeFileSync('./public/initial-inventory.json', JSON.stringify(inventory, null, 2));

console.log(`✅ Converted ${inventory.length} items from CSV to inventory format`);
console.log(`📄 Saved to public/initial-inventory.json`);
