import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { dataService } from './services/DataService';
import { normalizeWord, hasCyrillic } from './utils/wordMatcher';
import { getVazbaTheory } from './utils/vazbaTheory';
import { SRS_RATING } from './utils/srsScheduler';
import { ttsService } from './utils/ttsService';

// Чешские возвратные частицы и служебные слова, которые не нужны как отдельные карточки
const CZECH_NOISE_WORDS = new Set(['se', 'si', 'by', 'aby', 'že', 'je', 'to', 'už']);
const MAX_CONCURRENT_TRANSLATIONS = 4;
const MAX_CONCURRENT_ENRICHMENTS = 3;
const MAX_WORDS_PER_SESSION = 15;
const MAX_PHRASES_PER_SESSION = 20;

const THEMES = [
  { id: 'teal-light', icon: '🌙', label: 'Teal Light' },
  { id: 'teal-dark', icon: '🌲', label: 'Teal Dark' },
  { id: 'forest', icon: '🌸', label: 'Forest' },
  { id: 'rose', icon: '🏔️', label: 'Rose' },
  { id: 'earth', icon: '☀️', label: 'Earth' }
];

function loadSavedTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') return 'teal-light';
  if (saved === 'dark') return 'teal-dark';
  if (THEMES.some(t => t.id === saved)) return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'teal-dark'
    : 'teal-light';
}

// Извлечение уникальных слов из текста (паритет с Android ExtractWordsUseCase)
const extractUniqueWords = (text) => {
  if (!text || typeof text !== 'string') return [];
  const lowerCaseText = text.normalize('NFC').toLowerCase();
  const cleanedText = lowerCaseText.replace(/[.,/#!$%^&*;:{}=\-_`~()«»„"[\]]/g, ' ');
  const allWords = cleanedText.split(/\s+/).filter(word => word.length > 1);

  const noDigits = allWords
    .filter(w => !/^\d+$/.test(w))
    .filter(w => !/^\d+.*|.*\d+$/.test(w));

  const meaningfulWords = noDigits.filter(w => !CZECH_NOISE_WORDS.has(w));
  return Array.from(new Set(meaningfulWords)).sort();
};

function speakCzech(text) {
  ttsService.speak(text);
}

const uiTranslations = {
  ru: {
    subtitle: 'Ваша золотая база чешского языка',
    inputPlaceholder: 'Vložte český text zde...',
    extractWords: 'Извлечь слова',
    findInCzech: 'Найти по-чешски',
    reverseSingleWordHint: 'Для поиска по-чешски введите одно слово или короткое выражение (до 4 слов)',
    translateAsPhrase: 'Перевести как фразу',
    studyDueWords: 'Учить слова',
    randomPhrases: 'Фразы из словаря',
    viewHistory: 'История и словарь',
    historyTitle: 'История и словарь',
    tabSessions: 'Сессии',
    tabDictionary: 'Мой словарь',
    searchDictionaryHint: 'Поиск слова или перевода…',
    filterAll: 'Все',
    filterLearning: 'Изучаю',
    filterKnown: 'Знаю',
    filterPhrases: 'Фразы',
    returnToLearning: 'Вернуть в обучение',
    totalLearned: 'Всего в словаре',
    wordsShort: 'слов',
    repeatDay: 'Повторить этот день',
    moreItems: 'ещё',
    noHistory: 'Словарь пока пуст. Переведите слова или откройте фразы из словаря.',
    foundWords: 'Выбрано слов',
    hideKnown: 'Скрыть известные',
    tapToExcludeHint: 'Нажмите на слово, чтобы исключить до перевода',
    getTranslations: 'Получить данные',
    reset: 'Сбросить',
    back: 'Назад',
    paste: 'Вставить',
    chars: 'символов',
    loading: 'Загрузка...',
    cardsTitle: 'Карточки',
    tapToTranslate: 'Нажмите для перевода',
    noTranslations: 'Переводы не найдены',
    formFor: 'форма для',
    emptyState: 'Сессия завершена!',
    startAgain: 'Начать заново',
    inputHeader: 'Введите текст на чешском языке',
    inputSubtitle: 'Вставьте чешский текст для анализа и создания карточек.',
    wordForms: 'Словоформы',
    examples: 'Примеры',
    from: 'из',
    statusDone: 'Готово',
    statusProcessing: 'Обработка',
    statusWaiting: 'Ожидает',
    translationFailed: 'Не удалось получить переводы. Проверьте интернет и попробуйте снова.',
    phrasesFailed: 'Не удалось загрузить фразы. Проверьте интернет и попробуйте снова.',
    iKnowThis: 'Я это знаю',
    reverseMode: 'Обратный режим (RU → CZ)',
    srsAgain: 'Забыл',
    srsHard: 'Трудно',
    srsGood: 'Помню',
    updateCard: 'обновить',
    vazbaTitle: 'Управление (Vazba)',
    vazbaOk: 'Понятно',
    genderM: 'муж.',
    genderF: 'жен.',
    genderN: 'ср.',
    toggleTheme: 'Сменить тему',
    toggleLang: 'Переключить язык (RU/UA)'
  },
  ua: {
    subtitle: 'Ваша золота база чеської мови',
    inputPlaceholder: 'Vložte český text zde...',
    extractWords: 'Витягти слова',
    findInCzech: 'Знайти чеською',
    reverseSingleWordHint: 'Для пошуку чеською введіть одне слово або короткий вираз (до 4 слів)',
    translateAsPhrase: 'Перекласти як фразу',
    studyDueWords: 'Вчити слова',
    randomPhrases: 'Фрази зі словника',
    viewHistory: 'Історія та словник',
    historyTitle: 'Історія та словник',
    tabSessions: 'Сесії',
    tabDictionary: 'Мій словник',
    searchDictionaryHint: 'Пошук слова або перекладу…',
    filterAll: 'Усі',
    filterLearning: 'Вивчаю',
    filterKnown: 'Знаю',
    filterPhrases: 'Фрази',
    returnToLearning: 'Повернути у навчання',
    totalLearned: 'Всього у словнику',
    wordsShort: 'слів',
    repeatDay: 'Повторити цей день',
    moreItems: 'ще',
    noHistory: 'Словник поки порожній. Перекладіть слова або відкрийте фрази зі словника.',
    foundWords: 'Обрано слів',
    hideKnown: 'Сховати відомі',
    tapToExcludeHint: 'Натисніть на слово, щоб виключити до перекладу',
    getTranslations: 'Отримати дані',
    reset: 'Скинути',
    back: 'Назад',
    paste: 'Вставити',
    chars: 'символів',
    loading: 'Завантаження...',
    cardsTitle: 'Картки',
    tapToTranslate: 'Натисніть для перекладу',
    noTranslations: 'Переклади не знайдено',
    formFor: 'форма для',
    emptyState: 'Сесію завершено!',
    startAgain: 'Почати заново',
    inputHeader: 'Введіть текст чеською мовою',
    inputSubtitle: 'Вставте чеський текст для аналізу та створення карток.',
    wordForms: 'Словоформи',
    examples: 'Приклади',
    from: 'з',
    statusDone: 'Готово',
    statusProcessing: 'Обробка',
    statusWaiting: 'Очікує',
    translationFailed: 'Не вдалося отримати переклади. Перевірте інтернет та спробуйте ще раз.',
    phrasesFailed: 'Не вдалося завантажити фрази. Перевірте інтернет та спробуйте ще раз.',
    iKnowThis: 'Я це знаю',
    reverseMode: 'Зворотний режим (UA → CZ)',
    srsAgain: 'Забув',
    srsHard: 'Важко',
    srsGood: "Пам'ятаю",
    updateCard: 'оновити',
    vazbaTitle: 'Керування (Vazba)',
    vazbaOk: 'Зрозуміло',
    genderM: 'чол.',
    genderF: 'жін.',
    genderN: 'сер.',
    toggleTheme: 'Змінити тему',
    toggleLang: 'Перемкнути мову (RU/UA)'
  }
};

function formatGender(gender, t) {
  const g = String(gender || '').toLowerCase();
  if (g === 'm' || g === 'masculine' || g === 'муж') return t.genderM;
  if (g === 'f' || g === 'feminine' || g === 'жен') return t.genderF;
  if (g === 'n' || g === 'neuter' || g === 'ср') return t.genderN;
  return gender;
}

function getWordSizeClass(word) {
  const len = String(word || '').length;
  if (len > 22) return 'word-xl';
  if (len > 15) return 'word-lg';
  if (len > 10) return 'word-md';
  return '';
}

// Компонент для ввода текста
const TextInput = ({
  text,
  onTextChange,
  onExtractWords,
  onReverseLookup,
  onTranslateDirectPhrase,
  onStartSrsLearning,
  onLoadRandomPhrases,
  onOpenHistory,
  dueWordsCount,
  isPhraseLoading,
  isDirectPhraseLoading,
  isReverseLookupLoading,
  phraseError,
  targetLang
}) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const isCyrillicInput = Boolean(trimmed) && hasCyrillic(trimmed);
  const canReverseLookup = isCyrillicInput && wordCount >= 1 && wordCount <= 4 && trimmed.length <= 60;
  const canTranslateAsPhrase = !isCyrillicInput && wordCount >= 2 && wordCount <= 6 && trimmed.length <= 80;

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clip = await navigator.clipboard.readText();
        if (clip) onTextChange(text ? `${text}${clip}` : clip);
      }
    } catch (err) {
      console.warn('Clipboard read blocked:', err);
    }
  };

  return (
    <div className="text-input">
      <h2>{t.inputHeader}</h2>
      <p className="instruction">{t.inputSubtitle}</p>

      <div className="textarea-wrapper">
        <textarea
          className="text-area"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t.inputPlaceholder}
          rows={10}
        />
        <button
          type="button"
          className="paste-btn"
          onClick={handlePaste}
          title={t.paste}
          aria-label={t.paste}
        >
          📋
        </button>
        {text.length > 0 && (
          <span className="char-counter">
            {text.length} {t.chars}
          </span>
        )}
      </div>

      <div className="actions">
        {isCyrillicInput ? (
          <button
            className="btn btn-primary"
            onClick={onReverseLookup}
            disabled={!canReverseLookup || isReverseLookupLoading}
          >
            {isReverseLookupLoading && <span className="inline-spinner" />}
            {isReverseLookupLoading ? t.loading : t.findInCzech}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onExtractWords}
            disabled={!trimmed || isDirectPhraseLoading}
          >
            {t.extractWords}
          </button>
        )}

        {canTranslateAsPhrase && (
          <button
            className="btn btn-secondary"
            onClick={onTranslateDirectPhrase}
            disabled={isDirectPhraseLoading}
          >
            {isDirectPhraseLoading && <span className="inline-spinner" />}
            {isDirectPhraseLoading ? t.loading : t.translateAsPhrase}
          </button>
        )}

        {dueWordsCount > 0 && (
          <button className="btn btn-secondary" onClick={onStartSrsLearning}>
            🧠 {t.studyDueWords} ({dueWordsCount})
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={onLoadRandomPhrases}
          disabled={isPhraseLoading}
        >
          {isPhraseLoading && <span className="inline-spinner" />}
          {isPhraseLoading ? t.loading : t.randomPhrases}
        </button>
      </div>

      {isCyrillicInput && !canReverseLookup && (
        <div className="instruction" style={{ marginTop: '10px', marginBottom: 0, fontSize: '0.85rem' }}>
          {t.reverseSingleWordHint}
        </div>
      )}

      {phraseError && <div className="error-message">{t.phrasesFailed}</div>}

      <div className="input-extra-actions">
        <button type="button" className="btn-ghost" onClick={onOpenHistory}>
          🕒 {t.viewHistory}
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
          {processedWords !== undefined
            ? `${processedWords} ${t.from} ${totalWords} (${progress}%)`
            : `${progress}%`}
        </div>
      </div>
    </div>
  );
};

// Переключатель 5 тем по кругу (Teal Light → Teal Dark → Forest → Rose → Earth)
const ThemeToggle = ({ title }) => {
  const [themeId, setThemeId] = useState(loadSavedTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('theme', themeId);
  }, [themeId]);

  const currentIdx = THEMES.findIndex(t => t.id === themeId);
  const current = THEMES[currentIdx >= 0 ? currentIdx : 0];

  const handleCycle = () => {
    const next = THEMES[(currentIdx + 1) % THEMES.length];
    setThemeId(next.id);
  };

  return (
    <button
      className="theme-toggle"
      onClick={handleCycle}
      title={`${title}: ${current.label}`}
      aria-label={title}
    >
      {current.icon}
    </button>
  );
};

// Компонент переключения языка
const LanguageToggle = ({ lang, onToggle, title }) => (
  <button className="lang-toggle" onClick={onToggle} title={title} aria-label={title}>
    <span className={`flag-icon ${lang === 'ru' ? 'active' : ''}`}>🇷🇺</span>
    <span className="lang-separator">/</span>
    <span className={`flag-icon ${lang === 'ua' ? 'active' : ''}`}>🇺🇦</span>
  </button>
);

// Модальное окно теории управления (Vazba)
const VazbaModal = ({ theory, targetLang, onClose }) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  if (!theory) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t.vazbaTitle}</div>
        <div className="modal-body">{theory}</div>
        <div className="modal-actions">
          <button
            className="btn btn-primary"
            style={{ height: '40px', padding: '0 20px' }}
            onClick={onClose}
          >
            {t.vazbaOk}
          </button>
        </div>
      </div>
    </div>
  );
};

// Экран истории сессий и «Моего словаря»
const HistoryView = ({
  sessions,
  allWords,
  onBack,
  onStartReview,
  onOpenWord,
  onToggleKnown,
  targetLang
}) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  const [activeTab, setActiveTab] = useState('sessions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allWords.filter((entry) => {
      if (filter === 'learning' && entry.isKnown) return false;
      if (filter === 'known' && !entry.isKnown) return false;
      if (filter === 'phrases' && !String(entry.word).includes(' ')) return false;
      if (!q) return true;
      const inWord = String(entry.word || '').toLowerCase().includes(q);
      const inRu = (entry.translations || []).some(tr => tr.toLowerCase().includes(q));
      const inUa = (entry.translations_ua || []).some(tr => tr.toLowerCase().includes(q));
      return inWord || inRu || inUa;
    });
  }, [allWords, searchQuery, filter]);

  return (
    <div className="history-screen">
      <div className="screen-topbar">
        <div className="topbar-group">
          <button className="icon-action-btn" onClick={onBack} title={t.back} aria-label={t.back}>
            ←
          </button>
          <div>
            <h2 style={{ fontSize: '1.15rem', lineHeight: 1.2 }}>{t.historyTitle}</h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {t.totalLearned}: {allWords.length} {t.wordsShort}
            </div>
          </div>
        </div>
      </div>

      <div className="history-tabs">
        <button
          type="button"
          className={`filter-pill ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          {t.tabSessions}
        </button>
        <button
          type="button"
          className={`filter-pill ${activeTab === 'dictionary' ? 'active' : ''}`}
          onClick={() => setActiveTab('dictionary')}
        >
          {t.tabDictionary} ({allWords.length})
        </button>
      </div>

      {activeTab === 'sessions' ? (
        sessions.length === 0 ? (
          <div className="history-empty">{t.noHistory}</div>
        ) : (
          <div className="history-list">
            {sessions.map((session) => (
              <div key={session.id} className="history-card">
                <div className="history-card-header">
                  <span className="history-date">📅 {session.label}</span>
                  <span className="history-count-badge">
                    {session.words.length} {t.wordsShort}
                  </span>
                </div>
                <div className="history-preview-chips">
                  {session.words.slice(0, 5).map((w, idx) => (
                    <span key={`${w.word}-${idx}`} className="history-chip">
                      {w.word}
                    </span>
                  ))}
                  {session.words.length > 5 && (
                    <span className="history-more">
                      +{session.words.length - 5} {t.moreItems}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ height: '42px', width: '100%' }}
                  onClick={() => onStartReview(session)}
                >
                  ▶ {t.repeatDay}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <input
            type="text"
            className="dict-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchDictionaryHint}
          />
          <div className="filter-pill-row">
            {[
              ['all', t.filterAll],
              ['learning', t.filterLearning],
              ['known', t.filterKnown],
              ['phrases', t.filterPhrases]
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`filter-pill ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredWords.length === 0 ? (
            <div className="history-empty">{t.noHistory}</div>
          ) : (
            <div className="history-list">
              {filteredWords.map((entry) => {
                const trList =
                  targetLang === 'ua' && entry.translations_ua?.length
                    ? entry.translations_ua
                    : entry.translations || [];
                return (
                  <div
                    key={entry.word}
                    className="dict-item"
                    onClick={() => onOpenWord(entry, filteredWords)}
                  >
                    <div className="dict-item-main">
                      <div className="dict-item-head">
                        <span className="dict-word">{entry.word}</span>
                        {entry.cefr_level && <span className="dict-badge">{entry.cefr_level}</span>}
                        {!entry.isKnown && entry.intervalDays > 0 && (
                          <span className="dict-badge">{entry.intervalDays}d</span>
                        )}
                      </div>
                      {trList.length > 0 && (
                        <div className="dict-trans">{trList.slice(0, 2).join(', ')}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`dict-known-toggle ${entry.isKnown ? 'known' : ''}`}
                      title={entry.isKnown ? t.returnToLearning : t.iKnowThis}
                      aria-label={entry.isKnown ? t.returnToLearning : t.iKnowThis}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleKnown(entry);
                      }}
                    >
                      {entry.isKnown ? '✓' : '○'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// КАРТОЧКА (3D переворот, обратный режим RU/UA → CZ, контекст, примеры с TTS, кнопки SRS)
const Flashcard = ({
  word,
  translations,
  source,
  gender,
  grammar,
  forms,
  searchedWord,
  flipTrigger,
  ipa,
  vzor,
  cefrLevel,
  cefr_level,
  translationsUa,
  translations_ua,
  targetLang = 'ru',
  isRefreshing = false,
  isReverseMode = false,
  onRefreshCard,
  onRateCard,
  onVazbaClick,
  ...props
}) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  const ipaValue = ipa;
  const vzorValue = vzor;
  const cefrValue = cefrLevel || cefr_level;
  const uaTranslations = translationsUa || translations_ua || [];
  const aspectPair = props.aspect_pair || props.aspectPair;
  const wordStyle = props.style;
  const examples = props.examples || [];
  const stressWord = props.stress;
  const vazbaValue = props.vazba;

  const displayedWord = searchedWord || word;
  const showFormFor =
    searchedWord && normalizeWord(searchedWord) !== normalizeWord(word);

  const displayTranslations =
    targetLang === 'ua' && uaTranslations.length > 0 ? uaTranslations : translations;

  const [isFlipped, setIsFlipped] = useState(false);
  const glareRef = useRef(null);

  useEffect(() => {
    setIsFlipped(false);
  }, [word, searchedWord, isReverseMode]);

  useEffect(() => {
    if (flipTrigger > 0) {
      setIsFlipped(prev => !prev);
    }
  }, [flipTrigger]);

  const handleFlip = () => {
    setIsFlipped(prev => !prev);
  };

  const handleSpeak = (e, textToSpeak = displayedWord) => {
    e.stopPropagation();
    speakCzech(textToSpeak);
  };

  const handleMouseMove = (e) => {
    if (isFlipped || !glareRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    glareRef.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 75%)`;
  };

  const handleMouseLeave = () => {
    if (glareRef.current) {
      glareRef.current.style.background = 'none';
    }
  };

  const getSourceText = () => {
    if (source === 'golden_db' || source === 'sqlite_migration' || source === 'firebase') return '★ Golden DB';
    if (source === 'deepseek' || source === 'deepseek-enriched') return '🧠 DeepSeek';
    if (source === 'cache') return '💾 Cache';
    return source?.toUpperCase() || 'DB';
  };

  const vazbaItems = vazbaValue
    ? String(vazbaValue).split(',').map(v => v.trim()).filter(Boolean)
    : [];

  const genderLabel = gender ? formatGender(gender, t) : '';
  const wordSizeClass = getWordSizeClass(displayedWord);

  const handleRate = (e, rating) => {
    e.stopPropagation();
    setIsFlipped(false);
    onRateCard && onRateCard(rating);
  };

  return (
    <div
      className={`flashcard ${isFlipped ? 'flipped' : ''}`}
      onClick={handleFlip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-inner">
        {/* ЛИЦЕВАЯ СТОРОНА */}
        <div className="card-front">
          {!isFlipped && <div className="card-glare" ref={glareRef} />}
          {isReverseMode ? (
            <div className="word-container">
              {(genderLabel || grammar || cefrValue || wordStyle) && (
                <div className="front-meta">
                  {cefrValue && <span className="meta-badge cefr">{cefrValue}</span>}
                  {grammar && <span className="meta-badge grammar">{grammar}</span>}
                  {genderLabel && <span className="meta-badge gender">{genderLabel}</span>}
                  {wordStyle && <span className="meta-badge style">{wordStyle}</span>}
                </div>
              )}
              <div className="translations" style={{ flex: 'none', padding: '12px 0' }}>
                {displayTranslations?.length > 0 ? (
                  <p style={{ fontSize: '1.7rem', fontWeight: 700 }}>
                    {displayTranslations.slice(0, 3).join(', ')}
                  </p>
                ) : (
                  <p className="no-translations">{t.noTranslations}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="word-container">
              {showFormFor && (
                <div className="search-context">
                  {t.formFor}: <strong>{word}</strong>
                </div>
              )}

              <div className={`word ${wordSizeClass}`}>{displayedWord}</div>

              {stressWord && normalizeWord(stressWord) !== normalizeWord(displayedWord) && (
                <div className="stress-word">{stressWord}</div>
              )}

              {ipaValue && <div className="ipa-transcription">{ipaValue}</div>}

              {(genderLabel || grammar || vzorValue || cefrValue || wordStyle || aspectPair) && (
                <div className="front-meta">
                  {cefrValue && <span className="meta-badge cefr">{cefrValue}</span>}
                  {grammar && <span className="meta-badge grammar">{grammar}</span>}
                  {genderLabel && <span className="meta-badge gender">{genderLabel}</span>}
                  {vzorValue && <span className="meta-badge vzor">[{vzorValue}]</span>}
                  {wordStyle && <span className="meta-badge style">{wordStyle}</span>}
                  {aspectPair && <span className="meta-badge aspect">{aspectPair}</span>}
                </div>
              )}

              {vazbaItems.length > 0 && (
                <div className="vazba-row">
                  {vazbaItems.map((item, idx) => (
                    <button
                      key={`${item}-${idx}`}
                      type="button"
                      className="vazba-chip"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVazbaClick && onVazbaClick(item);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}

              <button type="button" className="audio-btn" onClick={(e) => handleSpeak(e, displayedWord)} aria-label="Speak">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                  <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>
          )}
          <p className="hint">{t.tapToTranslate}</p>
        </div>

        {/* ОБРАТНАЯ СТОРОНА */}
        <div className="card-back">
          <button
            type="button"
            className="card-refresh-btn"
            disabled={isRefreshing}
            onClick={(e) => {
              e.stopPropagation();
              onRefreshCard && onRefreshCard(word);
            }}
          >
            {isRefreshing ? <span className="inline-spinner" style={{ marginRight: 0 }} /> : t.updateCard}
          </button>

          <div className="back-header">
            <div className="card-back-title-row">
              <span className="card-back-word">{word}</span>
              <button
                type="button"
                className="mini-speak-btn"
                onClick={(e) => handleSpeak(e, word)}
                aria-label="Speak"
              >
                🔊
              </button>
            </div>
            {(genderLabel || grammar || vzorValue || cefrValue || wordStyle || aspectPair) && (
              <div className="grammar-tags">
                {cefrValue && <span className="tag tag-cefr">{cefrValue}</span>}
                {grammar && <span className="tag tag-grammar">{grammar}</span>}
                {genderLabel && <span className="tag tag-gender">{genderLabel}</span>}
                {vzorValue && <span className="tag tag-vzor">[{vzorValue}]</span>}
                {wordStyle && <span className="tag tag-style">{wordStyle}</span>}
                {aspectPair && <span className="tag tag-aspect">{aspectPair}</span>}
              </div>
            )}
          </div>

          <div className="card-back-scroll">
            {isReverseMode ? (
              <div style={{ textAlign: 'center' }}>
                {ipaValue && <div className="ipa-transcription">{ipaValue}</div>}
                {vazbaItems.length > 0 && (
                  <div className="vazba-row">
                    {vazbaItems.map((item, idx) => (
                      <button
                        key={`${item}-${idx}`}
                        type="button"
                        className="vazba-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVazbaClick && onVazbaClick(item);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="translations" style={{ flex: 'none' }}>
                {displayTranslations?.length > 0 ? (
                  <p>{displayTranslations.join(', ')}</p>
                ) : (
                  <p className="no-translations">{t.noTranslations}</p>
                )}
              </div>
            )}

            {examples?.length > 0 && (
              <div className="examples-section">
                <h4>{t.examples}:</h4>
                <div className="examples-list">
                  {examples.slice(0, 2).map((ex, i) => (
                    <div key={i} className="example-item">
                      <div className="example-item-row">
                        <div>
                          <p className="ex-cz">{ex.czech}</p>
                          <p className="ex-ru">
                            {targetLang === 'ua' ? ex.ukrainian || ex.russian : ex.russian}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="mini-speak-btn"
                          onClick={(e) => handleSpeak(e, ex.czech)}
                          aria-label="Speak example"
                        >
                          🔊
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forms?.length > 0 && (
              <div className="word-forms">
                <h4>{t.wordForms}:</h4>
                <div className="forms-grid">
                  {forms.slice(0, 12).map((f, i) => {
                    const isSearched = searchedWord && normalizeWord(f) === normalizeWord(searchedWord);
                    return (
                      <span key={i} className={`form-item ${isSearched ? 'current' : ''}`}>
                        {f}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card-source">
              <span className="source-badge" style={{ backgroundColor: 'transparent' }}>
                {getSourceText()}
              </span>
            </div>
          </div>

          <div className="srs-bar">
            <button
              type="button"
              className="srs-btn again"
              onClick={(e) => handleRate(e, SRS_RATING.AGAIN)}
            >
              {t.srsAgain}
            </button>
            <button
              type="button"
              className="srs-btn hard"
              onClick={(e) => handleRate(e, SRS_RATING.HARD)}
            >
              {t.srsHard}
            </button>
            <button
              type="button"
              className="srs-btn good"
              onClick={(e) => handleRate(e, SRS_RATING.GOOD)}
            >
              {t.srsGood}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ПРОСМОТРЩИК КАРТОЧЕК
const FlashcardViewer = ({
  flashcards,
  initialIndex = 0,
  onBack,
  onReset,
  onMarkAsKnown,
  onRateCard,
  onRefreshCard,
  refreshingWord,
  isReverseMode,
  onToggleReverseMode,
  onVazbaClick,
  isModalOpen = false,
  targetLang
}) => {
  const t = uiTranslations[targetLang] || uiTranslations.ru;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [flipTrigger, setFlipTrigger] = useState(0);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (flashcards.length > 0 && currentIndex >= flashcards.length) {
      setCurrentIndex(flashcards.length - 1);
    }
  }, [flashcards.length, currentIndex]);

  const goToPrevious = useCallback(() => {
    if (!flashcards.length) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : flashcards.length - 1));
  }, [flashcards.length]);

  const goToNext = useCallback(() => {
    if (!flashcards.length) return;
    setCurrentIndex(prev => (prev < flashcards.length - 1 ? prev + 1 : 0));
  }, [flashcards.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isModalOpen) return;
      if (e.key === 'ArrowLeft') goToPrevious();
      else if (e.key === 'ArrowRight') goToNext();
      else if (e.key === ' ') {
        e.preventDefault();
        setFlipTrigger(v => v + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, isModalOpen]);

  if (!flashcards.length) {
    return (
      <div className="flashcards-container" style={{ textAlign: 'center' }}>
        <div className="empty-state" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
          {t.emptyState}
        </div>
        <button className="btn btn-secondary" onClick={onReset}>
          {t.startAgain}
        </button>
      </div>
    );
  }

  const safeIndex = Math.min(currentIndex, flashcards.length - 1);
  const currentCard = flashcards[safeIndex];
  const isCardRefreshing = refreshingWord === normalizeWord(currentCard.word);

  const maxDots = 10;
  const visibleDots = Math.min(flashcards.length, maxDots);
  const windowStart =
    flashcards.length <= maxDots
      ? 0
      : Math.max(0, Math.min(safeIndex - 4, flashcards.length - maxDots));

  return (
    <div className="flashcards-container">
      <div className="screen-topbar" style={{ maxWidth: '640px', margin: '0 auto 6px' }}>
        <button className="icon-action-btn" onClick={onBack} title={t.back} aria-label={t.back}>
          ←
        </button>

        <div className="flashcards-count">
          {safeIndex + 1} / {flashcards.length}
        </div>

        <div className="topbar-group">
          <button
            className={`icon-action-btn ${isReverseMode ? 'active' : ''}`}
            onClick={onToggleReverseMode}
            title={t.reverseMode}
            aria-label={t.reverseMode}
          >
            ⇄
          </button>
          <button
            className="icon-action-btn known-btn"
            onClick={() => onMarkAsKnown(currentCard, safeIndex)}
            title={t.iKnowThis}
            aria-label={t.iKnowThis}
          >
            ✓
          </button>
          <button className="icon-action-btn" onClick={onReset} title={t.reset} aria-label={t.reset}>
            ↻
          </button>
        </div>
      </div>

      <div className="card-container">
        <button className="nav-btn desktop-only" onClick={goToPrevious} aria-label="Previous">
          &#8249;
        </button>
        <Flashcard
          key={`${currentCard.word}-${currentCard.searchedWord || ''}`}
          {...currentCard}
          flipTrigger={flipTrigger}
          targetLang={targetLang}
          isRefreshing={isCardRefreshing}
          isReverseMode={isReverseMode}
          onRefreshCard={onRefreshCard}
          onRateCard={(rating) => onRateCard(currentCard, safeIndex, rating)}
          onVazbaClick={onVazbaClick}
        />
        <button className="nav-btn desktop-only" onClick={goToNext} aria-label="Next">
          &#8250;
        </button>
      </div>

      <div className="card-viewer-bottom">
        <div className="nav-controls mobile-only">
          <button className="nav-btn" onClick={goToPrevious} aria-label="Previous">
            &#8249;
          </button>
          <div className="flashcards-count">
            {safeIndex + 1} / {flashcards.length}
          </div>
          <button className="nav-btn" onClick={goToNext} aria-label="Next">
            &#8250;
          </button>
        </div>

        <div className="progress-dots">
          {windowStart > 0 && <span className="dots-ellipsis">…</span>}
          {Array.from({ length: visibleDots }).map((_, i) => {
            const dotIndex = windowStart + i;
            return (
              <div
                key={dotIndex}
                className={`progress-dot ${dotIndex === safeIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(dotIndex)}
              />
            );
          })}
          {windowStart + visibleDots < flashcards.length && <span className="dots-ellipsis">…</span>}
        </div>

        <div className="actions-bottom">
          <button className="btn btn-secondary" onClick={onReset}>
            {t.startAgain}
          </button>
        </div>
      </div>
    </div>
  );
};

// ОСНОВНОЕ ПРИЛОЖЕНИЕ
const App = () => {
  const [text, setText] = useState('');
  const [uniqueWords, setUniqueWords] = useState([]);
  const [excludedWords, setExcludedWords] = useState(new Set());
  const [knownWordsSet, setKnownWordsSet] = useState(() => dataService.getKnownWordsSet());
  const [hideKnownWords, setHideKnownWords] = useState(true);

  const [flashcards, setFlashcards] = useState([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [historySessions, setHistorySessions] = useState([]);
  const [allDictionaryWords, setAllDictionaryWords] = useState([]);
  const [dueWordsCount, setDueWordsCount] = useState(() => dataService.getDueWordsCount());

  const [currentStep, setCurrentStep] = useState('input');
  const [previousStepForCards, setPreviousStepForCards] = useState('input');
  const [isReverseMode, setIsReverseMode] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [processedCount, setProcessedCount] = useState(0);
  const [processedWordsSet, setProcessedWordsSet] = useState(new Set());
  const [processingWordsSet, setProcessingWordsSet] = useState(new Set());
  const [translationError, setTranslationError] = useState(false);

  const [isPhraseLoading, setIsPhraseLoading] = useState(false);
  const [isDirectPhraseLoading, setIsDirectPhraseLoading] = useState(false);
  const [isReverseLookupLoading, setIsReverseLookupLoading] = useState(false);
  const [phraseError, setPhraseError] = useState(false);
  const [refreshingWord, setRefreshingWord] = useState(null);
  const [vazbaTheoryText, setVazbaTheoryText] = useState('');

  const [targetLang, setTargetLang] = useState(() => localStorage.getItem('targetLang') || 'ru');

  const translationRunRef = useRef(0);
  const enrichmentRunRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('targetLang', targetLang);
  }, [targetLang]);

  useEffect(() => {
    if (!vazbaTheoryText) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setVazbaTheoryText('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vazbaTheoryText]);

  const refreshCounts = useCallback(() => {
    setDueWordsCount(dataService.getDueWordsCount());
    setKnownWordsSet(dataService.getKnownWordsSet());
  }, []);

  const t = uiTranslations[targetLang] || uiTranslations.ru;

  // Фоновое дообогащение неполных карточек (без блокировки UI)
  const startBackgroundEnrichment = useCallback((cardsList) => {
    const runId = ++enrichmentRunRef.current;
    const candidates = cardsList.filter(c => dataService.isRecordIncomplete(c)).slice(0, 20);
    if (!candidates.length) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length && enrichmentRunRef.current === runId) {
        const card = candidates[cursor++];
        try {
          const enriched = await dataService.enrichWord(card);
          if (enriched && enrichmentRunRef.current === runId) {
            const targetKey = normalizeWord(enriched.word_normalized || enriched.word);
            setFlashcards(prev =>
              prev.map(item =>
                normalizeWord(item.word_normalized || item.word) === targetKey
                  ? {
                      ...enriched,
                      searchedWord: item.searchedWord,
                      isKnown: item.isKnown
                    }
                  : item
              )
            );
          }
        } catch (err) {
          console.warn('[Enrichment] Failed:', card.word, err);
        }
      }
    };

    const workersCount = Math.min(MAX_CONCURRENT_ENRICHMENTS, candidates.length);
    for (let i = 0; i < workersCount; i += 1) {
      worker();
    }
  }, []);

  const handleExtractWords = () => {
    if (!text.trim()) return;
    const extracted = extractUniqueWords(text);
    if (!extracted.length) return;
    setUniqueWords(extracted);
    setExcludedWords(new Set());
    setKnownWordsSet(dataService.getKnownWordsSet());
    setTranslationError(false);
    setProcessedWordsSet(new Set());
    setProcessingWordsSet(new Set());
    setCurrentStep('extracted');
  };

  const handleReverseLookup = async () => {
    const queryText = text.trim().replace(/\s+/g, ' ');
    if (!queryText || isReverseLookupLoading) return;
    setIsReverseLookupLoading(true);
    setPhraseError(false);
    try {
      const entry = await dataService.lookupCzechByNativeWord(queryText);
      if (entry && ((entry.translations && entry.translations.length) || (entry.translations_ua && entry.translations_ua.length))) {
        const deck = [entry];
        setIsReverseMode(false);
        setFlashcards(deck);
        setViewerInitialIndex(0);
        setPreviousStepForCards('input');
        setCurrentStep('translated');
        startBackgroundEnrichment(deck);
        refreshCounts();
      } else {
        setPhraseError(true);
      }
    } finally {
      setIsReverseLookupLoading(false);
    }
  };

  const handleTranslateDirectPhrase = async () => {
    const phrase = text.trim().replace(/\s+/g, ' ');
    if (!phrase || isDirectPhraseLoading) return;
    setIsDirectPhraseLoading(true);
    setPhraseError(false);
    try {
      const entry = await dataService.getTranslation(phrase);
      if (entry && ((entry.translations && entry.translations.length) || (entry.translations_ua && entry.translations_ua.length))) {
        const deck = [{ ...entry, searchedWord: phrase }];
        setFlashcards(deck);
        setViewerInitialIndex(0);
        setPreviousStepForCards('input');
        setCurrentStep('translated');
        startBackgroundEnrichment(deck);
        refreshCounts();
      } else {
        setPhraseError(true);
      }
    } finally {
      setIsDirectPhraseLoading(false);
    }
  };

  const handleStartSrsLearning = () => {
    const words = dataService.getWordsForSrsLearning(MAX_WORDS_PER_SESSION);
    if (!words.length) return;
    setFlashcards(words);
    setViewerInitialIndex(0);
    setPreviousStepForCards('input');
    setCurrentStep('translated');
    startBackgroundEnrichment(words);
  };

  const toggleWordExcluded = (word) => {
    const key = normalizeWord(word);
    setExcludedWords(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const knownInExtractedCount = useMemo(
    () => uniqueWords.filter(w => knownWordsSet.has(normalizeWord(w))).length,
    [uniqueWords, knownWordsSet]
  );

  const visibleExtractedWords = useMemo(
    () => (hideKnownWords ? uniqueWords.filter(w => !knownWordsSet.has(normalizeWord(w))) : uniqueWords),
    [uniqueWords, knownWordsSet, hideKnownWords]
  );

  const activeExtractedWords = useMemo(
    () => visibleExtractedWords.filter(w => !excludedWords.has(normalizeWord(w))),
    [visibleExtractedWords, excludedWords]
  );

  const handleGetTranslations = async () => {
    if (!activeExtractedWords.length || isLoading) return;
    const wordsToTranslate = activeExtractedWords;
    const runId = ++translationRunRef.current;
    setIsLoading(true);
    setTranslationError(false);
    setProgress(0);
    setProcessedCount(0);
    setProcessedWordsSet(new Set());
    setProcessingWordsSet(new Set());

    const results = new Array(wordsToTranslate.length).fill(null);
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
      while (cursor < wordsToTranslate.length && translationRunRef.current === runId) {
        const index = cursor++;
        const word = wordsToTranslate[index];
        const lower = word.toLowerCase();

        setCurrentWord(word);
        setProcessingWordsSet(prev => {
          const next = new Set(prev);
          next.add(lower);
          return next;
        });

        const res = await dataService.getTranslation(word);
        if (translationRunRef.current !== runId) return;

        if (res && ((res.translations && res.translations.length > 0) || (res.translations_ua && res.translations_ua.length > 0))) {
          results[index] = { ...res, searchedWord: word };
        }

        completed += 1;
        setProcessedCount(completed);
        setProgress(Math.floor((completed / wordsToTranslate.length) * 100));
        setProcessingWordsSet(prev => {
          const next = new Set(prev);
          next.delete(lower);
          return next;
        });
        setProcessedWordsSet(prev => {
          const next = new Set(prev);
          next.add(lower);
          return next;
        });
      }
    };

    const workersCount = Math.min(MAX_CONCURRENT_TRANSLATIONS, wordsToTranslate.length);
    await Promise.all(Array.from({ length: workersCount }, () => worker()));

    if (translationRunRef.current !== runId) return;

    const seenWords = new Set();
    const translatedCards = [];
    for (const item of results) {
      if (!item) continue;
      const baseKey = normalizeWord(item.word_normalized || item.word);
      if (!seenWords.has(baseKey)) {
        seenWords.add(baseKey);
        translatedCards.push(item);
      }
    }

    translatedCards.sort((a, b) => {
      const rankA = a.frequency_rank || a.frequencyRank || 999999;
      const rankB = b.frequency_rank || b.frequencyRank || 999999;
      return rankA - rankB;
    });

    setIsLoading(false);
    setProcessingWordsSet(new Set());

    if (translatedCards.length === 0) {
      setTranslationError(true);
      return;
    }

    setFlashcards(translatedCards);
    setViewerInitialIndex(0);
    setPreviousStepForCards('extracted');
    setCurrentStep('translated');
    startBackgroundEnrichment(translatedCards);
    refreshCounts();
  };

  const handleLoadRandomPhrases = async () => {
    if (isPhraseLoading) return;
    setIsPhraseLoading(true);
    setPhraseError(false);
    try {
      const phrases = await dataService.getRandomPhrases(MAX_PHRASES_PER_SESSION);
      if (phrases.length > 0) {
        setFlashcards(phrases);
        setViewerInitialIndex(0);
        setPreviousStepForCards('input');
        setCurrentStep('translated');
        startBackgroundEnrichment(phrases);
        refreshCounts();
      } else {
        setPhraseError(true);
      }
    } catch (err) {
      console.error('Error loading random phrases:', err);
      setPhraseError(true);
    } finally {
      setIsPhraseLoading(false);
    }
  };

  const reloadHistoryData = useCallback(() => {
    setHistorySessions(dataService.getHistorySessions(targetLang));
    setAllDictionaryWords(dataService.getAllCachedWords());
  }, [targetLang]);

  const handleOpenHistory = () => {
    reloadHistoryData();
    setCurrentStep('history');
  };

  const handleStartHistoryReview = (session) => {
    setFlashcards(session.words);
    setViewerInitialIndex(0);
    setPreviousStepForCards('history');
    setCurrentStep('translated');
    startBackgroundEnrichment(session.words);
  };

  const handleOpenWordFromDictionary = (entry, filteredList) => {
    const deck = filteredList.length ? filteredList : [entry];
    const idx = Math.max(
      0,
      deck.findIndex(w => normalizeWord(w.word) === normalizeWord(entry.word))
    );
    setFlashcards(deck);
    setViewerInitialIndex(idx);
    setPreviousStepForCards('history');
    setCurrentStep('translated');
    startBackgroundEnrichment(deck);
  };

  const handleToggleKnownInDictionary = (entry) => {
    if (entry.isKnown) {
      dataService.markAsUnknown(entry.word);
    } else {
      dataService.markAsKnown(entry);
    }
    reloadHistoryData();
    refreshCounts();
  };

  const handleMarkAsKnown = (card, index) => {
    dataService.markAsKnown(card);
    setFlashcards(prev => prev.filter((_, i) => i !== index));
    refreshCounts();
  };

  const handleRateCard = (card, index, rating) => {
    const updated = dataService.reviewWord(card, rating);
    setFlashcards(prev => {
      const copy = [...prev];
      if (index < 0 || index >= copy.length) return copy;
      copy.splice(index, 1);
      if (rating === SRS_RATING.AGAIN) {
        copy.push({
          ...(updated || card),
          searchedWord: card.searchedWord
        });
      }
      return copy;
    });
    refreshCounts();
  };

  const handleRefreshCard = async (word) => {
    const targetKey = normalizeWord(word);
    if (refreshingWord === targetKey) return;
    setRefreshingWord(targetKey);
    try {
      const refreshed = await dataService.refreshWord(word);
      if (refreshed) {
        setFlashcards(prev =>
          prev.map(item =>
            normalizeWord(item.word_normalized || item.word) === targetKey
              ? {
                  ...refreshed,
                  searchedWord: item.searchedWord,
                  isKnown: item.isKnown
                }
              : item
          )
        );
      }
    } finally {
      setRefreshingWord(curr => (curr === targetKey ? null : curr));
    }
  };

  const handleVazbaClick = (vazbaItem) => {
    setVazbaTheoryText(getVazbaTheory(vazbaItem, targetLang));
  };

  const handleBackFromCards = () => {
    enrichmentRunRef.current += 1;
    refreshCounts();
    if (previousStepForCards === 'history') {
      reloadHistoryData();
    }
    setCurrentStep(previousStepForCards);
  };

  const handleReset = () => {
    translationRunRef.current += 1;
    enrichmentRunRef.current += 1;
    setIsLoading(false);
    setText('');
    setUniqueWords([]);
    setExcludedWords(new Set());
    setFlashcards([]);
    setTranslationError(false);
    setPhraseError(false);
    setProcessedWordsSet(new Set());
    setProcessingWordsSet(new Set());
    setRefreshingWord(null);
    setCurrentStep('input');
    refreshCounts();
  };

  return (
    <div className="app">
      <div className="top-controls">
        <LanguageToggle
          lang={targetLang}
          onToggle={() => setTargetLang(prev => (prev === 'ru' ? 'ua' : 'ru'))}
          title={t.toggleLang}
        />
        <ThemeToggle title={t.toggleTheme} />
      </div>

      <header className="header">
        <h1>Flashcards Seznam</h1>
        <p className="subtitle">{t.subtitle}</p>
      </header>

      <main className="main-content">
        {currentStep === 'input' && (
          <TextInput
            text={text}
            onTextChange={(v) => {
              setText(v);
              if (phraseError) setPhraseError(false);
            }}
            onExtractWords={handleExtractWords}
            onReverseLookup={handleReverseLookup}
            onTranslateDirectPhrase={handleTranslateDirectPhrase}
            onStartSrsLearning={handleStartSrsLearning}
            onLoadRandomPhrases={handleLoadRandomPhrases}
            onOpenHistory={handleOpenHistory}
            dueWordsCount={dueWordsCount}
            isPhraseLoading={isPhraseLoading}
            isDirectPhraseLoading={isDirectPhraseLoading}
            isReverseLookupLoading={isReverseLookupLoading}
            phraseError={phraseError}
            targetLang={targetLang}
          />
        )}

        {currentStep === 'extracted' && (
          <div className="extracted-words">
            <div className="screen-topbar">
              <button
                className="icon-action-btn"
                onClick={() => !isLoading && setCurrentStep('input')}
                disabled={isLoading}
                title={t.back}
                aria-label={t.back}
              >
                ←
              </button>
              <h2 style={{ margin: 0 }}>
                {t.foundWords}: {activeExtractedWords.length}
              </h2>
              <div style={{ width: '38px' }} />
            </div>

            {!isLoading && (
              <div className="filter-pill-row">
                {knownInExtractedCount > 0 && (
                  <button
                    type="button"
                    className={`filter-pill ${hideKnownWords ? 'active' : ''}`}
                    onClick={() => setHideKnownWords(prev => !prev)}
                  >
                    {t.hideKnown} ({knownInExtractedCount})
                  </button>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {t.tapToExcludeHint}
                </span>
              </div>
            )}

            {isLoading && (
              <div className="chip-legend">
                <span className="legend-item">
                  <span className="legend-dot found" /> {t.statusDone} ({processedWordsSet.size})
                </span>
                <span className="legend-item">
                  <span className="legend-dot processing" /> {t.statusProcessing}
                </span>
                <span className="legend-item">
                  <span className="legend-dot pending" /> {t.statusWaiting}
                </span>
              </div>
            )}

            <div className="words-container">
              {visibleExtractedWords.map((w, i) => {
                const lower = w.toLowerCase();
                const isExcluded = excludedWords.has(normalizeWord(w));
                let statusClass = '';
                if (isExcluded) statusClass = 'excluded';
                else if (processingWordsSet.has(lower)) statusClass = 'processing';
                else if (processedWordsSet.has(lower)) statusClass = 'found';
                else if (isLoading) statusClass = 'pending';

                return (
                  <span
                    key={`${w}-${i}`}
                    className={`word-chip ${statusClass} ${!isLoading ? 'clickable' : ''}`}
                    onClick={() => !isLoading && toggleWordExcluded(w)}
                  >
                    {statusClass === 'found' ? '✓ ' : ''}
                    {w}
                  </span>
                );
              })}
            </div>

            {translationError && <div className="error-message">{t.translationFailed}</div>}

            {isLoading && (
              <ProgressIndicator
                progress={progress}
                currentWord={currentWord}
                totalWords={activeExtractedWords.length}
                processedWords={processedCount}
                targetLang={targetLang}
              />
            )}

            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={handleGetTranslations}
                disabled={isLoading || activeExtractedWords.length === 0}
              >
                {isLoading ? t.loading : t.getTranslations}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                {t.reset}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'history' && (
          <HistoryView
            sessions={historySessions}
            allWords={allDictionaryWords}
            onBack={() => {
              refreshCounts();
              setCurrentStep('input');
            }}
            onStartReview={handleStartHistoryReview}
            onOpenWord={handleOpenWordFromDictionary}
            onToggleKnown={handleToggleKnownInDictionary}
            targetLang={targetLang}
          />
        )}

        {currentStep === 'translated' && (
          <FlashcardViewer
            flashcards={flashcards}
            initialIndex={viewerInitialIndex}
            onBack={handleBackFromCards}
            onReset={handleReset}
            onMarkAsKnown={handleMarkAsKnown}
            onRateCard={handleRateCard}
            onRefreshCard={handleRefreshCard}
            refreshingWord={refreshingWord}
            isReverseMode={isReverseMode}
            onToggleReverseMode={() => setIsReverseMode(prev => !prev)}
            onVazbaClick={handleVazbaClick}
            isModalOpen={Boolean(vazbaTheoryText)}
            targetLang={targetLang}
          />
        )}
      </main>

      <VazbaModal
        theory={vazbaTheoryText}
        targetLang={targetLang}
        onClose={() => setVazbaTheoryText('')}
      />
    </div>
  );
};

export default App;
