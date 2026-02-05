# OFFER WIZARD SPEC v2 (Finish clarity)

Problem: step 6 feels like a dead-end.

## v2 behavior (no regressions)

Step 5:
- Always has `➡️ Далее` (not only Skip).

Step 6 ("Text + Publish"):
- Provide explicit actions:
  - `✍️ Написать текст` (ForceReply to capture offer text)
  - `📄 Шаблон` (insert template + ForceReply)
  - `✅ Опубликовать` (enabled when draft text exists; publishes)
- After publish: show `👀 Посмотреть` / `⬆️ Поднять` / `🔗 Поделиться` / `🗄 В архив`.
