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

  // t.me / telegram.me (also catches common obfuscations like: "t . me / abc", "t․me/abc")
  const tmeRe = /\b(?:t\s*[.\u2024\uFF0E\u2027]\s*me|telegram\s*[.\u2024\uFF0E\u2027]\s*me)\s*\/\s*[^\s<>()]+/gi;
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

  // phone numbers (mask only when it really looks like a phone).
  // Allow "dirty" separators (dots, unicode dashes, emoji between digits), but avoid letters.
  const phoneCandRe = /(?:\+?\d(?:[^\dA-Za-zА-Яа-я]{0,4}\d){9,})/g;
  if (phoneCandRe.test(s)) {
    s = s.replace(phoneCandRe, (m) => {
      const rawM = String(m || '');
      const digits = rawM.replace(/\D/g, '');
      // A bit conservative: modern phones are typically 10-15 digits.
      // Also avoid masking 16-digit card-like sequences.
      if (digits.length < 10 || digits.length > 15) return rawM;
      if (digits.length === 16) return rawM;
      // Bail out if letters are present (likely not a phone).
      if (/[A-Za-zА-Яа-я]/.test(rawM)) return rawM;
      const hasSep = /[^\d+]/.test(rawM);
      const looksRuMobile = (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8')));
      const ok = looksRuMobile || rawM.includes('+') || hasSep || rawM.includes('(');
      if (!ok) return rawM;
      redacted = true;
      return '🔒 номер скрыт';
    });
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
