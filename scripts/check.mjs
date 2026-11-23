import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { methods, normalize, parseRecipes, sources, homeCollection } from '../public/recipes.js';

const text = await readFile(new URL('../public/recipes.txt', import.meta.url), 'utf8');
const credits = JSON.parse(await readFile(new URL('../public/photo-credits.json', import.meta.url), 'utf8'));
const recipes = parseRecipes(text);
const counts = new Map(methods.map(method => [method, 0]));
const ids = new Set();
const countries = new Set();

for (const line of text.trim().split(/\r?\n/u)) assert.ok([12, 13].includes(line.split('|').length));
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
  assert.ok(recipe.steps.length >= 4 && recipe.steps.every(Boolean));
  assert.ok(!recipe.collection || recipe.collection === homeCollection, recipe.id);
  assert.ok(Object.hasOwn(credits.files, credits.recipes[recipe.id]), 'Missing photo credit for ' + recipe.id);
  if (recipe.source) {
    assert.ok(Object.hasOwn(sources, recipe.source), recipe.source);
    assert.equal(new URL(sources[recipe.source][1]).protocol, 'https:');
  }
}

assert.equal(Object.keys(credits.recipes).length, ids.size);
for (const credit of Object.values(credits.files)) {
  assert.match(credit.file, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  assert.equal(new URL(credit.source).hostname, 'commons.wikimedia.org');
  if (credit.creditUrl) assert.equal(new URL(credit.creditUrl).protocol, 'https:');
  assert.ok(credit.artist && credit.license && credit.title);
}
await Promise.all(['hero', ...Object.values(credits.files).map(photo => photo.file)].map(async id => {
  const image = await readFile(new URL('../public/images/' + id + '.webp', import.meta.url));
  assert.equal(image.toString('ascii', 0, 4), 'RIFF', id);
  assert.equal(image.toString('ascii', 8, 12), 'WEBP', id);
}));
for (const [method, count] of counts) assert.ok(count > 0, method);
const homeRecipes = recipes.filter(recipe => recipe.collection === homeCollection);
assert.equal(homeRecipes.length, 350);
for (const method of methods) assert.equal(homeRecipes.filter(recipe => recipe.method === method).length, 50, method);
assert.ok(homeRecipes.every(recipe => recipe.healthy && recipe.steps.length >= 5));
const healthy = recipes.filter(recipe => recipe.healthy);
assert.ok(healthy.length > 0 && healthy.length < recipes.length);
assert.ok(recipes.find(recipe => recipe.id === 'tom-yum-goong').search.includes(normalize('น้ำปลา')));
assert.ok(recipes.find(recipe => recipe.id === 'goi-cuon').search.includes(normalize('แตงกวา')));
console.log(recipes.length + ' recipes, ' + healthy.length + ' healthy picks, ' + countries.size +
  ' countries or regions, ' + methods.length + ' cooking categories');
