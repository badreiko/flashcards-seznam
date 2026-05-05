package com.flashcards.seznam.data.remote.api

import android.util.Log
import com.flashcards.seznam.data.remote.api.model.DeepSeekRequest
import com.flashcards.seznam.domain.model.Example
import com.flashcards.seznam.domain.model.WordEntry
import javax.inject.Inject
import javax.inject.Singleton

/**
 * DataSource для работы с Translation APIs через Netlify Functions
 */
@Singleton
class TranslationDataSource @Inject constructor(
    private val apiService: TranslationApiService
) {
    /**
     * Переводит слово через DeepSeek (получает полную информацию)
     */
    suspend fun translateWithDeepSeek(word: String): WordEntry? {
        return try {
            val mode = if (word.trim().contains(Regex("\\s+"))) MODE_PHRASE else MODE_WORD

            Log.d(TAG, "DeepSeek translating ($mode): $word")
            
            val response = apiService.translateDeepSeek(DeepSeekRequest(text = word, mode = mode))
            
            if (response.error != null) {
                Log.e(TAG, "DeepSeek error: ${response.error}")
                return null
            }
            
            WordEntry(
                word = response.word_normalized ?: response.word ?: word,
                translations = response.translations ?: emptyList(),
                gender = response.gender ?: "",
                grammar = response.grammar ?: "",
                forms = response.forms ?: emptyList(),
                examples = response.examples?.mapNotNull { ex ->
                    if (ex.czech != null && ex.russian != null) {
                        Example(ex.czech, ex.russian)
                    } else null
                } ?: emptyList(),
                source = "deepseek",
                ipa = parseStringField(response.ipa),
                vzor = parseStringField(response.vzor),
                vazba = parseStringField(response.vazba),
                cefrLevel = response.cefr_level ?: "",
                translationsUa = response.translations_ua ?: emptyList(),
                stress = parseStringField(response.stress),
                style = parseStringField(response.style),
                isCorrected = response.is_corrected ?: false,
                aspectPair = response.aspect_pair ?: "",
                frequencyRank = response.frequency_rank ?: 0,
                partOfSpeech = response.part_of_speech ?: ""
            ).also {
                Log.d(TAG, "DeepSeek success: ${it.translations.size} translations")
            }
        } catch (e: Exception) {
            Log.e(TAG, "DeepSeek error", e)
            null
        }
    }

    private fun parseStringField(value: Any?): String {
        return when (value) {
            is String -> value
            is List<*> -> value.filterIsInstance<String>().joinToString(", ")
            else -> ""
        }
    }
    
    companion object {
        private const val TAG = "TranslationDataSource"
        private const val MODE_WORD = "word"
        private const val MODE_PHRASE = "phrase"
    }
}
