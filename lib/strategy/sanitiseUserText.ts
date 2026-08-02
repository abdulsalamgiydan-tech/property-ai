/**
 * Free-text sanitisation for prompt-injection defence (STRATEGY_BUILD.md).
 * Strips known injection patterns, role tags, HTML, and caps length.
 */
export function sanitiseUserText(raw: string): { cleaned: string; flagged: boolean } {
  let s = raw;
  let flagged = false;

  const markIfChanged = (next: string) => {
    if (next !== s) flagged = true;
    s = next;
  };

  markIfChanged(
    s.replace(/ignore\s+(?:(?:previous|all|prior)\s+)+instructions/gi, "")
  );
  markIfChanged(s.replace(/system\s*:/gi, ""));
  markIfChanged(
    s.replace(/<\/?system>/gi, "").replace(/<\/?instructions>/gi, "").replace(/<\/?assistant>/gi, "").replace(/<\/?user>/gi, "")
  );

  const withoutHtml = s.replace(/<[^>]*>/g, "");
  markIfChanged(withoutHtml);

  markIfChanged(s.replace(/^#+\s*(system|assistant|user)\s*$/gim, ""));

  const trimmed = s.trim();
  if (trimmed !== s) flagged = true;
  s = trimmed;

  if (s.length > 500) {
    flagged = true;
    s = s.slice(0, 500);
  }

  return { cleaned: s, flagged };
}
