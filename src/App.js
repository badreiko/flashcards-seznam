import React, { useState } from 'react';

const App = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('input'); // input, extracted, translated
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  // Функция для извлечения уникальных слов из текста
  const extractUniqueWords = (text) => {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Приводим к нижнему регистру
    const lowerCaseText = text.toLowerCase();
    
    // Удаляем символы пунктуации и заменяем их пробелами
    const cleanedText = lowerCaseText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()«»„"\[\]]/g, ' ');
    
    // Разбиваем на слова и убираем лишние пробелы
    const words = cleanedText
      .split(/\s+/)
      .filter(word => word.length > 1); // Исключаем односимвольные слова
    
    // Создаем множество (Set) для исключения дубликатов
    const uniqueWordsSet = new Set(words);
    
    // Преобразуем множество обратно в массив
    return Array.from(uniqueWordsSet).sort();
  };

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
      
      // Обрабатываем по 5 слов за раз, чтобы не перегружать API
      for (let i = 0; i < uniqueWords.length; i += 5) {
        const batch = uniqueWords.slice(i, i + 5);
        const batchPromises = batch.map(word => window.fetchTranslation(word));
        
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
        
        // Небольшая задержка, чтобы не перегружать API
        if (i + 5 < uniqueWords.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
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
                <>
                  <h4>Переводы:</h4>
                  <ul>
                    {translations.map((translation, index) => (
                      <li key={index}>{translation}</li>
                    ))}
                  </ul>
                </>
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
              Перевод: LibreTranslate
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

  return (
    <div className="app">
      <header className="header">
        <h1>Flashcards Seznam</h1>
        <p className="subtitle">Изучение чешских слов с помощью карточек</p>
      </header>

      <main className="main-content">
        {currentStep === 'input' && (
          <TextInput 
            text={text} 
            onTextChange={handleTextChange}
            onExtractWords={handleExtractWords}
          />
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
          <>
            <FlashcardViewer flashcards={flashcards} />
            <div className="actions">
              <button className="btn btn-secondary" onClick={handleReset}>
                Начать заново
              </button>
            </div>
            <div className="api-attribution">
              Переводы предоставлены API <a href="https://libretranslate.com/" target="_blank" rel="noopener noreferrer">LibreTranslate</a>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default App;