package com.flashcards.seznam.domain.usecase

import javax.inject.Inject

/**
 * UseCase для извлечения уникальных слов из чешского текста
 * Логика аналогична extractUniqueWords() из App.js
 */
class ExtractWordsUseCase @Inject constructor() {

    companion object {
        /**
         * Чешские возвратные частицы и служебные слова, которые не нужны как отдельные карточки.
         * DeepSeek сам восстановит возвратную форму глагола (učím → učit se).
         */
        private val CZECH_NOISE_WORDS = setOf("se", "si", "by", "aby", "že", "je", "to", "už")
    }

    /**
     * Извлекает уникальные слова из текста
     * @param text входной текст на чешском языке
     * @return отсортированный список уникальных слов (lowercase)
     */
    operator fun invoke(text: String): List<String> {
        if (text.isBlank()) return emptyList()

        // Приводим к нижнему регистру
        val lowerCaseText = text.lowercase()

        // Убираем пунктуацию (как в JS версии)
        val cleanedText = lowerCaseText.replace(
            Regex("[.,/#!\$%^&*;:{}=\\-_`~()«»„\"\\[\\]]"),
            " "
        )

        // Разбиваем на слова и фильтруем
        val words = cleanedText
            .split(Regex("\\s+"))
            .filter { it.length > 1 }
            .filter { !it.all { char -> char.isDigit() } }
            .filter { !it.matches(Regex("^\\d+.*|.*\\d+$")) }
            .filter { it !in CZECH_NOISE_WORDS }
            .distinct()
            .sorted()

        return words
    }
}
