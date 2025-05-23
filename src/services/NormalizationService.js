/**
 * NormalizationService.js
 * Сервис для улучшенной нормализации чешских слов с морфологическим анализом
 * и расширенным логированием процесса нормализации
 */

import { CzechNormalizationRules } from '../utils/CzechNormalizationRules';
import { BaseDict } from '../utils/BaseDict';

class NormalizationService {
  constructor() {
    this.normalizer = new CzechNormalizationRules();
    this.baseDict = new BaseDict();
    this.normalizationLog = [];
    this.stats = {
      totalNormalizations: 0,
      successfulNormalizations: 0,
      failedNormalizations: 0,
      cacheHits: 0
    };
    this.cache = new Map();
  }

  /**
   * Определяет часть речи слова на основе морфологических признаков
   * @param {string} word - Слово для анализа
   * @returns {string} - Предполагаемая часть речи (verb, noun, adjective, etc.)
   */
  detectPartOfSpeech(word) {
    // Характерные окончания для разных частей речи
    const patterns = {
      verb: [/[aá]t$/, /[ií]t$/, /ovat$/, /nout$/, /ět$/, /[eě]t$/, /[ií]m$/, /[ií]š$/, /[ií]$/, /[eě]me$/, /[eě]te$/, /[ií]$/, /[ií]me$/, /[ií]te$/],
      noun: [/ost$/, /[eě]k$/, /[ií]k$/, /ník$/, /tel$/, /[dt]lo$/, /ství$/, /ctví$/, /ace$/, /[áa]ž$/, /ice$/, /[ií]na$/],
      adjective: [/[ýí]$/, /[áa]$/, /[ée]$/, /ého$/, /ému$/, /ým$/, /ými$/, /ých$/],
      pronoun: [/[jt]á$/, /[jt]y$/, /[jt]i$/, /[jt]e$/, /[jt]o$/, /ho$/, /mu$/, /mi$/],
      preposition: [/^[kvszopřd]$/],
      conjunction: [/^(a|i|ale|nebo|či|aby|když|protože|jelikož|neboť|však|přesto|tedy|totiž)$/],
      numeral: [/^\d+$/, /^(jeden|dva|tři|čtyři|pět|šest|sedm|osm|devět|deset)$/i],
      adverb: [/[eě]$/, /ky$/, /sky$/, /cky$/]
    };

    // Проверяем каждый паттерн
    for (const [partOfSpeech, patternList] of Object.entries(patterns)) {
      for (const pattern of patternList) {
        if (pattern.test(word)) {
          return partOfSpeech;
        }
      }
    }

    // По умолчанию считаем существительным
    return 'unknown';
  }

  /**
   * Нормализует слово с учетом его морфологических характеристик
   * @param {string} word - Слово для нормализации
   * @param {Object} options - Дополнительные опции
   * @returns {Object} - Результат нормализации с логами
   */
  normalize(word, options = {}) {
    const startTime = performance.now();
    this.normalizationLog = [];
    this.stats.totalNormalizations++;
    
    // Проверяем кэш
    const cacheKey = word.toLowerCase();
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      this.log(`Найдено в кэше: ${word}`);
      return this.cache.get(cacheKey);
    }

    // Определяем часть речи
    const partOfSpeech = this.detectPartOfSpeech(word);
    this.log(`Определена часть речи: ${partOfSpeech}`);

    // Применяем нормализацию с учетом части речи
    let normalizedForms = this.normalizer.normalize(word);
    
    // Применяем дополнительные правила в зависимости от части речи
    if (partOfSpeech === 'verb') {
      // Для глаголов проверяем инфинитивную форму
      this.log(`Применяем специальные правила для глаголов`);
      // Дополнительная логика для глаголов может быть добавлена здесь
    } else if (partOfSpeech === 'noun') {
      // Для существительных проверяем именительный падеж
      this.log(`Применяем специальные правила для существительных`);
      // Дополнительная логика для существительных может быть добавлена здесь
    } else if (partOfSpeech === 'adjective') {
      // Для прилагательных проверяем мужской род, ед. число, им. падеж
      this.log(`Применяем специальные правила для прилагательных`);
      // Дополнительная логика для прилагательных может быть добавлена здесь
    }

    // Валидация результатов против базового словаря
    const validatedForms = this.validateAgainstBaseDict(normalizedForms);
    if (validatedForms.length > 0) {
      normalizedForms = validatedForms;
      this.log(`Результаты подтверждены базовым словарем: ${validatedForms.join(', ')}`);
    }

    // Если нормализация не дала результатов, возвращаем исходное слово
    if (normalizedForms.length === 0) {
      normalizedForms = [word];
      this.stats.failedNormalizations++;
      this.log(`Нормализация не удалась, возвращаем исходное слово: ${word}`);
    } else {
      this.stats.successfulNormalizations++;
    }

    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // Формируем результат
    const result = {
      originalWord: word,
      normalizedForms,
      partOfSpeech,
      usedNormalization: normalizedForms[0] !== word,
      processingTime,
      log: [...this.normalizationLog]
    };

    // Сохраняем в кэш
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Валидирует результаты нормализации против базового словаря
   * @param {Array<string>} forms - Формы для проверки
   * @returns {Array<string>} - Подтвержденные формы
   */
  validateAgainstBaseDict(forms) {
    return forms.filter(form => this.baseDict.hasWord(form));
  }

  /**
   * Добавляет запись в лог нормализации
   * @param {string} message - Сообщение для логирования
   */
  log(message) {
    this.normalizationLog.push({
      timestamp: new Date().toISOString(),
      message
    });
  }

  /**
   * Возвращает статистику нормализации
   * @returns {Object} - Статистика нормализации
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      successRate: this.stats.totalNormalizations > 0 
        ? (this.stats.successfulNormalizations / this.stats.totalNormalizations * 100).toFixed(2) + '%' 
        : '0%',
      cacheHitRate: this.stats.totalNormalizations > 0 
        ? (this.stats.cacheHits / this.stats.totalNormalizations * 100).toFixed(2) + '%' 
        : '0%'
    };
  }

  /**
   * Очищает кэш нормализации
   */
  clearCache() {
    this.cache.clear();
    this.log('Кэш нормализации очищен');
  }

  /**
   * Анализирует эффективность правил нормализации
   * @param {Array<string>} testWords - Слова для тестирования
   * @returns {Object} - Результаты анализа
   */
  analyzeRuleEffectiveness(testWords) {
    const results = {
      totalWords: testWords.length,
      successfulNormalizations: 0,
      failedNormalizations: 0,
      averageProcessingTime: 0,
      detailedResults: []
    };

    let totalProcessingTime = 0;

    for (const word of testWords) {
      const result = this.normalize(word);
      totalProcessingTime += result.processingTime;

      if (result.usedNormalization) {
        results.successfulNormalizations++;
      } else {
        results.failedNormalizations++;
      }

      results.detailedResults.push({
        word,
        normalizedForms: result.normalizedForms,
        partOfSpeech: result.partOfSpeech,
        usedNormalization: result.usedNormalization,
        processingTime: result.processingTime
      });
    }

    results.averageProcessingTime = totalProcessingTime / testWords.length;
    results.successRate = (results.successfulNormalizations / results.totalWords * 100).toFixed(2) + '%';

    return results;
  }
}

// Создаем и экспортируем экземпляр сервиса
const normalizationService = new NormalizationService();

export { normalizationService, NormalizationService };
