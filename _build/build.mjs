// node _build/build.mjs  →  index.html, <slug>/index.html, sitemap.xml 생성
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const ORIGIN = 'https://sunlitkoreakorea.github.io/game-sens-converter';
const SITE_NAME = '게임별 마우스 감도 변환기';
const CM_CONST = 360 * 2.54;
const TABLE_DPI = 800;

const games = JSON.parse(fs.readFileSync(path.join(here, 'games.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const today = new Date().toISOString().slice(0, 10);

// ---- 계산 (app.js와 동일) ----
const speedFor = (g, s) => (g.curve === 'exp15' ? g.base * 2 ** ((s - g.baseSens) / 15) : s * g.yaw);
const sensForSpeed = (g, v) => (g.curve === 'exp15' ? g.baseSens + 15 * Math.log2(v / g.base) : v / g.yaw);
const cmFromSpeed = (v, dpi) => CM_CONST / (v * dpi);
const speedFromCm = (cm, dpi) => CM_CONST / (cm * dpi);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n, d) => {
  let s = n.toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
};

// 정적 표에는 검증된 선형 yaw 게임만 (배그는 근사라서 제외). yaw가 같은 게임은 한 열로 묶는다.
const linear = games.filter((g) => !g.approx);
function groupsExcluding(gameId) {
  const map = new Map();
  for (const g of linear) {
    const key = String(g.yaw);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  return [...map.values()].filter((grp) => !grp.some((g) => g.id === gameId));
}
const groupLabel = (grp) => grp.map((g) => g.short).join(' · ') + (grp[0].unit === '%' ? ' (%)' : '');
const groupDec = (grp) => Math.max(...grp.map((g) => g.dec));
const cell = (grp, cm) => fmt(sensForSpeed(grp[0], speedFromCm(cm, TABLE_DPI)), groupDec(grp));

function table(caption, head, rows) {
  const th = head.map((h) => `<th scope="col">${esc(h)}</th>`).join('');
  const tr = rows
    .map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="tablewrap" tabindex="0" role="region" aria-label="${esc(caption)}"><table class="data"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// ---- 공통 조각 ----
const yawRows = games
  .map((g) => {
    if (g.curve) {
      return `          <tr><td>${esc(g.name)} (근사)</td><td>슬라이더 (지수)</td><td>${g.baseSens} = ${g.base}°, 15칸마다 ×2</td></tr>`;
    }
    return `          <tr><td>${esc(g.name)}</td><td>${g.unit === '%' ? '%' : '감도'}</td><td>${g.yaw}</td></tr>`;
  })
  .join('\n');

function linksPanel(currentId) {
  const items = games
    .filter((g) => g.id !== currentId)
    .map((g) => `<li><a href="${currentId === null ? '' : '../'}${g.slug}/">${esc(g.name)} 감도 변환기</a></li>`)
    .join('');
  const home = currentId === null ? '' : `<li><a href="../">전체 게임 감도 변환기</a></li>`;
  return `
  <section class="panel" aria-labelledby="h-links">
    <h2 id="h-links">게임별 감도 변환기</h2>
    <ul class="links">${home}${items}</ul>
  </section>`;
}

// ---- 홈 전용 ----
const cs2 = games.find((g) => g.id === 'cs2');
const valo = games.find((g) => g.id === 'valorant');
const cs2InValo = fmt(cs2.yaw / valo.yaw, 3);

const faq = [
  ['cm/360이란 무엇인가요?',
    '마우스를 일직선으로 움직여 게임 화면이 정확히 한 바퀴(360°) 돌 때 필요한 이동 거리(cm)입니다. 게임마다 감도 숫자의 의미가 달라서, 이 값을 기준으로 맞추면 다른 게임에서도 같은 손 움직임으로 같은 각도를 돌 수 있습니다.'],
  ['감도 숫자가 같으면 같은 감도인가요?',
    `아닙니다. 감도 1.0일 때 마우스 1카운트당 도는 각도(yaw)가 게임마다 다릅니다. 같은 DPI에서 발로란트 ${cs2InValo}는 CS2 1.0과 같은 속도로 돕니다. 반대로 CS2와 에이펙스처럼 yaw가 같은 게임은 DPI가 같다면 숫자를 그대로 옮겨도 됩니다.`],
  ['DPI를 바꾸면 감도도 바꿔야 하나요?',
    '같은 체감을 유지하려면 감도 × DPI(eDPI)를 같게 맞춰야 합니다. DPI를 800에서 1600으로 올리면 감도는 절반으로 내립니다. 이 변환기의 "변환 후 DPI" 칸에 새 DPI를 넣으면 자동으로 계산합니다. 배그는 슬라이더가 지수형이라 DPI가 2배가 되면 슬라이더를 15 낮춥니다.'],
  ['FOV가 다르면 어떻게 되나요?',
    '이 변환기는 360° 회전 거리만 맞춥니다. FOV가 다르면 같은 cm/360이어도 화면 속 물체가 움직이는 속도감이 다르게 느껴질 수 있습니다. 조준경(ADS)·줌 감도는 게임마다 따로 조정해야 합니다.'],
  ['내 cm/360은 어떻게 재나요?',
    '마우스패드 옆에 자를 놓고, 조준점을 화면 속 고정된 물체에 맞춘 뒤 마우스를 일직선으로 움직여 한 바퀴 돌아 같은 물체로 돌아올 때까지의 이동 거리를 잽니다. 이렇게 잰 값을 "cm/360 직접 입력"에 넣으면 됩니다.'],
  ['배틀그라운드 변환값은 정확한가요?',
    '근사값입니다. 배그 일반 감도는 슬라이더 15칸마다 속도가 2배가 되는 지수 곡선이고, 곡선의 모양은 한국 커뮤니티 자료에서 일치하지만 기준점은 제보된 대응값 1건으로 맞춘 값입니다. 정확히 맞추려면 직접 cm/360을 재서 "cm/360 직접 입력"으로 다른 게임 값을 구하세요.'],
];
const faqHtml = faq
  .map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`)
  .join('');

const homeCms = [15, 20, 25, 30, 35, 40, 45, 50, 60];
const homeGroups = groupsExcluding(null);
const homeTable = table(
  `cm/360별 게임 감도 대응표 (DPI ${TABLE_DPI} 기준)`,
  ['cm/360', ...homeGroups.map(groupLabel)],
  homeCms.map((cm) => [`${cm} cm`, ...homeGroups.map((grp) => cell(grp, cm))]),
);

// ---- 페이지 조립 ----
function render(vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v);
  const left = out.match(/\{\{[A-Z_]+\}\}/g);
  if (left) throw new Error('unreplaced placeholders: ' + [...new Set(left)].join(', '));
  return out;
}
const gamesJson = JSON.stringify(games).replace(/</g, '\\u003c');
const write = (rel, content) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
};

// 홈
{
  const url = `${ORIGIN}/`;
  const desc =
    '발로란트, CS2(카스), 오버워치 2, 배그, 에이펙스, 포트나이트 등 게임 간 마우스 감도를 cm/360 기준으로 변환합니다. DPI 직접 입력, eDPI·cm/360 계산, 게임별 감도 대응표 제공.';
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url,
    description: desc,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    inLanguage: 'ko',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
  };
  const extraTop = `
  <section class="panel" aria-labelledby="h-table">
    <h2 id="h-table">cm/360별 게임 감도 대응표</h2>
    <p class="note">마우스 DPI ${TABLE_DPI} 기준입니다. DPI가 1600이면 표의 값을 절반으로, 400이면 2배로 바꿔 보세요. 배그는 근사값이라 표에서 뺐습니다.</p>
    ${homeTable}
  </section>`;
  const extraBottom = `
  <section class="panel faq" aria-labelledby="h-faq">
    <h2 id="h-faq">자주 묻는 질문</h2>
    ${faqHtml}
  </section>${linksPanel(null)}`;
  write(
    'index.html',
    render({
      TITLE: '게임별 마우스 감도 변환기 — 발로란트·CS2·오버워치·배그·에이펙스',
      DESC: esc(desc), URL: url, ORIGIN, ROOT: '', PRESET: '',
      JSONLD: JSON.stringify(jsonld).replace(/</g, '\\u003c'),
      EYEBROW: '<span class="eyebrow">Game Sens Converter</span>',
      H1: SITE_NAME, EXTRA_TOP: extraTop, EXTRA_BOTTOM: extraBottom,
      YAW_ROWS: yawRows, GAMES_JSON: gamesJson,
    }),
  );
}

// 게임별 페이지
for (const g of games) {
  const url = `${ORIGIN}/${g.slug}/`;
  const others = games.filter((o) => o.id !== g.id);
  const title = `${g.short} 감도 변환기 — ${others.slice(0, 3).map((o) => o.short).join('·')} 감도로 바로 변환`;
  const yawText = g.curve
    ? '배그 일반 감도는 지수 곡선이라 별도 공식으로 계산합니다.'
    : `${g.name}의 yaw는 ${g.yaw}이며 감도별 대응표도 제공합니다.`;
  const desc = `${g.name} 감도와 DPI를 입력하면 ${others.slice(0, 4).map((o) => o.short).join('·')} 등의 같은 체감 감도를 cm/360 기준으로 계산합니다. ${yawText}`;

  let about;
  let tableHtml = '';
  if (g.curve) {
    about = [
      '배틀그라운드의 일반 감도는 다른 게임과 달리 선형이 아닙니다. 슬라이더가 15칸 올라갈 때마다 회전 속도가 2배가 되는 지수 곡선이라서, 감도 숫자에 yaw를 곱하는 방식으로는 정확히 변환할 수 없습니다.',
      `그래서 이 변환기는 슬라이더 ${g.baseSens}을 ${g.base}°/카운트로 두고 15칸마다 2배로 계산합니다. 곡선의 모양은 한국 커뮤니티 자료에서 확인된 것이지만, 기준점은 제보된 대응값 1건으로 맞춘 근사값입니다.`,
      '감도를 유지한 채 DPI만 바꿀 때는 간단합니다. DPI가 2배가 되면 슬라이더를 15 낮추면 됩니다. 예: 400 DPI·50 = 800 DPI·35 = 1600 DPI·20. 다른 게임과 정확히 맞추려면 직접 cm/360을 재서 "cm/360 직접 입력"으로 다른 게임 값을 구하세요.',
      '배그는 값이 근사라서 이 페이지에는 감도 대응표를 싣지 않았습니다.',
    ];
  } else {
    const same = linear.filter((o) => o.id !== g.id && o.yaw === g.yaw);
    const ratio = g.yaw / cs2.yaw;
    const cm = cmFromSpeed(speedFor(g, g.defaultSens), TABLE_DPI);
    about = [
      `${g.name}의 감도 1${g.unit}은 마우스가 1카운트 움직일 때 화면이 ${g.yaw}° 도는 값입니다(yaw ${g.yaw}). 같은 DPI라면 감도 숫자가 클수록 빠르게 돕니다.`,
      same.length
        ? `${same.map((o) => o.name).join(', ')}는 yaw가 같아서 DPI만 같다면 감도 숫자를 그대로 옮겨도 됩니다.`
        : 'yaw가 같은 게임이 없어서 다른 게임으로 옮길 때는 항상 변환이 필요합니다.',
    ];
    if (g.id !== 'cs2') {
      about.push(
        ratio > 1
          ? `같은 숫자의 감도라면 ${g.name}은 CS2보다 약 ${fmt(ratio, 2)}배 빠르게 돕니다.`
          : `같은 숫자의 감도라면 ${g.name}은 CS2보다 약 ${fmt(1 / ratio, 2)}배 느리게 돕니다.`,
      );
    }
    about.push(
      `예를 들어 ${g.name} ${g.defaultSens}${g.unit}(DPI ${TABLE_DPI})은 360° 회전에 약 ${fmt(cm, 1)}cm이고, 감도 × DPI는 ${fmt(g.defaultSens * TABLE_DPI, 1)}입니다.`,
    );

    const grps = groupsExcluding(g.id);
    tableHtml = `
  <section class="panel" aria-labelledby="h-table">
    <h2 id="h-table">${esc(g.short)} 감도별 다른 게임 대응표</h2>
    <p class="note">마우스 DPI ${TABLE_DPI} 기준입니다. DPI가 1600이면 표의 변환 값을 절반으로, 400이면 2배로 바꿔 보세요. 배그는 근사값이라 표에서 뺐습니다.</p>
    ${table(
      `${g.short} 감도별 다른 게임 대응표 (DPI ${TABLE_DPI} 기준)`,
      [`${g.short} 감도${g.unit ? ' (%)' : ''}`, 'cm/360', ...grps.map(groupLabel)],
      g.typical.map((s) => {
        const cm = cmFromSpeed(speedFor(g, s), TABLE_DPI);
        return [fmt(s, g.dec) + g.unit, `${fmt(cm, cm < 10 ? 2 : 1)} cm`, ...grps.map((grp) => cell(grp, cm))];
      }),
    )}
  </section>`;
  }

  const extraTop = `
  <section class="panel about" aria-labelledby="h-about">
    <h2 id="h-about">${esc(g.short)} 감도 정보</h2>
    ${about.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>${tableHtml}`;

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: `${g.short} 감도 변환기`,
      url,
      description: desc,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      inLanguage: 'ko',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: `${g.short} 감도 변환기`, item: url },
      ],
    },
  ];

  write(
    `${g.slug}/index.html`,
    render({
      TITLE: esc(title), DESC: esc(desc), URL: url, ORIGIN, ROOT: '../', PRESET: g.id,
      JSONLD: JSON.stringify(jsonld).replace(/</g, '\\u003c'),
      EYEBROW: '<a class="eyebrow" href="../">Game Sens Converter</a>',
      H1: `${esc(g.short)} 감도 변환기`, EXTRA_TOP: extraTop, EXTRA_BOTTOM: linksPanel(g.id),
      YAW_ROWS: yawRows, GAMES_JSON: gamesJson,
    }),
  );
}

// 사이트맵 (프로젝트 폴더용)
const urls = [{ loc: `${ORIGIN}/`, priority: '1.0' }, ...games.map((g) => ({ loc: `${ORIGIN}/${g.slug}/`, priority: '0.8' }))];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
      .join('\n') +
    `\n</urlset>\n`,
);

console.log(`built ${1 + games.length} pages + sitemap (${today})`);
