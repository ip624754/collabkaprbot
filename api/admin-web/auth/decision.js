import { approveChallenge } from '../../../src/lib/adminWeb/auth.js';
import { html } from '../../../src/lib/adminWeb/common.js';

function page(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;background:#071021;color:#eef3ff;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:rgba(12,21,44,.88);border:1px solid rgba(133,177,255,.25);border-radius:20px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}h1{margin:0 0 10px;font-size:28px}p{margin:8px 0;color:#bfc9e6;line-height:1.5}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p><p>Можно вернуться в веб-админку и обновить статус входа.</p></div></body></html>`;
}

export default async function handler(req, res) {
  const challengeId = String(req.query?.challengeId || '').trim();
  const decision = String(req.query?.decision || '').trim();
  const actor = Number(req.query?.actor || 0) || 0;
  const exp = Number(req.query?.exp || 0) || 0;
  const sig = String(req.query?.sig || '').trim();
  const result = await approveChallenge({ challengeId, decision, actorTgId: actor, exp, sig });
  if (!result.ok) return html(res, 400, page('Не удалось обработать вход', `Причина: ${String(result.error || 'unknown')}`));
  if (decision === 'deny') return html(res, 200, page('Вход отклонён', 'Этот login challenge помечен как denied.'));
  return html(res, 200, page('Вход подтверждён', 'Challenge помечен как approved.'));
}
