import xss from 'xss';

/**
 * Allow-list for job descriptions.
 * Matches TipTap on Create/Edit (StarterKit + Underline + TextAlign).
 * Strips script, iframe, svg, img, event handlers, and javascript: URLs.
 */
const JOB_DESCRIPTION_XSS = new xss.FilterXSS({
  whiteList: {
    p: ['style'],
    br: [],
    b: [],
    strong: [],
    i: [],
    em: [],
    u: [],
    s: [],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    ul: [],
    ol: [],
    li: [],
    blockquote: [],
    code: [],
    pre: [],
    hr: [],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form'],
  css: {
    whiteList: {
      'text-align': true,
    },
  },
  safeAttrValue: (tag, name, value, cssFilter) => {
    if (name === 'style') {
      const match = String(value || '').match(
        /^\s*text-align\s*:\s*(left|right|center|justify)\s*;?\s*$/i
      );
      return match ? `text-align: ${match[1].toLowerCase()}` : '';
    }
    return xss.safeAttrValue(tag, name, value, cssFilter);
  },
});

/**
 * Sanitize HTML stored in jobs.description.
 * Non-string values are returned unchanged (validation owns type checks).
 * @param {unknown} html
 * @returns {unknown}
 */
export const sanitizeJobDescription = (html) => {
  if (typeof html !== 'string') return html;
  return JOB_DESCRIPTION_XSS.process(html);
};
