# _ig_oauth_parked

Этот subtree **не относится к активному production runtime**.

Здесь лежит parked-контекст для Instagram OAuth, который был снят с deploy surface:
- parked API handlers: `_ig_oauth_parked/api/ig/oauth/*`
- parked helper libs: `_ig_oauth_parked/lib/igOAuth.js`, `_ig_oauth_parked/lib/cryptoBox.js`

Почему helpers вынесены из `src/lib/*`:
- чтобы active runtime tree не содержал неиспользуемую интеграцию;
- чтобы repo/audit не путали parked IG OAuth с рабочими production helper-модулями;
- чтобы сохранить revival-reference без возврата parked-кода в hot/source-critical paths.

Правило:
- не импортировать этот subtree в active bot/runtime без отдельного revival-step;
- если IG OAuth возвращается, это должно быть отдельным шагом с явным docs/spec/QA обновлением.
