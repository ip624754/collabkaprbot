import { isModerationReportAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('moderation_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'db',
  'isModerator',
  'renderModHome',
  'renderModReportView',
  'renderModReports',
]);

export async function handleModerationReportsCallback(ctx, p, u, deps = {}) {
  if (!isModerationReportAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const { db, isModerator, renderModHome, renderModReportView, renderModReports } = bound;

  await (async () => {
if (p.a === 'a:mod_home') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderModHome(ctx);
      return;
    }
if (p.a === 'a:mod_reports') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderModReports(ctx, Number(p.p || 0));
      return;
    }
if (p.a === 'a:mod_report') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.rid || 0);
      if (!Number.isInteger(rid) || rid <= 0) return;
      await renderModReportView(ctx, rid);
      return;
    }
if (p.a === 'a:mod_r_freeze') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.rid || 0);
      if (!Number.isInteger(rid) || rid <= 0) return;
      const rep = await db.getBarterReport(rid);
      if (rep && rep.offer_id) {
        await db.moderatorFreezeBarterOffer(rep.offer_id);
        await db.auditBarterOffer(rep.offer_id, u.id, 'offer.frozen', { reportId: rid });
      }
      await renderModReportView(ctx, rid);
      return;
    }
if (p.a === 'a:mod_r_close') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.rid || 0);
      if (!Number.isInteger(rid) || rid <= 0) return;
      const rep = await db.getBarterReport(rid);
      if (rep && rep.thread_id) {
        await db.moderatorCloseBarterThread(rep.thread_id);
        await db.auditBarterThread(rep.thread_id, u.id, 'thread.closed_by_mod', { reportId: rid });
      }
      await renderModReportView(ctx, rid);
      return;
    }
if (p.a === 'a:mod_r_resolve') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.rid || 0);
      if (!Number.isInteger(rid) || rid <= 0) return;
      await db.resolveBarterReport(rid, u.id);
      await renderModReportView(ctx, rid);
      return;
    }
  })();
  return true;
}
