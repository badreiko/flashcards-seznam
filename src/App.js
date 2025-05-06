import React, { useState, useEffect } from 'react';
import { 
  fetchTranslation, 
  getEntireDictionary,
  exportDictionaryToJson 
} from './glosbeTranslator';

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
const Flashcard = ({ word, translations, samples, note }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };
  
  return (
    <div 
      className={`flashcard ${isFlipped ? 'flipped' : ''}`} 
      onClick={handleFlip}
    >
      <div className="card-inner">
        <div className="card-front">
          <div className="word">{word}</div>
          <p className="hint">Нажмите, чтобы увидеть перевод</p>
        </div>
        
        <div className="card-back">
          <h3 className="original-word">{word}</h3>
          
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
          
          {samples && samples.length > 0 && (
            <div className="examples">
              <h4>Примеры:</h4>
              <ul>
                {samples.map((sample, index) => (
                  <li key={index}>
                    <div className="sample-phrase">{sample.phrase}</div>
                    <div className="sample-translation">{sample.translation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {note && <p className="note">{note}</p>}
          
          <p className="hint">Нажмите, чтобы вернуться к слову</p>
          
          <div className="attribution">
            Источник: Glosbe
          </div>
        </div>
      </div>
    </div>
  );
};

// Компонент просмотра карточек
const FlashcardViewer = ({ flashcards }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  if (!flashcards || flashcards.length === 0) {
    return <div className="no-cards">Карточки не найдены</div>;
  }
  
  const currentCard = flashcards[currentIndex];
  
  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? flashcards.length - 1 : prevIndex - 1
    );
  };
  
  const goToNext = () => {
    setCurrentIndex((prevIndex) => 
      prevIndex === flashcards.length - 1 ? 0 : prevIndex + 1
    );
  };
  
  return (
    <div className="flashcard-viewer">
      <div className="progress-info">
        Карточка {currentIndex + 1} из {flashcards.length}
      </div>
      
      <div className="card-container">
        <button 
          className="nav-btn prev-btn"
          onClick={goToPrevious}
          aria-label="Предыдущая карточка"
        >
          &lt;
        </button>
        
        <Flashcard 
          word={currentCard.word}
          translations={currentCard.translations}
          samples={currentCard.samples}
          note={currentCard.note}
        />
        
        <button 
          className="nav-btn next-btn"
          onClick={goToNext}
          aria-label="Следующая карточка"
        >
          &gt;
        </button>
      </div>
      
      <div className="card-progress">
        {flashcards.map((_, index) => (
          <span 
            key={index} 
            className={`progress-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
          />
        ))}
      </div>
    </div>
  );
};

// Компонент для отображения статистики словаря
const DictionaryStats = ({ onViewDictionary }) => {
  const [wordCount, setWordCount] = useState(0);
  
  useEffect(() => {
    async function loadStats() {
      try {
        const dictionary = await getEntireDictionary();
        setWordCount(dictionary.length);
      } catch (error) {
        console.error('Ошибка при загрузке статистики словаря:', error);
      }
    }
    
    loadStats();
  }, []);
  
  const handleExportDictionary = async () => {
    try {
      const dictionary = await getEntireDictionary();
      if (dictionary.length > 0) {
        exportDictionaryToJson(dictionary);
      } else {
        alert('Словарь пуст. Нечего экспортировать.');
      }
    } catch (error) {
      console.error('Ошибка при экспорте словаря:', error);
      alert('Произошла ошибка при экспорте словаря.');
    }
  };
  
  return (
    <div className="dictionary-stats">
      <p>В вашем локальном словаре: <strong>{wordCount}</strong> слов</p>
      <div style={{ marginTop: '10px' }}>
        <button className="dictionary-button" onClick={onViewDictionary}>
          Просмотреть словарь
        </button>
        <button className="dictionary-button" onClick={handleExportDictionary}>
          Экспорт словаря
        </button>
      </div>
    </div>
  );
};

// Компонент для просмотра словаря
const DictionaryViewer = ({ onClose }) => {
  const [dictionary, setDictionary] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    async function loadDictionary() {
      setIsLoading(true);
      try {
        const dict = await getEntireDictionary();
        // Сортируем слова по алфавиту
        dict.sort((a, b) => a.word.localeCompare(b.word));
        setDictionary(dict);
      } catch (error) {
        console.error('Ошибка при загрузке словаря:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadDictionary();
  }, []);
  
  if (isLoading) {
    return <div className="dictionary-view">Загрузка словаря...</div>;
  }
  
  if (dictionary.length === 0) {
    return (
      <div className="dictionary-view">
        <p>Словарь пуст. Добавьте слова, используя текст для перевода.</p>
        <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '15px' }}>
          Закрыть
        </button>
      </div>
    );
  }
  
  return (
    <div>
      <div className="dictionary-view">
        {dictionary.map((entry, index) => (
          <div key={index} className="dict-word-item">
            <div className="dict-word">{entry.word}</div>
            <div className="dict-translations">
              {entry.translations.join(', ')}
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '15px' }}>
        Закрыть
      </button>
    </div>
  );
};

const App = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('input'); // input, extracted, translated, dictionary
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

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
    if (uniqueWords.length === 0) return;
    
    setIsLoading(true);
    setProgress(0);
    setError('');
    
    try {
      const translatedCards = [];
      let completed = 0;
      const total = uniqueWords.length;
      
      // Обрабатываем по 2 слова за раз, чтобы не перегружать сервер
      for (let i = 0; i < uniqueWords.length; i += 2) {
        const batch = uniqueWords.slice(i, i + 2);
        const batchPromises = batch.map(word => fetchTranslation(word));
        
        try {
          const batchResults = await Promise.all(batchPromises);
          
          batchResults.forEach(result => {
            if (result) {
              translatedCards.push(result);
            }
          });
        } catch (batchError) {
          console.error('Error processing batch:', batchError);
          // Продолжаем выполнение, даже если часть слов не удалось перевести
        }
        
        // Обновляем прогресс
        completed += batch.length;
        setProgress(Math.floor((completed / total) * 100));
        
        // Небольшая задержка, чтобы не перегружать сервер
        if (i + 2 < uniqueWords.length) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 секунды задержки
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
      setError('Произошла ошибка при получении переводов. Пожалуйста, попробуйте позже.');
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
                disabled={isLoading}
              >
                {isLoading ? 'Загрузка...' : 'Получить переводы'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Сбросить
              </button>
            </div>
            
            {isLoading && <ProgressIndicator progress={progress} />}
            {error && <div className="error-message">{error}</div>}
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
              Переводы предоставлены словарем <a href="https://glosbe.com" target="_blank" rel="noopener noreferrer">Glosbe</a>
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