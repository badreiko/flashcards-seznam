import vazbaData from '../data/vazba_theory.json';

/**
 * Возвращает локализованную теорию управления глагола (vazba).
 * Порядок поиска 1:1 с Android VazbaTheoryProvider.kt:
 *   1) exact[key]
 *   2) первый contains[i], чей token входит в key
 *   3) default
 */
export function getVazbaTheory(vazba, lang = 'ru') {
  const key = String(vazba || '').toLowerCase().trim();
  const isUk = lang === 'ua' || lang === 'uk';

  if (vazbaData.exact && vazbaData.exact[key]) {
    return isUk ? vazbaData.exact[key].uk : vazbaData.exact[key].ru;
  }

  if (Array.isArray(vazbaData.contains)) {
    for (const rule of vazbaData.contains) {
      if (rule.token && key.includes(rule.token)) {
        return isUk ? rule.uk : rule.ru;
      }
    }
  }

  return isUk ? vazbaData.default.uk : vazbaData.default.ru;
}
