/**
 * Тест нормализации конкретных слов
 * Проверяет работу системы нормализации для проблемных слов
 */

import { CzechNormalizationRules } from './src/utils/CzechNormalizationRules.js';

// Инициализируем нормализатор
const normalizer = new CzechNormalizationRules();

// Список проблемных слов для проверки
const testWords = [
  'aplikaci',      // должно нормализоваться в "aplikace"
  'informaci',     // должно нормализоваться в "informace"
  'komunikaci',    // должно нормализоваться в "komunikace"
  'situaci',       // должно нормализоваться в "situace"
  'organizaci',    // должно нормализоваться в "organizace"
  'prezentaci',    // должно нормализоваться в "prezentace"
  'instalaci',     // должно нормализоваться в "instalace"
  'dokumentaci',   // должно нормализоваться в "dokumentace"
  'realizaci',     // должно нормализоваться в "realizace"
  'registraci',    // должно нормализоваться в "registrace"
  'pracuji',       // должно остаться "pracuji" (исключение)
  'lepší',         // должно остаться "lepší" (сравнительная степень)
];

// Функция для тестирования нормализации
function testNormalization() {
  console.log('🔍 Тестирование нормализации проблемных слов:\n');
  
  testWords.forEach(word => {
    const normalized = normalizer.normalize(word);
    const expectedBase = getExpectedBase(word);
    const result = normalized.includes(expectedBase);
    
    console.log(
      `${result ? '✅' : '❌'} ${word.padEnd(15)} → ${normalized.join(', ').padEnd(20)} ${!result ? `(ожидалось: ${expectedBase})` : ''}`
    );
  });
}

// Функция для получения ожидаемой базовой формы
function getExpectedBase(word) {
  const expectations = {
    'aplikaci': 'aplikace',
    'informaci': 'informace',
    'komunikaci': 'komunikace',
    'situaci': 'situace',
    'organizaci': 'organizace',
    'prezentaci': 'prezentace',
    'instalaci': 'instalace',
    'dokumentaci': 'dokumentace',
    'realizaci': 'realizace',
    'registraci': 'registrace',
    'pracuji': 'pracuji',
    'lepší': 'lepší'
  };
  
  return expectations[word] || word;
}

// Запускаем тест
console.log('🚀 Запуск теста нормализации чешских слов\n');
testNormalization();
console.log('\n✨ Тестирование завершено');
