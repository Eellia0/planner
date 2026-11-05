// Проверка длины и угла «руками»: комната 6,55 × 3,40; клик по верхней стене у правого конца — правый угол стоит,
// новая длина 7,00 переносит левую стену; затем стена 3 м под углом 30° (поле «Угол») и стена под углом без длины.
// Запуск при работающем приложении:  node scripts/check-length-angle.mjs [адрес] [папка для снимков]
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
await page.getByRole('button', { name: 'План', exact: true }).click();
await page.waitForTimeout(300);

const box = await page.locator('svg.plan').boundingBox();
const S = 50;
const x0 = box.x + 200, y0 = box.y + 200;
const at = (x, y) => [x0 + x * S, y0 + y * S];
const typeLength = async (towards, text) => {
  await page.mouse.move(...towards);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const corners = () => page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('planner.project'));
  const r = Object.values(p.rooms)[0];
  return r ? r.nodes.map(id => `(${p.nodes[id].x}; ${p.nodes[id].y})`).join(' ') : '';
});
const walls = () => page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('planner.project'));
  return Object.values(p.walls).map(w => `(${p.nodes[w.a].x}; ${p.nodes[w.a].y})→(${p.nodes[w.b].x}; ${p.nodes[w.b].y})`).join(' | ');
});

// комната; её левый верхний угол в (0; 0) плана, если начать с at(0, 0)
await page.keyboard.press('w');
await page.mouse.move(...at(0, 0));
await page.mouse.click(...at(0, 0));
await typeLength(at(4, 0.05), '6,55');
await typeLength(at(6.6, 2), '340');
await typeLength(at(3, 3.45), '6550mm');
await page.mouse.move(...at(0.02, 0.02));
await page.mouse.click(...at(0.02, 0.02));
await page.keyboard.press('Escape');
const before = await corners();
console.log('комната:', before);

// клик по верхней стене у правого конца: стоит правый угол
await page.mouse.click(...at(6, -0.05));
await page.waitForTimeout(200);
const pressed = await page.locator('.inspector .seg button[aria-pressed="true"]').first().innerText();
console.log('стоит:', pressed);
const len = page.getByLabel('Длина', { exact: true });
await len.fill('7,00');
await len.press('Enter');
await page.waitForTimeout(200);
console.log('после 7,00:', await corners());
await page.screenshot({ path: `${outDir}/len-1-anchor.png` });

// переключили на левый угол, 6,00 — теперь едет правая стена
await page.getByRole('button', { name: 'левый угол' }).click();
await len.fill('6,00');
await len.press('Enter');
await page.waitForTimeout(200);
console.log('после 6,00 от левого:', await corners());
await page.keyboard.press('Escape');

// стена 3 м под углом 30° от точки (10; 6)
await page.keyboard.press('w');
await page.mouse.move(...at(10, 6));
await page.mouse.click(...at(10, 6));
await page.mouse.move(...at(13, 6.3));
await page.keyboard.type('300');
await page.keyboard.press('Tab');
await page.keyboard.type('30');
await page.waitForTimeout(100);
await page.screenshot({ path: `${outDir}/len-2-angle.png` });
await page.keyboard.press('Enter');
// только угол: -60°, длина до курсора
await page.keyboard.press('Tab');
await page.keyboard.type('-60');
await page.mouse.move(...at(14.6, 8));
await page.waitForTimeout(100);
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const all = (await walls()).split(' | ').slice(-2).join(' | ');
console.log('стены под углом:', all);
console.log('ожидается: (12.8; 8.8)→(15.398; 7.3), затем вниз-вправо под -60° (dx : dy = 1 : 1,732)');

console.log(errors.length ? `ОШИБКИ: ${errors.join(' | ')}` : 'ошибок в консоли нет');
await browser.close();
