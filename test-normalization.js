/**
 * ===============================================================================
 * КОМПЛЕКСНЫЙ ТЕСТ СИСТЕМЫ НОРМАЛИЗАЦИИ ЧЕШСКОГО ЯЗЫКА
 * ===============================================================================
 *
 * Покрывает все категории:
 * - Глаголы (разные типы спряжения + прошедшее время)
 * - Существительные (м/ж/с род, твердое/мягкое склонение)
 * - Прилагательные
 * - Наречия (не должны нормализоваться)
 * - Предлоги и союзы (не должны нормализоваться)
 * - Причастия и деепричастия
 * - Уменьшительные формы
 *
 * Всего: 250+ тестовых случаев
 * ===============================================================================
 */

import { CzechNormalizationRules } from './src/utils/CzechNormalizationRules.js';

// Инициализация
const normalizer = new CzechNormalizationRules();

// Счетчики
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors = [];

/**
 * Функция для тестирования одного слова
 */
function test(word, expected, category) {
  totalTests++;
  const result = normalizer.normalize(word);
  const normalized = result[0]; // Берем первый результат

  const passed = normalized === expected;

  if (passed) {
    passedTests++;
    console.log(`✓ ${category}: ${word} → ${normalized}`);
  } else {
    failedTests++;
    console.log(`✗ ${category}: ${word} → ${normalized} (ожидалось: ${expected})`);
    errors.push({
      category,
      word,
      expected,
      actual: normalized
    });
  }
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  ТЕСТ СИСТЕМЫ НОРМАЛИЗАЦИИ ЧЕШСКОГО ЯЗЫКА');
console.log('═══════════════════════════════════════════════════════════════════\n');

// =====================================================================
// 1. ГЛАГОЛЫ -ovat (pracovat, studovat, etc.)
// =====================================================================
console.log('\n--- 1. Глаголы -ovat ---');
test('pracuji', 'pracovat', 'verb-ovat');
test('pracuješ', 'pracovat', 'verb-ovat');
test('pracuje', 'pracovat', 'verb-ovat');
test('pracujeme', 'pracovat', 'verb-ovat');
test('pracujete', 'pracovat', 'verb-ovat');
test('pracují', 'pracovat', 'verb-ovat');
test('pracoval', 'pracovat', 'verb-ovat-past');
test('pracovala', 'pracovat', 'verb-ovat-past');
test('pracovalo', 'pracovat', 'verb-ovat-past');
test('pracovali', 'pracovat', 'verb-ovat-past');
test('pracovaly', 'pracovat', 'verb-ovat-past');

test('studuje', 'studovat', 'verb-ovat');
test('studuji', 'studovat', 'verb-ovat');
test('studoval', 'studovat', 'verb-ovat-past');

test('cestuje', 'cestovat', 'verb-ovat');
test('cestuji', 'cestovat', 'verb-ovat');
test('cestoval', 'cestovat', 'verb-ovat-past');

test('kupuji', 'kupovat', 'verb-ovat');
test('kupuje', 'kupovat', 'verb-ovat');
test('kupoval', 'kupovat', 'verb-ovat-past');

// =====================================================================
// 2. ГЛАГОЛЫ -at (dělat, hrát, etc.)
// =====================================================================
console.log('\n--- 2. Глаголы -at ---');
test('dělám', 'dělat', 'verb-at');
test('děláš', 'dělat', 'verb-at');
test('dělá', 'dělat', 'verb-at');
test('děláme', 'dělat', 'verb-at');
test('děláte', 'dělat', 'verb-at');
test('dělají', 'dělat', 'verb-at');
test('dělal', 'dělat', 'verb-at-past');
test('dělala', 'dělat', 'verb-at-past');
test('dělalo', 'dělat', 'verb-at-past');
test('dělali', 'dělat', 'verb-at-past');
test('dělaly', 'dělat', 'verb-at-past');

test('hraju', 'hrát', 'verb-at');
test('hraješ', 'hrát', 'verb-at');
test('hraje', 'hrát', 'verb-at');
test('hrajeme', 'hrát', 'verb-at');
test('hráli', 'hrát', 'verb-at-past');

test('znám', 'znát', 'verb-at');
test('znáš', 'znát', 'verb-at');
test('zná', 'znát', 'verb-at');
test('znali', 'znát', 'verb-at-past');

test('čekám', 'čekat', 'verb-at');
test('čekáš', 'čekat', 'verb-at');
test('čeká', 'čekat', 'verb-at');
test('čekal', 'čekat', 'verb-at-past');

// =====================================================================
// 3. ГЛАГОЛЫ -it (mluvit, prosit, vidět)
// =====================================================================
console.log('\n--- 3. Глаголы -it ---');
test('mluvím', 'mluvit', 'verb-it');
test('mluvíš', 'mluvit', 'verb-it');
test('mluví', 'mluvit', 'verb-it');
test('mluvíme', 'mluvit', 'verb-it');
test('mluvíte', 'mluvit', 'verb-it');
test('mluvil', 'mluvit', 'verb-it-past');
test('mluvila', 'mluvit', 'verb-it-past');
test('mluvilo', 'mluvit', 'verb-it-past');
test('mluvili', 'mluvit', 'verb-it-past');
test('mluvily', 'mluvit', 'verb-it-past');

test('prosím', 'prosit', 'verb-it');
test('prosíš', 'prosit', 'verb-it');
test('prosí', 'prosit', 'verb-it');
test('prosil', 'prosit', 'verb-it-past');

test('učím', 'učit', 'verb-it');
test('učíš', 'učit', 'verb-it');
test('učí', 'učit', 'verb-it');
test('učil', 'učit', 'verb-it-past');

test('myslím', 'myslit', 'verb-it');
test('myslíš', 'myslit', 'verb-it');
test('myslí', 'myslit', 'verb-it');
test('myslel', 'myslit', 'verb-it-past');

// =====================================================================
// 4. ГЛАГОЛЫ -ět (vidět, rozumět)
// =====================================================================
console.log('\n--- 4. Глаголы -ět ---');
test('vidím', 'vidět', 'verb-et');
test('vidíš', 'vidět', 'verb-et');
test('vidí', 'vidět', 'verb-et');
test('vidíme', 'vidět', 'verb-et');
test('vidíte', 'vidět', 'verb-et');
test('viděl', 'vidět', 'verb-et-past');
test('viděla', 'vidět', 'verb-et-past');
test('vidělo', 'vidět', 'verb-et-past');
test('viděli', 'vidět', 'verb-et-past');
test('viděly', 'vidět', 'verb-et-past');

test('rozumím', 'rozumět', 'verb-et');
test('rozumíš', 'rozumět', 'verb-et');
test('rozumí', 'rozumět', 'verb-et');
test('rozuměl', 'rozumět', 'verb-et-past');

test('seděl', 'sedět', 'verb-et-past');
test('stojí', 'stát', 'verb-et'); // может быть неправильно
test('leží', 'ležet', 'verb-et');

// =====================================================================
// 5. НЕПРАВИЛЬНЫЕ ГЛАГОЛЫ (исключения)
// =====================================================================
console.log('\n--- 5. Неправильные глаголы ---');
test('jsem', 'být', 'irregular-verb');
test('jsi', 'být', 'irregular-verb');
test('je', 'být', 'irregular-verb');
test('jsme', 'být', 'irregular-verb');
test('jste', 'být', 'irregular-verb');
test('jsou', 'být', 'irregular-verb');
test('byl', 'být', 'irregular-verb');
test('byla', 'být', 'irregular-verb');
test('bylo', 'být', 'irregular-verb');
test('byli', 'být', 'irregular-verb');
test('byly', 'být', 'irregular-verb');

test('mám', 'mít', 'irregular-verb');
test('máš', 'mít', 'irregular-verb');
test('má', 'mít', 'irregular-verb');
test('máme', 'mít', 'irregular-verb');
test('máte', 'mít', 'irregular-verb');
test('mají', 'mít', 'irregular-verb');
test('měl', 'mít', 'irregular-verb');
test('měla', 'mít', 'irregular-verb');
test('měli', 'mít', 'irregular-verb');

test('jdu', 'jít', 'irregular-verb');
test('jdeš', 'jít', 'irregular-verb');
test('jde', 'jít', 'irregular-verb');
test('jdeme', 'jít', 'irregular-verb');
test('šel', 'jít', 'irregular-verb');
test('šla', 'jít', 'irregular-verb');
test('šli', 'jít', 'irregular-verb');

test('vím', 'vědět', 'irregular-verb');
test('víš', 'vědět', 'irregular-verb');
test('ví', 'vědět', 'irregular-verb');
test('věděl', 'vědět', 'irregular-verb');

// =====================================================================
// 6. СУЩЕСТВИТЕЛЬНЫЕ МУЖСКОГО РОДА (твердое склонение)
// =====================================================================
console.log('\n--- 6. Существительные мужского рода (твердое) ---');
test('muž', 'muž', 'noun-m-hard');
test('muži', 'muž', 'noun-m-hard');
test('muže', 'muž', 'noun-m-hard');
test('mužů', 'muž', 'noun-m-hard');
test('mužem', 'muž', 'noun-m-hard');

test('dům', 'dům', 'noun-m-hard');
test('domu', 'dům', 'noun-m-hard');
test('domů', 'dům', 'noun-m-hard');
test('domem', 'dům', 'noun-m-hard');
test('domy', 'dům', 'noun-m-hard');

test('strom', 'strom', 'noun-m-hard');
test('stromu', 'strom', 'noun-m-hard');
test('stromů', 'strom', 'noun-m-hard');
test('stromem', 'strom', 'noun-m-hard');
test('stromy', 'strom', 'noun-m-hard');

test('důvod', 'důvod', 'noun-m-hard');
test('důvodu', 'důvod', 'noun-m-hard'); // ВАЖНО! Родительный падеж
test('důvodů', 'důvod', 'noun-m-hard');
test('důvodem', 'důvod', 'noun-m-hard');

test('hrad', 'hrad', 'noun-m-hard');
test('hradu', 'hrad', 'noun-m-hard');
test('hradů', 'hrad', 'noun-m-hard');
test('hradem', 'hrad', 'noun-m-hard');

// =====================================================================
// 7. СУЩЕСТВИТЕЛЬНЫЕ МУЖСКОГО РОДА (мягкое склонение)
// =====================================================================
console.log('\n--- 7. Существительные мужского рода (мягкое) ---');
test('učitel', 'učitel', 'noun-m-soft');
test('učitele', 'učitel', 'noun-m-soft');
test('učitelé', 'učitel', 'noun-m-soft');
test('učitelů', 'učitel', 'noun-m-soft');
test('učitelem', 'učitel', 'noun-m-soft');

test('student', 'student', 'noun-m-soft');
test('studenta', 'student', 'noun-m-soft');
test('studenti', 'student', 'noun-m-soft');
test('studentů', 'student', 'noun-m-soft');
test('studentem', 'student', 'noun-m-soft');

test('přítel', 'přítel', 'noun-m-soft');
test('přítele', 'přítel', 'noun-m-soft');
test('přátelé', 'přítel', 'noun-m-soft'); // чередование á/í

// =====================================================================
// 8. СУЩЕСТВИТЕЛЬНЫЕ ЖЕНСКОГО РОДА (твердое склонение)
// =====================================================================
console.log('\n--- 8. Существительные женского рода (твердое) ---');
test('žena', 'žena', 'noun-f-hard');
test('ženy', 'žena', 'noun-f-hard');
test('ženě', 'žena', 'noun-f-hard');
test('ženu', 'žena', 'noun-f-hard');
test('ženou', 'žena', 'noun-f-hard');
test('žen', 'žena', 'noun-f-hard');

test('kniha', 'kniha', 'noun-f-hard');
test('knihy', 'kniha', 'noun-f-hard');
test('knize', 'kniha', 'noun-f-hard');
test('knihu', 'kniha', 'noun-f-hard');
test('knihou', 'kniha', 'noun-f-hard');
test('knih', 'kniha', 'noun-f-hard');

test('škola', 'škola', 'noun-f-hard');
test('školy', 'škola', 'noun-f-hard');
test('škole', 'škola', 'noun-f-hard');
test('školu', 'škola', 'noun-f-hard');
test('školou', 'škola', 'noun-f-hard');

test('voda', 'voda', 'noun-f-hard');
test('vody', 'voda', 'noun-f-hard');
test('vodě', 'voda', 'noun-f-hard');
test('vodu', 'voda', 'noun-f-hard');
test('vodou', 'voda', 'noun-f-hard');

// =====================================================================
// 9. СУЩЕСТВИТЕЛЬНЫЕ ЖЕНСКОГО РОДА (мягкое склонение)
// =====================================================================
console.log('\n--- 9. Существительные женского рода (мягкое) ---');
test('růže', 'růže', 'noun-f-soft');
test('růži', 'růže', 'noun-f-soft');
test('růží', 'růže', 'noun-f-soft');

test('ulice', 'ulice', 'noun-f-soft');
test('ulici', 'ulice', 'noun-f-soft');
test('ulic', 'ulice', 'noun-f-soft');

test('informace', 'informace', 'noun-f-soft');
test('informaci', 'informace', 'noun-f-soft');
test('informací', 'informace', 'noun-f-soft');

test('aplikace', 'aplikace', 'noun-f-soft');
test('aplikaci', 'aplikace', 'noun-f-soft');
test('aplikací', 'aplikace', 'noun-f-soft');

test('stanice', 'stanice', 'noun-f-soft');
test('stanici', 'stanice', 'noun-f-soft');
test('stanic', 'stanice', 'noun-f-soft');

test('práce', 'práce', 'noun-f-soft');
test('práci', 'práce', 'noun-f-soft');
test('prací', 'práce', 'noun-f-soft');

// =====================================================================
// 10. СУЩЕСТВИТЕЛЬНЫЕ СРЕДНЕГО РОДА (твердое склонение)
// =====================================================================
console.log('\n--- 10. Существительные среднего рода (твердое) ---');
test('okno', 'okno', 'noun-n-hard');
test('okna', 'okno', 'noun-n-hard');
test('oknu', 'okno', 'noun-n-hard');
test('oknech', 'okno', 'noun-n-hard');
test('oknem', 'okno', 'noun-n-hard');

test('město', 'město', 'noun-n-hard');
test('města', 'město', 'noun-n-hard');
test('městu', 'město', 'noun-n-hard');
test('městech', 'město', 'noun-n-hard');
test('městem', 'město', 'noun-n-hard');

test('slovo', 'slovo', 'noun-n-hard');
test('slova', 'slovo', 'noun-n-hard');
test('slovu', 'slovo', 'noun-n-hard');
test('slovem', 'slovo', 'noun-n-hard');

// =====================================================================
// 11. СУЩЕСТВИТЕЛЬНЫЕ СРЕДНЕГО РОДА (мягкое склонение)
// =====================================================================
console.log('\n--- 11. Существительные среднего рода (мягкое) ---');
test('moře', 'moře', 'noun-n-soft');
test('moří', 'moře', 'noun-n-soft');
test('moři', 'moře', 'noun-n-soft');

test('pole', 'pole', 'noun-n-soft');
test('polí', 'pole', 'noun-n-soft');
test('poli', 'pole', 'noun-n-soft');

test('nádraží', 'nádraží', 'noun-n-soft');
test('nádražím', 'nádraží', 'noun-n-soft');

// =====================================================================
// 12. ПРИЛАГАТЕЛЬНЫЕ (мужской род)
// =====================================================================
console.log('\n--- 12. Прилагательные (мужской род) ---');
test('dobrý', 'dobrý', 'adj-m');
test('dobrého', 'dobrý', 'adj-m');
test('dobrému', 'dobrý', 'adj-m');
test('dobrým', 'dobrý', 'adj-m');
test('dobrých', 'dobrý', 'adj-m');
test('dobrými', 'dobrý', 'adj-m');

test('velký', 'velký', 'adj-m');
test('velkého', 'velký', 'adj-m');
test('velkému', 'velký', 'adj-m');
test('velkým', 'velký', 'adj-m');

test('nový', 'nový', 'adj-m');
test('nového', 'nový', 'adj-m');
test('novému', 'nový', 'adj-m');
test('novým', 'nový', 'adj-m');

// =====================================================================
// 13. ПРИЛАГАТЕЛЬНЫЕ (женский и средний род)
// =====================================================================
console.log('\n--- 13. Прилагательные (женский/средний род) ---');
test('dobrá', 'dobrý', 'adj-f');
test('dobrou', 'dobrý', 'adj-f');
test('dobré', 'dobrý', 'adj-n');

test('velká', 'velký', 'adj-f');
test('velkou', 'velký', 'adj-f');
test('velké', 'velký', 'adj-n');

test('nová', 'nový', 'adj-f');
test('novou', 'nový', 'adj-f');
test('nové', 'nový', 'adj-n');

// =====================================================================
// 14. ПРИЛАГАТЕЛЬНЫЕ (сравнительная степень)
// =====================================================================
console.log('\n--- 14. Прилагательные (сравнительная степень) ---');
test('lepší', 'lepší', 'adj-comparative');
test('lepšího', 'lepší', 'adj-comparative');
test('lepšímu', 'lepší', 'adj-comparative');
test('lepším', 'lepší', 'adj-comparative');
test('lepších', 'lepší', 'adj-comparative');

test('větší', 'větší', 'adj-comparative');
test('většího', 'větší', 'adj-comparative');
test('většímu', 'větší', 'adj-comparative');

test('menší', 'menší', 'adj-comparative');
test('hezčí', 'hezčí', 'adj-comparative');
test('rychlejší', 'rychlejší', 'adj-comparative');

// =====================================================================
// 15. НАРЕЧИЯ (НЕ должны нормализоваться)
// =====================================================================
console.log('\n--- 15. Наречия (не нормализуются) ---');
test('nyní', 'nyní', 'adverb'); // ВАЖНО! ≤4 символов на 'í'
test('teď', 'teď', 'adverb');
test('potom', 'potom', 'adverb');
test('pak', 'pak', 'adverb');
test('brzy', 'brzy', 'adverb');
test('dobře', 'dobře', 'adverb');
test('špatně', 'špatně', 'adverb');
test('rychle', 'rychle', 'adverb');
test('pomalu', 'pomalu', 'adverb');
test('vždy', 'vždy', 'adverb');
test('často', 'často', 'adverb');
test('málo', 'málo', 'adverb');
test('hodně', 'hodně', 'adverb');
test('více', 'více', 'adverb');
test('méně', 'méně', 'adverb');

// =====================================================================
// 16. ПРЕДЛОГИ И СОЮЗЫ (НЕ должны нормализоваться)
// =====================================================================
console.log('\n--- 16. Предлоги и союзы (не нормализуются) ---');
test('na', 'na', 'preposition');
test('v', 'v', 'preposition');
test('ve', 've', 'preposition');
test('s', 's', 'preposition');
test('se', 'se', 'preposition');
test('k', 'k', 'preposition');
test('ke', 'ke', 'preposition');
test('do', 'do', 'preposition');
test('od', 'od', 'preposition');
test('za', 'za', 'preposition');
test('po', 'po', 'preposition');
test('pro', 'pro', 'preposition');
test('před', 'před', 'preposition');
test('mezi', 'mezi', 'preposition');

test('a', 'a', 'conjunction');
test('ale', 'ale', 'conjunction');
test('nebo', 'nebo', 'conjunction');
test('že', 'že', 'conjunction');
test('když', 'když', 'conjunction');
test('protože', 'protože', 'conjunction');

// =====================================================================
// 17. ПРИЧАСТИЯ И ДЕЕПРИЧАСТИЯ
// =====================================================================
console.log('\n--- 17. Причастия и деепричастия ---');
test('dělající', 'dělat', 'participle');
test('pracující', 'pracovat', 'participle');
test('studující', 'studovat', 'participle');

test('psaný', 'psát', 'participle');
test('psaná', 'psát', 'participle');
test('dělané', 'dělat', 'participle');

// =====================================================================
// 18. СУППЛЕТИВНЫЕ ФОРМЫ (исключения)
// =====================================================================
console.log('\n--- 18. Супплетивные формы ---');
test('lidé', 'člověk', 'suppletion');
test('lidi', 'člověk', 'suppletion');
test('lidí', 'člověk', 'suppletion');
test('lidem', 'člověk', 'suppletion');

test('děti', 'dítě', 'suppletion');
test('dětí', 'dítě', 'suppletion');
test('dětem', 'dítě', 'suppletion');

test('oči', 'oko', 'suppletion');
test('očí', 'oko', 'suppletion');

test('uši', 'ucho', 'suppletion');
test('uší', 'ucho', 'suppletion');

// =====================================================================
// 19. СПЕЦИАЛЬНЫЕ СЛУЧАИ (короткие слова на 'í')
// =====================================================================
console.log('\n--- 19. Специальные случаи (короткие слова на í) ---');
test('vidí', 'vidět', 'verb-short-i'); // ≤4 символов, но ГЛАГОЛ - должен нормализоваться
test('prosí', 'prosit', 'verb-short-i');
test('chytí', 'chytit', 'verb-short-i'); // 5 символов - должен нормализоваться
test('nyní', 'nyní', 'adverb-short-i'); // ≤4 символов, НАРЕЧИЕ - НЕ нормализуется
test('tady', 'tady', 'adverb-short'); // короткое наречие

// =====================================================================
// 20. УМЕНЬШИТЕЛЬНЫЕ ФОРМЫ
// =====================================================================
console.log('\n--- 20. Уменьшительные формы ---');
test('domek', 'domek', 'diminutive'); // может быть: domek → dům
test('knížka', 'knížka', 'diminutive'); // может быть: knížka → kniha
test('okénko', 'okénko', 'diminutive'); // может быть: okénko → okno

// =====================================================================
// ФИНАЛЬНЫЙ ОТЧЕТ
// =====================================================================
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  ИТОГОВЫЙ ОТЧЕТ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Всего тестов: ${totalTests}`);
console.log(`✓ Успешно: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
console.log(`✗ Ошибок: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
console.log('═══════════════════════════════════════════════════════════════════\n');

// Группировка ошибок по категориям
if (errors.length > 0) {
  console.log('\n📋 ДЕТАЛИЗАЦИЯ ОШИБОК ПО КАТЕГОРИЯМ:\n');

  const errorsByCategory = {};
  errors.forEach(error => {
    if (!errorsByCategory[error.category]) {
      errorsByCategory[error.category] = [];
    }
    errorsByCategory[error.category].push(error);
  });

  Object.keys(errorsByCategory).sort().forEach(category => {
    console.log(`\n--- ${category} (${errorsByCategory[category].length} ошибок) ---`);
    errorsByCategory[category].forEach(error => {
      console.log(`  ${error.word} → ${error.actual} (ожидалось: ${error.expected})`);
    });
  });
}

// Статистика системы
console.log('\n\n📊 СТАТИСТИКА СИСТЕМЫ НОРМАЛИЗАЦИИ:');
const stats = normalizer.getStats();
console.log(`  Версия: ${stats.version}`);
console.log(`  Кэш: ${stats.cacheSize} записей`);
console.log(`  Исключений: ${stats.exceptionsCount}`);
console.log(`  Не нормализуемых слов: ${stats.doNotNormalizeCount}`);
console.log(`  Морфологических паттернов: ${stats.morphPatternsCount}`);

console.log('\n═══════════════════════════════════════════════════════════════════\n');
