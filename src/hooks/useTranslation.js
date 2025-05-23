/**
 * useTranslation.js
 * Хук для работы с переводами, который инкапсулирует логику получения переводов,
 * управляет состоянием загрузки и обрабатывает ошибки
 */

import { useState, useEffect, useCallback } from 'react';
import { dataService } from '../services/DataService';
import { normalizationService } from '../services/NormalizationService';

/**
 * Хук для работы с переводами чешских слов
 * @param {Object} options - Опции для хука
 * @returns {Object} - Состояние и функции для работы с переводами
 */
const useTranslation = (options = {}) => {
  // Состояние для текущего перевода
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [normalizationInfo, setNormalizationInfo] = useState(null);
  const [source, setSource] = useState(null);
  
  // Состояние для истории переводов
  const [history, setHistory] = useState([]);
  const [historyEnabled] = useState(options.historyEnabled !== false);
  const [historyLimit] = useState(options.historyLimit || 20);

  /**
   * Функция для получения перевода слова
   * @param {string} word - Слово для перевода
   * @param {Object} translationOptions - Дополнительные опции для перевода
   * @returns {Promise<Object>} - Результат перевода
   */
  const translateWord = useCallback(async (word, translationOptions = {}) => {
    if (!word || word.trim() === '') {
      setError('Слово не может быть пустым');
      return null;
    }
    
    const normalizedWord = word.trim().toLowerCase();
    
    try {
      setLoading(true);
      setError(null);
      
      // Получаем перевод с помощью DataService
      const result = await dataService.getTranslation(normalizedWord, translationOptions);
      
      // Проверяем результат
      if (result.error) {
        setError(result.error);
        return null;
      }
      
      // Сохраняем результат в состояние
      setTranslation(result);
      
      // Сохраняем информацию о нормализации
      if (result.usedNormalization && result.normalizationInfo) {
        setNormalizationInfo(result.normalizationInfo);
      } else {
        setNormalizationInfo(null);
      }
      
      // Сохраняем информацию об источнике данных
      setSource(result.source);
      
      // Добавляем в историю, если она включена
      if (historyEnabled) {
        addToHistory({
          word: normalizedWord,
          timestamp: new Date().toISOString(),
          source: result.source,
          usedNormalization: result.usedNormalization,
          normalizedWord: result.normalizedWord
        });
      }
      
      return result;
    } catch (err) {
      console.error('Error translating word:', err);
      setError(`Ошибка при переводе: ${err.message || err}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [historyEnabled]);

  /**
   * Добавляет запись в историю переводов
   * @param {Object} entry - Запись для добавления в историю
   */
  const addToHistory = useCallback((entry) => {
    setHistory(prevHistory => {
      // Удаляем дубликаты
      const filteredHistory = prevHistory.filter(item => item.word !== entry.word);
      
      // Добавляем новую запись в начало
      const newHistory = [entry, ...filteredHistory];
      
      // Ограничиваем размер истории
      return newHistory.slice(0, historyLimit);
    });
  }, [historyLimit]);

  /**
   * Очищает историю переводов
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  /**
   * Очищает кэш переводов
   */
  const clearCache = useCallback(() => {
    dataService.clearCache();
  }, []);

  /**
   * Получает статистику использования источников данных
   * @returns {Object} - Статистика
   */
  const getStats = useCallback(() => {
    const dataStats = dataService.getStats();
    const normalizationStats = normalizationService.getStats();
    
    return {
      data: dataStats,
      normalization: normalizationStats,
      history: {
        count: history.length,
        limit: historyLimit
      }
    };
  }, [history.length, historyLimit]);

  /**
   * Пакетная обработка списка слов
   * @param {Array<string>} words - Список слов для обработки
   * @returns {Promise<Object>} - Результаты обработки
   */
  const processBatch = useCallback(async (words) => {
    if (!Array.isArray(words) || words.length === 0) {
      return { processed: 0, error: 'Список слов пуст или неверного формата' };
    }
    
    // Добавляем слова в очередь
    for (const word of words) {
      await dataService.addToBatch(word);
    }
    
    // Запускаем обработку
    return await dataService.processBatch();
  }, []);

  // Возвращаем состояние и функции
  return {
    // Состояние
    translation,
    loading,
    error,
    normalizationInfo,
    source,
    history,
    
    // Функции
    translateWord,
    clearHistory,
    clearCache,
    getStats,
    processBatch
  };
};

export default useTranslation;
