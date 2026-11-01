// Проверка Т-стыков «руками»: комната 6,55 × 3,40, перегородка от верхней стены к нижней делит её на две,
// пристройка справа от угла до угла, затем перегородку удаляют — комнаты сливаются. Запуск при работающем приложении:
//   node scripts/check-tjunction.mjs [адрес] [папка для снимков]
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
await page.getByRole('button', { name: 'План', exact: true }).click(); // пристройка не помещается в половину экрана
await page.waitForTimeout(300);

const box = await page.locator('svg.plan').boundingBox();
const S = 50; // пикселей на метр при открытии
const x0 = box.x + 100, y0 = box.y + 120;
const at = (x, y) => [x0 + x * S, y0 + y * S];
const typeLength = async (towards, text) => {
  await page.mouse.move(...towards);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('planner.project') || 'null'));
const report = async title => {
  const s = await state();
  const area = r => {
    let a = 0;
    r.nodes.forEach((id, i) => { const p = s.nodes[id], q = s.nodes[r.nodes[(i + 1) % r.nodes.length]]; a += p.x * q.y - q.x * p.y; });
    return Math.abs(a / 2).toFixed(2);
  };
  const shown = await page.locator('.room-area').allTextContents();
  console.log(`${title}: стен ${Object.keys(s.walls).length}, узлов ${Object.keys(s.nodes).length}, комнат ${Object.keys(s.rooms).length}`,
    `| по узлам: ${Object.values(s.rooms).map(area).join(', ')} | на плане: ${shown.join(', ')}`);
  for (const r of Object.values(s.rooms)) console.log(`  ${r.name}:`, r.nodes.map(id => `(${s.nodes[id].x}; ${s.nodes[id].y})`).join(' '));
  if (process.env.VERBOSE) console.log('  стены:', Object.values(s.walls).map(w => `(${s.nodes[w.a].x}; ${s.nodes[w.a].y})→(${s.nodes[w.b].x}; ${s.nodes[w.b].y})`).join(' '));
};

// комната
await page.keyboard.press('w');
await page.mouse.move(...at(0, 0));
await page.mouse.click(...at(0, 0));
await typeLength(at(4, 0.05), '6,55');
await typeLength(at(6.6, 2), '340');
await typeLength(at(3, 3.45), '6550mm');
await page.mouse.move(...at(0.02, 0.02));
await page.mouse.click(...at(0.02, 0.02));
await page.waitForTimeout(300);
await report('комната');

// перегородка: клик по верхней стене около x = 3, ведём вниз, клик у нижней стены
await page.mouse.move(...at(3.01, 0.04));
await page.waitForTimeout(100);
await page.screenshot({ path: `${outDir}/tj-1-hover-wall.png` });
await page.mouse.click(...at(3.01, 0.04));
await page.mouse.move(...at(3.05, 3.3), { steps: 6 });
await page.waitForTimeout(100);
await page.screenshot({ path: `${outDir}/tj-2-to-wall.png` });
await page.mouse.click(...at(3.05, 3.3));
await page.waitForTimeout(300);
await report('перегородка');

// пристройка справа: от правого верхнего угла 3 м вправо, 3,40 вниз, и в правый нижний угол комнаты
await page.mouse.move(...at(6.55, 0));
await page.mouse.click(...at(6.55, 0));
await typeLength(at(8, 0.05), '300');
await typeLength(at(9.6, 2), '340');
await page.mouse.move(...at(6.56, 3.41));
await page.mouse.click(...at(6.56, 3.41));
await page.waitForTimeout(300);
await report('пристройка');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/tj-3-rooms.png` });

// удалить перегородку: выбрать её и Delete
await page.keyboard.press('v');
await page.mouse.click(...at(3.06, 1.7));
await page.waitForTimeout(200);
await page.screenshot({ path: `${outDir}/tj-4-selected.png` });
await page.keyboard.press('Delete');
await page.waitForTimeout(800);
await report('без перегородки');
await page.screenshot({ path: `${outDir}/tj-5-deleted.png` });

// отдельная стена внутри комнаты, затем её верхний угол перетаскиваем на верхнюю стену — встаёт Т-стыком
await page.keyboard.press('w');
await page.mouse.move(...at(2, 1));
await page.mouse.click(...at(2, 1));
await typeLength(at(2.02, 2), '150');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.keyboard.press('v');
await page.mouse.click(...at(2.03, 1.8));
await page.waitForTimeout(200);
await page.mouse.move(...at(2, 1));
await page.mouse.down();
await page.mouse.move(...at(2.04, 0.06), { steps: 8 });
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForTimeout(500);
await report('угол на стену');
await page.screenshot({ path: `${outDir}/tj-6-node-to-wall.png` });

await browser.close();
if (errors.length) { console.log('ошибки на странице:'); for (const e of errors) console.log(' -', e); process.exitCode = 1; }
