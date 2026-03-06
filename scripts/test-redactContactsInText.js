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
    name: 't.me with spaces around dot and slash redacted',
    input: 'Пиши сюда: t . me / some_channel',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['t . me', 'some_channel'] }
  },
  {
    name: 't.me with zero-width chars redacted',
    input: 'Пиши сюда: t\u200B.\u200Cme/some_channel',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['t\u200B.', 'some_channel'] }
  },
  {
    name: 'instagram without protocol redacted',
    input: 'Инста: instagram.com/myprofile',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['instagram.com'] }
  },
  {
    name: 'instagram obfuscated (dot) redacted',
    input: 'Инста: instagram (dot) com/myprofile',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['instagram (dot) com', 'myprofile'] }
  },
  {
    name: 'instagram with dot leader redacted',
    input: 'Инста: instagram․com/myprofile',
    opts: { redacted: true, contains: ['🔒 ссылка скрыта'], notContains: ['instagram․com'] }
  },
  {
    name: 'email redacted',
    input: 'Почта: test.user+1@example.co',
    opts: { redacted: true, contains: ['🔒 email скрыт'], notContains: ['@example'] }
  },
  {
    name: 'email with fullwidth @ and dot leader redacted',
    input: 'Почта: test.user+1＠example․co',
    opts: { redacted: true, contains: ['🔒 email скрыт'], notContains: ['＠example', '․co'] }
  },
  {
    name: 'email obfuscated (at)/(dot) redacted',
    input: 'Почта: test.user (at) example (dot) com',
    opts: { redacted: true, contains: ['🔒 email скрыт'], notContains: ['test.user', '(at)', '(dot)', 'example'] }
  },
  {
    name: 'email obfuscated with words redacted (triggered)',
    input: 'Email: test.user at example dot com',
    opts: { redacted: true, contains: ['🔒 email скрыт'], notContains: ['test.user', ' at ', ' dot ', 'example'] }
  },
  {
    name: 'email word not a contact (no colon) not redacted',
    input: 'Email marketing at scale dot product — это не контакт.',
    opts: { redacted: false, contains: ['Email marketing at scale dot product'] }
  },
  {
    name: '@handle redacted and delinkified',
    input: 'TG: @my_handle',
    // deLinkifyText turns @ into fullwidth ＠
    opts: { redacted: true, contains: ['🔒＠скрыто'], notContains: ['@my_handle'] }
  },
  {
    name: '@handle with spaces redacted and delinkified',
    input: 'TG: @ my_handle',
    opts: { redacted: true, contains: ['🔒＠скрыто'], notContains: ['@ my_handle', '@my_handle'] }
  },
  {
    name: 'fullwidth @handle redacted and delinkified',
    input: 'IG: ＠my.user',
    opts: { redacted: true, contains: ['🔒＠скрыто'], notContains: ['＠my.user'] }
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
    name: 'ru phone +7 with separators redacted',
    input: 'WhatsApp: +7 (999) 123 45 67',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['999'] }
  },
  {
    name: 'phone in words (plus + russian digits) redacted',
    input: 'Пиши в вотсап: плюс семь девятьсот двенадцать триста сорок пять шестьдесят семь',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['девятьсот'] }
  },
  {
    name: 'phone in words (plus + digits, no explicit phone keyword) redacted (strict RU mobile)',
    input: 'плюс семь девять девять девять один два три четыре пять шесть семь',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['девять девять'] }
  },
  {
    name: 'phone in words (ru mobile start with 8) redacted',
    input: 'Телефон: восемь девять ноль ноль один один два три четыре пять шесть',
    opts: { redacted: true, contains: ['🔒 номер скрыт'], notContains: ['восемь девять ноль'] }
  },
  {
    name: 'non-phone number words not redacted (small count)',
    input: 'Телефон не нужен. У меня пять тысяч рублей на рекламу.',
    opts: { redacted: false, contains: ['пять тысяч рублей'] }
  },
  {
    name: 'non-phone plus math not redacted',
    input: 'Плюс пять минут к дедлайну, плюс шесть идей — и всё.',
    opts: { redacted: false, contains: ['Плюс пять минут'] }
  },
  {
    name: 'non-phone plus digits list not redacted (math/example)',
    input: 'Плюс семь восемь девять ноль один два три четыре пять шесть — пример, не контакт.',
    opts: { redacted: false, contains: ['Плюс семь восемь девять'] }
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
