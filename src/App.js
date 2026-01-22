import React, { useState, useEffect, useCallback } from 'react';
import useTranslation from './hooks/useTranslation';
import { dataService } from './services/DataService';

// Функция для извлечения уникальных слов из текста
const extractUniqueWords = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lowerCaseText = text.toLowerCase();
  const cleanedText = lowerCaseText.replace(/[.,/#!$%^&*;:{}=\-_`~()«»„"[\]]/g, ' ');
  const words = cleanedText.split(/\s+/).filter(word => word.length > 1);
  return Array.from(new Set(words)).sort();
};

// Компонент для ввода текста
const TextInput = ({ text, onTextChange, onExtractWords }) => (
  <div className="text-input">
    <h2>Введите текст на чешском языке</h2>
    <p className="instruction">Вставьте чешский текст для анализа и создания карточек.</p>
    <textarea
      className="text-area"
      value={text}
      onChange={(e) => onTextChange(e.target.value)}
      placeholder="Вставьте текст..."
      rows={10}
    />
    <button className="btn btn-primary" onClick={onExtractWords} disabled={!text.trim()}>
      Извлечь слова
    </button>
  </div>
);

// Компонент индикатора прогресса
const ProgressIndicator = ({ progress, currentWord, totalWords, processedWords }) => (
  <div className="loading-indicator">
    <div className="loading-spinner"></div>
    {currentWord && <div className="loading-current-word">{currentWord}</div>}
    <div className="progress-container" style={{ width: '100%', maxWidth: '300px' }}>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="loading-status">
        {processedWords !== undefined ? `${processedWords} из ${totalWords} (${progress}%)` : `${progress}%`}
      </div>
    </div>
  </div>
);

// Компонент переключения темы
const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
           (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <button className="theme-toggle" onClick={() => setIsDark(!isDark)}>
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};

// КАРТОЧКА (С 3D эффектом, Звуком и Поддержкой SQLite)
const Flashcard = ({ word, translations, source, gender, grammar, forms, searchedWord, flipTrigger }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });

  // Синхронизация внешнего переворота (например, пробелом)
  useEffect(() => {
    if (flipTrigger > 0) {
      setIsFlipped(prev => !prev);
    }
  }, [flipTrigger]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    setRotateX(0);
    setRotateY(0);
  };

  const handleSpeak = (e) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'cs-CZ';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleMouseMove = (e) => {
    if (isFlipped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rotateXVal = ((y - rect.height / 2) / (rect.height / 2)) * -5;
    const rotateYVal = ((x - rect.width / 2) / (rect.width / 2)) * 5;
    setRotateX(rotateXVal);
    setRotateY(rotateYVal);
    setGlarePosition({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setGlarePosition({ x: 50, y: 50 });
  };

  const getSourceText = () => {
    if (source === 'golden_db' || source === 'sqlite_migration') return '★ Golden DB';
    if (source === 'deepl') return '🤖 DeepL AI';
    return source?.toUpperCase() || 'DB';
  };

  const getSourceColor = () => {
    if (source?.includes('db')) return '#8b5cf6';
    if (source === 'deepl') return '#0f2b46';
    return 'var(--primary)';
  };

  return (
    <div
      className={`flashcard ${isFlipped ? 'flipped' : ''}`}
      onClick={handleFlip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-inner">
        <div className="card-front">
          {!isFlipped && (
            <div className="card-glare" style={{ background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 80%)` }} />
          )}
          <div className="word-container">
            <div className="word">{word}</div>
            {(gender || grammar) && (
              <div className="front-meta">
                {gender && <span className="meta-badge gender">{gender}</span>}
                {grammar && <span className="meta-badge grammar">{grammar}</span>}
              </div>
            )}
            <button className="audio-btn" onClick={handleSpeak}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" /><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" /></svg>
            </button>
          </div>
          {searchedWord && searchedWord.toLowerCase() !== word.toLowerCase() && (
            <div className="search-context">форма для: <strong>{searchedWord}</strong></div>
          )}
          <p className="hint">Нажмите для перевода</p>
        </div>

        <div className="card-back">
          {(gender || grammar) && (
            <div className="back-header">
              <div className="grammar-tags">
                {gender && <span className="tag tag-gender">{gender}</span>}
                {grammar && <span className="tag tag-grammar">{grammar}</span>}
              </div>
            </div>
          )}
          <div className="translations">
            {translations?.length > 0 ? (
              <ul>{translations.map((t, i) => <li key={i}>{t}</li>)}</ul>
            ) : <p className="no-translations">Переводы не найдены</p>}
          </div>
          {forms?.length > 0 && (
            <div className="word-forms">
              <h4>Словоформы:</h4>
              <div className="forms-grid">
                {forms.map((f, i) => (
                  <span key={i} className={`form-item ${searchedWord && f.toLowerCase() === searchedWord.toLowerCase() ? 'current' : ''}`}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="card-source">
            <span className="source-badge" style={{ backgroundColor: getSourceColor() }}>{getSourceText()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ПРОСМОТРЩИК КАРТОЧЕК
const FlashcardViewer = ({ flashcards }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipTrigger, setFlipTrigger] = useState(0);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : flashcards.length - 1));
  }, [flashcards.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => (prev < flashcards.length - 1 ? prev + 1 : 0));
  }, [flashcards.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      else if (e.key === 'ArrowRight') goToNext();
      else if (e.key === ' ') { e.preventDefault(); setFlipTrigger(t => t + 1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext]);

  if (!flashcards.length) return <div className="empty-state">Нет карточек</div>;

  const currentCard = flashcards[currentIndex];

  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <h2>Карточки</h2>
        <div className="flashcards-count">{currentIndex + 1} / {flashcards.length}</div>
      </div>
      <div className="card-container">
        <button className="nav-btn" onClick={goToPrevious}>&#8249;</button>
        <Flashcard key={currentCard.word} {...currentCard} flipTrigger={flipTrigger} />
        <button className="nav-btn" onClick={goToNext}>&#8250;</button>
      </div>
      <div className="progress-dots">
        {flashcards.slice(0, 20).map((_, i) => (
          <div key={i} className={`progress-dot ${i === currentIndex ? 'active' : ''}`} onClick={() => setCurrentIndex(i)} />
        ))}
      </div>
    </div>
  );
};

// ОСНОВНОЕ ПРИЛОЖЕНИЕ
const App = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [currentStep, setCurrentStep] = useState('input');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [processedCount, setProcessedCount] = useState(0);

  const { translateWord } = useTranslation();

  const handleExtractWords = () => {
    if (!text.trim()) return;
    setUniqueWords(extractUniqueWords(text));
    setCurrentStep('extracted');
  };

  const handleGetTranslations = async () => {
    setIsLoading(true); setProgress(0); setProcessedCount(0);
    const translatedCards = [];
    
    for (let i = 0; i < uniqueWords.length; i++) {
      const word = uniqueWords[i];
      setCurrentWord(word);
      const res = await translateWord(word);
      if (res) {
        translatedCards.push({
          ...res,
          searchedWord: word // Запоминаем, что искали
        });
      }
      setProcessedCount(i + 1);
      setProgress(Math.floor(((i + 1) / uniqueWords.length) * 100));
    }
    
    setFlashcards(translatedCards);
    setCurrentStep('translated');
    setIsLoading(false);
  };

  const handleReset = () => {
    setText(''); setUniqueWords([]); setFlashcards([]); setCurrentStep('input');
  };

  const handleDebug = async () => {
    console.log("🔍 ЗАПУСК ГЛУБОКОЙ ДИАГНОСТИКИ...");
    try {
      const testWord = "haldamáš";
      
      // 1. Прямой поиск
      const result = await dataService.getFromFirebase(testWord);
      console.log(`Результат для "${testWord}":`, result);

      // 2. Поиск без диакритики (на случай, если база нормализована)
      const flatWord = testWord.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      console.log(`Проверка версии без акцентов: "${flatWord}"`);
      const resultFlat = await dataService.getFromFirebase(flatWord);
      console.log(`Результат для "${flatWord}":`, resultFlat);

      // 3. Получаем список ключей, чтобы понять структуру
      const { ref, get, query, limitToFirst } = await import('firebase/database');
      const dbRef = ref(dataService.baseDict.database || (await import('./firebase')).database, 'dictionary');
      const firstWordsQuery = query(dbRef, limitToFirst(20));
      const snapshot = await get(firstWordsQuery);
      
      if (snapshot.exists()) {
        console.log("ПЕРВЫЕ 20 КЛЮЧЕЙ В БАЗЕ:");
        console.table(Object.keys(snapshot.val()));
      } else {
        console.log("❌ База 'dictionary' пуста или недоступна");
      }

      alert("Диагностика завершена. Проверьте консоль (F12)");
    } catch (e) {
      console.error("Ошибка диагностики:", e);
      alert("Ошибка: " + e.message);
    }
  };

  return (
    <div className="app">
      <ThemeToggle />
      <header className="header">
        <h1>Flashcards Seznam</h1>
        <p className="subtitle">Ваша золотая база чешского языка</p>
        <button onClick={handleDebug} style={{opacity: 0.5, fontSize: '10px'}}>Debug Firebase</button>
      </header>

      <main className="main-content">
        {currentStep === 'input' && (
          <TextInput text={text} onTextChange={setText} onExtractWords={handleExtractWords} />
        )}

        {currentStep === 'extracted' && (
          <div className="extracted-words">
            <h2>Найдено слов: {uniqueWords.length}</h2>
            <div className="words-container">
              {uniqueWords.map((w, i) => <span key={i} className="word-chip">{w}</span>)}
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={handleGetTranslations} disabled={isLoading}>
                {isLoading ? 'Загрузка...' : 'Получить данные'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>Сбросить</button>
            </div>
            {isLoading && <ProgressIndicator progress={progress} currentWord={currentWord} totalWords={uniqueWords.length} processedWords={processedCount} />}
          </div>
        )}

        {currentStep === 'translated' && (
          <div>
            <FlashcardViewer flashcards={flashcards} />
            <div className="actions">
              <button className="btn btn-secondary" onClick={handleReset}>Начать заново</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
