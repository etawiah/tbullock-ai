import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../public/favicon.svg');
const publicDir = join(__dirname, '../public');

const svgBuffer = readFileSync(svgPath);

async function generateIcons() {
  try {
    // Generate 192x192 icon
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile(join(publicDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate 512x512 icon
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(join(publicDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    console.log('\nPWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
