// Проверка окон и дверей «руками»: комната 6,55 × 3,40, окно на верхней стене (ширина полем и ручкой — створки 1 → 2 → 3),
// дверь внизу (затем балконная), панорамное окно справа, низкая левая стена, отмена. Запуск при работающем приложении:
//   node scripts/check-openings.mjs [адрес] [папка для снимков]
import { chromium } from "playwright-core";

process.env.TMP = process.env.TEMP = "D:/dev-tools/tmp";
const [url = "http://localhost:5173/", outDir = "D:/dev-tools/planner"] = process.argv.slice(2);

const browser = await chromium.launch({
  channel: "msedge",
  args: ["--use-angle=d3d11", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(url);
await page.waitForSelector("svg.plan");
await page.getByRole("button", { name: "План", exact: true }).click();
await page.waitForTimeout(300);

const box = await page.locator("svg.plan").boundingBox();
const S = 50;
const x0 = box.x + 120;
const y0 = box.y + 140;
const at = (x, y) => [x0 + x * S, y0 + y * S];
const typeLength = async (towards, text) => {
  await page.mouse.move(...towards);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};
const card = async () => (await page.locator(".inspector .card").first().innerText()).replace(/\s+/g, " ");
const setField = async (label, value) => {
  const input = page.locator(".inspector .card").first().getByLabel(label, { exact: true });
  await input.fill(value);
  await input.press("Enter");
  await page.waitForTimeout(150);
};

// комната
await page.keyboard.press("w");
await page.mouse.move(...at(0, 0));
await page.mouse.click(...at(0, 0));
await typeLength(at(4, 0.05), "6,55");
await typeLength(at(6.6, 2), "340");
await typeLength(at(3, 3.45), "6550mm");
await page.mouse.move(...at(0.02, 0.02));
await page.mouse.click(...at(0.02, 0.02));
await page.keyboard.press("Escape");

// окно на верхней стене
await page.keyboard.press("o");
await page.mouse.move(...at(3, -0.05));
await page.waitForTimeout(150);
await page.mouse.click(...at(3, -0.05));
await page.waitForTimeout(200);
console.log("окно:", await card());
await setField("Ширина", "80");
console.log("80 см:", (await card()).match(/Створок \d+[^В]*/)?.[0]);
await setField("Ширина", "150");
console.log("150 см:", (await card()).match(/Створок \d+[^В]*/)?.[0]);

// ручка правого края: +50 см
await page.keyboard.press("v");
const end = page.locator(".opening.selected .op-end").nth(1);
const eb = await end.boundingBox();
await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
await page.mouse.down();
await page.mouse.move(eb.x + eb.width / 2 + 0.5 * S, eb.y + eb.height / 2, { steps: 8 });
await page.screenshot({ path: `${outDir}/open-1-resize.png` });
await page.mouse.up();
await page.waitForTimeout(200);
console.log("ручкой +50:", (await card()).match(/Ширина \S+ \S+|Створок \d+[^В]*/g)?.join(" · "));

// дверь внизу, потом балконная
await page.keyboard.press("d");
await page.mouse.move(...at(1.2, 3.45));
await page.waitForTimeout(150);
await page.mouse.click(...at(1.2, 3.45));
await page.waitForTimeout(200);
console.log("дверь:", await card());
await page.locator(".inspector .card").first().getByRole("button", { name: "балконная" }).click();
await page.waitForTimeout(150);

// панорамное окно на правой стене
await page.keyboard.press("o");
await page.mouse.move(...at(6.6, 1.7));
await page.waitForTimeout(150);
await page.mouse.click(...at(6.6, 1.7));
await page.waitForTimeout(150);
await page.locator(".inspector .card").first().getByRole("button", { name: "панорамное" }).click();
await page.waitForTimeout(150);
console.log("панорамное:", (await card()).match(/Ширина.*Высота \S+ \S+/)?.[0]);

// левая стена — низкая
await page.keyboard.press("v");
await page.keyboard.press("Escape");
await page.mouse.click(...at(-0.06, 1.7));
await page.waitForTimeout(150);
await setField("Высота (до потолка)", "110");
console.log("левая стена:", (await card()).match(/Высота \S+ \S+/)?.[0]);
await page.keyboard.press("Escape");
await page.mouse.click(...at(9, 6));

console.log(
  "проёмов на плане:",
  await page.locator(".opening:not(.placing)").count(),
  "; красных:",
  await page.locator(".opening.bad").count(),
);
await page.screenshot({ path: `${outDir}/open-2-plan.png` });
await page.getByRole("button", { name: "План + 3D", exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/open-3-both.png` });
await page.getByRole("switch", { name: "Прозрачные стены" }).click();
await page.getByRole("button", { name: "3D", exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/open-4-3d.png` });
// с другой стороны и ближе: панорамное окно и дверь
const v = await page.locator(".pane-3d canvas").boundingBox();
await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
await page.mouse.down();
await page.mouse.move(v.x + v.width / 2 + 420, v.y + v.height / 2, { steps: 20 });
await page.mouse.up();
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -300);
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/open-5-3d-back.png` });
await page.getByRole("switch", { name: "Прозрачные стены" }).click();

// отмена: высота стены, вид, панорамное
for (let i = 0; i < 3; i++) await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
console.log("после трёх отмен проёмов:", await page.locator(".opening").count());

console.log(errors.length ? `ОШИБКИ: ${errors.join("\n")}` : "ошибок в консоли нет");
await browser.close();
