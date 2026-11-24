import { normalize } from './recipes.js';

const pantryEntries = [
  ['egg','ไข่',['ไข่ ','ไข่ต้ม','ไข่ไก่']],
  ['chicken','ไก่',['ไก่','อกไก่','น่องไก่','สะโพกไก่']],
  ['fish','ปลา',['ปลา ','ปลากะพง','ปลานิล','ปลาทู','ปลาย่าง','ปลาสุก','ปลาทะเล','ปลาเนื้อ','ปลาแมกเคอเรล','เนื้อปลา','แซลมอน']],
  ['shrimp','กุ้ง',['กุ้ง']],
  ['tofu','เต้าหู้',['เต้าหู้']],
  ['rice','ข้าว',['ข้าวสุก','ข้าวกล้อง','ข้าวสวย','ข้าวขาว']],
  ['cabbage','กะหล่ำปลี',['กะหล่ำปลี','กะหล่ำม่วง']],
  ['carrot','แครอต',['แครอต','แครอท']],
  ['pumpkin','ฟักทอง',['ฟักทอง']],
  ['broccoli','บรอกโคลี',['บรอกโคลี','บร็อกโคลี']],
  ['tomato','มะเขือเทศ',['มะเขือเทศ']],
  ['mushroom','เห็ด',['เห็ด']],
  ['cucumber','แตงกวา',['แตงกวา']],
  ['corn','ข้าวโพด',['ข้าวโพด']],
  ['beans','ถั่วต้ม',['ถั่วขาวต้ม','ถั่วดำต้ม','ถั่วลูกไก่ต้ม','เลนทิล']],
];
export const pantry = pantryEntries.map(([id,label,aliases]) => ({id,label,aliases:aliases.map(normalize)}));

export function pantryMatches(ingredients) {
  const normalized = ingredients.map(normalize);
  return new Set(pantry.filter(({aliases}) =>
    normalized.some(item => aliases.some(alias => item.startsWith(alias)))
  ).map(({id}) => id));
}

const amount = '(?:\\d+ \\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?)';
const units = ['ช้อนโต๊ะ','ช้อนชา','มิลลิลิตร','มล.','กิโลกรัม','กรัม','ถ้วยตวง','ถ้วย','ฟอง','กลีบ','ลูก',
  'หัว','ต้น','แว่น','เม็ด','กิ่ง','ใบ','แท่ง','ดอก','แผ่น','ชิ้น','น่อง','หลอด','หยิบมือ'];
const escapedUnits = units.map(unit => unit.replace('.','\\.')).join('|');
const quantity = new RegExp('^(.+?)\\s+(' + amount + ')(?:\\s*[–-]\\s*(' + amount + '))?\\s*(' + escapedUnits +
  ')(?=$|\\s)(.*)$','u');

function numeric(value) {
  return value.split(' ').reduce((sum, part) => {
    const [numerator,denominator] = part.split('/').map(Number);
    return sum + (denominator === undefined ? numerator : numerator / denominator);
  },0);
}

export function splitIngredient(text) {
  const digits = text.replace(/[๐-๙]/gu, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const match = digits.match(quantity);
  if (!match) return null;
  const [,name,low,high,originalUnit,tail] = match;
  const amounts = [numeric(low),...(high === undefined ? [] : [numeric(high)])];
  if (/\d/u.test(name+tail) || amounts.some(number => !Number.isFinite(number) || number <= 0) ||
      (amounts.length === 2 && amounts[1] < amounts[0])) return null;
  const unit = originalUnit === 'มิลลิลิตร' ? 'มล.' : originalUnit;
  return { name, amounts, unit, originalUnit, tail };
}

function displayNumber(value) {
  const whole = Math.floor(value);
  for (const [num,denom] of [[1,8],[1,4],[1,3],[3,8],[1,2],[5,8],[2,3],[3,4],[7,8]]) {
    if (Math.abs(value - whole - num / denom) < 1e-8) return (whole ? whole + ' ' : '') + num + '/' + denom;
  }
  return String(Number(value.toFixed(2)));
}

function describe(item, unit = item.unit) {
  return item.name + ' ' + item.amounts.map(displayNumber).join('–') + ' ' + unit + item.tail;
}

export function scaleIngredient(text, servings) {
  if (servings === 2) return text;
  const item = splitIngredient(text);
  if (!item) return text;
  item.amounts = item.amounts.map(value => value * servings / 2);
  return describe(item, item.originalUnit);
}

export const meals = ['เช้า','กลางวัน','เย็น'];
const dayMs = 24*60*60*1000;
const localeDay = new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Bangkok', year:'numeric',month:'2-digit',day:'2-digit',
});
const isoDay = date => date.toISOString().slice(0,10);

export function todayInBangkok(now = new Date()) {
  const parts = Object.fromEntries(localeDay.formatToParts(now).map(({type,value}) => [type,value]));
  return [parts.year,parts.month,parts.day].join('-');
}

export function shiftDay(day, increment) {
  return isoDay(new Date(Date.parse(day+'T00:00:00Z') + increment*dayMs));
}

export function isDay(day) {
  if (typeof day !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/u.test(day)) return false;
  const date = new Date(day+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && isoDay(date) === day;
}

export function weekStart(day) {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  return shiftDay(day, -((weekday + 6) % 7));
}

export function validServings(value) {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

export function shoppingList(entries, byId) {
  const groups = new Map();
  for (const {recipeId,servings} of entries) {
    for (const text of byId.get(recipeId)?.ingredients ?? []) {
      const item = splitIngredient(text);
      const key = item ? JSON.stringify([normalize(item.name),item.unit,item.tail]) : normalize(text);
      if (!item) {
        if (!groups.has(key)) groups.set(key,{text});
        continue;
      }
      if (!groups.has(key)) groups.set(key, {...item, amounts:[0,0]});
      const total = groups.get(key).amounts;
      total[0] += item.amounts[0] * servings / 2;
      total[1] += (item.amounts[1] ?? item.amounts[0]) * servings / 2;
    }
  }
  return [...groups.entries()].map(([key,item]) => {
    const text = item.text ?? describe({...item,amounts:Math.abs(item.amounts[0]-item.amounts[1])<1e-8 ?
      [item.amounts[0]] : item.amounts});
    return {key:JSON.stringify([key,text]),text};
  }).sort((a,b) => a.text.localeCompare(b.text,'th'));
}
