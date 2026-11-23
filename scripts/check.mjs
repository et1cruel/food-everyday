import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { illustrated, methods, normalize, parseRecipes, sources } from '../public/recipes.js';

const text = await readFile(new URL('../public/recipes.txt', import.meta.url), 'utf8');
const recipes = parseRecipes(text);
const counts = new Map(methods.map(method => [method, 0]));
const ids = new Set();
const countries = new Set();

for (const line of text.trim().split(/\r?\n/u)) assert.equal(line.split('|').length, 12);
for (const recipe of recipes) {
  assert.match(recipe.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  assert.ok(!ids.has(recipe.id), recipe.id);
  ids.add(recipe.id);
  countries.add(recipe.country);
  assert.ok(methods.includes(recipe.method), recipe.method);
  counts.set(recipe.method, counts.get(recipe.method) + 1);
  assert.ok(recipe.name && recipe.english && recipe.tip && recipe.history && recipe.region);
  assert.ok(Number.isInteger(recipe.minutes) && recipe.minutes > 0);
  assert.ok(recipe.ingredients.length >= 4 && recipe.ingredients.every(Boolean));
  assert.ok(recipe.steps.length >= 3 && recipe.steps.every(Boolean));
  if (recipe.source) {
    assert.ok(Object.hasOwn(sources, recipe.source), recipe.source);
    assert.equal(new URL(sources[recipe.source][1]).protocol, 'https:');
  }
}

const images = await readdir(new URL('../public/images', import.meta.url));
assert.ok(images.includes('hero.webp'));
for (const id of illustrated) assert.ok(ids.has(id) && images.includes(id + '.webp'), id);
for (const [method, count] of counts) assert.ok(count > 0, method);
const healthy = recipes.filter(recipe => recipe.healthy);
assert.ok(healthy.length > 0 && healthy.length < recipes.length);
assert.ok(recipes.find(recipe => recipe.id === 'tom-yum-goong').search.includes(normalize('น้ำปลา')));
assert.ok(recipes.find(recipe => recipe.id === 'goi-cuon').search.includes(normalize('แตงกวา')));
console.log(recipes.length + ' recipes, ' + healthy.length + ' healthy picks, ' + countries.size +
  ' countries or regions, ' + methods.length + ' cooking categories');
