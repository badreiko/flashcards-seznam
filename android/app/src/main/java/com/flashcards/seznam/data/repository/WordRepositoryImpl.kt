package com.flashcards.seznam.data.repository

import android.util.Log
import com.flashcards.seznam.data.remote.api.TranslationDataSource
import com.flashcards.seznam.data.remote.firebase.FirebaseDataSource
import com.flashcards.seznam.data.local.WordDao
import com.flashcards.seznam.data.local.WordEntity
import com.flashcards.seznam.domain.model.WordEntry
import com.flashcards.seznam.domain.repository.WordRepository
import java.text.Normalizer
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Реализация репозитория для получения переводов слов
 * Приоритет источников: Cache → Firebase → DeepSeek
 */
@Singleton
class WordRepositoryImpl @Inject constructor(
    private val wordDao: WordDao,
    private val firebaseDataSource: FirebaseDataSource,
    private val translationDataSource: TranslationDataSource
) : WordRepository {

    override suspend fun getTranslation(word: String): WordEntry {
        val normalizedWord = normalizeWord(word)
        Log.d(TAG, "Getting translation for: $normalizedWord")
        
        // 1. Проверяем локальный кэш
        val cached = getFromCache(normalizedWord)
        if (cached != null && cached.hasTranslations) {
            Log.d(TAG, "✅ Found in cache")
            return cached.copy(source = "cache")
        }
        
        // 2. Проверяем Firebase
        val firebaseEntry = getFromFirebase(normalizedWord)
        if (firebaseEntry != null && firebaseEntry.hasTranslations) {
            Log.d(TAG, "✅ Found in Firebase")
            saveToCache(firebaseEntry)
            return firebaseEntry
        }
        
        // 3. DeepSeek API (генерирует полные данные)
        val deepSeekEntry = getFromDeepSeek(normalizedWord)
        if (deepSeekEntry != null && deepSeekEntry.hasTranslations) {
            Log.d(TAG, "✅ Got from DeepSeek: searched='$normalizedWord', returned='${deepSeekEntry.word}'")
            if (!isValidMatch(normalizedWord, deepSeekEntry)) {
                Log.w(TAG, "⚠️ Rejected DeepSeek mismatch: searched='$normalizedWord', returned='${deepSeekEntry.word}'")
                return WordEntry.empty(normalizedWord)
            }

            val entryToSave = deepSeekEntry.copy(source = "deepseek")

            // Сохраняем по ключу из DeepSeek (базовая форма)
            saveToCache(entryToSave)
            saveToFirebase(entryToSave)

            // Если искомое слово отличается от базовой формы — обновляем forms_index,
            // чтобы в следующий раз найти его через индекс (как делает Web)
            val returnedWord = normalizeWord(entryToSave.word)
            if (normalizedWord != returnedWord) {
                Log.d(TAG, "📝 Adding forms_index: $normalizedWord → $returnedWord")
                try {
                    firebaseDataSource.addFormIndex(normalizedWord, returnedWord)
                } catch (e: Exception) {
                    Log.e(TAG, "Error updating forms_index", e)
                }
            }

            return entryToSave
        }
        
        Log.d(TAG, "❌ No translation found")
        return WordEntry.empty(normalizedWord)
    }
    
    private suspend fun getFromCache(word: String): WordEntry? {
        return try {
            wordDao.getWord(word)?.toDomainModel()
        } catch (e: Exception) {
            Log.e(TAG, "Cache error", e)
            null
        }
    }
    
    private suspend fun getFromFirebase(word: String): WordEntry? {
        return try {
            firebaseDataSource.getWord(word)
        } catch (e: Exception) {
            Log.e(TAG, "Firebase error", e)
            null
        }
    }
    
    private suspend fun getFromDeepSeek(word: String): WordEntry? {
        return try {
            translationDataSource.translateWithDeepSeek(word)
        } catch (e: Exception) {
            Log.e(TAG, "DeepSeek error", e)
            null
        }
    }
    
    private suspend fun saveToCache(entry: WordEntry) {
        try {
            wordDao.insertWord(WordEntity.fromDomainModel(entry))
        } catch (e: Exception) {
            Log.e(TAG, "Error saving to cache", e)
        }
    }
    
    private suspend fun saveToFirebase(entry: WordEntry) {
        try {
            Log.d(TAG, "Saving to Firebase: ${entry.word}")
            firebaseDataSource.saveWord(entry)
        } catch (e: Exception) {
            Log.e(TAG, "Error saving to Firebase", e)
        }
    }
    
    override suspend fun clearCache() {
        try {
            wordDao.clearAll()
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing cache", e)
        }
    }
    
    override suspend fun getAllWords(): List<WordEntry> {
        return try {
            wordDao.getAllWords().map { it.toDomainModel() }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting all words", e)
            emptyList()
        }
    }
    
    private fun normalizeWord(word: String): String {
        return Normalizer.normalize(word, Normalizer.Form.NFC)
            .lowercase()
            .trim()
    }
    
    override suspend fun getWordsForLearning(limit: Int): List<WordEntry> {
        return try {
            wordDao.getWordsForLearning(limit).map { it.toDomainModel() }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting words for learning", e)
            emptyList()
        }
    }

    override suspend fun getRandomPhrases(limit: Int): List<WordEntry> {
        return try {
            val phrases = firebaseDataSource.getRandomPhrases(limit)
            for (phrase in phrases) {
                saveToCache(phrase)
            }
            phrases
        } catch (e: Exception) {
            Log.e(TAG, "Error getting random phrases", e)
            emptyList()
        }
    }
    
    override suspend fun markAsKnown(word: String) {
        try {
            wordDao.markAsKnown(normalizeWord(word))
            Log.d(TAG, "✅ Marked as known: $word")
        } catch (e: Exception) {
            Log.e(TAG, "Error marking as known", e)
        }
    }
    
    override suspend fun markAsUnknown(word: String) {
        try {
            wordDao.markAsUnknown(normalizeWord(word))
        } catch (e: Exception) {
            Log.e(TAG, "Error marking as unknown", e)
        }
    }
    
    override suspend fun getUnknownWordsCount(): Int {
        return try {
            wordDao.getUnknownWordsCount()
        } catch (e: Exception) {
            Log.e(TAG, "Error getting unknown words count", e)
            0
        }
    }
    
    override suspend fun getIncompleteWords(limit: Int): List<WordEntry> {
        return try {
            wordDao.getIncompleteWords(limit).map { it.toDomainModel() }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting incomplete words", e)
            emptyList()
        }
    }
    
    override suspend fun enrichWord(word: String): Boolean {
        val normalizedWord = normalizeWord(word)
        Log.d(TAG, "🔄 Enriching word: $normalizedWord")
        
        return try {
            // Получаем полные данные от DeepSeek API
            val enrichedEntry = translationDataSource.translateWithDeepSeek(normalizedWord)
            
            if (enrichedEntry != null && enrichedEntry.translations.isNotEmpty()) {
                if (!isValidMatch(normalizedWord, enrichedEntry)) {
                    Log.w(
                        TAG,
                        "⚠️ Rejected enrichment mismatch: searched='$normalizedWord', returned='${enrichedEntry.word}'"
                    )
                    return false
                }

                // Обновляем локальный кэш (Room)
                val translationsUaJson = com.google.gson.Gson().toJson(enrichedEntry.translationsUa)
                wordDao.updateEnrichedData(
                    word = normalizedWord,
                    ipa = enrichedEntry.ipa,
                    vzor = enrichedEntry.vzor,
                    vazba = enrichedEntry.vazba,
                    cefrLevel = enrichedEntry.cefrLevel,
                    translationsUa = translationsUaJson,
                    stress = enrichedEntry.stress,
                    style = enrichedEntry.style,
                    aspectPair = enrichedEntry.aspectPair,
                    frequencyRank = enrichedEntry.frequencyRank,
                    partOfSpeech = enrichedEntry.partOfSpeech
                )
                
                // Обновляем Firebase
                // Получаем текущие данные из кэша и объединяем с обогащёнными
                val cachedEntry = wordDao.getWord(normalizedWord)
                if (cachedEntry != null) {
                    val mergedEntry = cachedEntry.toDomainModel().copy(
                        ipa = enrichedEntry.ipa.ifEmpty { cachedEntry.ipa },
                        vzor = enrichedEntry.vzor.ifEmpty { cachedEntry.vzor },
                        vazba = enrichedEntry.vazba.ifEmpty { cachedEntry.vazba },
                        cefrLevel = enrichedEntry.cefrLevel.ifEmpty { cachedEntry.cefrLevel },
                        translationsUa = enrichedEntry.translationsUa.ifEmpty { cachedEntry.translationsUa },
                        stress = enrichedEntry.stress.ifEmpty { cachedEntry.stress },
                        style = enrichedEntry.style.ifEmpty { cachedEntry.style },
                        aspectPair = enrichedEntry.aspectPair.ifEmpty { cachedEntry.aspectPair },
                        frequencyRank = if (enrichedEntry.frequencyRank > 0) enrichedEntry.frequencyRank else cachedEntry.frequencyRank,
                        partOfSpeech = enrichedEntry.partOfSpeech.ifEmpty { cachedEntry.partOfSpeech },
                        isEnriched = true
                    )
                    firebaseDataSource.saveWord(mergedEntry)
                }
                
                Log.d(TAG, "✅ Enriched: $normalizedWord (ipa=${enrichedEntry.ipa}, ua=${enrichedEntry.translationsUa.size})")
                true
            } else {
                Log.w(TAG, "⚠️ Enrichment failed for: $normalizedWord (no data)")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error enriching word: $normalizedWord", e)
            false
        }
    }

    
    override suspend fun refreshWord(word: String): WordEntry {
        val normalizedWord = normalizeWord(word)
        Log.d(TAG, "🔄 Force refresh from DeepSeek: $normalizedWord")

        val deepSeekEntry = getFromDeepSeek(normalizedWord)
        if (deepSeekEntry != null && deepSeekEntry.hasTranslations) {
            Log.d(TAG, "✅ Refreshed: searched='$normalizedWord', returned='${deepSeekEntry.word}'")
            if (!isValidMatch(normalizedWord, deepSeekEntry)) {
                Log.w(TAG, "⚠️ Rejected DeepSeek refresh mismatch: searched='$normalizedWord', returned='${deepSeekEntry.word}'")
                return WordEntry.empty(normalizedWord)
            }

            val entryToSave = deepSeekEntry.copy(source = "deepseek")
            saveToCache(entryToSave)
            saveToFirebase(entryToSave)
            if (normalizedWord.contains(' ')) {
                firebaseDataSource.markPhraseRefreshed(normalizedWord, entryToSave)
            }
            return entryToSave
        }

        Log.d(TAG, "❌ Refresh failed, no data from DeepSeek")
        return WordEntry.empty(normalizedWord)
    }

    override fun observeWords(words: List<String>): kotlinx.coroutines.flow.Flow<List<WordEntry>> {
        return wordDao.observeWords(words).map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    private fun isValidMatch(searchedWord: String, entry: WordEntry): Boolean {
        val returnedWord = normalizeWord(entry.word)
        if (searchedWord == returnedWord) return true
        if (searchedWord.contains(' ') && returnedWord.contains(' ')) {
            return isRelatedPhrase(searchedWord, returnedWord) ||
                entry.forms.any { form -> normalizeWord(form) == searchedWord }
        }

        return entry.forms.any { form ->
            normalizeWord(form) == searchedWord
        }
    }

    private fun isRelatedPhrase(searchedPhrase: String, returnedPhrase: String): Boolean {
        val searchedTokens = phraseTokens(searchedPhrase)
        val returnedTokens = phraseTokens(returnedPhrase)
        if (searchedTokens.isEmpty() || returnedTokens.isEmpty()) return false

        val commonCount = searchedTokens.intersect(returnedTokens).size
        if (commonCount == 0) return false

        val minTokenCount = minOf(searchedTokens.size, returnedTokens.size)
        return commonCount >= minOf(2, minTokenCount) ||
            commonCount.toDouble() / minTokenCount >= 0.5
    }

    private fun phraseTokens(phrase: String): Set<String> {
        return normalizeWord(phrase)
            .split(Regex("\\s+"))
            .map { it.trim() }
            .filter { it.length > 2 }
            .toSet()
    }

    companion object {
        private const val TAG = "WordRepository"
    }
}
