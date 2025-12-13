import type { Shot } from '../types/project';

/**
 * Найти следующий доступный номер шота в пределах сцены
 *
 * @param sceneId - ID сцены (undefined для shots-only режима)
 * @param allShots - Все шоты в проекте
 * @param preferredNumber - Предпочитаемый номер (необязательно)
 * @returns Следующий доступный номер (1-999)
 */
export function findNextAvailableShotNumber(
  sceneId: string | undefined,
  allShots: Shot[],
  preferredNumber?: number
): number {
  // Фильтровать шоты для текущей сцены
  const shotsInScene = allShots.filter(s => {
    // shots-only режим: sceneId === undefined, искать шоты без сцены
    // scenes режим: искать шоты в конкретной сцене
    const matchesScene = sceneId ? s.sceneId === sceneId : s.sceneId === undefined;
    return matchesScene && s.number > 0;
  });

  // Set для O(1) поиска существующих номеров
  const existingNumbers = new Set(shotsInScene.map(s => s.number));

  // Если указан preferredNumber и он доступен - использовать его
  if (
    preferredNumber !== undefined &&
    preferredNumber >= 1 &&
    preferredNumber <= 999 &&
    !existingNumbers.has(preferredNumber)
  ) {
    return preferredNumber;
  }

  // Найти первый доступный номер (заполняет пробелы)
  for (let num = 1; num <= 999; num++) {
    if (!existingNumbers.has(num)) {
      return num;
    }
  }

  // Все 999 номеров заняты (крайне маловероятно)
  throw new Error('Достигнут лимит шотов в сцене (максимум 999)');
}

/**
 * Проверить, доступен ли номер шота
 *
 * @param sceneId - ID сцены
 * @param allShots - Все шоты в проекте
 * @param number - Проверяемый номер
 * @param excludeShotId - ID шота для исключения из проверки (для переименования)
 * @returns true если номер доступен
 */
export function isShotNumberAvailable(
  sceneId: string | undefined,
  allShots: Shot[],
  number: number,
  excludeShotId?: string
): boolean {
  const shotsInScene = allShots.filter(s => {
    const matchesScene = sceneId ? s.sceneId === sceneId : s.sceneId === undefined;
    const isNotExcluded = excludeShotId ? s.id !== excludeShotId : true;
    return matchesScene && isNotExcluded && s.number > 0;
  });

  return !shotsInScene.some(s => s.number === number);
}
