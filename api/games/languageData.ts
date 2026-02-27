import enLang from '../../public/dict/English/en/language.json';
import ruLang from '../../public/dict/Russian/ru/language.json';
import frLang from '../../public/dict/French/fr/language.json';
import esLang from '../../public/dict/Spanish/es/language.json';
import deLang from '../../public/dict/German/de/language.json';
import heLang from '../../public/dict/Hebrew/he/language.json';
import elLang from '../../public/dict/Greek/el/language.json';
import hyLang from '../../public/dict/Armenian/hy/language.json';

const NORMALIZATION: Record<string, Record<string, string> | undefined> = {
  en: (enLang as any).normalization,
  ru: (ruLang as any).normalization,
  fr: (frLang as any).normalization,
  es: (esLang as any).normalization,
  de: (deLang as any).normalization,
  he: (heLang as any).normalization,
  el: (elLang as any).normalization,
  hy: (hyLang as any).normalization,
};

export function getNormalization(language: string): Record<string, string> | undefined {
  return NORMALIZATION[language];
}
