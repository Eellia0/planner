// Проверка проектов «руками»: перенос старого проекта из localStorage, сохранение при перезагрузке, новый проект
// и переключение, сохранение в файл и загрузка из него, удаление, битый файл. Запуск при работающем приложении:
//   node scripts/check-projects.mjs [адрес] [папка для снимков и файла]
import { chromium } from 'playwright-core';

process.env.TMP = process.env.TEMP = 'D:/dev-tools/tmp';
const [url = 'http://localhost:5173/', outDir = 'D:/dev-tools/planner'] = process.argv.slice(2);

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
// окно «Сохранить как» скрипт нажать не может — пусть файл идёт через загрузку
await context.addInitScript(() => { delete window.showSaveFilePicker; });
const page = await context.newPage();
const errors = [], dialogs = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => { dialogs.push(d.message()); void d.accept(); });

const walls = () => page.locator('svg.plan .wall').count();
const title = () => page.locator('.project-name').innerText();
const menu = async () => {
  await page.locator('.project-btn').click();
  await page.waitForTimeout(200);
  return (await page.locator('.project-open b').allTextContents()).join(' | ');
};
const ready = async () => { await page.waitForSelector('svg.plan'); await page.waitForTimeout(400); };

// 1. старый проект из localStorage: квадрат 2 × 2 без списка проектов
await page.goto(url);
await ready();
await page.evaluate(() => {
  localStorage.removeItem('planner.current');
  const n = (id, x, y) => ({ id, x, y });
  const w = (id, a, b) => ({ id, a, b, thickness: 0.12, side: -1 });
  localStorage.setItem('planner.project', JSON.stringify({
    id: 'old00001', name: 'Old project', ceilingHeight: 2.7, defaultThickness: 0.12, updatedAt: 1,
    nodes: { a: n('a', 0, 0), b: n('b', 2, 0), c: n('c', 2, 2), d: n('d', 0, 2) },
    walls: { w1: w('w1', 'a', 'b'), w2: w('w2', 'b', 'c'), w3: w('w3', 'c', 'd'), w4: w('w4', 'd', 'a') },
    rooms: { r: { id: 'r', name: 'Room', nodes: ['a', 'b', 'c', 'd'] } },
  }));
});
await page.reload();
await ready();
console.log('1. перенос:', await title(), '— стен', await walls());

// 2. правка сохраняется при перезагрузке
await page.getByRole('button', { name: 'План', exact: true }).click();
await page.fill('#project-name', 'Kvartira');
await page.press('#project-name', 'Enter');
await page.click('svg.plan .wall >> nth=0');
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
await page.reload();
await ready();
console.log('2. после перезагрузки:', await title(), '— стен', await walls(), '(ждём 3)');

// 3. новый проект и переключение обратно
console.log('3. список:', await menu());
await page.getByRole('button', { name: 'Новый проект', exact: true }).click();
await page.waitForTimeout(300);
console.log('   новый:', await title(), '— стен', await walls(), '; список:', await menu());
await page.screenshot({ path: `${outDir}/projects-1-menu.png` });
await page.locator('.project-open', { hasText: 'Kvartira' }).click();
await page.waitForTimeout(300);
console.log('   обратно:', await title(), '— стен', await walls());

// 4. в файл и из файла
await menu();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить в файл' }).click()]);
const file = `${outDir}/${download.suggestedFilename()}`;
await download.saveAs(file);
console.log('4. файл:', download.suggestedFilename());
await page.setInputFiles('input[type=file]', file);
await page.waitForTimeout(400);
console.log('   загружен:', await title(), '— стен', await walls(), '; список:', await menu());

// 5. удалить открытый (копию из файла) — откроется другой
await page.locator('.project-list li.current .project-del').click();
await page.waitForTimeout(400);
console.log('5. после удаления:', await title(), '; список:', await page.locator('.project-open b').allTextContents());
await page.keyboard.press('Escape');

// 6. битый файл — сообщение, проект не меняется
await page.setInputFiles('input[type=file]', { name: 'bad.planner.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
await page.waitForTimeout(300);
console.log('6. битый файл:', await title());
await page.screenshot({ path: `${outDir}/projects-2-after.png` });

console.log('диалоги:', dialogs);
console.log(errors.length ? `ОШИБКИ: ${errors.join('\n')}` : 'ошибок в консоли нет');
await browser.close();
