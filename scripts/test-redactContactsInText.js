import assert from 'node:assert/strict';
import { redactContactsInText } from '../src/bot/redactContacts.js';

function runCase(name, input, opts) {
  const { text, redacted } = redactContactsInText(input);

  if (opts.redacted !== undefined) {
    assert.equal(redacted, opts.redacted, `${name}: redacted flag`);
  }
  if (opts.contains) {
    for (const needle of opts.contains) {
      assert.ok(
        text.includes(needle),
        `${name}: expected to contain ${JSON.stringify(needle)}; got ${JSON.stringify(text)}`
      );
    }
  }
  if (opts.notContains) {
    for (const needle of opts.notContains) {
      assert.ok(
        !text.includes(needle),
        `${name}: expected NOT to contain ${JSON.stringify(needle)}; got ${JSON.stringify(text)}`
      );
    }
  }
}

const cases = [
  {
    name: 'no redaction plain text',
    input: 'Привет это просто описание без контактов',
    opts: { redacted: false }
  },
  {
    name: 'http url redacted',
    input: 'Сайт: https://example.com/page',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['https://'] }
  },
  {
    name: 't.me redacted',
    input: 'Пиши сюда: t.me/some_channel',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['t.me/'] }
  },
  {
    name: 'instagram without protocol redacted',
    input: 'Инста: instagram.com/myprofile',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['instagram.com'] }
  },
  {
    name: 'email redacted',
    input: 'Почта: test.user+1@example.co',
    opts: { redacted: true, contains: ['🔒 email скрыт'], notContains: ['@example'] }
  },
  {
    name: '@handle redacted and delinkified',
    input: 'TG: @my_handle',
    // deLinkifyText turns @ into fullwidth ＠
    opts: { redacted: true, contains: ['🔒＠скрыто'], notContains: ['@my_handle'] }
  },
  {
    name: 'ru mobile 11 digits (starts with 7) redacted',
    input: 'Тел: 79991234567',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['79991234567'] }
  },
  {
    name: 'ru mobile 11 digits (starts with 8) redacted',
    input: 'Тел: 89991234567',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['89991234567'] }
  },
  {
    name: 'international phone with + and separators redacted',
    input: 'Call +1 (415) 555-1212',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['415'] }
  },
  {
    name: 'ru phone with dots redacted',
    input: 'Тел: 8.999.123.45.67',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['8.999.123.45.67'] }
  },
  {
    name: 'phone with emoji separators redacted',
    input: 'Тел: +7 999 🤝 123 🤝 45 🤝 67',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['999 🤝 123'] }
  },
  {
    name: 'phone with leading zeros and unicode dash redacted',
    input: 'Тел: +7 (000) 123‑45‑67',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['000'] }
  },
  {
    name: 't․me obfuscated dot leader redacted',
    input: 'Пиши: t․me/abc',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['t․me/'] }
  },
  {
    name: 't . me / abc spaced obfuscation redacted',
    input: 'Пиши: t . me / abc',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['t . me'] }
  },
  {
    name: 'credit card like 16 digits not redacted',
    input: 'Карта: 1234 5678 9012 3456',
    opts: { redacted: false, contains: ['1234 5678 9012 3456'] }
  },
  {
    name: 'short number not redacted',
    input: 'Код: 12345678',
    opts: { redacted: false, contains: ['12345678'] }
  },
  {
    name: 'multiple surfaces redacted',
    input: 'Связь: test@example.com и t.me/abc',
    opts: {
      redacted: true,
      contains: ['🔒 email скрыт', '🔒 ссылка скрыта'],
      notContains: ['test@example.com', 't.me/abc']
    }
  },
  {
    name: 'tg:// link redacted via url rule',
    input: 'tg://resolve?domain=test',
    // Not matched by http/https rule; but may be linkified as scheme. We still want it hidden.
    // Current implementation does not cover tg:// explicitly; this test is a sentinel.
    // Expectation: should be redacted (future-proof) — if it fails, tighten regexes.
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'] }
  },
];

let pass = 0;
for (const c of cases) {
  try {
    runCase(c.name, c.input, c.opts);
    pass += 1;
  } catch (e) {
    console.error(`\n❌ FAIL: ${c.name}`);
    console.error(`   input: ${JSON.stringify(c.input)}`);
    throw e;
  }
}

console.log(`✅ redactContactsInText: ${pass}/${cases.length} cases passed`);
