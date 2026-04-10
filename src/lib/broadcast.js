export const BROADCAST_CAPTION_SAFE_LIMIT = 900;

function codepointLen(v) {
  return Array.from(String(v || '')).length;
}

export function parseBroadcastButtons(input, maxButtons = 3) {
  let btns = [];
  try {
    if (Array.isArray(input)) btns = input;
    else if (typeof input === 'string' && input.trim()) btns = JSON.parse(input);
  } catch {
    btns = [];
  }
  if (!Array.isArray(btns)) btns = [];
  return btns
    .filter((b) => b && String(b.text || '').trim() && String(b.url || '').trim())
    .slice(0, Math.max(0, Number(maxButtons) || 0))
    .map((b) => ({
      text: String(b.text).trim().slice(0, 64),
      url: String(b.url).trim().slice(0, 2048),
    }));
}

export function buildBroadcastReplyMarkup(input, { maxButtons = 3, rowSize = 2 } = {}) {
  const btns = parseBroadcastButtons(input, maxButtons);
  if (!btns.length) return null;
  const rows = [];
  const size = Math.max(1, Math.min(3, Number(rowSize) || 2));
  for (let i = 0; i < btns.length; i += size) rows.push(btns.slice(i, i + size));
  return rows.length ? { inline_keyboard: rows } : null;
}

export function buildBroadcastDeliveryPlan(bc, { maxButtons = 3, captionSafeLimit = BROADCAST_CAPTION_SAFE_LIMIT } = {}) {
  const type = String(bc?.draft_type || 'text').toLowerCase();
  const draftText = String(bc?.draft_text || '').trim();
  const draftCaption = String(bc?.draft_caption || '').trim();
  const fileId = String(bc?.draft_file_id || '').trim();
  const replyMarkup = buildBroadcastReplyMarkup(bc?.buttons ?? bc?.buttons_json ?? null, { maxButtons });
  const out = {
    type,
    media: type !== 'text' && !!fileId,
    button: !!replyMarkup,
    splitLongText: false,
    messages: [],
  };

  if (type === 'text' || !fileId) {
    out.messages.push({ kind: 'text', text: draftText || draftCaption || '', reply_markup: replyMarkup });
    return out;
  }

  const bodyText = draftText || draftCaption;
  const mediaMsg = { kind: type, file_id: fileId };

  if (!bodyText) {
    if (replyMarkup) mediaMsg.reply_markup = replyMarkup;
    out.messages.push(mediaMsg);
    return out;
  }

  if (codepointLen(bodyText) <= captionSafeLimit) {
    mediaMsg.caption = bodyText;
    if (replyMarkup) mediaMsg.reply_markup = replyMarkup;
    out.messages.push(mediaMsg);
    return out;
  }

  out.splitLongText = true;
  const shortCaption = draftCaption && draftCaption !== draftText && codepointLen(draftCaption) <= captionSafeLimit
    ? draftCaption
    : '';
  if (shortCaption) mediaMsg.caption = shortCaption;
  out.messages.push(mediaMsg);
  out.messages.push({ kind: 'text', text: bodyText, reply_markup: replyMarkup });
  return out;
}
