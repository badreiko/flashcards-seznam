import React, { useState } from 'react';
import { translateText } from './translator';

// Типы для карточек
type Translation = {
  word: string;
  translations: string[];
  samples: Array<{
    phrase: string;
    translation: string;
  }>;
  note?: string;
};

// ----- Вспомогательные функции для обработки текста -----
const extractUniqueWords = (text: string): string[] => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input text');
  }

  try {
    // Приводим к нижнему регистру
    const lowerCaseText = text.toLowerCase();
    
    // Удаляем символы пунктуации и заменяем их пробелами
    const cleanedText = lowerCaseText.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()«»„"\[\]]/g, ' ');
    
    // Разбиваем на слова и убираем лишние пробелы
    const words = cleanedText
      .split(/\s+/)
      .filter(word => word.length > 1 && word.match(/^[a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/)); // Фильтруем только чешские слова
    
    // Создаем множество (Set) для исключения дубликатов
    const uniqueWordsSet = new Set(words);
    
    // Преобразуем множество обратно в массив и сортируем
    return Array.from(uniqueWordsSet).sort();
  } catch (error) {
    console.error('Error extracting words:', error);
    throw error;
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

// ----- API для работы с переводами с использованием LibreTranslate API -----
const fetchTranslation = async (word: string): Promise<Translation | null> => {
  if (!word || typeof word !== 'string') {
    throw new Error('Invalid word for translation');
  }

  try {
    // Используем LibreTranslate API для перевода
    const translatedText = await translateText(word, 'cs', 'ru');
    
    // Создаем объект в формате, совместимом с приложением
    return {
      word: word,
      translations: [translatedText],
      samples: [] // LibreTranslate не предоставляет примеры использования
    };
  } catch (error) {
    console.error(`Error fetching translation for word "${word}":`, error);
    return null;
  }
};

// ----- Компонент для ввода текста -----
interface TextInputProps {
  text: string;
  onTextChange: (text: string) => void;
  onExtractWords: () => void;
  isLoading?: boolean;
}

const TextInput = ({ text, onTextChange, onExtractWords, isLoading = false }: TextInputProps) => {
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

// ----- Индикатор прогресса -----
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

// ----- Компонент карточки -----
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

// ----- Компонент просмотра карточек -----
interface FlashcardViewerProps {
  flashcards: Translation[];
}

const FlashcardViewer = ({ flashcards }: FlashcardViewerProps) => {
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

// ----- Главный компонент приложения -----
interface AppProps {
  // Добавьте пропсы, если они будут использоваться
}

const App: React.FC<AppProps> = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState('input'); // input, extracted, translated
  const [progress, setProgress] = useState(0);

  const handleTextChange = (newText) => {
    setText(newText);
  };

  const handleExtractWords = async () => {
    if (!text.trim()) {
      alert('Пожалуйста, введите текст');
      return;
    }

    try {
      const words = extractUniqueWords(text);
      if (words.length === 0) {
        alert('Не найдено подходящих слов для изучения');
        return;
      }
      setUniqueWords(words);
      setCurrentStep('extracted');
    } catch (error) {
      console.error('Error extracting words:', error);
      alert('Ошибка при обработке текста. Пожалуйста, проверьте введенный текст.');
    }
    
    const words = extractUniqueWords(text);
    setUniqueWords(words);
    setCurrentStep('extracted');
  };

  const handleGetTranslations = async () => {
    if (uniqueWords.length === 0) {
      alert('Сначала извлеките слова из текста');
      return;
    }

    setIsLoading(true);
    setProgress(0);
    if (uniqueWords.length === 0) return;
    
    setIsLoading(true);
    setProgress(0);
    
    try {
      const translatedCards = [];
      let completed = 0;
      const total = uniqueWords.length;
      
      // Обрабатываем по 5 слов за раз, чтобы не перегружать API
      for (let i = 0; i < uniqueWords.length; i += 5) {
        const batch = uniqueWords.slice(i, i + 5);
        const batchPromises = batch.map(word => fetchTranslation(word));
        
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
          if (result) {
            translatedCards.push(result);
          }
        });
        
        // Обновляем прогресс
        completed += batch.length;
        setProgress(Math.floor((completed / total) * 100));
        
        // Небольшая задержка, чтобы не перегружать API
        if (i + 5 < uniqueWords.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      setFlashcards(translatedCards);
      setCurrentStep('translated');
    } catch (error) {
      console.error('Error fetching translations:', error);
    } finally {
      setIsLoading(false);
      setProgress(100);
    }
  };

  const handleReset = () => {
    if (currentStep === 'translated' || currentStep === 'extracted') {
      if (window.confirm('Вы уверены, что хотите сбросить прогресс?')) {
        setText('');
        setUniqueWords([]);
        setFlashcards([]);
        setCurrentStep('input');
        setProgress(0);
      }
    } else {
      setText('');
      setUniqueWords([]);
      setFlashcards([]);
      setCurrentStep('input');
      setProgress(0);
    }
    setText('');
    setUniqueWords([]);
    setFlashcards([]);
    setCurrentStep('input');
    setProgress(0);
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
            
            {isLoading && (
              <div className="loading-state">
                <ProgressIndicator progress={progress} />
                <p>Получение переводов для {uniqueWords.length} слов...</p>
              </div>
            )}
          </div>
        )}
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

      <style jsx>{`
        /* Основные стили CSS */
        :root {
          --primary-color: #2c3e50;
          --secondary-color: #3498db;
          --accent-color: #e74c3c;
          --light-color: #ecf0f1;
          --dark-color: #34495e;
          --success-color: #27ae60;
          --warning-color: #f39c12;
          --border-radius: 8px;
          --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          --transition: all 0.3s ease;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Roboto', 'Segoe UI', sans-serif;
          line-height: 1.6;
          color: var(--dark-color);
          background-color: var(--light-color);
        }
        
        .app {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        
        .header {
          text-align: center;
          margin-bottom: 40px;
          padding: 20px;
          border-bottom: 2px solid var(--secondary-color);
        }
        
        .header h1 {
          color: var(--primary-color);
          font-size: 2.5rem;
          margin-bottom: 10px;
        }
        
        .subtitle {
          color: var(--dark-color);
          font-size: 1.2rem;
          font-weight: 300;
        }
        
        .main-content {
          background-color: white;
          border-radius: var(--border-radius);
          box-shadow: var(--shadow);
          padding: 30px;
          min-height: 500px;
        }
        
        .btn {
          display: inline-block;
          padding: 10px 20px;
          border: none;
          border-radius: var(--border-radius);
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          text-align: center;
          transition: var(--transition);
        }
        
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .btn-primary {
          background-color: var(--secondary-color);
          color: white;
        }
        
        .btn-primary:hover:not(:disabled) {
          background-color: #2980b9;
        }
        
        .btn-secondary {
          background-color: var(--light-color);
          color: var(--dark-color);
          border: 1px solid var(--dark-color);
        }
        
        .btn-secondary:hover:not(:disabled) {
          background-color: #dfe6e9;
        }
        
        .actions {
          margin-top: 20px;
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        
        .extracted-words {
          margin-bottom: 30px;
        }
        
        .extracted-words h2 {
          margin-bottom: 20px;
          text-align: center;
          color: var(--primary-color);
        }
        
        .words-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 30px;
        }
        
        .word-chip {
          background-color: var(--light-color);
          padding: 8px 15px;
          border-radius: 20px;
          font-size: 0.9rem;
          border: 1px solid #bdc3c7;
          color: var(--dark-color);
          transition: var(--transition);
        }
        
        .word-chip:hover {
          background-color: var(--secondary-color);
          color: white;
          border-color: var(--secondary-color);
        }
        
        /* Стили для TextInput */
        .text-input {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .text-input h2 {
          text-align: center;
          margin-bottom: 15px;
          color: var(--primary-color);
        }
        
        .instruction {
          text-align: center;
          margin-bottom: 20px;
          color: var(--dark-color);
          font-size: 1rem;
        }
        
        .text-area {
          width: 100%;
          min-height: 200px;
          padding: 15px;
          border-radius: var(--border-radius);
          border: 1px solid #bdc3c7;
          font-family: inherit;
          font-size: 1rem;
          resize: vertical;
          transition: var(--transition);
          margin-bottom: 20px;
        }
        
        .text-area:focus {
          outline: none;
          border-color: var(--secondary-color);
          box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        
        .text-input .btn {
          display: block;
          margin: 0 auto;
          min-width: 200px;
        }
        
        /* Стили для FlashcardViewer */
        .flashcard-viewer {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px 0;
        }
        
        .progress-info {
          text-align: center;
          margin-bottom: 20px;
          font-size: 1.1rem;
          color: var(--dark-color);
        }
        
        .card-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          margin-bottom: 30px;
          min-height: 350px;
        }
        
        .nav-btn {
          background: var(--light-color);
          border: none;
          color: var(--primary-color);
          font-size: 2rem;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition);
          box-shadow: var(--shadow);
        }
        
        .nav-btn:hover {
          background-color: var(--secondary-color);
          color: white;
        }
        
        .nav-btn:focus {
          outline: none;
        }
        
        .card-progress {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-top: 20px;
        }
        
        .progress-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: var(--light-color);
          border: 1px solid var(--dark-color);
          cursor: pointer;
          transition: var(--transition);
        }
        
        .progress-dot.active {
          background-color: var(--secondary-color);
          border-color: var(--secondary-color);
          transform: scale(1.2);
        }
        
        .no-cards {
          text-align: center;
          padding: 50px 0;
          font-size: 1.2rem;
          color: var(--dark-color);
        }
        
        /* Стили для Flashcard */
        .flashcard {
          width: 100%;
          max-width: 400px;
          height: 300px;
          perspective: 1000px;
          cursor: pointer;
        }
        
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s;
          transform-style: preserve-3d;
          box-shadow: var(--shadow);
          border-radius: var(--border-radius);
        }
        
        .flashcard.flipped .card-inner {
          transform: rotateY(180deg);
        }
        
        .card-front, .card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 20px;
          border-radius: var(--border-radius);
        }
        
        .card-front {
          background-color: var(--secondary-color);
          color: white;
        }
        
        .card-back {
          background-color: white;
          color: var(--dark-color);
          transform: rotateY(180deg);
          overflow-y: auto;
        }
        
        .word {
          font-size: 2.5rem;
          margin-bottom: 20px;
          text-align: center;
          font-weight: 700;
        }
        
        .hint {
          font-size: 0.9rem;
          opacity: 0.8;
          position: absolute;
          bottom: 15px;
          text-align: center;
          font-style: italic;
        }
        
        .original-word {
          font-size: 1.8rem;
          margin-bottom: 15px;
          color: var(--primary-color);
          text-align: center;
        }
        
        .translations, .examples {
          width: 100%;
          margin-bottom: 15px;
        }
        
        .translations h4, .examples h4 {
          font-size: 1.1rem;
          margin-bottom: 8px;
          color: var(--primary-color);
          border-bottom: 1px solid var(--light-color);
          padding-bottom: 5px;
        }
        
        .translations ul, .examples ul {
          list-style-type: none;
        }
        
        .translations li {
          margin-bottom: 8px;
          font-size: 1.1rem;
        }
        
        .examples li {
          margin-bottom: 15px;
          background-color: var(--light-color);
          padding: 10px;
          border-radius: var(--border-radius);
        }
        
        .sample-phrase {
          font-weight: 500;
          margin-bottom: 5px;
          color: var(--primary-color);
        }
        
        .sample-translation {
          font-style: italic;
        }
        
        .note {
          font-size: 0.9rem;
          font-style: italic;
          color: var(--dark-color);
          margin-top: 10px;
          text-align: center;
        }
        
        .attribution {
          font-size: 0.8rem;
          color: #999;
          position: absolute;
          bottom: 5px;
          right: 10px;
        }
        
        .api-attribution {
          text-align: center;
          margin-top: 20px;
          font-size: 0.9rem;
          color: #999;
        }
        
        /* Стили для индикатора прогресса */
        .progress-container {
          margin: 20px auto;
          max-width: 400px;
        }
        
        .progress-bar {
          height: 10px;
          background-color: #ecf0f1;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 5px;
        }
        
        .progress-bar-fill {
          height: 100%;
          background-color: var(--secondary-color);
          border-radius: 5px;
          transition: width 0.3s ease;
        }
        
        .progress-text {
          font-size: 14px;
          color: #7f8c8d;
          text-align: center;
        }
        
        /* Адаптивные стили */
        @media screen and (max-width: 768px) {
          .app {
            padding: 10px;
          }
          
          .header h1 {
            font-size: 2rem;
          }
          
          .main-content {
            padding: 20px;
          }
          
          .words-container {
            justify-content: center;
          }
          
          .text-area {
            min-height: 150px;
          }
          
          .card-container {
            flex-direction: column;
            gap: 15px;
          }
          
          .nav-btn {
            order: 1;
            width: 40px;
            height: 40px;
            font-size: 1.5rem;
          }
          
          .card-progress {
            max-width: 100%;
            flex-wrap: wrap;
          }
        }