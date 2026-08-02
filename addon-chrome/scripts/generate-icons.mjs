import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import sharp from 'sharp';

// 現在のスクリプトファイルのディレクトリを取得する
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ソースSVGと出力先ディレクトリを設定する
const srcSvg = resolve(__dirname, '../src/icons/icon.svg');
const iconsDir = resolve(__dirname, '../src/icons');

// 生成するPNGアイコンのサイズ（Chrome拡張機能用の標準サイズ）
const sizes = [16, 48, 128];

// 各サイズのPNGを生成する
async function main() {
    for (const size of sizes) {
        const outputPath = resolve(iconsDir, `icon${size}.png`);
        await sharp(srcSvg)
            .resize(size, size, { fit: 'contain', background: { r: 37, g: 99, b: 235, alpha: 1 } })
            .png()
            .toFile(outputPath);
        console.log(`Generated: ${outputPath}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
