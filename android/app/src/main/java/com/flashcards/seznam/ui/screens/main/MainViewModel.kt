package com.flashcards.seznam.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.flashcards.seznam.domain.model.AppScreen
import com.flashcards.seznam.domain.model.TranslationState
import com.flashcards.seznam.domain.model.WordEntry
import com.flashcards.seznam.ui.theme.AppTheme
import com.flashcards.seznam.domain.usecase.ExtractWordsUseCase
import com.flashcards.seznam.domain.usecase.GetTranslationsUseCase
import com.flashcards.seznam.ui.utils.TtsManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * ViewModel для управления состоянием всего приложения
 */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val extractWordsUseCase: ExtractWordsUseCase,
    private val getTranslationsUseCase: GetTranslationsUseCase,
    private val getHistoryUseCase: com.flashcards.seznam.domain.usecase.GetHistoryUseCase,
    private val markAsKnownUseCase: com.flashcards.seznam.domain.usecase.MarkAsKnownUseCase,
    private val ttsManager: TtsManager,
    private val settingsRepository: com.flashcards.seznam.data.repository.SettingsRepository,
    private val enrichmentScheduler: com.flashcards.seznam.data.worker.EnrichmentScheduler,
    private val wordRepository: com.flashcards.seznam.domain.repository.WordRepository
) : ViewModel() {
    
    companion object {
        // Оптимальное количество слов для запоминания за сессию (исследование Spaced Repetition)
        const val MAX_WORDS_PER_SESSION = 15
        const val MAX_PHRASES_PER_SESSION = 20
    }

    
    // Текущий экран
    private val _currentScreen = MutableStateFlow(AppScreen.INPUT)
    val currentScreen: StateFlow<AppScreen> = _currentScreen.asStateFlow()

    // Текущий язык
    val currentLanguage: StateFlow<String> = settingsRepository.currentLanguage
    
    // Ввод пользователя
    private val _inputText = MutableStateFlow("")
    val inputText: StateFlow<String> = _inputText.asStateFlow()
    
    // Извлечённые слова
    private val _extractedWords = MutableStateFlow<List<String>>(emptyList())
    val extractedWords: StateFlow<List<String>> = _extractedWords.asStateFlow()
    
    // История
    private val _historyWords = MutableStateFlow<List<WordEntry>>(emptyList())
    val historyWords: StateFlow<List<WordEntry>> = _historyWords.asStateFlow()
    
    // Группы истории (Сессии)
    data class HistorySession(
        val date: Long,
        val label: String,
        val words: List<WordEntry>
    )
    
    private val _historySessions = MutableStateFlow<List<HistorySession>>(emptyList())
    val historySessions: StateFlow<List<HistorySession>> = _historySessions.asStateFlow()
    
    // Состояние загрузки переводов
    private val _translationState = MutableStateFlow<TranslationState>(TranslationState.Idle)
    val translationState: StateFlow<TranslationState> = _translationState.asStateFlow()
    
    // Тема приложения (5 тем по кругу, сохраняется в SharedPreferences)
    val currentTheme: StateFlow<AppTheme> = settingsRepository.currentTheme
    
    // Карточки (результат)
    private val _cards = MutableStateFlow<List<WordEntry>>(emptyList())
    val cards: StateFlow<List<WordEntry>> = _cards.asStateFlow()
    
    // Текущий индекс карточки
    private val _currentCardIndex = MutableStateFlow(0)
    val currentCardIndex: StateFlow<Int> = _currentCardIndex.asStateFlow()

    private val _isPhraseLoading = MutableStateFlow(false)
    val isPhraseLoading: StateFlow<Boolean> = _isPhraseLoading.asStateFlow()

    // Реактивное обновление карточек (подписка на Room)
    private var cardsObservationJob: Job? = null
    
    /**
     * Смена языка
     */
    fun changeLanguage(code: String, activity: android.app.Activity? = null) {
        settingsRepository.setLanguage(code)
        activity?.recreate()
    }

    /**
     * Обновляет ввод пользователя
     */
    fun updateInputText(text: String) {
        _inputText.value = text
    }

    /**
     * Загружает историю и группирует по датам
     */
    fun loadHistory() {
        viewModelScope.launch {
            val history = getHistoryUseCase()
            _historyWords.value = history
            
            // Группировка по временным промежуткам (сессиям) - 15 минут
            val threshold = 15 * 60 * 1000L
            val sortedHistory = history.sortedByDescending { it.learnedAt }
            val sessions = mutableListOf<HistorySession>()
            
            if (sortedHistory.isNotEmpty()) {
                var currentBatch = mutableListOf<WordEntry>()
                currentBatch.add(sortedHistory.first())
                
                // Форматирование даты в зависимости от языка
                val locale = java.util.Locale(currentLanguage.value)
                val sdf = java.text.SimpleDateFormat("d MMMM, HH:mm", locale)

                for (i in 1 until sortedHistory.size) {
                    val prev = sortedHistory[i - 1]
                    val curr = sortedHistory[i]
                    
                    // Если разрыв больше порога - новая сессия
                    if (kotlin.math.abs(prev.learnedAt - curr.learnedAt) > threshold) {
                        // Сохраняем текущую группу
                        val sessionDate = currentBatch.first().learnedAt
                        sessions.add(
                            HistorySession(
                                date = sessionDate,
                                label = sdf.format(java.util.Date(sessionDate)),
                                words = currentBatch
                            )
                        )
                        currentBatch = mutableListOf()
                    }
                    currentBatch.add(curr)
                }
                
                // Добавляем последнюю группу
                if (currentBatch.isNotEmpty()) {
                    val sessionDate = currentBatch.first().learnedAt
                    sessions.add(
                        HistorySession(
                            date = sessionDate,
                            label = sdf.format(java.util.Date(sessionDate)),
                            words = currentBatch
                        )
                    )
                }
            }
            
            _historySessions.value = sessions
            _currentScreen.value = AppScreen.HISTORY
        }
    }
    
    /**
     * Запускает повторение сессии
     */
    fun startSessionReview(session: HistorySession) {
        _cards.value = session.words
        _currentCardIndex.value = 0
        _currentScreen.value = AppScreen.FLASHCARDS
        
        // Запускаем фоновое обогащение данных (для слов с неполной информацией)
        enrichmentScheduler.scheduleImmediateEnrichment()
        
        // Начинаем наблюдение за изменениями данных
        startObservingCards(session.words.map { it.word })
    }


    /**
     * Извлекает уникальные слова из текста
     */
    fun extractWords() {
        val words = extractWordsUseCase(_inputText.value)
        _extractedWords.value = words
        
        if (words.isNotEmpty()) {
            _currentScreen.value = AppScreen.EXTRACTED
        }
    }
    
    /**
     * Загружает переводы для извлечённых слов
     */
    fun loadTranslations() {
        viewModelScope.launch {
            getTranslationsUseCase(_extractedWords.value).collect { state ->
                _translationState.value = state
                
                when (state) {
                    is TranslationState.Success -> {
                        _cards.value = state.cards
                        if (state.cards.isNotEmpty()) {
                            _currentScreen.value = AppScreen.FLASHCARDS
                            // Запускаем фоновое обогащение данных
                            enrichmentScheduler.scheduleImmediateEnrichment()
                            // Начинаем наблюдение за изменениями данных
                            startObservingCards(state.cards.map { it.word })
                        }
                    }
                    else -> { /* Loading, Idle, Error - обрабатываются в UI */ }
                }
            }
        }
    }

    /**
     * Загружает отдельную сессию случайных словосочетаний из словаря
     */
    fun loadRandomPhrases() {
        if (_isPhraseLoading.value) return

        viewModelScope.launch {
            _isPhraseLoading.value = true
            try {
                val phrases = withContext(Dispatchers.IO) {
                    wordRepository.getRandomPhrases(MAX_PHRASES_PER_SESSION)
                }

                if (phrases.isNotEmpty()) {
                    _cards.value = phrases
                    _currentCardIndex.value = 0
                    _currentScreen.value = AppScreen.FLASHCARDS
                    startObservingCards(phrases.map { it.word })
                }
            } finally {
                _isPhraseLoading.value = false
            }
        }
    }
    
    /**
     * Произносит слово
     */
    fun speakWord(word: String) {
        ttsManager.speak(word)
    }
    
    /**
     * Переход к следующей карточке
     */
    fun nextCard() {
        if (_currentCardIndex.value < _cards.value.size - 1) {
            _currentCardIndex.value++
        }
    }
    
    /**
     * Переход к предыдущей карточке
     */
    fun previousCard() {
        if (_currentCardIndex.value > 0) {
            _currentCardIndex.value--
        }
    }
    
    /**
     * Установка конкретного индекса карточки
     */
    fun setCardIndex(index: Int) {
        if (index in 0 until _cards.value.size) {
            _currentCardIndex.value = index
        }
    }
    
    /**
     * Сброс к начальному состоянию
     */
    fun reset() {
        _inputText.value = ""
        _extractedWords.value = emptyList()
        _historyWords.value = emptyList()
        _historySessions.value = emptyList()
        _cards.value = emptyList()
        _translationState.value = TranslationState.Idle
        _currentCardIndex.value = 0
        _currentScreen.value = AppScreen.INPUT
        stopObservingCards()
    }

    /**
     * Начинает наблюдение за изменениями в базе данных для текущего набора слов
     */
    private fun startObservingCards(wordList: List<String>) {
        cardsObservationJob?.cancel()
        cardsObservationJob = viewModelScope.launch {
            wordRepository.observeWords(wordList).collectLatest { updatedEntities ->
                val currentCards = _cards.value.toMutableList()
                var changed = false
                
                updatedEntities.forEach { updated ->
                    val index = currentCards.indexOfFirst { it.word == updated.word }
                    if (index != -1) {
                        val old = currentCards[index]
                        // Проверяем ВСЕ обогащаемые поля
                        if (old.ipa != updated.ipa ||
                            old.translationsUa.size != updated.translationsUa.size ||
                            old.vzor != updated.vzor ||
                            old.cefrLevel != updated.cefrLevel ||
                            old.stress != updated.stress ||
                            old.style != updated.style ||
                            old.vazba != updated.vazba ||
                            old.aspectPair != updated.aspectPair ||
                            old.isEnriched != updated.isEnriched) {

                            currentCards[index] = updated.copy(
                                isKnown = old.isKnown,
                                searchedWord = old.searchedWord
                            )
                            changed = true
                        }
                    }
                }
                
                if (changed) {
                    _cards.value = currentCards
                }
            }
        }
    }

    private fun stopObservingCards() {
        cardsObservationJob?.cancel()
        cardsObservationJob = null
    }
    
    /**
     * Возврат к предыдущему экрану
     */
    fun goBack() {
        when (_currentScreen.value) {
            AppScreen.FLASHCARDS -> {
                // Если активны сессии истории, значит мы пришли из истории
                if (_historySessions.value.isNotEmpty() && _historyWords.value.isNotEmpty()) {
                    _currentScreen.value = AppScreen.HISTORY
                } else {
                    _currentScreen.value = AppScreen.EXTRACTED
                }
            }
            AppScreen.EXTRACTED -> {
                _currentScreen.value = AppScreen.INPUT
            }
            AppScreen.HISTORY -> {
                _currentScreen.value = AppScreen.INPUT
            }
            AppScreen.INPUT -> {
                // Ничего не делаем, уже на первом экране
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        ttsManager.shutdown()
    }
    
    /**
     * Переключает тему по кругу: Teal Light → Teal Dark → Forest → Rose → Earth → ...
     */
    fun toggleTheme() {
        val next = when (currentTheme.value) {
            AppTheme.TEAL_LIGHT -> AppTheme.TEAL_DARK
            AppTheme.TEAL_DARK -> AppTheme.FOREST
            AppTheme.FOREST -> AppTheme.ROSE
            AppTheme.ROSE -> AppTheme.EARTH
            AppTheme.EARTH -> AppTheme.TEAL_LIGHT
        }
        settingsRepository.setTheme(next)
    }
    
    /**
     * Принудительно обновляет данные текущей карточки из DeepSeek
     */
    fun refreshCurrentCard(word: String) {
        viewModelScope.launch {
            val refreshed = withContext(Dispatchers.IO) {
                wordRepository.refreshWord(word)
            }
            if (refreshed.hasTranslations) {
                val updatedCards = _cards.value.toMutableList()
                val index = updatedCards.indexOfFirst { it.word == word }
                if (index != -1) {
                    updatedCards[index] = refreshed.copy(
                        isKnown = updatedCards[index].isKnown,
                        searchedWord = updatedCards[index].searchedWord
                    )
                    _cards.value = updatedCards
                }
            }
        }
    }

    /**
     * Помечает текущее слово как известное и переходит к следующему
     */
    fun markCurrentCardAsKnown() {
        viewModelScope.launch {
            val currentCard = _cards.value.getOrNull(_currentCardIndex.value)
            if (currentCard != null) {
                withContext(Dispatchers.IO) {
                    markAsKnownUseCase(currentCard.word)
                }
                
                // Удаляем слово из текущего списка карточек
                val updatedCards = _cards.value.toMutableList()
                updatedCards.removeAt(_currentCardIndex.value)
                _cards.value = updatedCards
                
                // Корректируем индекс если нужно
                if (_currentCardIndex.value >= updatedCards.size && updatedCards.isNotEmpty()) {
                    _currentCardIndex.value = updatedCards.size - 1
                }
            }
        }
    }
}
