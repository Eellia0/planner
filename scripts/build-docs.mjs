// Сборка документации: все docs/NN-*.md по порядку → один файл docs/index.html с оглавлением.
// Запуск: npm run docs. Открывается двойным кликом, интернет не нужен (кроме шрифтов — без них будут системные).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const DIR = 'docs';
const files = readdirSync(DIR).filter(f => /^\d\d-.+\.md$/.test(f)).sort();
const toc = [];
let body = '';

files.forEach((file, i) => {
  let html = marked.parse(readFileSync(join(DIR, file), 'utf8'));
  let sub = 0;
  // заголовкам — якоря, оглавлению — разделы (h1) и подразделы (h2)
  html = html.replace(/<h([12])>(.*?)<\/h\1>/g, (_, level, text) => {
    const plain = text.replace(/<[^>]+>/g, '');
    const id = level === '1' ? `s${i + 1}` : `s${i + 1}-${++sub}`;
    toc.push({ level: Number(level), id, text: plain });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  body += `<section>${html}</section>\n`;
});

const nav = toc.map(t => `<a class="l${t.level}" href="#${t.id}">${t.text}</a>`).join('\n');
const built = new Date().toLocaleDateString('ru-RU');

const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Планировщик — документация</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Unbounded:wght@500&display=swap">
<style>
:root{--bg:#E9EDEB;--surface:#F7F9F8;--ink:#1C2322;--muted:#586663;--line:#D2D9D6;--chip:#DCE3E0;--accent:#2D6A62;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121615;--surface:#1A1F1E;--ink:#E4EAE8;--muted:#97A5A1;--line:#2C3432;--chip:#2A3230;--accent:#74B6AC;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Golos Text",system-ui,"Segoe UI",sans-serif}
.layout{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;padding:24px 16px;border-right:1px solid var(--line);background:var(--surface)}
.brand{font:500 18px/1.2 "Unbounded",sans-serif;margin:0 8px 4px}
.built{margin:0 8px 18px;font-size:12px;color:var(--muted)}
nav a{display:block;color:var(--ink);text-decoration:none;border-radius:8px;padding:5px 8px}
nav a.l1{font-weight:600;margin-top:10px}
nav a.l2{font-size:13.5px;color:var(--muted);padding-left:20px}
nav a:hover{background:var(--chip)}
nav a.on{background:var(--accent);color:#fff}
@media (prefers-color-scheme:dark){nav a.on{color:#0E1614}}
main{padding:32px 48px 80px;max-width:920px}
section{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:8px 32px 24px;margin-bottom:20px}
h1{font:500 26px/1.25 "Unbounded",sans-serif;letter-spacing:-.01em;margin:24px 0 12px}
h2{font-size:18px;margin:28px 0 8px}
h3{font-size:15.5px;margin:20px 0 6px}
h1,h2{scroll-margin-top:16px}
a{color:var(--accent)}
code{font:13px "JetBrains Mono",Consolas,monospace;background:var(--chip);border-radius:5px;padding:1px 5px}
pre{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
li{margin:3px 0}
@media (max-width:800px){.layout{grid-template-columns:1fr}nav{position:static;height:auto}main{padding:16px}section{padding:4px 16px 16px}}
</style>
</head>
<body>
<div class="layout">
<nav aria-label="Оглавление">
<p class="brand">Планировщик</p>
<p class="built">Документация · собрана ${built}</p>
${nav}
</nav>
<main>
${body}
</main>
</div>
<script>
// подсветка раздела, который сейчас на экране
const links=[...document.querySelectorAll('nav a')];
const byId=Object.fromEntries(links.map(a=>[a.getAttribute('href').slice(1),a]));
const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){links.forEach(a=>a.classList.remove('on'));byId[e.target.id]?.classList.add('on');}},{rootMargin:'0px 0px -70% 0px'});
document.querySelectorAll('h1[id],h2[id]').forEach(h=>io.observe(h));
</script>
</body>
</html>
`;

writeFileSync(join(DIR, 'index.html'), page);
console.log(`документация: ${files.length} разделов, ${toc.length} пунктов оглавления → docs/index.html`);
