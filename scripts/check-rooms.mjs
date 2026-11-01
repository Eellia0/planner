// Проверка выбора комнат «руками»: комната 6,55 × 3,40 с перегородкой, клик по полу выбирает половину,
// переименование в свойствах, двойной клик сразу открывает название, отмена возвращает имя. Запуск при работающем приложении:
//   node scripts/check-rooms.mjs [адрес] [папка для снимков]
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
const x0 = box.x + 100, y0 = box.y + 120;
const at = (x, y) => [x0 + x * S, y0 + y * S];
const typeLength = async (towards, text) => {
  await page.mouse.move(...towards);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const names = async () => (await page.locator('.room-name').allTextContents()).join(', ');
const card = async () => (await page.locator('.inspector .card').first().innerText()).replace(/\s+/g, ' ');

// комната с перегородкой
await page.keyboard.press('w');
await page.mouse.move(...at(0, 0));
await page.mouse.click(...at(0, 0));
await typeLength(at(4, 0.05), '6,55');
await typeLength(at(6.6, 2), '340');
await typeLength(at(3, 3.45), '6550mm');
await page.mouse.move(...at(0.02, 0.02));
await page.mouse.click(...at(0.02, 0.02));
await page.mouse.move(...at(3.01, 0.04));
await page.mouse.click(...at(3.01, 0.04));
await page.mouse.move(...at(3.05, 3.3), { steps: 6 });
await page.mouse.click(...at(3.05, 3.3));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
console.log('комнаты:', await names());

// клик по полу левой половины
await page.mouse.click(...at(1.5, 1.7));
await page.waitForTimeout(200);
console.log('выбрана левая:', await card());
await page.fill('#room-name', 'Кухня');
await page.press('#room-name', 'Enter');
await page.waitForTimeout(200);
console.log('после переименования:', await names());
await page.screenshot({ path: `${outDir}/rooms-1-selected.png` });

// двойной клик по правой — поле названия сразу в фокусе
await page.mouse.dblclick(...at(5, 1.7));
await page.waitForTimeout(200);
console.log('фокус после двойного клика:', await page.evaluate(() => document.activeElement?.id));
await page.keyboard.type('Bedroom');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
console.log('после второго:', await names());

// отмена возвращает старое имя, затем стены комнаты
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
console.log('после отмены:', await names());
await page.mouse.click(...at(5, 1.7));
await page.getByRole('button', { name: 'Выбрать стены комнаты' }).click();
await page.waitForTimeout(200);
console.log('стены комнаты:', await card());
await page.screenshot({ path: `${outDir}/rooms-2-walls.png` });

// клик мимо пола снимает выбор
await page.mouse.click(...at(9, 6));
await page.waitForTimeout(200);
console.log('мимо пола:', (await card()).slice(0, 40));

console.log(errors.length ? `ОШИБКИ: ${errors.join(' | ')}` : 'ошибок в консоли нет');
await browser.close();
