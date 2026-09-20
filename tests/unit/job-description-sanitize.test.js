import { sanitizeJobDescription } from '../../src/modules/jobs/job-description-sanitize.js';

describe('sanitizeJobDescription', () => {
  test('strips script tags and their contents', () => {
    const input = '<p>Safe padding text here.</p><script>alert("M3-STORED-XSS-PROOF")</script>';
    const output = sanitizeJobDescription(input);

    expect(output).not.toMatch(/<script/i);
    expect(output).not.toContain('M3-STORED-XSS-PROOF');
    expect(output).toContain('Safe padding text here');
    expect(output).toContain('<p>');
  });

  test('strips img tags and event handlers', () => {
    const input =
      '<p>Need help with harvesting crops in the field.</p><img src=x onerror="alert(1)">';
    const output = sanitizeJobDescription(input);

    expect(output).not.toMatch(/<img/i);
    expect(output).not.toMatch(/onerror/i);
    expect(output).toContain('Need help with harvesting crops');
  });

  test('keeps allow-listed rich text', () => {
    const input = '<p><strong>Need help with harvesting crops in the field.</strong></p>';
    const output = sanitizeJobDescription(input);

    expect(output).toContain('<p>');
    expect(output).toContain('<strong>');
    expect(output).toContain('Need help with harvesting crops in the field.');
  });

  test('keeps <b> used by the Stage A HTML-injection payload', () => {
    const input =
      '<b>M3-HTML-INJECTION-TEST</b> padding text to satisfy the twenty character minimum.';
    const output = sanitizeJobDescription(input);

    expect(output).toContain('<b>M3-HTML-INJECTION-TEST</b>');
  });

  test('returns non-string values unchanged', () => {
    expect(sanitizeJobDescription(undefined)).toBeUndefined();
    expect(sanitizeJobDescription(null)).toBeNull();
  });
});
