import { parseRecipes, normalize, methods, sources, homeCollection } from './recipes.js';
import { meals, pantry, pantryMatches, scaleIngredient, todayInBangkok, validServings } from './kitchen.js';
import { createPlanner } from './planner.js';

const icons = {
  leaf: '<path d="M20 4c-6 0-12 2-12 9a4 4 0 0 0 4 4c7 0 8-7 8-13Z M4 21l10-10"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  bookmark: '<path d="M6 5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const $ = selector => document.querySelector(selector);
const icon = name => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

for (const placeholder of document.querySelectorAll('[data-icon]')) {
  placeholder.innerHTML = icon(placeholder.dataset.icon);
}

const query = $('#query');
const region = $('#region');
const grid = $('#recipe-grid');
const meter = $('#result-count');
const more = $('#more');
const reset = $('#reset');
const savedNav = $('.saved-nav');
const dialog = $('#recipe-dialog');
const detail = $('#recipe-detail');
const quickFilter = $('#quick-filter');
const homeFilter = $('#home-collection');
const pantryToggle = $('#pantry-toggle');
const pantryOptions = $('#pantry-options');
const pantryClear = $('#pantry-clear');
const pageSize = 9;
const filters = new URL(location.href).searchParams;
const initialMethod = filters.get('method');
const state = {
  mode: 'healthy', method: methods.includes(initialMethod) ? initialMethod : '', quick: filters.get('quick') === '1',
  homeOnly: filters.get('collection') === homeCollection, savedOnly: false, limit: pageSize,
};
let recipes;
let byId;
let photoCredits;
let lastTrigger;
let jumpToPlan = false;
let saved = new Set();
let pantrySelected = new Set();
let pantryOn = false;
let pantryByRecipe = new Map();
const knownPantry = new Set(pantry.map(item => item.id));
const pantryFromLink = filters.get('pantry');
query.value = (filters.get('q') ?? '').slice(0,120);

try {
  const ids = JSON.parse(localStorage.getItem('food-everyday:saved') ?? '[]');
  if (Array.isArray(ids)) saved = new Set(ids);
  const storedPantry = JSON.parse(localStorage.getItem('food-everyday:pantry') ?? '[]');
  if (Array.isArray(storedPantry)) pantrySelected = new Set(storedPantry.filter(id => knownPantry.has(id)));
} catch {
  // The recipe catalog remains usable when browser storage is unavailable.
}

if (pantryFromLink) {
  pantrySelected = new Set(pantryFromLink.split(',').filter(id => knownPantry.has(id)));
  pantryOn = pantrySelected.size > 0;
  $('#pantry-panel').open = pantryOn;
}

function announce(message) {
  const status = dialog.open ? $('#recipe-status') : $('#site-status');
  if (status) status.textContent = message;
}

async function copy(value, success, fallback) {
  try {
    await navigator.clipboard.writeText(value);
    fallback.hidden = true;
    announce(success);
    return true;
  } catch {
    fallback.hidden = false;
    const field = fallback.querySelector('textarea, input');
    field.value = value;
    field.focus();
    field.select();
    return false;
  }
}

const planner = createPlanner({ escape, announce, copy });

function updatePantry() {
  for (const button of pantryOptions.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', pantrySelected.has(button.dataset.pantry));
  }
  const count = $('#pantry-count');
  count.textContent = pantrySelected.size + ' อย่าง';
  count.hidden = pantrySelected.size === 0;
  pantryToggle.disabled = pantrySelected.size === 0;
  pantryToggle.setAttribute('aria-pressed', pantryOn);
  pantryToggle.textContent = pantryOn ? 'หยุดกรองด้วยของในครัว' : 'กรองด้วยของที่เลือก';
  pantryClear.hidden = pantrySelected.size === 0;
}

function savePantry() {
  try { localStorage.setItem('food-everyday:pantry',JSON.stringify([...pantrySelected])); }
  catch { announce('เก็บของในครัวไม่ได้ ข้อมูลยังอยู่ขณะเปิดหน้าเว็บ'); }
}

function bookmark(recipe) {
  return '<button class="bookmark" type="button" data-save="' + recipe.id + '" aria-label="บันทึก ' +
    escape(recipe.name) + '" aria-pressed="' + saved.has(recipe.id) + '">' + icon('bookmark') + '</button>';
}

function media(recipe, detailView = false) {
  const cssClass = detailView ? 'detail-image' : 'card-media';
  const photo = photoCredits.files[photoCredits.recipes[recipe.id]];
  const alt = detailView ? 'ภาพถ่ายจานอาหารสำหรับประกอบสูตร ' + recipe.name : '';
  const loading = detailView ? 'eager' : 'lazy';
  return '<img class="' + cssClass + '" src="./images/' + escape(photo.file) + '.webp" alt="' + escape(alt) +
    '" loading="' + loading + '" decoding="async">';
}

function photoCredit(id, compact = false) {
  const photo = photoCredits.files[photoCredits.recipes[id]];
  const link = (href, label) => '<a href="' + escape(href) + '" target="_blank" rel="noopener noreferrer">' + escape(label) + '</a>';
  const license = photo.licenseUrl ? link(photo.licenseUrl, photo.license) : escape(photo.license);
  const artist = photo.creditUrl ? link(photo.creditUrl, photo.artist) : escape(photo.artist);
  const credit = compact ? link(photo.source, photo.artist) : link(photo.source, photo.title) + ' · ' + artist;
  return credit + ' · ' + license + (compact ? ' · ครอปภาพ' : ' · ปรับขนาดและครอปเพื่อแสดงผล');
}

function card(recipe, matches) {
  const found = matches ? pantry.filter(item => matches.has(item.id)).map(item => item.label) : [];
  return [
    '<article class="card"><a href="?recipe=' + recipe.id + '">',
    media(recipe), '<div class="card-copy">',
    '<span class="card-region">' + escape(recipe.region) + '</span>',
    '<h3>' + escape(recipe.name) + '</h3>',
    '<div class="card-meta"><span>' + icon('clock') + recipe.minutes + ' นาที</span><span aria-hidden="true">·</span><span>' +
      recipe.method + '</span></div>',
    found.length ? '<p class="card-match">มี ' + found.length + '/' + pantrySelected.size + ' อย่าง · ' + escape(found.join(' / ')) + '</p>' : '',
    '</div></a>', bookmark(recipe), '</article>',
  ].join('');
}

function updateSavedDisplay() {
  const count = $('#saved-count');
  count.textContent = [...saved].filter(id => byId.has(id)).length;
  count.hidden = count.textContent === '0';
  savedNav.setAttribute('aria-pressed', state.savedOnly);
}

function render() {
  if (!recipes) return;
  const words = normalize(query.value.trim()).split(/\s+/u).filter(Boolean);
  const selectedRegion = region.value;
  const matching = recipes.filter(recipe =>
    (state.savedOnly ? saved.has(recipe.id) : state.mode === 'all' || recipe.healthy) &&
    (!state.method || recipe.method === state.method) &&
    (!state.quick || recipe.minutes <= 20) &&
    (!state.homeOnly || recipe.collection === homeCollection) &&
    (!selectedRegion || [recipe.country, recipe.region].includes(selectedRegion)) &&
    words.every(word => recipe.search.includes(word))
  );
  const matchById = new Map();
  if (pantryOn) {
    for (const recipe of matching) {
      const present = pantryByRecipe.get(recipe.id);
      const matches = new Set([...pantrySelected].filter(id => present.has(id)));
      matchById.set(recipe.id,matches);
    }
    matching.sort((a,b) => matchById.get(b.id).size - matchById.get(a.id).size || a.minutes-b.minutes);
    while (matching.length && !matchById.get(matching.at(-1).id).size) matching.pop();
  } else if (state.quick) matching.sort((a, b) => a.minutes - b.minutes);

  grid.innerHTML = matching.slice(0, state.limit).map(recipe => card(recipe,matchById.get(recipe.id))).join('') ||
    '<p class="empty">' + (state.savedOnly && !saved.size
      ? 'แตะไอคอนบุ๊กมาร์กบนการ์ดสูตรเพื่อบันทึกเมนูโปรด'
      : 'ไม่พบเมนูที่ตรง ลองเปลี่ยนคำค้นหรือล้างตัวกรอง') + '</p>';
  meter.textContent = (state.savedOnly ? 'รายการโปรด' : state.homeOnly ? 'สูตรใหม่' : state.mode === 'healthy' ? 'เมนูสุขภาพ' : 'ทุกเมนู') +
    ' · ' + matching.length + ' เมนู' + (matching.length > pageSize ? ' · แสดง ' + Math.min(state.limit, matching.length) : '');
  more.hidden = matching.length <= state.limit;
  reset.hidden = !words.length && !selectedRegion && !state.method && !state.quick && !state.homeOnly && !pantryOn;
  updatePantry();
  quickFilter.setAttribute('aria-pressed', state.quick);
  homeFilter.setAttribute('aria-pressed', state.homeOnly);
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', !state.savedOnly && button.dataset.mode === state.mode);
  }
  for (const button of document.querySelectorAll('[data-method-filter]')) {
    button.setAttribute('aria-pressed', button.dataset.methodFilter === state.method);
  }
  updateSavedDisplay();
}

function refreshFilters() {
  state.limit = pageSize;
  render();
}

function updateFilterUrl() {
  const url = new URL(location.href);
  if (state.method) url.searchParams.set('method', state.method);
  else url.searchParams.delete('method');
  if (state.quick) url.searchParams.set('quick', '1');
  else url.searchParams.delete('quick');
  if (state.homeOnly) url.searchParams.set('collection', homeCollection);
  else url.searchParams.delete('collection');
  for (const [key,value] of [['q',query.value.trim()],['region',region.value],['pantry',pantryOn ? [...pantrySelected].join(',') : '']]) {
    if (value) url.searchParams.set(key,value);
    else url.searchParams.delete(key);
  }
  history.replaceState(history.state, '', url);
}

function clearFilters() {
  query.value = '';
  region.value = '';
  state.method = '';
  state.quick = false;
  state.homeOnly = false;
  pantryOn = false;
  updateFilterUrl();
  refreshFilters();
}

let step = 0;
let servings = 2;
let timerDeadline = 0;
let timerJob;

function timerUpdate() {
  const display = $('#timer-left');
  const remaining = Math.max(0,Math.ceil((timerDeadline-Date.now())/1000));
  if (display) display.textContent = timerDeadline ? Math.floor(remaining/60) + ':' + String(remaining%60).padStart(2,'0') : '—';
  const cancel = $('#timer-reset');
  if (cancel) cancel.disabled = !timerDeadline;
  if (!remaining && timerJob) {
    clearInterval(timerJob);
    timerJob = undefined;
    if (timerDeadline) announce('หมดเวลาที่ตั้งไว้แล้ว');
  }
}

function showStep(recipe) {
  $('#cook-progress').value = step + 1;
  $('#cook-step-count').textContent = 'ขั้นที่ ' + (step+1) + ' จาก ' + recipe.steps.length;
  $('#cook-step').textContent = recipe.steps[step];
  $('#cook-prev').disabled = step === 0;
  $('#cook-next').disabled = step === recipe.steps.length-1;
}

function cookingMode(on, recipe) {
  $('#cook-panel').hidden = !on;
  $('#all-steps').hidden = on;
  $('#cook-toggle').setAttribute('aria-pressed',on);
  $('#cook-toggle').textContent = on ? 'ดูทุกขั้นตอน' : 'เปิดโหมดทำอาหาร';
  if (on) showStep(recipe);
}

function renderRecipe(recipe) {
  servings = 2;
  step = 0;
  const ingredients = recipe.ingredients.map((item,index) =>
    '<li><label><input type="checkbox"><span data-ingredient-index="' + index + '">' + escape(item) + '</span></label></li>'
  ).join('');
  const steps = recipe.steps.map(item => '<li>' + escape(item) + '</li>').join('');
  const source = sources[recipe.source];
  detail.innerHTML = [
    '<div class="detail-head"><span class="card-region">' + escape(recipe.region) + '</span>',
    '<h2 id="recipe-title">' + escape(recipe.name) + '</h2>',
    '<p lang="en">' + escape(recipe.english) + '</p>',
    '<p>' + recipe.method + ' · ' + recipe.minutes + ' นาที · <span id="serving-summary">2 ที่</span></p>',
    bookmark(recipe), '</div><figure class="recipe-photo">', media(recipe, true),
    '<figcaption>ภาพถ่ายประกอบจานใกล้เคียง ส่วนผสมอาจต่างจากสูตร · ', photoCredit(recipe.id),
    '</figcaption></figure><div class="detail-body">',
    '<section class="health-note"><h3>ปรับให้เข้ากับมื้อสุขภาพ</h3><p>' + escape(recipe.tip) + '</p></section>',
    '<section><div class="recipe-subhead"><h3>วัตถุดิบ</h3><label class="field-inline">จำนวนที่ <select id="servings">' +
      Array.from({length:8},(_,i) => '<option value="' + (i+1) + '"' + (i===1 ? ' selected' : '') + '>' + (i+1) + '</option>').join('') +
      '</select></label></div><p id="serving-note" class="quiet" hidden>ปรับเฉพาะปริมาณที่ระบุชัดเจน วิธีทำและเวลาอิงสูตรเดิมสำหรับ 2 ที่</p>' +
      '<ul class="ingredients">' + ingredients + '</ul></section>',
    '<section><div class="recipe-subhead"><h3>วิธีทำ</h3><button id="cook-toggle" class="action" type="button" aria-pressed="false">เปิดโหมดทำอาหาร</button></div>',
    '<ol id="all-steps">' + steps + '</ol>',
    '<div id="cook-panel" class="cook-panel" hidden><progress id="cook-progress" aria-label="ความคืบหน้าวิธีทำ" max="' + recipe.steps.length +
      '" value="1"></progress><div aria-live="polite" aria-atomic="true"><span id="cook-step-count"></span><p id="cook-step"></p></div>' +
      '<div class="actions"><button id="cook-prev" class="action" type="button">ขั้นก่อน</button><button id="cook-next" class="action" type="button">ขั้นถัดไป</button></div>',
    '<form id="timer-form" class="timer"><label class="field-inline">ตั้งเวลา <input aria-label="นาทีที่ต้องการจับเวลา" name="minutes" type="number" min="1" max="180" value="5" required> นาที</label>' +
      '<button class="action" type="submit">เริ่มจับเวลา</button><button class="text-action" type="button" id="timer-reset">ล้างเวลา</button>' +
      '<span role="timer" id="timer-left" aria-label="เวลาที่เหลือ">—</span></form></div></section>',
    '<section class="recipe-controls"><details><summary>เพิ่มลงแผนมื้อ</summary><form id="add-meal" class="meal-form">' +
      '<label>วันที่ <input type="date" name="date" value="' + todayInBangkok() + '" min="2000-01-03" max="2099-12-27" required></label>' +
      '<label>มื้อ <select name="meal">' + meals.map(meal => '<option>' + meal + '</option>').join('') + '</select></label>' +
      '<button class="action primary" type="submit">เพิ่ม <span id="plan-servings">2</span> ที่ลงแผน</button></form></details>',
    '<div class="actions"><button class="text-action" id="copy-recipe" type="button">คัดลอกลิงก์สูตร</button>' +
      '<a class="recipe-page-link" href="./recipe/' + recipe.id + '/">เปิดหน้าสูตร</a></div>',
    '<label id="recipe-copy-fallback" hidden>เลือกลิงก์เพื่อคัดลอก<input readonly></label><p id="recipe-status" class="feedback" role="status"></p>' +
    '<button id="show-added-plan" class="text-action" type="button" hidden>ดูแผนมื้อ</button></section>',
    '<section><h3>เรื่องราวของเมนู</h3><p>' + escape(recipe.history) + '</p>',
    source ? '<a class="history-link" href="' + source[1] + '" target="_blank" rel="noopener noreferrer">' +
      escape(source[0]) + ' ↗</a>' : '',
    '</section></div>',
  ].join('');
  dialog.scrollTop = 0;
  timerUpdate();
}

function updateDialog() {
  if (!byId) return;
  const params = new URL(location.href).searchParams;
  const id = params.get('recipe');
  const recipe = byId.get(id);
  if (recipe) {
    renderRecipe(recipe);
    if (!dialog.open) dialog.showModal();
    if (params.get('cook') === '1') cookingMode(true,recipe);
    $('#close-recipe').focus();
  } else if (dialog.open) {
    dialog.close();
    if (jumpToPlan) {
      jumpToPlan = false;
      const url = new URL(location.href);
      url.hash = 'plan';
      history.replaceState(history.state, '', url);
      $('#plan-title').focus({preventScroll:true});
      $('#plan').scrollIntoView();
    } else if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
  }
  if (id && !recipe) {
    meter.textContent = 'ไม่พบสูตรจากลิงก์นี้ เลือกสูตรอื่นจากรายการด้านล่าง';
    $('#recipes').scrollIntoView();
  }
}

function closeRecipe() {
  if (history.state?.recipeOverlay) {
    history.back();
    return;
  }
  const url = new URL(location.href);
  url.searchParams.delete('recipe');
  url.searchParams.delete('cook');
  history.replaceState(history.state, '', url);
  updateDialog();
}

function addOptions() {
  const thai = recipes.filter(recipe => recipe.country === 'ไทย').map(recipe => recipe.region);
  const countries = recipes.filter(recipe => recipe.country !== 'ไทย').map(recipe => recipe.country);
  const sortThai = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'th'));
  for (const value of ['ไทย', ...sortThai(thai), ...sortThai(countries)]) {
    region.add(new Option(value, value));
  }
  $('#methods').innerHTML = ['', ...methods].map(method =>
    '<button type="button" data-method-filter="' + method + '" aria-pressed="false">' +
    (method || 'ทุกวิธีปรุง') + '</button>'
  ).join('');
  pantryOptions.innerHTML = pantry.map(item =>
    '<button class="action" type="button" data-pantry="' + item.id + '" aria-pressed="false">' + item.label + '</button>'
  ).join('');
  region.value = [...region.options].some(option => option.value === filters.get('region')) ? filters.get('region') : '';
}

function setupEvents() {
  function changeFilters() {
    updateFilterUrl();
    refreshFilters();
  }
  query.addEventListener('input', changeFilters);
  region.addEventListener('change', changeFilters);
  reset.addEventListener('click', clearFilters);
  $('#pantry-shortcut').addEventListener('click', () => { $('#pantry-panel').open = true; });
  pantryOptions.addEventListener('click', event => {
    const choice = event.target.closest('[data-pantry]');
    if (!choice) return;
    const id = choice.dataset.pantry;
    if (pantrySelected.has(id)) pantrySelected.delete(id);
    else pantrySelected.add(id);
    pantryOn = pantrySelected.size > 0;
    savePantry();
    changeFilters();
  });
  pantryToggle.addEventListener('click', () => {
    pantryOn = !pantryOn && pantrySelected.size > 0;
    changeFilters();
  });
  pantryClear.addEventListener('click', () => {
    pantrySelected.clear();
    pantryOn = false;
    savePantry();
    changeFilters();
    pantryOptions.querySelector('button')?.focus();
  });
  quickFilter.addEventListener('click', () => {
    state.quick = !state.quick;
    updateFilterUrl();
    refreshFilters();
  });
  homeFilter.addEventListener('click', () => {
    state.homeOnly = !state.homeOnly;
    state.savedOnly = false;
    updateFilterUrl();
    refreshFilters();
  });
  more.addEventListener('click', () => {
    const firstNew = state.limit;
    state.limit += pageSize;
    render();
    grid.querySelectorAll('.card > a')[firstNew]?.focus();
  });
  savedNav.addEventListener('click', () => {
    state.savedOnly = !state.savedOnly;
    clearFilters();
    $('#recipes').scrollIntoView();
  });
  $('.modes').addEventListener('click', event => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    state.mode = button.dataset.mode;
    state.savedOnly = false;
    refreshFilters();
  });
  $('#methods').addEventListener('click', event => {
    const button = event.target.closest('[data-method-filter]');
    if (!button) return;
    state.method = button.dataset.methodFilter;
    updateFilterUrl();
    refreshFilters();
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-save]');
    if (button) {
      const id = button.dataset.save;
      const isSaved = !saved.has(id);
      if (isSaved) saved.add(id);
      else saved.delete(id);
      try { localStorage.setItem('food-everyday:saved', JSON.stringify([...saved])); } catch {
        announce('เก็บรายการโปรดไม่ได้ ข้อมูลยังอยู่ขณะเปิดหน้าเว็บ');
      }
      if (state.savedOnly) render();
      document.querySelectorAll('[data-save="' + id + '"]').forEach(control => {
        control.setAttribute('aria-pressed', isSaved);
      });
      if (!button.isConnected) (grid.querySelector('[data-save]') ?? savedNav).focus();
      updateSavedDisplay();
      return;
    }
    const link = event.target.closest('a[href^="?recipe="]');
    if (!link || !byId || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    lastTrigger = link;
    const url = new URL(location.href);
    url.searchParams.set('recipe', new URL(link.href).searchParams.get('recipe'));
    url.searchParams.delete('cook');
    history.pushState({ recipeOverlay: true }, '', url);
    updateDialog();
  });
  detail.addEventListener('change', event => {
    if (event.target.id !== 'servings') return;
    const recipe = byId.get(new URL(location.href).searchParams.get('recipe'));
    const count = Number(event.target.value);
    if (!recipe || !validServings(count)) return;
    servings = count;
    $('#serving-summary').textContent = count + ' ที่';
    $('#plan-servings').textContent = count;
    $('#serving-note').hidden = count === 2;
    for (const item of detail.querySelectorAll('[data-ingredient-index]')) {
      item.textContent = scaleIngredient(recipe.ingredients[Number(item.dataset.ingredientIndex)],count);
    }
  });
  detail.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const recipe = byId.get(new URL(location.href).searchParams.get('recipe'));
    if (!recipe) return;
    if (button.id === 'cook-toggle') cookingMode($('#cook-panel').hidden,recipe);
    if (button.id === 'cook-prev' || button.id === 'cook-next') {
      step += button.id === 'cook-prev' ? -1 : 1;
      showStep(recipe);
      if (button.disabled) (button.id === 'cook-next' ? $('#cook-prev') : $('#cook-next')).focus();
    }
    if (button.id === 'timer-reset') {
      timerDeadline = 0;
      timerUpdate();
      $('#timer-form [name="minutes"]').focus();
    }
    if (button.id === 'copy-recipe') {
      copy(new URL('./recipe/' + recipe.id + '/',location.href).href,
        'คัดลอกลิงก์สูตรแล้ว',$('#recipe-copy-fallback'));
    }
    if (button.id === 'show-added-plan') {
      jumpToPlan = true;
      closeRecipe();
    }
  });
  detail.addEventListener('submit', event => {
    if (event.target.id !== 'add-meal' && event.target.id !== 'timer-form') return;
    event.preventDefault();
    const values = new FormData(event.target);
    if (event.target.id === 'add-meal') {
      const recipeId = new URL(location.href).searchParams.get('recipe');
      const added = planner.add(recipeId,values.get('date'),values.get('meal'),servings);
      announce(added.message);
      $('#show-added-plan').hidden = !added.ok;
      return;
    }
    const minutes = Number(values.get('minutes'));
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return;
    timerDeadline = Date.now() + minutes*60_000;
    if (!timerJob) timerJob = setInterval(timerUpdate,250);
    timerUpdate();
    announce('เริ่มจับเวลา ' + minutes + ' นาที');
  });
  $('#close-recipe').addEventListener('click', closeRecipe);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeRecipe();
  });
  window.addEventListener('popstate', updateDialog);
}

setupEvents();
try {
  const [response, credits] = await Promise.all([
    fetch(new URL('./recipes.txt', import.meta.url)),
    fetch(new URL('./photo-credits.json', import.meta.url)),
  ]);
  if (!response.ok || !credits.ok) throw new Error('Recipe collection unavailable');
  photoCredits = await credits.json();
  $('#hero-credit').innerHTML = photoCredit('tom-yum-goong', true);
  recipes = parseRecipes(await response.text());
  byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  pantryByRecipe = new Map(recipes.map(recipe => [recipe.id,pantryMatches(recipe.ingredients)]));
  planner.init(byId);
  addOptions();
  render();
  updateDialog();
} catch (error) {
  meter.textContent = 'โหลดสูตรไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง';
  console.error(error);
}
