package com.flashcards.seznam.data.remote.firebase

import android.util.Log
import com.flashcards.seznam.domain.model.Example
import com.flashcards.seznam.domain.model.WordEntry
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import kotlinx.coroutines.tasks.await
import java.text.Normalizer
import javax.inject.Inject
import javax.inject.Singleton

/**
 * DataSource для работы с Firebase Realtime Database
 * Структура базы соответствует веб-версии flashcards-seznam
 */
@Singleton
class FirebaseDataSource @Inject constructor() {
    
    private val database: FirebaseDatabase by lazy {
        FirebaseDatabase.getInstance("https://flashcards-seznam-6652a-default-rtdb.europe-west1.firebasedatabase.app/")
    }
    
    private val dictionaryRef: DatabaseReference
        get() = database.reference.child("dictionary")
    
    private val formsIndexRef: DatabaseReference
        get() = database.reference.child("forms_index")
    
    private val wordsRef: DatabaseReference
        get() = database.reference.child("words")
    
    /**
     * Нормализует строку для поиска в Firebase (NFC форма, lowercase)
     */
    private fun normalizeWord(word: String): String {
        return Normalizer.normalize(word, Normalizer.Form.NFC)
            .lowercase()
            .trim()
    }
    
    /**
     * Получает слово из Firebase
     * Пробует несколько путей: dictionary/, words/, корень
     */
    suspend fun getWord(word: String): WordEntry? {
        val normalizedWord = normalizeWord(word)
        Log.d(TAG, "Searching for: $normalizedWord")
        
        // Пробуем разные пути (как в DataService.js)
        val paths = listOf(
            "dictionary/$normalizedWord",
            "words/$normalizedWord",
            normalizedWord
        )
        
        for (path in paths) {
            try {
                val snapshot = database.reference.child(path).get().await()
                if (snapshot.exists()) {
                    val entry = parseWordSnapshot(snapshot.value, normalizedWord)
                    if (entry != null) {
                        Log.d(TAG, "Found at path: $path")
                        return entry
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error reading path $path", e)
            }
        }
        
        // Поиск по индексу словоформ
        return searchByFormIndex(normalizedWord)
    }
    
    /**
     * Поиск базового слова через forms_index
     */
    private suspend fun searchByFormIndex(form: String): WordEntry? {
        try {
            Log.d(TAG, "Searching in forms_index for: $form")
            val indexSnapshot = formsIndexRef.child(form).get().await()
            
            if (indexSnapshot.exists()) {
                val baseWord = indexSnapshot.getValue(String::class.java)
                if (baseWord != null) {
                    Log.d(TAG, "Found in forms_index: $form → $baseWord")
                    
                    // Получаем базовое слово
                    val basePaths = listOf(
                        "dictionary/$baseWord",
                        "words/$baseWord",
                        baseWord
                    )
                    
                    for (path in basePaths) {
                        val snapshot = database.reference.child(path).get().await()
                        if (snapshot.exists()) {
                            return parseWordSnapshot(snapshot.value, baseWord)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error searching forms_index", e)
        }
        
        return null
    }
    
    /**
     * Парсит snapshot Firebase в WordEntry
     */
    @Suppress("UNCHECKED_CAST")
    private fun parseWordSnapshot(value: Any?, defaultWord: String): WordEntry? {
        if (value == null) return null
        
        return try {
            val map = value as? Map<String, Any?> ?: return null
            
            WordEntry(
                word = (map["word"] as? String) ?: defaultWord,
                translations = parseStringList(map["translations"]),
                gender = (map["gender"] as? String) ?: "",
                grammar = (map["grammar"] as? String) ?: "",
                forms = parseStringList(map["forms"]),
                examples = parseExamples(map["examples"]),
                source = (map["source"] as? String) ?: "firebase",
                timestamp = (map["timestamp"] as? String) ?: "",
                // Новые поля для расширенного анализа
                ipa = (map["ipa"] as? String) ?: "",
                vzor = (map["vzor"] as? String) ?: "",
                vazba = (map["vazba"] as? String) ?: "",
                cefrLevel = (map["cefr_level"] as? String) ?: (map["cefrLevel"] as? String) ?: "",
                translationsUa = parseStringList(map["translations_ua"] ?: map["translationsUa"]),
                stress = (map["stress"] as? String) ?: "",
                style = (map["style"] as? String) ?: "",
                isCorrected = (map["is_corrected"] as? Boolean) ?: (map["isCorrected"] as? Boolean) ?: false,
                // Поля для умного обучения
                aspectPair = (map["aspect_pair"] as? String) ?: (map["aspectPair"] as? String) ?: "",
                frequencyRank = ((map["frequency_rank"] ?: map["frequencyRank"]) as? Number)?.toInt() ?: 0,
                isKnown = (map["is_known"] as? Boolean) ?: (map["isKnown"] as? Boolean) ?: false,
                partOfSpeech = (map["part_of_speech"] as? String) ?: (map["partOfSpeech"] as? String) ?: ""
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing word snapshot", e)
            null
        }
    }

    
    @Suppress("UNCHECKED_CAST")
    private fun parseStringList(value: Any?): List<String> {
        return when (value) {
            is List<*> -> value.filterIsInstance<String>()
            is String -> listOf(value)
            else -> emptyList()
        }
    }
    
    @Suppress("UNCHECKED_CAST")
    private fun parseExamples(value: Any?): List<Example> {
        return try {
            when (value) {
                is List<*> -> value.mapNotNull { item ->
                    val map = item as? Map<String, Any?> ?: return@mapNotNull null
                    Example(
                        czech = (map["czech"] as? String) ?: "",
                        russian = (map["russian"] as? String) ?: ""
                    )
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
    
    /**
     * Сохраняет слово в Firebase
     */
    suspend fun saveWord(entry: WordEntry) {
        val normalizedWord = normalizeWord(entry.word)
        try {
            val data = mutableMapOf<String, Any?>(
                "word" to normalizedWord,
                "translations" to entry.translations,
                "gender" to entry.gender,
                "grammar" to entry.grammar,
                "forms" to entry.forms,
                "examples" to entry.examples.map { mapOf("czech" to it.czech, "russian" to it.russian) },
                "source" to entry.source,
                "timestamp" to java.time.Instant.now().toString()
            )
            
            // Добавляем расширенные поля только если они не пустые
            if (entry.ipa.isNotEmpty()) data["ipa"] = entry.ipa
            if (entry.vzor.isNotEmpty()) data["vzor"] = entry.vzor
            if (entry.vazba.isNotEmpty()) data["vazba"] = entry.vazba
            if (entry.cefrLevel.isNotEmpty()) data["cefr_level"] = entry.cefrLevel
            if (entry.translationsUa.isNotEmpty()) data["translations_ua"] = entry.translationsUa
            if (entry.stress.isNotEmpty()) data["stress"] = entry.stress
            if (entry.style.isNotEmpty()) data["style"] = entry.style
            if (entry.isCorrected) data["is_corrected"] = true
            if (entry.aspectPair.isNotEmpty()) data["aspect_pair"] = entry.aspectPair
            if (entry.frequencyRank > 0) data["frequency_rank"] = entry.frequencyRank
            if (entry.partOfSpeech.isNotEmpty()) data["part_of_speech"] = entry.partOfSpeech
            // isKnown не сохраняем в Firebase (локальное состояние пользователя)
            
            dictionaryRef.child(normalizedWord).setValue(data).await()
            Log.d(TAG, "Saved word to Firebase: $normalizedWord")

            // Обновляем forms_index: каждая словоформа → базовое слово
            if (entry.forms.isNotEmpty()) {
                val indexUpdates = mutableMapOf<String, Any>()
                for (form in entry.forms) {
                    val normalizedForm = normalizeWord(form)
                    if (normalizedForm.isNotEmpty() && normalizedForm != normalizedWord) {
                        indexUpdates["forms_index/$normalizedForm"] = normalizedWord
                    }
                }
                if (indexUpdates.isNotEmpty()) {
                    database.reference.updateChildren(indexUpdates).await()
                    Log.d(TAG, "forms_index updated: ${indexUpdates.size} forms → \"$normalizedWord\"")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error saving word to Firebase", e)
        }
    }

    
    companion object {
        private const val TAG = "FirebaseDataSource"
    }
}
