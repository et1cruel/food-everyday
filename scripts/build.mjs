import { cp, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecipes, sources } from '../public/recipes.js';

const base = 'https://food-everyday.pages.dev';
const root = await realpath(fileURLToPath(new URL('..',import.meta.url)));
const output = join(root,'dist');
const assets = join(root,'public');
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const absolute = path => base + path;
const urlFor = recipe => '/recipe/' + recipe.id + '/';
const textList = (items,tag) => '<'+tag+'>'+items.map(item=>'<li>'+escape(item)+'</li>').join('')+'</'+tag+'>';
const external = (url,text) => '<a href="'+escape(url)+'" rel="noopener noreferrer">'+escape(text)+'</a>';

function recipePage(recipe,photo) {
  const canonical = absolute(urlFor(recipe));
  const description = recipe.name + ' สูตรสำหรับ 2 ที่ ใช้เวลาประมาณ ' + recipe.minutes + ' นาที พร้อมวัตถุดิบและวิธีทำ';
  const image = '/images/'+photo.file+'.webp';
  const cook = '/?recipe='+encodeURIComponent(recipe.id)+'&cook=1';
  const source = sources[recipe.source];
  const data = {
    '@context':'https://schema.org','@type':'Recipe',
    name:recipe.name,description,inLanguage:'th',url:canonical,totalTime:'PT'+recipe.minutes+'M',
    recipeYield:'2',recipeIngredient:recipe.ingredients,
    recipeInstructions:recipe.steps.map(text=>({'@type':'HowToStep',text})),
  };
  const credit = external(photo.source,photo.title) + ' · ' +
    (photo.creditUrl ? external(photo.creditUrl,photo.artist) : escape(photo.artist)) + ' · ' +
    (photo.licenseUrl ? external(photo.licenseUrl,photo.license) : escape(photo.license)) + ' · ปรับขนาดเพื่อแสดงผล';
  return '<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="theme-color" content="#f7f6ef">\n' +
    '<title>'+escape(recipe.name)+' | FOOD EVERYDAY</title>\n'+
    '<meta name="description" content="'+escape(description)+'">\n<link rel="canonical" href="'+canonical+'">\n' +
    '<meta property="og:title" content="'+escape(recipe.name)+' | FOOD EVERYDAY">\n' +
    '<meta property="og:description" content="'+escape(description)+'">\n'+
    '<meta property="og:url" content="'+canonical+'">\n<meta property="og:type" content="article">\n'+
    '<meta property="og:locale" content="th_TH">\n<meta property="og:image" content="'+absolute(image)+'">\n'+
    '<meta property="og:image:alt" content="ภาพถ่ายประกอบสูตร '+escape(recipe.name)+'">\n'+
    '<link rel="icon" href="/images/icon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="/style.css">\n'+
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n'+
    '<script type="application/ld+json">'+JSON.stringify(data).replace(/</g,'\\u003c')+'</script>\n</head>\n<body>\n' +
    '<header class="site-header"><div class="wrap header-inner"><a href="/" class="logo"><img src="/images/icon.svg" alt="" width="38" height="38"><span>food<span class="brand-accent">everyday.</span></span></a><a class="plan-nav" href="/#recipes">ค้นหาสูตร</a></div></header>\n'+
    '<main class="wrap standalone"><div class="standalone-head"><span class="card-region">'+escape(recipe.region)+'</span>'+
    '<h1>'+escape(recipe.name)+'</h1><span lang="en">'+escape(recipe.english)+'</span>'+
    '<span class="quiet">'+escape(recipe.method)+' · '+recipe.minutes+' นาที · 2 ที่</span>'+
    '<div class="actions"><a class="action primary" href="'+escape(cook)+'">เปิดโหมดทำอาหาร</a></div></div>\n'+
    '<figure class="recipe-photo"><img class="detail-image" src="'+image+'" alt="ภาพถ่ายประกอบสูตร '+escape(recipe.name)+'"><figcaption>ภาพถ่ายจานใกล้เคียง ส่วนผสมอาจต่างจากสูตร · '+credit+'</figcaption></figure>\n'+
    '<div class="detail-body"><section class="health-note"><h2>ปรับให้เข้ากับมื้อสุขภาพ</h2><p>'+escape(recipe.tip)+'</p></section>'+
    '<section><h2>วัตถุดิบ</h2>'+textList(recipe.ingredients,'ul')+'</section>'+
    '<section><h2>วิธีทำ</h2>'+textList(recipe.steps,'ol')+'</section>'+
    '<section><h2>เรื่องราวของเมนู</h2><p>'+escape(recipe.history)+'</p>'+(source ? external(source[1],source[0]) : '')+'</section></div>\n'+
    '</main></body></html>\n';
}

const existing = await lstat(output).catch(error => {
  if (error.code !== 'ENOENT') throw error;
});
if (existing) {
  if (!existing.isDirectory() || existing.isSymbolicLink() || await realpath(output) !== output) {
    throw new Error('dist must be a regular directory directly inside this repository');
  }
  await rm(output,{recursive:true});
}
await cp(assets,output,{recursive:true});
const recipes = parseRecipes(await readFile(join(assets,'recipes.txt'),'utf8'));
const credits = JSON.parse(await readFile(join(assets,'photo-credits.json'),'utf8'));
for (const recipe of recipes) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(recipe.id)) throw new Error('Invalid recipe identifier');
  const folder = join(output,'recipe',recipe.id);
  await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'index.html'),recipePage(recipe,credits.files[credits.recipes[recipe.id]]));
}
const sitemap = ['/',...recipes.map(urlFor)].map(path=>'<url><loc>'+absolute(path)+'</loc></url>').join('\n');
await writeFile(join(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+sitemap+'\n</urlset>\n');
await writeFile(join(output,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: '+absolute('/sitemap.xml')+'\n');
await writeFile(join(output,'404.html'),'<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ไม่พบสูตร | FOOD EVERYDAY</title><link rel="stylesheet" href="/style.css"><main class="wrap standalone"><h1>ไม่พบหน้านี้</h1><p><a class="action" href="/#recipes">กลับไปค้นหาสูตร</a></p></main></html>\n');
console.log('Built',recipes.length,'static recipe pages in dist');
