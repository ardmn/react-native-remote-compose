/**
 * Conventional commits, plus one hard rule for this repository: no AI or co-author
 * attribution trailers in any commit message.
 */
const noAttribution = (parsed) => {
  const raw = parsed.raw || '';
  const banned = /^(co-authored-by|claude-session|generated-by):/im;
  const generated = /generated with \[?claude/i;
  const ok = !banned.test(raw) && !generated.test(raw);
  return [
    ok,
    'attribution trailers (Co-Authored-By, Claude-Session, Generated with …) are not allowed',
  ];
};

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'no-attribution': noAttribution } }],
  rules: {
    'no-attribution': [2, 'always'],
    'body-max-line-length': [1, 'always', 100],
  },
};
