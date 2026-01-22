import React, { useState, useEffect } from 'react';
import useTranslation from './hooks/useTranslation';
import NormalizationInfo from './components/NormalizationInfo';
import { dataService } from './services/DataService';
import { normalizationService } from './services/NormalizationService';

// Функция для извлечения уникальных слов из текста
const extractUniqueWords = (text) => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Приводим к нижнему регистру
  const lowerCaseText = text.toLowerCase();
  
  // Удаляем символы пунктуации и заменяем их пробелами
  const cleanedText = lowerCaseText.replace(/[.,/#!$%^&*;:{}=\-_`~()«»„"[\]]/g, ' ');
  
  // Разбиваем на слова и убираем лишние пробелы
  const words = cleanedText
    .split(/\s+/)
    .filter(word => word.length > 1); // Исключаем односимвольные слова
  
  // Создаем множество (Set) для исключения дубликатов
  const uniqueWordsSet = new Set(words);
  
  // Преобразуем множество обратно в массив
  return Array.from(uniqueWordsSet).sort();
};

// Компонент для ввода текста
const TextInput = ({ text, onTextChange, onExtractWords }) => {
  return (
    <div className="text-input">
      <h2>Введите текст на чешском языке</h2>
      <p className="instruction">
        Вставьте текст (статью, рассказ, диалог) на чешском языке, из которого нужно извлечь слова для изучения.
      </p>
      
      <textarea
        className="text-area"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Вставьте текст на чешском языке..."
        rows={10}
      />
      
      <button 
        className="btn btn-primary"
        onClick={onExtractWords}
        disabled={!text.trim()}
      >
        Извлечь слова
      </button>
    </div>
  );
};

// Компонент индикатора прогресса
const ProgressIndicator = ({ progress }) => {
  return (
    <div className="progress-container">
      <div className="progress-bar">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="progress-text">{progress}% завершено</div>
    </div>
  );
};

// Компонент карточки
const Flashcard = ({ word, translations, samples, note, normalizedWord, usedNormalization, source }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };
  
  // Определяем цвет индикатора источника
  const getSourceColor = () => {
    switch (source) {
      case 'cache':
        return 'var(--success)';
      case 'localStorage':
        return 'var(--success)';
      case 'firebase':
        return 'var(--primary)';
      case 'deepl':
        return '#0f2b46'; // DeepL brand color
      case 'fallback':
        return 'var(--error)';
      default:
        return 'var(--text-secondary)';
    }
  };
  
  // Определяем текст источника
  const getSourceText = () => {
    switch (source) {
      case 'cache':
        return 'Кэш';
      case 'localStorage':
        return 'Локальное хранилище';
      case 'firebase':
        return 'Firebase';
      case 'deepl':
        return '🤖 DeepL AI';
      case 'fallback':
        return 'Базовый словарь';
      default:
        return 'Неизвестный';
    }
  };
  
  return (
    <div 
      className={`flashcard ${isFlipped ? 'flipped' : ''}`} 
      onClick={handleFlip}
    >
      <div className="card-inner">
        <div className="card-front">
          <div className="word">{word}</div>
          {usedNormalization && normalizedWord && (
            <div className="normalization-hint">
              Нормализовано: <span className="normalized-form">{normalizedWord}</span>
            </div>
          )}
          <p className="hint">Нажмите, чтобы увидеть перевод</p>
        </div>
        
        <div className="card-back">
          <h3 className="original-word">{word}</h3>
          
          {usedNormalization && normalizedWord && (
            <div className="normalization-info-card">
              <span className="normalized-label">Нормализовано:</span>
              <span className="normalized-value">{normalizedWord}</span>
              {source && (
                <span 
                  className="source-badge-small" 
                  style={{ backgroundColor: getSourceColor() }}
                >
                  {getSourceText()}
                </span>
              )}
            </div>
          )}
          
          <div className="translations">
            {translations && translations.length > 0 ? (
              <div>
                <h4>Переводы:</h4>
                <ul>
                  {translations.map((translation, index) => (
                    <li key={index}>{translation}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="no-translations">Переводы не найдены</p>
            )}
          </div>

          {note && <p className="note">{note}</p>}

          {source && (
            <div className="card-source">
              <span
                className="source-badge"
                style={{ backgroundColor: getSourceColor() }}
              >
                {getSourceText()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Компонент просмотра карточек
const FlashcardViewer = ({ flashcards }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  
  // Если нет карточек, показываем сообщение
  if (!flashcards || flashcards.length === 0) {
    return <div className="no-cards">Нет карточек для отображения</div>;
  }
  
  const goToPrevious = () => {
    setCurrentIndex(prevIndex => {
      return prevIndex > 0 ? prevIndex - 1 : flashcards.length - 1;
    });
  };
  
  const goToNext = () => {
    setCurrentIndex(prevIndex => {
      return prevIndex < flashcards.length - 1 ? prevIndex + 1 : 0;
    });
  };
  
  const currentCard = flashcards[currentIndex];
  
  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <h2>Карточки для изучения</h2>
        <div className="flashcards-count">
          Карточка {currentIndex + 1} из {flashcards.length}
        </div>
      </div>
      
      <div className="card-container">
        <button 
          className="nav-btn prev-btn" 
          onClick={goToPrevious}
          aria-label="Предыдущая карточка"
        >
          &#8249;
        </button>
        
        <Flashcard 
          word={currentCard.word}
          translations={currentCard.translations}
          samples={currentCard.samples}
          normalizedWord={currentCard.normalizedWord}
          usedNormalization={currentCard.usedNormalization}
          source={currentCard.source}
          note={currentCard.note}
        />
        
        <button 
          className="nav-btn next-btn" 
          onClick={goToNext}
          aria-label="Следующая карточка"
        >
          &#8250;
        </button>
      </div>
      
      <div className="flashcards-actions">
        <button 
          className="btn btn-secondary"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Скрыть все карточки' : 'Показать все карточки'}
        </button>
      </div>
      
      {showAll && (
        <div className="all-cards">
          <h3>Все карточки</h3>
          <div className="cards-grid">
            {flashcards.map((card, index) => (
              <div
                key={index}
                className={`card-item ${index === currentIndex ? 'active' : ''} ${card.usedNormalization ? 'normalized' : ''}`}
                onClick={() => setCurrentIndex(index)}
              >
                <span className="card-item-word">{card.word}</span>
                {card.usedNormalization && card.normalizedWord && card.normalizedWord !== card.word && (
                  <span className="card-item-normalized">→ {card.normalizedWord}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент для отображения статистики словаря
const DictionaryStats = ({ onViewDictionary }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailedStats, setDetailedStats] = useState(null);
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  
  const loadStats = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Используем новый DataService для получения статистики
      const dataStats = await dataService.getStats();
      const normStats = normalizationService.getStats();
      
      // Получаем количество слов в базовом словаре
      const baseDictSize = dataService.baseDict.getWordCount();
      
      // Сохраняем подробную статистику
      setDetailedStats({
        data: dataStats,
        normalization: normStats,
        baseDict: {
          wordCount: baseDictSize
        }
      });
      
      // Сохраняем основную статистику
      setStats({
        count: dataStats.cacheSize || 0,
        cacheHitRate: dataStats.cacheHitRate,
        firebaseHitRate: dataStats.firebaseHitRate,
        deeplHitRate: dataStats.deeplHitRate,
        fallbackHitRate: dataStats.fallbackHitRate,
        normalizationSuccessRate: normStats.successRate
      });
    } catch (error) {
      console.error('Error loading dictionary stats:', error);
      setError('Ошибка при загрузке статистики словаря');
    } finally {
      setLoading(false);
    }
  };
  
  // Загружаем статистику при монтировании компонента
  useEffect(() => {
    loadStats();
  }, []);
  
  const handleExportDictionary = async () => {
    try {
      setLoading(true);
      
      // Синхронизируем данные между источниками
      const syncResult = await dataService.syncData();
      console.log('Sync result:', syncResult);
      
      // Обновляем статистику
      await loadStats();
      
      alert('Словарь успешно синхронизирован');
    } catch (error) {
      console.error('Error exporting dictionary:', error);
      setError('Ошибка при экспорте словаря: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearCache = () => {
    try {
      dataService.clearCache();
      normalizationService.clearCache();
      loadStats();
      alert('Кэш очищен');
    } catch (error) {
      console.error('Error clearing cache:', error);
      setError('Ошибка при очистке кэша: ' + error.message);
    }
  };
  
  return (
    <div className="dictionary-stats">
      <h3>Словарь и статистика</h3>
      
      {loading ? (
        <p>Загрузка статистики...</p>
      ) : error ? (
        <p className="error-message">{error}</p>
      ) : stats ? (
        <div className="stats-container">
          <p>В кэше {stats.count} слов</p>
          
          <button 
            className="stats-toggle-btn" 
            onClick={() => setShowDetailedStats(!showDetailedStats)}
          >
            {showDetailedStats ? 'Скрыть подробную статистику' : 'Показать подробную статистику'}
          </button>
          
          {showDetailedStats && detailedStats && (
            <div className="detailed-stats">
              <div className="stats-section">
                <h4>Источники данных</h4>
                <p>Кэш: {stats.cacheHitRate}</p>
                <p>Firebase: {stats.firebaseHitRate}</p>
                <p>🤖 DeepL AI: {stats.deeplHitRate}</p>
                <p>Базовый словарь: {stats.fallbackHitRate}</p>
              </div>
              
              <div className="stats-section">
                <h4>Нормализация</h4>
                <p>Успешность: {stats.normalizationSuccessRate}</p>
                <p>Всего слов в базовом словаре: {detailedStats.baseDict.wordCount}</p>
              </div>
            </div>
          )}
        </div>
      ) : null}
      
      <div className="dictionary-actions">
        <button className="dictionary-button" onClick={onViewDictionary}>
          Просмотреть словарь
        </button>
        <button className="dictionary-button" onClick={handleExportDictionary} disabled={loading}>
          Синхронизировать
        </button>
        <button className="dictionary-button" onClick={handleClearCache} disabled={loading}>
          Очистить кэш
        </button>
      </div>
    </div>
  );
};

// Компонент для просмотра словаря
const DictionaryViewer = ({ onClose }) => {
  const [dictionary, setDictionary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showNormalizationInfo, setShowNormalizationInfo] = useState(false);
  
  const loadDictionary = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Используем новый DataService для получения словаря
      // Собираем данные из localStorage
      const cacheKey = 'flashcards_seznam_cache';
      const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      
      // Преобразуем в массив слов
      const dictArray = Object.entries(cache).map(([word, data]) => ({
        word,
        translations: data.translations || [],
        examples: data.examples || [],
        normalizedWord: data.normalizedWord,
        usedNormalization: data.usedNormalization,
        source: data.source || 'localStorage',
        cachedAt: data.cachedAt
      }));
      
      // Сортируем по алфавиту
      dictArray.sort((a, b) => a.word.localeCompare(b.word));
      
      setDictionary(dictArray);
    } catch (error) {
      console.error('Error loading dictionary:', error);
      setError('Ошибка при загрузке словаря: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadDictionary();
  }, []);
  
  // Фильтрация словаря по поисковому запросу и источнику
  const filteredDictionary = dictionary.filter(item => {
    // Фильтр по источнику
    if (sourceFilter !== 'all' && item.source !== sourceFilter) {
      return false;
    }
    
    // Фильтр по нормализации
    if (showNormalizationInfo && !item.usedNormalization) {
      return false;
    }
    
    if (!searchTerm) return true;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    // Поиск по слову
    if (item.word.toLowerCase().includes(lowerSearchTerm)) {
      return true;
    }
    
    // Поиск по нормализованному слову
    if (item.normalizedWord && item.normalizedWord.toLowerCase().includes(lowerSearchTerm)) {
      return true;
    }
    
    // Поиск по переводам
    if (item.translations && item.translations.some(translation => 
      translation.toLowerCase().includes(lowerSearchTerm)
    )) {
      return true;
    }
    
    return false;
  });
  
  // Получаем цвет для источника
  const getSourceColor = (source) => {
    switch (source) {
      case 'cache':
        return 'var(--success)';
      case 'localStorage':
        return 'var(--success)';
      case 'firebase':
        return 'var(--primary)';
      case 'deepl':
        return '#0f2b46'; // DeepL brand color
      case 'fallback':
        return 'var(--error)';
      default:
        return 'var(--text-secondary)';
    }
  };
  
  // Получаем текст для источника
  const getSourceText = (source) => {
    switch (source) {
      case 'cache':
        return 'Кэш';
      case 'localStorage':
        return 'Локальное хранилище';
      case 'firebase':
        return 'Firebase';
      case 'deepl':
        return '🤖 DeepL AI';
      case 'fallback':
        return 'Базовый словарь';
      default:
        return 'Неизвестный';
    }
  };
  
  return (
    <div className="dictionary-viewer">
      <div className="dictionary-header">
        <h2>Словарь</h2>
        <button className="close-btn" onClick={onClose}>Закрыть</button>
      </div>
      
      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Поиск по словам или переводам..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <div className="filter-container">
          <div className="filter-group">
            <label>Источник:</label>
            <select 
              value={sourceFilter} 
              onChange={(e) => setSourceFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">Все</option>
              <option value="cache">Кэш</option>
              <option value="localStorage">Локальное хранилище</option>
              <option value="firebase">Firebase</option>
              <option value="server">Сервер</option>
              <option value="fallback">Базовый словарь</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>
              <input 
                type="checkbox" 
                checked={showNormalizationInfo} 
                onChange={() => setShowNormalizationInfo(!showNormalizationInfo)}
              />
              Только нормализованные
            </label>
          </div>
        </div>
      </div>
      
      <div className="dictionary-stats-summary">
        Найдено: {filteredDictionary.length} из {dictionary.length} слов
      </div>
      
      {loading ? (
        <div className="loading">Загрузка словаря...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : filteredDictionary.length === 0 ? (
        <div className="no-results">Нет результатов для поиска</div>
      ) : (
        <div className="dictionary-view">
          {filteredDictionary.map((item, index) => (
            <div key={index} className="dict-word-item">
              <div className="dict-word-header">
                <div className="dict-word">{item.word}</div>
                {item.usedNormalization && item.normalizedWord && (
                  <div className="dict-normalized">
                    → {item.normalizedWord}
                  </div>
                )}
                {item.source && (
                  <div 
                    className="dict-source-badge" 
                    style={{ backgroundColor: getSourceColor(item.source) }}
                  >
                    {getSourceText(item.source)}
                  </div>
                )}
              </div>
              <div className="dict-translations">
                {item.translations && item.translations.length > 0 ? (
                  item.translations.join(', ')
                ) : (
                  <span className="no-translations">Переводы не найдены</span>
                )}
              </div>
              {item.cachedAt && (
                <div className="dict-cached-at">
                  Добавлено: {new Date(item.cachedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [currentStep, setCurrentStep] = useState('input');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [lastTranslation, setLastTranslation] = useState(null);
  
  // Используем хук useTranslation для работы с переводами
  const {
    translation,
    loading: translationLoading,
    error: translationError,
    normalizationInfo,
    source,
    translateWord,
    getStats,
    processBatch
  } = useTranslation();

  // Обработчик изменения текста
  const handleTextChange = (newText) => {
    setText(newText);
  };

  // Извлечение уникальных слов из текста
  const handleExtractWords = () => {
    if (!text.trim()) return;
    
    const words = extractUniqueWords(text);
    setUniqueWords(words);
    setCurrentStep('extracted');
    setError('');
  };

  // Получение переводов для всех извлеченных слов
  const handleGetTranslations = async () => {
    if (uniqueWords.length === 0) {
      setError('Нет слов для перевода');
      return;
    }
    
    setIsLoading(true);
    setProgress(0);
    setError('');
    
    try {
      const translatedCards = [];
      const total = uniqueWords.length;
      let completed = 0;
      
      // Используем пакетную обработку из нашего хука useTranslation
      // Обрабатываем слова пакетами по 5 для уменьшения нагрузки
      for (let i = 0; i < uniqueWords.length; i += 5) {
        const batch = uniqueWords.slice(i, i + 5);

        // Получаем переводы для каждого слова в пакете
        // Метод translateWord внутри уже добавляет слова в очередь через addToBatch
        const batchTranslations = await Promise.all(
          batch.map(async (word) => {
            try {
              // Используем translateWord из хука useTranslation
              const result = await translateWord(word);
              const translationData = {
                word,
                translations: result?.translations || [],
                samples: result?.examples || [],
                normalizedWord: result?.normalizedWord,
                usedNormalization: result?.usedNormalization,
                source: result?.source
              };
              
              // Сохраняем последний перевод для отображения информации о нормализации
              setLastTranslation(translationData);
              
              return translationData;
            } catch (error) {
              console.error(`Error translating word ${word}:`, error);
              return {
                word,
                translations: [],
                samples: [],
                error: error.message
              };
            }
          })
        );
        
        // Добавляем результаты в общий массив
        translatedCards.push(...batchTranslations.filter(item => item));
        
        // Обновляем прогресс
        completed += batch.length;
        setProgress(Math.floor((completed / total) * 100));
        
        // Небольшая задержка между пакетами
        if (i + 5 < uniqueWords.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 секунда задержки
        }
      }
      
      if (translatedCards.length === 0) {
        setError('Не удалось получить переводы. Пожалуйста, попробуйте позже.');
      } else {
        setFlashcards(translatedCards);
        setCurrentStep('translated');
      }
    } catch (error) {
      console.error('Error fetching translations:', error);
      setError(`Произошла ошибка при получении переводов: ${error.message}`);
    } finally {
      setIsLoading(false);
      setProgress(100);
    }
  };

  // Сброс состояния приложения
  const handleReset = () => {
    setText('');
    setUniqueWords([]);
    setFlashcards([]);
    setCurrentStep('input');
    setProgress(0);
    setError('');
  };
  
  // Просмотр словаря
  const handleViewDictionary = () => {
    setCurrentStep('dictionary');
  };
  
  // Возврат из просмотра словаря
  const handleCloseDictionary = () => {
    setCurrentStep('input');
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Flashcards Seznam</h1>
        <p className="subtitle">Изучение чешских слов с помощью карточек</p>
      </header>

      <main className="main-content">
        {currentStep === 'input' && (
          <React.Fragment>
            <TextInput 
              text={text} 
              onTextChange={handleTextChange}
              onExtractWords={handleExtractWords}
            />
            <DictionaryStats onViewDictionary={handleViewDictionary} />
          </React.Fragment>
        )}

        {currentStep === 'extracted' && (
          <div className="extracted-words">
            <h2>Найдено {uniqueWords.length} уникальных слов</h2>
            <div className="words-container">
              {uniqueWords.map((word, index) => (
                <span key={index} className="word-chip">{word}</span>
              ))}
            </div>
            <div className="actions">
              <button 
                className="btn btn-primary"
                onClick={handleGetTranslations}
                disabled={isLoading || translationLoading}
              >
                {isLoading || translationLoading ? 'Загрузка...' : 'Получить переводы'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Сбросить
              </button>
            </div>
            
            {isLoading && <ProgressIndicator progress={progress} />}
            {error && <div className="error-message">{error}</div>}
            {translationError && <div className="error-message">{translationError}</div>}
            
            {/* Отображаем информацию о нормализации для последнего переведенного слова */}
            {lastTranslation && lastTranslation.usedNormalization && (
              <div className="normalization-container">
                <h3>Информация о нормализации</h3>
                <NormalizationInfo 
                  originalWord={lastTranslation.word}
                  normalizedWord={lastTranslation.normalizedWord}
                  normalizationInfo={normalizationInfo}
                  usedNormalization={lastTranslation.usedNormalization}
                  source={lastTranslation.source}
                />
              </div>
            )}
          </div>
        )}

        {currentStep === 'translated' && (
          <div>
            <FlashcardViewer flashcards={flashcards} />
            <div className="actions">
              <button className="btn btn-secondary" onClick={handleReset}>
                Начать заново
              </button>
              <button className="btn btn-primary" onClick={handleViewDictionary}>
                Просмотреть словарь
              </button>
            </div>
            <div className="api-attribution">
              Переводы предоставлены <a href="https://www.deepl.com" target="_blank" rel="noopener noreferrer">DeepL API</a>
            </div>
          </div>
        )}
        
        {currentStep === 'dictionary' && (
          <DictionaryViewer onClose={handleCloseDictionary} />
        )}
      </main>
    </div>
  );
};

export default App;