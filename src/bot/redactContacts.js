// Minimal, dependency-free sanitizers for user-provided text.
// Used to prevent contact/link leakage in profiles before paid unlock.

export function deLinkifyText(input) {
  let s = String(input || '').trim();
  if (!s) return '';

  // Remove scheme to keep the text short and to avoid Telegram treating it as a clickable link.
  s = s.replace(/^https?:\/\//i, '');

  // Break @mentions and domains (no clickable @ / URL).
  s = s.replace(/@/g, '＠');
  s = s.replace(/\./g, '․');

  return s;
}

export function redactContactsInText(raw) {
  const s0 = String(raw || '');
  if (!s0) return { text: s0, redacted: false };

  let s = s0;
  let redacted = false;

  // URLs
  const urlRe = /\bhttps?:\/\/[^\s<>()]+/gi;
  if (urlRe.test(s)) {
    redacted = true;
    s = s.replace(urlRe, '🔒 ссылка скрыта');
  }

  // tg:// deep links
  const tgRe = /\btg:\/\/[^\s<>()]+/gi;
  if (tgRe.test(s)) {
    redacted = true;
    s = s.replace(tgRe, '🔒 ссылка скрыта');
  }

  // t.me / telegram.me
  const tmeRe = /\b(?:t\.me|telegram\.me)\/[\w\-./?=&%+#]+/gi;
  if (tmeRe.test(s)) {
    redacted = true;
    s = s.replace(tmeRe, '🔒 ссылка скрыта');
  }

  // common social domains without protocol
  const socialRe = /\b(?:instagram\.com|instagr\.am|vk\.com|youtube\.com|youtu\.be)\/[^\s<>()]+/gi;
  if (socialRe.test(s)) {
    redacted = true;
    s = s.replace(socialRe, '🔒 ссылка скрыта');
  }

  // emails
  const emailRe = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;
  if (emailRe.test(s)) {
    redacted = true;
    s = s.replace(emailRe, '🔒 email скрыт');
  }

  // phone numbers (mask only when it really looks like a phone)
  const phoneCandRe = /(?:\+?\d[\d\s().\-]{7,}\d)/g;
  if (phoneCandRe.test(s)) {
    s = s.replace(phoneCandRe, (m) => {
      const rawM = String(m || '');
      const digits = rawM.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) return rawM;
      const hasSep = /[\s().\-]/.test(rawM);
      const looksRuMobile = (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8')));
      const ok = looksRuMobile || rawM.includes('+') || hasSep || rawM.includes('(');
      if (!ok) return rawM;
      redacted = true;
      return '🔒 номер скрыт';
    });
  }

  // Phone numbers written in words (anti-bypass).
  // Keep it conservative: only redact when we can confidently normalize to a 10–15 digit phone-looking sequence.
  // Targets cases like: "плюс семь девятьсот ..." / "восемь девятьсот ...".
  {
    const sLower = s.toLowerCase().replace(/ё/g, 'е');

    const WORD_TO_DIGITS = {
      // RU digits
      'ноль': '0', 'нуль': '0',
      'один': '1', 'одна': '1', 'раз': '1',
      'два': '2', 'две': '2',
      'три': '3',
      'четыре': '4',
      'пять': '5',
      'шесть': '6',
      'семь': '7',
      'восемь': '8',
      'девять': '9',

      // RU 10-19
      'десять': '10',
      'одиннадцать': '11',
      'двенадцать': '12',
      'тринадцать': '13',
      'четырнадцать': '14',
      'пятнадцать': '15',
      'шестнадцать': '16',
      'семнадцать': '17',
      'восемнадцать': '18',
      'девятнадцать': '19',

      // RU tens
      'двадцать': '20',
      'тридцать': '30',
      'сорок': '40',
      'пятьдесят': '50',
      'шестьдесят': '60',
      'семьдесят': '70',
      'восемьдесят': '80',
      'девяносто': '90',

      // RU hundreds
      'сто': '100',
      'двести': '200',
      'триста': '300',
      'четыреста': '400',
      'пятьсот': '500',
      'шестьсот': '600',
      'семьсот': '700',
      'восемьсот': '800',
      'девятьсот': '900',

      // EN digits (minimal)
      'zero': '0',
      'one': '1',
      'two': '2',
      'three': '3',
      'four': '4',
      'five': '5',
      'six': '6',
      'seven': '7',
      'eight': '8',
      'nine': '9',
    };

    const isSepOnly = (gap) => /^[\s,.:;()\[\]{}<>\-–—_+\/\\]*$/.test(gap);
    const tokenRe = /[a-zа-я]+|\d+/gi;
    const spans = [];

    // Gate: only run the scan when text plausibly contains a phone mention.
    // IMPORTANT: JS \b word boundary is ASCII-only; use explicit boundaries to support Cyrillic.
    const phoneTriggerRe = /(^|[^a-zа-я0-9_])(тел(?:ефон)?|номер|ватсап|вотсап|whats?app|wa|вайбер|viber|phone|call|звон|позвони)(?=$|[^a-zа-я0-9_])/i;
    const plusStartRe = /(^|[^a-zа-я0-9_])плюс(?=$|[^a-zа-я0-9_])(?=[\s\-–—]*?(?:7|8|9|семь|восемь|девять))/i;

    if (phoneTriggerRe.test(sLower) || plusStartRe.test(sLower)) {
      const tokens = [];
      let m;
      while ((m = tokenRe.exec(sLower)) !== null) {
        tokens.push({ t: m[0], start: m.index, end: m.index + m[0].length });
      }

      let runStart = null;
      let runEnd = null;
      let runDigits = '';
      let runTokenCount = 0;
      let plusSeen = false;
      let prevEnd = null;

      const flush = () => {
        if (runStart === null) return;
        const digits = runDigits;
        const len = digits.length;
        const startsOk = /^[789]/.test(digits) || (len === 11 && /^[78]/.test(digits));
        const okLen = len >= 10 && len <= 15;
        const ok = okLen && startsOk && (plusSeen || phoneTriggerRe.test(sLower)) && runTokenCount >= 6;
        if (ok) spans.push({ start: runStart, end: runEnd });
        runStart = null;
        runEnd = null;
        runDigits = '';
        runTokenCount = 0;
        plusSeen = false;
        prevEnd = null;
      };

      for (const tok of tokens) {
        const gapOk = prevEnd === null ? true : isSepOnly(sLower.slice(prevEnd, tok.start));
        if (!gapOk) flush();

        const t = tok.t;
        if (t === 'плюс' || t === '+') {
          if (runStart === null) runStart = tok.start;
          runEnd = tok.end;
          plusSeen = true;
          prevEnd = tok.end;
          continue;
        }

        const digitsPart = /^\d+$/.test(t) ? t : WORD_TO_DIGITS[t];
        if (!digitsPart) {
          flush();
          continue;
        }

        if (runStart === null) runStart = tok.start;
        runEnd = tok.end;
        runDigits += digitsPart;
        runTokenCount += 1;
        prevEnd = tok.end;

        if (runDigits.length > 15) flush();
      }
      flush();
    }

    if (spans.length) {
      spans.sort((a, b) => b.start - a.start);
      for (const sp of spans) {
        const before = s.slice(0, sp.start);
        const mid = s.slice(sp.start, sp.end);
        const after = s.slice(sp.end);
        if (mid.includes('🔒')) continue;
        s = before + '🔒 номер скрыт' + after;
        redacted = true;
      }
    }
  }

  // @handles (telegram/instagram-style)
  const atRe = /(^|[^\w@])@([a-z0-9_]{3,32})\b/gi;
  if (atRe.test(s)) {
    redacted = true;
    s = s.replace(atRe, (m, p1) => `${p1}🔒@скрыто`);
  }

  // Prevent accidental linkification by Telegram entities.
  if (redacted) s = deLinkifyText(s);

  return { text: s, redacted };
}
