import { isUserAccountAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('user_services_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'bmActiveBrandKey',
  'copySafetyRecoveryKb',
  'copySafetyUnavailableHtml',
  'db',
  'k',
  'redis',
  'renderAccountDeletedGate',
  'renderRoleSelection',
  'reportCopySafetyDiagnostic',
  'safeEditOrReply',
]);

export async function handleUserAccountCallback(ctx, p, u, deps = {}) {
  if (!isUserAccountAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    bmActiveBrandKey,
    copySafetyRecoveryKb,
    copySafetyUnavailableHtml,
    db,
    k,
    redis,
    renderAccountDeletedGate,
    renderRoleSelection,
    reportCopySafetyDiagnostic,
    safeEditOrReply,
  } = bound;

  await (async () => {
    if (p.a === 'a:acc_del_q') {
      const text = `🗑 <b>Удалить аккаунт?</b>

Это действие:
• очистит контакты/профили в Collabka PR
• отключит показ в каталогах
• отзовёт роли менеджера/редактора/куратора

В Telegram переписка у других пользователей останется.

⚠️ Подтверждение ниже — необратимо.`;

      const kb = new InlineKeyboard() /* navlint: ignore — destructive confirmation preserves the original compact Back + Home layout */
        .text('✅ Да, удалить', 'a:acc_del_do')
        .row()
        .text('⬅️ Назад', 'a:support')
        .text('🏠 Домой', 'a:home');

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:acc_del_do') {
      try { await ctx.answerCallbackQuery({ text: '⏳ Удаляю…' }); } catch {}

      try {
        await db.tombstoneUser(u.id);
      } catch (e) {
        const code = String(e?.code || '');
        if (code === 'MISSING_SOFT_DELETE_COLUMNS') {
          reportCopySafetyDiagnostic('soft_delete_columns_missing', {
            columns: ['is_deleted', 'deleted_at'],
            runner: 'migrations/run.js',
          });
          await safeEditOrReply(
            ctx,
            copySafetyUnavailableHtml('Управление аккаунтом временно недоступно'),
            { parse_mode: 'HTML', reply_markup: copySafetyRecoveryKb('a:support') }
          );
          return;
        }
        throw e;
      }

      try { await redis.del(k(['ui_mode', ctx.from.id])); } catch {}
      try { await redis.del(k(['bm_mode', ctx.from.id])); } catch {}
      try { await redis.del(k(['cur_mode', ctx.from.id])); } catch {}
      try { await redis.del(bmActiveBrandKey(ctx.from.id)); } catch {}

      try { await ctx.answerCallbackQuery({ text: '🗑 Аккаунт удалён' }); } catch {}
      await renderAccountDeletedGate(ctx, { edit: true });
      return;
    }

    if (p.a === 'a:acc_restore') {
      try { await ctx.answerCallbackQuery({ text: '⏳ Восстанавливаю…' }); } catch {}

      try {
        await db.restoreUser(u.id);
      } catch (e) {
        const code = String(e?.code || '');
        if (code === 'MISSING_SOFT_DELETE_COLUMNS') {
          reportCopySafetyDiagnostic('soft_delete_columns_missing', {
            columns: ['is_deleted', 'deleted_at'],
            runner: 'migrations/run.js',
          });
          await safeEditOrReply(
            ctx,
            copySafetyUnavailableHtml('Управление аккаунтом временно недоступно'),
            { parse_mode: 'HTML', reply_markup: copySafetyRecoveryKb('a:support') }
          );
          return;
        }
        throw e;
      }

      try { await redis.del(k(['ui_mode', ctx.from.id])); } catch {}
      try { await redis.del(k(['bm_mode', ctx.from.id])); } catch {}
      try { await redis.del(k(['cur_mode', ctx.from.id])); } catch {}
      try { await redis.del(bmActiveBrandKey(ctx.from.id)); } catch {}

      try { await ctx.answerCallbackQuery({ text: '✅ Аккаунт восстановлен' }); } catch {}
      await renderRoleSelection(ctx, u, { edit: true });
      return;
    }
  })();
  return true;
}
