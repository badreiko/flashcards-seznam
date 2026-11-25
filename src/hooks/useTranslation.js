/**
 * useTranslation.js
 * Хук для работы с переводами поверх DataService
 */

import { useState, useCallback } from 'react';
import { dataService } from '../services/DataService';

const useTranslation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const translateWord = useCallback(async (word) => {
    if (!word || !word.trim()) {
      setError('Слово не может быть пустым');
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await dataService.getTranslation(word);
      if (!result) {
        setError('Not found');
        return null;
      }
      return result;
    } catch (err) {
      console.error('Error translating word:', err);
      setError(err.message || String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCache = useCallback(() => {
    dataService.clearCache();
  }, []);

  const getStats = useCallback(() => dataService.getStats(), []);

  return {
    loading,
    error,
    translateWord,
    clearCache,
    getStats
  };
};

export default useTranslation;
