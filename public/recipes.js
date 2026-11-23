export const methods = ['ต้ม', 'ผัด', 'ทอด', 'นึ่ง', 'ย่าง/อบ', 'สลัด/ยำ'];

export const sources = {
  tom: ['UNESCO · ต้มยำกุ้ง', 'https://ich.unesco.org/en/RL/tomyum-kung-01879'],
  thai: ['Thailand.go.th · อาหารเด่นแต่ละภาค', 'https://thailand.go.th/public/issue-focus-detail/009-013'],
  mekong: ['ททท. · มรดกอาเซียนลุ่มน้ำโขง', 'https://tourismproduct.tourismthailand.org/wp-content/uploads/2023/01/ASEAN-HT_3_Mekong_Online-Spread144.pdf'],
  korea: ['Korea.net · สูตรจากครัวตระกูลเกาหลี', 'https://www.korea.net/NewsFocus/Culture/view?articleId=164488'],
  gimbap: ['Korea.net · คิมบับในวัฒนธรรมเกาหลี', 'https://www.korea.net/K-InfoHub/SubMainDetail/view?articleId=4091&headwordCd=72&headwordGroupCd=28&pageIndex=1'],
  sundubu: ['Korea.net · ซุปเต้าหู้อ่อน', 'https://www.korea.net/NewsFocus/Culture/view?articleId=131355'],
  washoku: ['MAFF ญี่ปุ่น · สำรับวาโชกุ', 'https://www.maff.go.jp/j/shokusan/gaisyoku/pamphlet/pdf/washoku_english.pdf'],
  udon: ['MAFF ญี่ปุ่น · ซุปอูด้งคางาวะ', 'https://www.maff.go.jp/e/policies/market/k_ryouri/search_menu/3970/index.html'],
  dango: ['MAFF ญี่ปุ่น · ดังโงะจิรุ', 'https://www.maff.go.jp/e/policies/market/k_ryouri/search_menu/330/index.html'],
  rolls: ['Vietnam Tourism · อาหารม้วนเวียดนาม', 'https://vietnam.travel/node/780'],
  vietnam: ['Vietnam Tourism · อาหารเวียดนาม', 'https://vietnam.travel/things-to-do/21-must-try-vietnamese-dishes/'],
  vnhome: ['Vietnam Tourism · สูตรทำที่บ้าน', 'https://vietnam.travel/node/1249'],
  gaz: ['Real Academia de Gastronomía · กัซปาโช', 'https://artsandculture.google.com/story/gazpacho-real-academia-de-gastronomia-espa%C3%B1ola/MAWRbRJhXh12yQ?hl=en-US'],
  liguria: ['Italia.it · มิเนสโตรเนแบบเจนัว', 'https://www.italia.it/en/liguria/things-to-do/winter-notes'],
  nice: ['Atout France · อาหารท้องถิ่นนีซ', 'https://jp-res.france.fr/DP2014/villes/articles/nice.pdf'],
  cous: ['UNESCO · ธรรมเนียมคูสคูส', 'https://ich.unesco.org/en/RL/knowledge-know-how-and-practices-pertaining-to-the-production-and-consumption-of-couscous-01602'],
  joumou: ['UNESCO · ซุปจูมู', 'https://ich.unesco.org/en/RL/joumou-soup-01853'],
  mexico: ['UNESCO · อาหารเม็กซิกันดั้งเดิม', 'https://ich.unesco.org/en/rl/traditional-mexican-cuisine-ancestral-ongoing-community-culture-the-milpa-system-00400'],
  peru: ['UNESCO · วัฒนธรรมเซบิเชของเปรู', 'https://ich.unesco.org/en/RL/ceviche-an-expression-of-traditional-peruvian-cuisine-01952'],
  borscht: ['UNESCO · วัฒนธรรมการทำบอร์ชต์ยูเครน', 'https://ich.unesco.org/en/RL/-01852'],
};

export const illustrated = new Set([
  'tom-yum-goong', 'nam-prik-ong', 'bibimbap', 'pla-neung-manao', 'som-tam', 'miso-soup',
  'pho-ga', 'gazpacho', 'masoor-dal', 'black-bean-tacos', 'tod-mun', 'khao-soi',
]);

export function normalize(text) {
  return text.normalize('NFKD').replace(/\p{Script=Latin}\p{M}+/gu, letter => letter[0]).toLowerCase();
}

export function parseRecipes(text) {
  return text.trim().split(/\r?\n/u).filter(Boolean).map(line => {
    const [id, name, english, region, method, minutes, healthy, ingredients, steps, tip, history, source] = line.split('|');
    const country = region.split(' · ')[0];
    return {
      id, name, english, region, country, method, minutes: Number(minutes), healthy: healthy === '1',
      ingredients: ingredients.split(';'), steps: steps.split(';'), tip, history, source,
      search: normalize([name, english, region, method, ingredients].join(' ')),
    };
  });
}
