/**
 * BUG-041: fields must always end up with a non-empty, human-readable label
 * so generated inputs have a programmatic accessible name. Used as a save-time
 * fallback in EntityEditor and a render-time defense-in-depth fallback in
 * PublicFormPage.
 */
export function humanizeKey(key: string): string {
  const words = key
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
