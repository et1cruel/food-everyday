import { parseRecipes, normalize, methods, sources } from './recipes.js';

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
const pageSize = 9;
const filters = new URL(location.href).searchParams;
const initialMethod = filters.get('method');
const state = {
  mode: 'healthy', method: methods.includes(initialMethod) ? initialMethod : '', quick: filters.get('quick') === '1',
  savedOnly: false, limit: pageSize,
};
let recipes;
let byId;
let photoCredits;
let lastTrigger;
let saved = new Set();

try {
  const ids = JSON.parse(localStorage.getItem('food-everyday:saved') ?? '[]');
  if (Array.isArray(ids)) saved = new Set(ids);
} catch {
  // The recipe catalog remains usable when browser storage is unavailable.
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
  const credit = compact ? link(photo.source, photo.artist) : link(photo.source, photo.title) + ' · ' + escape(photo.artist);
  return credit + ' · ' + license + ' · ปรับขนาดและครอปเพื่อแสดงผล';
}

function card(recipe) {
  return [
    '<article class="card"><a href="?recipe=' + recipe.id + '">',
    media(recipe), '<div class="card-copy">',
    '<span class="card-region">' + escape(recipe.region) + '</span>',
    '<h3>' + escape(recipe.name) + '</h3>',
    '<div class="card-meta"><span>' + icon('clock') + recipe.minutes + ' นาที</span><span aria-hidden="true">·</span><span>' +
      recipe.method + '</span></div>',
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
    (!selectedRegion || [recipe.country, recipe.region].includes(selectedRegion)) &&
    words.every(word => recipe.search.includes(word))
  );
  if (state.quick) matching.sort((a, b) => a.minutes - b.minutes);

  grid.innerHTML = matching.slice(0, state.limit).map(card).join('') ||
    '<p class="empty">' + (state.savedOnly && !saved.size
      ? 'แตะไอคอนบุ๊กมาร์กบนการ์ดสูตรเพื่อบันทึกเมนูโปรด'
      : 'ไม่พบเมนูที่ตรง ลองเปลี่ยนคำค้นหรือล้างตัวกรอง') + '</p>';
  meter.textContent = (state.savedOnly ? 'รายการโปรด' : state.mode === 'healthy' ? 'เมนูสุขภาพ' : 'ทุกเมนู') +
    ' · ' + matching.length + ' เมนู' + (matching.length > pageSize ? ' · แสดง ' + Math.min(state.limit, matching.length) : '');
  more.hidden = matching.length <= state.limit;
  reset.hidden = !words.length && !selectedRegion && !state.method && !state.quick;
  quickFilter.setAttribute('aria-pressed', state.quick);
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
  history.replaceState(history.state, '', url);
}

function clearFilters() {
  query.value = '';
  region.value = '';
  state.method = '';
  state.quick = false;
  updateFilterUrl();
  refreshFilters();
}

function renderRecipe(recipe) {
  const ingredients = recipe.ingredients.map(item =>
    '<li><label><input type="checkbox"><span>' + escape(item) + '</span></label></li>'
  ).join('');
  const steps = recipe.steps.map(step => '<li>' + escape(step) + '</li>').join('');
  const source = sources[recipe.source];
  detail.innerHTML = [
    '<div class="detail-head"><span class="card-region">' + escape(recipe.region) + '</span>',
    '<h2 id="recipe-title">' + escape(recipe.name) + '</h2>',
    '<p lang="en">' + escape(recipe.english) + '</p>',
    '<p>' + recipe.method + ' · ' + recipe.minutes + ' นาที · 2 ที่</p>',
    bookmark(recipe), '</div><figure class="recipe-photo">', media(recipe, true),
    '<figcaption>ภาพถ่ายประกอบจานใกล้เคียง ส่วนผสมอาจต่างจากสูตร · ', photoCredit(recipe.id),
    '</figcaption></figure><div class="detail-body">',
    '<section class="health-note"><h3>ปรับให้เข้ากับมื้อสุขภาพ</h3><p>' + escape(recipe.tip) + '</p></section>',
    '<section><h3>วัตถุดิบ</h3><ul class="ingredients">' + ingredients + '</ul></section>',
    '<section><h3>วิธีทำ</h3><ol>' + steps + '</ol></section>',
    '<section><h3>เรื่องราวของเมนู</h3><p>' + escape(recipe.history) + '</p>',
    source ? '<a class="history-link" href="' + source[1] + '" target="_blank" rel="noopener noreferrer">' +
      escape(source[0]) + ' ↗</a>' : '',
    '</section></div>',
  ].join('');
  dialog.scrollTop = 0;
}

function updateDialog() {
  if (!byId) return;
  const id = new URL(location.href).searchParams.get('recipe');
  const recipe = byId.get(id);
  if (recipe) {
    renderRecipe(recipe);
    if (!dialog.open) dialog.showModal();
    $('#close-recipe').focus();
  } else if (dialog.open) {
    dialog.close();
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
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
}

function setupEvents() {
  query.addEventListener('input', refreshFilters);
  region.addEventListener('change', refreshFilters);
  reset.addEventListener('click', clearFilters);
  quickFilter.addEventListener('click', () => {
    state.quick = !state.quick;
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
        // Keep the saved items available for the current visit.
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
    history.pushState({ recipeOverlay: true }, '', url);
    updateDialog();
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
  addOptions();
  render();
  updateDialog();
} catch (error) {
  meter.textContent = 'โหลดสูตรไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง';
  console.error(error);
}
