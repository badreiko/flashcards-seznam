package com.flashcards.seznam.data.remote.api.model

/**
 * API модели для translation сервисов
 */
data class DeepSeekRequest(
    val text: String,
    val mode: String? = null
)

data class DeepSeekResponse(
    val word: String?,
    val word_normalized: String?,
    val translations: List<String>?,
    val translations_ua: List<String>?,
    val gender: String?,
    val grammar: String?,
    val forms: List<String>?,
    val examples: List<DeepSeekExample>?,
    val ipa: Any?,
    val vzor: Any?,
    val vazba: Any?,
    val stress: Any?,
    val style: Any?,
    val cefr_level: String?,
    val is_corrected: Boolean?,
    val aspect_pair: String?,
    val frequency_rank: Int?,
    val part_of_speech: String?,
    val source: String?,
    val error: String?
)

data class DeepSeekExample(
    val czech: String?,
    val russian: String?
)
