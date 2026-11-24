import { isDay, meals, shiftDay, shoppingList, todayInBangkok, validServings, weekStart } from './kitchen.js';

const storageKey = 'food-everyday:meal-plan';
const listKey = 'food-everyday:shopping-checks';
const selectedWeek = weekStart(todayInBangkok());
const readable = new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const dayLabel = new Intl.DateTimeFormat('th-TH',{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'});
const asDate = date => new Date(date+'T00:00:00Z');
const dateLabel = (date,format = readable) => format.format(asDate(date));

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function createPlanner({ escape, announce, copy }) {
  const panel = document.querySelector('#plan');
  const days = panel.querySelector('#plan-days');
  const shopping = panel.querySelector('#shopping-list');
  const dateText = panel.querySelector('#plan-range');
  const copyList = panel.querySelector('#copy-shopping');
  const shoppingStatus = panel.querySelector('#shopping-status');
  const previous = panel.querySelector('[data-week="-7"]');
  const next = panel.querySelector('[data-week="7"]');
  let week = selectedWeek;
  let byId = new Map();
  let entries = readList(storageKey).filter(entry =>
    isDay(entry?.date) && meals.includes(entry.meal) && typeof entry.recipeId === 'string' &&
    typeof entry.key === 'string' && validServings(entry.servings)
  );
  const checked = new Map(readList(listKey).filter(pair =>
    Array.isArray(pair) && pair.length === 2 && isDay(pair[0]) && Array.isArray(pair[1])
  ).map(([date, keys]) => [date, new Set(keys.filter(key => typeof key === 'string'))]));

  function persist(key, value) {
    try {
      localStorage.setItem(key,JSON.stringify(value));
      return true;
    } catch {
      announce('เก็บข้อมูลไม่ได้ในเบราว์เซอร์นี้ ข้อมูลยังอยู่ขณะเปิดหน้าเว็บ');
      return false;
    }
  }

  function thisWeek() {
    const end = shiftDay(week,6);
    return entries.filter(entry => entry.date >= week && entry.date <= end && byId.has(entry.recipeId));
  }

  function shoppingItems() {
    return shoppingList(thisWeek(),byId);
  }

  function renderShopping() {
    const items = shoppingItems();
    const marks = checked.get(week);
    shopping.innerHTML = items.length ? items.map(({key,text}, index) =>
      '<li><label><input type="checkbox" data-shopping="' + index + '"' +
      (marks?.has(key) ? ' checked' : '') + '><span>' + escape(text) + '</span></label></li>'
    ).join('') : '<li class="quiet">เพิ่มสูตรในสัปดาห์นี้เพื่อรวมรายการซื้อของ</li>';
    copyList.disabled = !items.some(item => !marks?.has(item.key));
    shoppingStatus.textContent = '';
  }

  function render() {
    dateText.textContent = readable.formatRange(asDate(week),asDate(shiftDay(week,6)));
    previous.disabled = !isDay(shiftDay(week,-7));
    next.disabled = !isDay(shiftDay(week,13));
    const planned = thisWeek();
    const today = todayInBangkok();
    days.innerHTML = Array.from({length:7},(_,offset) => {
      const date = shiftDay(week,offset);
      const items = planned.filter(entry => entry.date === date);
      const groups = meals.map(meal => {
        const matching = items.filter(entry => entry.meal === meal);
        if (!matching.length) return '';
        return '<div class="day-meal"><h4>มื้อ' + meal + '</h4><ul>' + matching.map(entry => {
          const recipe = byId.get(entry.recipeId);
          return '<li><a href="?recipe=' + escape(recipe.id) + '">' + escape(recipe.name) + '</a><small>' +
            entry.servings + ' ที่</small><button type="button" data-remove-meal="' + escape(entry.key) +
            '" aria-label="นำ ' + escape(recipe.name) + ' ออกจากวันที่ ' + escape(dateLabel(date)) + ' มื้อ' + meal + '">×</button></li>';
        }).join('') + '</ul></div>';
      }).join('');
      return '<article class="plan-day"><h3' + (date === today ? ' aria-current="date"' : '') + '>' +
        escape(dateLabel(date,dayLabel)) + '</h3>' + (groups || '<p class="quiet">ยังไม่ได้วางมื้อ</p>') + '</article>';
    }).join('');
    renderShopping();
  }

  panel.addEventListener('click', event => {
    const jump = event.target.closest('[data-week]');
    if (jump) {
      const target = jump.dataset.week === 'today' ? weekStart(todayInBangkok()) : shiftDay(week,Number(jump.dataset.week));
      if (isDay(target) && isDay(shiftDay(target,6))) {
        week = target;
        render();
      }
      return;
    }
    const remove = event.target.closest('[data-remove-meal]');
    if (remove) {
      entries = entries.filter(entry => entry.key !== remove.dataset.removeMeal);
      const ok = persist(storageKey,entries);
      render();
      panel.querySelector('#plan-title').focus({preventScroll:true});
      if (ok) announce('นำเมนูออกจากแผนแล้ว');
    }
  });

  shopping.addEventListener('change', event => {
    const input = event.target.closest('[data-shopping]');
    const item = input && shoppingItems()[Number(input.dataset.shopping)];
    if (!item) return;
    if (!checked.has(week)) checked.set(week,new Set());
    const marks = checked.get(week);
    if (input.checked) marks.add(item.key);
    else marks.delete(item.key);
    copyList.disabled = shoppingItems().every(entry => marks.has(entry.key));
    shoppingStatus.textContent = '';
    persist(listKey,[...checked].map(([date,keys]) => [date,[...keys]]));
  });

  copyList.addEventListener('click', async () => {
    const marks = checked.get(week);
    const copied = await copy(shoppingItems().filter(item => !marks?.has(item.key)).map(item => '• '+item.text).join('\n'),
      'คัดลอกรายการซื้อของแล้ว',panel.querySelector('#shopping-copy-fallback'));
    shoppingStatus.textContent = copied ? 'คัดลอกรายการซื้อของแล้ว' : '';
  });

  return {
    init(index) { byId = index; render(); },
    add(recipeId,date,meal,servings) {
      if (!byId.has(recipeId) || !isDay(date) || !meals.includes(meal) || !validServings(servings)) {
        return {ok:false,message:'เลือกวัน มื้อ และจำนวนที่ก่อนเพิ่ม'};
      }
      const key = globalThis.crypto?.randomUUID?.() ?? Date.now()+'-'+Math.random();
      entries.push({recipeId,date,meal,servings,key});
      const ok = persist(storageKey,entries);
      const monday = weekStart(date);
      if (isDay(monday) && isDay(shiftDay(monday,6))) week = monday;
      render();
      const line = 'เพิ่มมื้อ' + meal + ' วันที่ ' + dateLabel(date) + ' แล้ว';
      return {ok:true,message:ok ? line : line + ' ในหน้านี้'};
    },
  };
}
