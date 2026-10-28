// Проверка редактора стен «руками»: рисует комнату 6,55 × 3,40 вводом длин, замыкает её,
// выбирает стену и снимает экран. Запуск при работающем приложении:
//   node scripts/check-walls.mjs [адрес] [папка для снимков]
import { chromium } from 'playwright-core';

process.env.TMP = process.env.TEMP = 'D:/dev-tools/tmp';
const [url = 'http://localhost:5173/', outDir = 'D:/dev-tools/planner'] = process.argv.slice(2);

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('svg.plan');

const box = await page.locator('svg.plan').boundingBox();
const S = 50; // пикселей на метр при открытии
const x0 = box.x + 100, y0 = box.y + 120;

await page.keyboard.press('w');
await page.mouse.move(x0, y0);
await page.mouse.click(x0, y0);
// вправо 6,55
await page.mouse.move(x0 + 200, y0 + 3);
await page.keyboard.type('6,55');
await page.keyboard.press('Enter');
// вниз 340 (сантиметры)
await page.mouse.move(x0 + 6.55 * S + 2, y0 + 150);
await page.keyboard.type('340');
await page.keyboard.press('Enter');
// влево 6550 мм
await page.mouse.move(x0 + 300, y0 + 3.4 * S + 2);
await page.keyboard.type('6550mm'); // кириллицу Playwright вводит без нажатий клавиш, поэтому латиницей
await page.keyboard.press('Enter');
// замкнуть: клик в начальную точку
await page.mouse.move(x0 + 2, y0 + 2);
await page.screenshot({ path: `${outDir}/walls-1-before-close.png` });
await page.mouse.click(x0 + 1, y0 + 1);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/walls-2-room.png` });

// выбрать верхнюю стену и поменять толщину на 20 см
await page.keyboard.press('v');
await page.mouse.click(x0 + 3 * S, y0 - 3);
await page.waitForTimeout(300);
const thick = page.locator('label.field', { hasText: 'Толщина' }).first().locator('input');
await thick.fill('20');
await thick.press('Enter');
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/walls-3-selected.png` });

// рамкой слева направо выделить всю комнату и перенести группой на 1 м вправо за нижнюю стену
await page.keyboard.press('Escape');
await page.mouse.move(x0 - 30, y0 - 30);
await page.mouse.down();
await page.mouse.move(x0 + 6.55 * S + 30, y0 + 3.4 * S + 30, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.mouse.move(x0 + 3 * S, y0 + 3.4 * S + 3);
await page.mouse.down();
await page.mouse.move(x0 + 4 * S, y0 + 3.4 * S + 3, { steps: 8 });
await page.mouse.up();
// один угол: правый нижний — за ручку на 0,5 м вниз
await page.waitForTimeout(200);
await page.mouse.move(x0 + 7.55 * S, y0 + 3.4 * S);
await page.mouse.down();
await page.mouse.move(x0 + 7.55 * S, y0 + 3.9 * S, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/walls-4-moved.png` });

const state = await page.evaluate(() => JSON.parse(localStorage.getItem('planner.project') || 'null'));
console.log('стен:', Object.keys(state.walls).length, 'комнат:', Object.keys(state.rooms).length,
  'толщины:', Object.values(state.walls).map(w => w.thickness).join(', '));
console.log('углы:', Object.values(state.nodes).map(n => `(${n.x}; ${n.y})`).join(' '));
console.log('стены:', Object.values(state.walls).map(w => `${w.a}→${w.b} side ${w.side}`).join(' | '));
await browser.close();
if (errors.length) { console.log('ошибки на странице:'); for (const e of errors) console.log(' -', e); process.exitCode = 1; }
