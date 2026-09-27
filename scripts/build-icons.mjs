import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const staticDir = path.join(projectRoot, 'static');
const assetsDir = path.join(projectRoot, 'src', 'lib', 'assets');

// 1. Master Brand App Icon SVG (512x512)
// Minimalist, elegant clothes hanger with AI stylist diamond sparkle and luxury indigo/violet gradient
const masterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Brand Signature Gradient: Indigo to Violet with deep nocturnal base -->
    <linearGradient id="brandBg" x1="15%" y1="95%" x2="85%" y2="5%">
      <stop offset="0%" stop-color="#312e81" />
      <stop offset="35%" stop-color="#4338ca" />
      <stop offset="70%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>

    <!-- Top-Right Luminous Violet Glow -->
    <radialGradient id="topVioletGlow" cx="78%" cy="16%" r="62%">
      <stop offset="0%" stop-color="#c084fc" stop-opacity="0.45" />
      <stop offset="55%" stop-color="#7c3aed" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#312e81" stop-opacity="0" />
    </radialGradient>

    <!-- Center Radiant Backlight behind AI Sparkle -->
    <radialGradient id="centerBacklight" cx="50%" cy="56%" r="38%">
      <stop offset="0%" stop-color="#818cf8" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#4f46e5" stop-opacity="0" />
    </radialGradient>

    <!-- 1px Precision Specular Glass Rim -->
    <linearGradient id="specularRim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45" />
      <stop offset="20%" stop-color="#ffffff" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02" />
    </linearGradient>

    <!-- Hanger Shading -->
    <linearGradient id="hangerStroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>

    <!-- AI Sparkle Soft Bloom -->
    <filter id="aiStarGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Squircle Base Canvas (Standard 22.5% radius) -->
  <rect width="512" height="512" rx="116" fill="url(#brandBg)" />
  <rect width="512" height="512" rx="116" fill="url(#topVioletGlow)" />
  <rect width="512" height="512" rx="116" fill="url(#centerBacklight)" />
  <rect x="1.5" y="1.5" width="509" height="509" rx="114.5" fill="none" stroke="url(#specularRim)" stroke-width="2.5" />

  <!-- Hanger Emblem -->
  <!-- 1. The Hook: seamless bezier loop with neck into apex -->
  <path
    d="M 230 148 C 220 138 218 122 226 110 C 234 98 246 90 260 90 C 278 90 294 104 294 122 C 294 138 282 152 266 162 C 258 167 256 174 256 184 L 256 206"
    fill="none"
    stroke="url(#hangerStroke)"
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- 2. The Shoulders & Crossbar: wide grounded stance (width 360px) -->
  <path
    d="M 256 206 L 76 338 C 64 348 72 368 88 368 L 424 368 C 440 368 448 348 436 338 Z"
    fill="none"
    stroke="url(#hangerStroke)"
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- 3. AI Stylist Sparkle Star (Centered inside hanger triangle) -->
  <path
    d="M 256 248 Q 256 284 292 284 Q 256 284 256 320 Q 256 284 220 284 Q 256 284 256 248 Z"
    fill="#ffffff"
    filter="url(#aiStarGlow)"
  />
</svg>`;

// 2. Maskable PWA SVG (Centered with 18% safe-zone margin for Android adaptive round/squircle icon masks)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="maskableBg" x1="15%" y1="95%" x2="85%" y2="5%">
      <stop offset="0%" stop-color="#312e81" />
      <stop offset="35%" stop-color="#4338ca" />
      <stop offset="70%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#7c3aed" />
    </linearGradient>
    <radialGradient id="maskableGlow" cx="78%" cy="16%" r="62%">
      <stop offset="0%" stop-color="#c084fc" stop-opacity="0.45" />
      <stop offset="55%" stop-color="#7c3aed" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#312e81" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="mHangerStroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
  </defs>

  <!-- Full Bleed Background for Maskable Icon -->
  <rect width="512" height="512" fill="url(#maskableBg)" />
  <rect width="512" height="512" fill="url(#maskableGlow)" />

  <!-- Scaled Emblem inside Safe Zone (80% scale centered) -->
  <g transform="translate(51.2, 51.2) scale(0.8)">
    <path
      d="M 230 148 C 220 138 218 122 226 110 C 234 98 246 90 260 90 C 278 90 294 104 294 122 C 294 138 282 152 266 162 C 258 167 256 174 256 184 L 256 206"
      fill="none"
      stroke="url(#mHangerStroke)"
      stroke-width="30"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M 256 206 L 76 338 C 64 348 72 368 88 368 L 424 368 C 440 368 448 348 436 338 Z"
      fill="none"
      stroke="url(#mHangerStroke)"
      stroke-width="30"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M 256 248 Q 256 284 292 284 Q 256 284 256 320 Q 256 284 220 284 Q 256 284 256 248 Z"
      fill="#ffffff"
    />
  </g>
</svg>`;

// Helper function to build a valid Windows/standard .ICO file from PNG buffers
function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = count * dirEntrySize;
  let offset = headerSize + dirSize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Image offset
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((b) => b.buffer)]);
}

async function buildAll() {
  console.log('--- Generating My Wardrobe App Icons ---');

  // 1. Write SVG icons
  fs.writeFileSync(path.join(assetsDir, 'favicon.svg'), masterSvg, 'utf-8');
  fs.writeFileSync(path.join(staticDir, 'favicon.svg'), masterSvg, 'utf-8');
  console.log('✓ Wrote favicon.svg to src/lib/assets and static/');

  const masterBuf = Buffer.from(masterSvg);
  const maskableBuf = Buffer.from(maskableSvg);

  // 2. Generate PNG favicons
  const png16 = await sharp(masterBuf).resize(16, 16).png().toBuffer();
  const png32 = await sharp(masterBuf).resize(32, 32).png().toBuffer();
  const png48 = await sharp(masterBuf).resize(48, 48).png().toBuffer();
  const png180 = await sharp(masterBuf).resize(180, 180).png().toBuffer();
  const png192 = await sharp(masterBuf).resize(192, 192).png().toBuffer();
  const png512 = await sharp(masterBuf).resize(512, 512).png().toBuffer();

  fs.writeFileSync(path.join(staticDir, 'favicon-16x16.png'), png16);
  fs.writeFileSync(path.join(staticDir, 'favicon-32x32.png'), png32);
  fs.writeFileSync(path.join(staticDir, 'apple-touch-icon.png'), png180);
  fs.writeFileSync(path.join(staticDir, 'icon-192.png'), png192);
  fs.writeFileSync(path.join(staticDir, 'icon-512.png'), png512);
  console.log('✓ Generated PNG favicons & standard icons');

  // 3. Generate Maskable Icons
  const maskable192 = await sharp(maskableBuf).resize(192, 192).png().toBuffer();
  const maskable512 = await sharp(maskableBuf).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(staticDir, 'icon-maskable-192.png'), maskable192);
  fs.writeFileSync(path.join(staticDir, 'icon-maskable-512.png'), maskable512);
  console.log('✓ Generated PWA maskable icons');

  // 4. Generate multi-resolution favicon.ico
  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 }
  ]);
  fs.writeFileSync(path.join(staticDir, 'favicon.ico'), icoBuffer);
  console.log('✓ Generated multi-resolution favicon.ico (16, 32, 48px)');

  // 5. Generate site.webmanifest and manifest.json
  const manifest = {
    name: 'My Wardrobe',
    short_name: 'Wardrobe',
    description: 'Personal digital wardrobe and AI styling studio',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [
      {
        src: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };

  const manifestStr = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(staticDir, 'site.webmanifest'), manifestStr, 'utf-8');
  fs.writeFileSync(path.join(staticDir, 'manifest.json'), manifestStr, 'utf-8');
  console.log('✓ Generated site.webmanifest and manifest.json');

  console.log('--- All App Icon Assets Built Successfully! ---');
}

buildAll().catch((err) => {
  console.error('Error building icons:', err);
  process.exit(1);
});
