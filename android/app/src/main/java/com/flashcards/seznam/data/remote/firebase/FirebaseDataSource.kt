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
import kotlin.random.Random

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

    private val phraseIndexRef: DatabaseReference
        get() = database.reference.child("phrase_index")

    private val phraseBucketsRef: DatabaseReference
        get() = database.reference.child("phrase_buckets")
    
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
                        return preservePhraseKeyIfNeeded(normalizedWord, entry)
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
                            val entry = parseWordSnapshot(snapshot.value, baseWord)
                            if (entry != null && isValidFormIndexMatch(form, entry)) {
                                return entry
                            }

                            Log.w(
                                TAG,
                                "Ignoring stale forms_index mapping: $form → $baseWord"
                            )
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error searching forms_index", e)
        }
        
        return null
    }

    private fun isValidFormIndexMatch(form: String, entry: WordEntry): Boolean {
        val normalizedForm = normalizeWord(form)
        if (normalizeWord(entry.word) == normalizedForm) return true

        return entry.forms.any { candidate ->
            normalizeWord(candidate) == normalizedForm
        }
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
                // Время добавления пользователем (для группировки сессий в истории)
                learnedAt = ((map["learned_at"] ?: map["learnedAt"]) as? Number)?.toLong() ?: 0L,
                // Поля для умного обучения
                aspectPair = (map["aspect_pair"] as? String) ?: (map["aspectPair"] as? String) ?: "",
                frequencyRank = ((map["frequency_rank"] ?: map["frequencyRank"]) as? Number)?.toInt() ?: 0,
                isKnown = (map["is_known"] as? Boolean) ?: (map["isKnown"] as? Boolean) ?: false,
                partOfSpeech = (map["part_of_speech"] as? String) ?: (map["partOfSpeech"] as? String) ?: "",
                isEnriched = (map["isEnriched"] as? Boolean) ?: (map["is_enriched"] as? Boolean) ?: false
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
                "timestamp" to java.time.Instant.now().toString(),
                "learned_at" to if (entry.learnedAt > 0) entry.learnedAt else System.currentTimeMillis()
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
            if (entry.isEnriched) data["isEnriched"] = true
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

    
    /**
     * Добавляет маппинг словоформы на базовое слово в forms_index
     */
    suspend fun addFormIndex(form: String, baseWord: String) {
        val normalizedForm = normalizeWord(form)
        val normalizedBase = normalizeWord(baseWord)
        if (normalizedForm.isNotEmpty() && normalizedForm != normalizedBase) {
            formsIndexRef.child(normalizedForm).setValue(normalizedBase).await()
            Log.d(TAG, "forms_index updated: $normalizedForm → $normalizedBase")
        }
    }

    /**
     * Получает случайные словосочетания из phrase_index.
     * Полные карточки берутся из dictionary, phrase_index используется только как лёгкий индекс.
     */
    suspend fun getRandomPhrases(limit: Int = 20): List<WordEntry> {
        val selectedKeys = linkedSetOf<String>()
        val triedBuckets = mutableSetOf<Int>()

        while (selectedKeys.size < limit && triedBuckets.size < PHRASE_BUCKET_COUNT) {
            val bucket = nextUntriedBucket(triedBuckets)
            triedBuckets.add(bucket)

            try {
                val bucketKeys = getPhraseBucketKeys(bucket).shuffled()

                for (key in bucketKeys) {
                    selectedKeys.add(key)
                    if (selectedKeys.size >= limit) break
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error reading phrase bucket $bucket", e)
            }
        }

        return selectedKeys
            .take(limit)
            .mapNotNull { key -> getDictionaryEntry(key) }
    }

    private suspend fun getPhraseBucketKeys(bucket: Int): List<String> {
        val bucketSnapshot = phraseBucketsRef.child(bucket.toString()).get().await()
        val directBucketKeys = bucketSnapshot.children
            .mapNotNull { child -> child.getValue(String::class.java) ?: child.key }
            .filter { it.contains(' ') }

        if (directBucketKeys.isNotEmpty()) return directBucketKeys

        val indexSnapshot = phraseIndexRef
            .orderByChild("bucket")
            .equalTo(bucket.toDouble())
            .get()
            .await()

        return indexSnapshot.children
            .mapNotNull { child ->
                child.child("canonical_key").getValue(String::class.java)
                    ?: child.child("dictionary_key").getValue(String::class.java)
                    ?: child.key
            }
            .filter { it.contains(' ') }
    }

    private suspend fun getDictionaryEntry(key: String): WordEntry? {
        val normalizedKey = normalizeWord(key)
        return try {
            val snapshot = dictionaryRef.child(normalizedKey).get().await()
            if (snapshot.exists()) {
                parseWordSnapshot(snapshot.value, normalizedKey)?.let { entry ->
                    preservePhraseKeyIfNeeded(normalizedKey, entry)
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading dictionary phrase: $normalizedKey", e)
            null
        }
    }

    private fun nextUntriedBucket(triedBuckets: Set<Int>): Int {
        var bucket = Random.nextInt(PHRASE_BUCKET_COUNT)
        while (bucket in triedBuckets) {
            bucket = Random.nextInt(PHRASE_BUCKET_COUNT)
        }
        return bucket
    }

    private fun preservePhraseKeyIfNeeded(requestedKey: String, entry: WordEntry): WordEntry {
        val normalizedKey = normalizeWord(requestedKey)
        val normalizedEntryWord = normalizeWord(entry.word)
        if (normalizedKey.contains(' ') && !normalizedEntryWord.contains(' ')) {
            Log.w(
                TAG,
                "Preserving phrase key for corrupted phrase entry: $normalizedKey had word=${entry.word}"
            )
            return entry.copy(word = normalizedKey)
        }

        return entry
    }

    suspend fun markPhraseRefreshed(originalKey: String, refreshedEntry: WordEntry) {
        val normalizedOriginal = normalizeWord(originalKey)
        val normalizedRefreshed = normalizeWord(refreshedEntry.word)
        if (!normalizedOriginal.contains(' ')) return

        val updates = mutableMapOf<String, Any?>(
            "phrase_index/$normalizedOriginal/last_enriched_at" to System.currentTimeMillis(),
            "phrase_index/$normalizedOriginal/needs_enrichment" to false,
            "phrase_index/$normalizedOriginal/repair_status" to "refreshed"
        )

        if (normalizedRefreshed.contains(' ') && normalizedRefreshed != normalizedOriginal) {
            updates["phrase_index/$normalizedOriginal/canonical_key"] = normalizedRefreshed
            updates["phrase_index/$normalizedOriginal/repair_status"] = "repaired"
            updates["phrase_index/$normalizedRefreshed/dictionary_key"] = normalizedRefreshed
            updates["phrase_index/$normalizedRefreshed/word_count"] =
                normalizedRefreshed.split(Regex("\\s+")).filter { it.isNotEmpty() }.size
            updates["phrase_index/$normalizedRefreshed/char_count"] = normalizedRefreshed.length
            updates["phrase_index/$normalizedRefreshed/bucket"] = phraseBucket(normalizedRefreshed)
            updates["phrase_index/$normalizedRefreshed/last_enriched_at"] = System.currentTimeMillis()
            updates["phrase_index/$normalizedRefreshed/needs_enrichment"] = false
            updates["phrase_index/$normalizedRefreshed/repair_status"] = "valid"
            updates["phrase_buckets/${phraseBucket(normalizedRefreshed)}/$normalizedRefreshed"] = normalizedRefreshed
        }

        database.reference.updateChildren(updates).await()
    }

    private fun phraseBucket(key: String): Int {
        var hash = 0
        for (char in key) {
            hash = 31 * hash + char.code
        }
        return Math.floorMod(hash, PHRASE_BUCKET_COUNT)
    }

    companion object {
        private const val TAG = "FirebaseDataSource"
        private const val PHRASE_BUCKET_COUNT = 100
    }
}
