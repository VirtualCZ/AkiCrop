/**
 * Generate placeholder PWA icons (Adobe blue #3b63fb) for AkiCrop.
 * Run: node scripts/generate-icons.cjs
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const staticDir = path.join(__dirname, '..', 'static');
const outDir = path.join(staticDir, 'icons');
const SIZES = [32, 144, 180, 192];
const R = 59, G = 99, B = 251, A = 255; // #3b63fb

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function writePng(size, outPath, cb) {
	const png = new PNG({ width: size, height: size });
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const idx = (size * y + x) << 2;
			png.data[idx] = R;
			png.data[idx + 1] = G;
			png.data[idx + 2] = B;
			png.data[idx + 3] = A;
		}
	}
	png.pack().pipe(fs.createWriteStream(outPath)).on('finish', () => {
		console.log('Written', outPath);
		if (cb) cb();
	});
}

// Icons in static/icons/
[144, 180, 192].forEach((size) => {
	writePng(size, path.join(outDir, `icon-${size}.png`));
});

// Root-level names browsers request (avoid 404)
writePng(180, path.join(staticDir, 'apple-touch-icon.png'));
writePng(180, path.join(staticDir, 'apple-touch-icon-precomposed.png'));
writePng(32, path.join(staticDir, 'favicon.ico'), () => {}); // 32x32 PNG as .ico; many browsers accept
