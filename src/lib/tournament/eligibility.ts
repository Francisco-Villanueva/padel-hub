import { BEGINNERS_SUM_VALUE, type CategoryRuleKind, type Modality } from './constants';

export interface PairPlayer { category: number | null; gender: 'male' | 'female' }
export interface EligibilityRules { rule: { kind: CategoryRuleKind; value: number }; modality: Modality }
export type EligibilityResult = { ok: true } | { ok: false; reason: 'no_category' | 'category_mismatch' | 'sum_too_low' | 'modality_mismatch' };

const catValue = (c: number) => (c === 9 ? BEGINNERS_SUM_VALUE : c);

/** single: ambas categorías iguales a N. sum: la suma de las categorías es N o más (6ta + 7ma = 13). */
export function validatePair({ rule, modality }: EligibilityRules, p1: PairPlayer, p2: PairPlayer): EligibilityResult {
  if (p1.category == null || p2.category == null) return { ok: false, reason: 'no_category' };
  if (rule.kind === 'single') {
    if (p1.category !== rule.value || p2.category !== rule.value) return { ok: false, reason: 'category_mismatch' };
  } else if (catValue(p1.category) + catValue(p2.category) < rule.value) {
    return { ok: false, reason: 'sum_too_low' };
  }
  const genders = [p1.gender, p2.gender];
  const okModality = modality === 'libre'
    || (modality === 'mixto' && genders.includes('male') && genders.includes('female'))
    || (modality === 'masculino' && genders.every((g) => g === 'male'))
    || (modality === 'femenino' && genders.every((g) => g === 'female'));
  return okModality ? { ok: true } : { ok: false, reason: 'modality_mismatch' };
}
