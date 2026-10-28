// Снимок запущенного приложения через установленный Microsoft Edge (браузеры Playwright не скачиваются).
// Запуск: node scripts/screenshot.mjs [адрес] [файл.png] [ширина] [высота]
// По умолчанию снимает http://localhost:5173/ в D:/dev-tools/planner/shot.png
import { chromium } from 'playwright-core';

// временный профиль браузера — на диске D, а не в C:\Users\...\Temp
process.env.TMP = process.env.TEMP = 'D:/dev-tools/tmp';

const [url = 'http://localhost:5173/', out = 'D:/dev-tools/planner/shot.png', w = '1440', h = '860'] = process.argv.slice(2);

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url);
// ждём, пока 3D-холст получит свой размер, и даём ему отрисовать несколько кадров
await page.waitForFunction(() => {
  const c = document.querySelector('canvas');
  return c && c.width > 300 && c.height > 150;
}, null, { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();

console.log('снимок:', out);
if (errors.length) {
  console.log('ошибки на странице:');
  for (const e of errors) console.log(' -', e);
  process.exitCode = 1;
}
