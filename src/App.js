import React, { useState, useEffect, useCallback } from 'react';
import useTranslation from './hooks/useTranslation';
import { dataService } from './services/DataService';

// Чешские возвратные частицы и служебные слова, которые не нужны как отдельные карточки
const CZECH_NOISE_WORDS = new Set(['se', 'si', 'by', 'aby', 'že', 'je', 'to', 'už']);

// Функция для извлечения уникальных слов из текста
const extractUniqueWords = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lowerCaseText = text.toLowerCase();
  const cleanedText = lowerCaseText.replace(/[.,/#!$%^&*;:{}=\-_`~()«»„"[\]]/g, ' ');
  const allWords = cleanedText.split(/\s+/).filter(word => word.length > 1);

  // Убираем шумовые/служебные слова (se, si, etc.)
  // DeepSeek сам восстановит возвратную форму глагола (učím → učit se)
  const meaningfulWords = allWords.filter(w => !CZECH_NOISE_WORDS.has(w));

  return Array.from(new Set(meaningfulWords)).sort();
};

const uiTranslations = {
  ru: {
    subtitle: "Ваша золотая база чешского языка",
    inputPlaceholder: "Вставьте текст...",
    extractWords: "Извлечь слова",
    foundWords: "Найдено слов",
    getTranslations: "Получить данные",
    reset: "Сбросить",
    loading: "Загрузка...",
    cardsTitle: "Карточки",
    tapToTranslate: "Нажмите для перевода",
    primaryLabelRu: "🇷🇺 Русский:",
    primaryLabelUa: "🇺🇦 Українська:",
    noTranslations: "Переводы не найдены",
    formFor: "форма для",
    emptyState: "Нет карточек",
    startAgain: "Начать заново",
    inputHeader: "Введите текст на чешском языке",
    inputSubtitle: "Вставьте чешский текст для анализа и создания карточек.",
    wordForms: "Словоформы",
    examples: "Примеры",
    from: "из"
  },
  ua: {
    subtitle: "Ваша золота база чеської мови",
    inputPlaceholder: "Вставте текст...",
    extractWords: "Витягти слова",
    foundWords: "Знайдено слів",
    getTranslations: "Отримати дані",
    reset: "Скинути",
    loading: "Завантаження...",
    cardsTitle: "Картки",
    tapToTranslate: "Натисніть для перекладу",
    primaryLabelRu: "🇷🇺 Російська:",
    primaryLabelUa: "🇺🇦 Українська:",
    noTranslations: "Переклади не знайдено",
    formFor: "форма для",
    emptyState: "Немає карток",
    startAgain: "Почати заново",
    inputHeader: "Введіть текст чеською мовою",
    inputSubtitle: "Вставте чеський текст для аналізу та створення карток.",
    wordForms: "Словоформи",
    examples: "Приклади",
    from: "з"
  }
};

// Компонент для ввода текста
const TextInput = ({ text, onTextChange, onExtractWords, targetLang }) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  return (
    <div className="text-input">
      <h2>{t.inputHeader}</h2>
      <p className="instruction">{t.inputSubtitle}</p>
      <textarea
        className="text-area"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={t.inputPlaceholder}
        rows={10}
      />
      <div className="actions">
        <button className="btn btn-primary" onClick={onExtractWords} disabled={!text.trim()}>
          {t.extractWords}
        </button>
      </div>
    </div>
  );
};

// Компонент индикатора прогресса
const ProgressIndicator = ({ progress, currentWord, totalWords, processedWords, targetLang }) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  return (
    <div className="loading-indicator">
      <div className="loading-spinner"></div>
      {currentWord && <div className="loading-current-word">{currentWord}</div>}
      <div className="progress-container" style={{ width: '100%', maxWidth: '300px' }}>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loading-status">
          {processedWords !== undefined ? `${processedWords} ${t.from} ${totalWords} (${progress}%)` : `${progress}%`}
        </div>
      </div>
    </div>
  );
};

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
    <button className="theme-toggle" onClick={() => setIsDark(!isDark)} title="Переключить тему">
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};

// Компонент переключения языка
const LanguageToggle = ({ lang, onToggle }) => {
  return (
    <button className="lang-toggle" onClick={onToggle} title="Переключить язык (RU/UA)">
      <span className={`flag-icon ${lang === 'ru' ? 'active' : ''}`}>🇷🇺</span>
      <span className="lang-separator">/</span>
      <span className={`flag-icon ${lang === 'ua' ? 'active' : ''}`}>🇺🇦</span>
    </button>
  );
};

// КАРТОЧКА (С 3D эффектом, Звуком и Поддержкой SQLite)
const Flashcard = ({
  word, translations, source, gender, grammar, forms, searchedWord, flipTrigger,
  ipa, vzor, cefrLevel, cefr_level, translationsUa, translations_ua,
  targetLang = 'ru', ...props
}) => {
  // Поддержка обоих форматов именования (camelCase и snake_case)
  const ipaValue = ipa;
  const vzorValue = vzor;
  const cefrValue = cefrLevel || cefr_level;
  const uaTranslations = translationsUa || translations_ua || [];

  // Логика выбора перевода (всегда только один язык)
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  const displayTranslations = (targetLang === 'ua' && uaTranslations.length > 0)
    ? uaTranslations
    : translations;

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
    if (source === 'deepseek') return '🤖 AI (DeepSeek)';
    return source?.toUpperCase() || 'DB';
  };

  const getSourceColor = () => {
    return 'transparent';
  };

  // Новые поля
  const aspectPair = props.aspect_pair || props.aspectPair;
  const wordStyle = props.style;
  const examples = props.examples || [];
  const stressWord = props.stress;
  const vazbaValue = props.vazba;

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
            <div className="word">{stressWord || word}</div>
            {ipaValue && <div className="ipa-transcription">{ipaValue}</div>}
            {(gender || grammar || vzorValue || cefrValue || wordStyle || aspectPair) && (
              <div className="front-meta">
                {gender && <span className="meta-badge gender">{gender}</span>}
                {grammar && <span className="meta-badge grammar">{grammar}</span>}
                {vzorValue && <span className="meta-badge vzor">vzor: {vzorValue}</span>}
                {cefrValue && <span className="meta-badge cefr">{cefrValue}</span>}
                {wordStyle && <span className="meta-badge style">{wordStyle}</span>}
                {aspectPair && <span className="meta-badge aspect">{aspectPair}</span>}
              </div>
            )}
            {vazbaValue && (
              <div className="vazba-badge">
                <span className="vazba-label">vazba:</span> {vazbaValue}
              </div>
            )}
            <button className="audio-btn" onClick={handleSpeak}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" /><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" /></svg>
            </button>
          </div>
          {searchedWord && searchedWord.toLowerCase() !== word.toLowerCase() && (
            <div className="search-context">{t.formFor}: <strong>{searchedWord}</strong></div>
          )}
          <p className="hint">{t.tapToTranslate}</p>
        </div>

        <div className="card-back">
          {(gender || grammar || vzorValue || cefrValue || wordStyle || aspectPair) && (
            <div className="back-header">
              <div className="grammar-tags">
                {gender && <span className="tag tag-gender">{gender}</span>}
                {grammar && <span className="tag tag-grammar">{grammar}</span>}
                {vzorValue && <span className="tag tag-vzor">vzor: {vzorValue}</span>}
                {cefrValue && <span className="tag tag-cefr">{cefrValue}</span>}
                {wordStyle && <span className="tag tag-style">{wordStyle}</span>}
                {aspectPair && <span className="tag tag-aspect">{aspectPair}</span>}
              </div>
            </div>
          )}
          <div className="translations">
            {displayTranslations?.length > 0 ? (
              <p>{displayTranslations.join(', ')}</p>
            ) : <p className="no-translations">{t.noTranslations}</p>}
          </div>
          {forms?.length > 0 && (
            <div className="word-forms">
              <h4>{t.wordForms}:</h4>
              <div className="forms-grid">
                {forms.slice(0, 12).map((f, i) => {
                  const isSearched = searchedWord && f.toLowerCase() === searchedWord.toLowerCase();
                  return (
                    <span key={i} className={`form-item ${isSearched ? 'current' : ''}`}>
                      {f}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {examples?.length > 0 && (
            <div className="examples-section">
              <h4>{t.examples}:</h4>
              <div className="examples-list">
                {examples.slice(0, 2).map((ex, i) => (
                  <div key={i} className="example-item">
                    <p className="ex-cz">{ex.czech}</p>
                    <p className="ex-ru">{targetLang === 'ua' ? (ex.ukrainian || ex.russian) : ex.russian}</p>
                  </div>
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
const FlashcardViewer = ({ flashcards, onReset, targetLang }) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
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

  if (!flashcards.length) return <div className="empty-state">{t.emptyState}</div>;

  const currentCard = flashcards[currentIndex];

  return (
    <div className="flashcards-container">
      <div className="flashcards-header">
        <h2>{t.cardsTitle}</h2>
        <div className="flashcards-count desktop-only">{currentIndex + 1} / {flashcards.length}</div>
      </div>

      <div className="card-container">
        <button className="nav-btn desktop-only" onClick={goToPrevious}>&#8249;</button>
        <Flashcard key={currentCard.word} {...currentCard} flipTrigger={flipTrigger} targetLang={targetLang} />
        <button className="nav-btn desktop-only" onClick={goToNext}>&#8250;</button>
      </div>

      <div className="card-viewer-bottom">
        <div className="nav-controls mobile-only">
          <button className="nav-btn" onClick={goToPrevious}>&#8249;</button>
          <div className="flashcards-count">{currentIndex + 1} / {flashcards.length}</div>
          <button className="nav-btn" onClick={goToNext}>&#8250;</button>
        </div>

        <div className="progress-dots">
          {flashcards.slice(0, 20).map((_, i) => (
            <div key={i} className={`progress-dot ${i === currentIndex ? 'active' : ''}`} onClick={() => setCurrentIndex(i)} />
          ))}
        </div>

        <div className="actions-bottom">
          <button className="btn btn-secondary" onClick={onReset}>{t.startAgain}</button>
        </div>
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
  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('targetLang') || 'ru');

  useEffect(() => {
    localStorage.setItem('targetLang', targetLang);
  }, [targetLang]);

  const t = uiTranslations[targetLang] || uiTranslations.ru;
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

    // Сортировка по частотности (frequency_rank). 
    // Чем меньше ранг, тем более частотное (важное) слово.
    // Слова без ранга (0) уходят в конец.
    translatedCards.sort((a, b) => {
      const rankA = a.frequency_rank || a.frequencyRank || 999999;
      const rankB = b.frequency_rank || b.frequencyRank || 999999;
      return rankA - rankB;
    });

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
      <div className="top-controls">
        <LanguageToggle lang={targetLang} onToggle={() => setTargetLang(prev => prev === 'ru' ? 'ua' : 'ru')} />
        <ThemeToggle />
      </div>
      <header className="header">
        <h1>Flashcards Seznam</h1>
        <p className="subtitle">{t.subtitle}</p>
        <button onClick={handleDebug} style={{ opacity: 0.5, fontSize: '10px' }}>Debug Firebase</button>
      </header>

      <main className="main-content">
        {currentStep === 'input' && (
          <TextInput
            text={text}
            onTextChange={setText}
            onExtractWords={handleExtractWords}
            targetLang={targetLang}
          />
        )}

        {currentStep === 'extracted' && (
          <div className="extracted-words">
            <h2>{t.foundWords}: {uniqueWords.length}</h2>
            <div className="words-container">
              {uniqueWords.map((w, i) => <span key={i} className="word-chip">{w}</span>)}
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={handleGetTranslations} disabled={isLoading}>
                {isLoading ? t.loading : t.getTranslations}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>{t.reset}</button>
            </div>
            {isLoading && <ProgressIndicator progress={progress} currentWord={currentWord} totalWords={uniqueWords.length} processedWords={processedCount} targetLang={targetLang} />}
          </div>
        )}

        {currentStep === 'translated' && (
          <FlashcardViewer flashcards={flashcards} onReset={handleReset} targetLang={targetLang} />
        )}
      </main>
    </div>
  );
};

export default App;
