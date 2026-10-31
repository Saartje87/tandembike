const previewableMediaTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/**
 * Whether an Attachment of `mediaType` can show as an image. SVG cannot: it
 * may hold script, so it only downloads.
 */
export function isPreviewable(mediaType: string): boolean {
  return previewableMediaTypes.has(mediaType);
}

/**
 * Whether an Attachment of `mediaType` holds text an Agent can read as text:
 * text/*, and JSON, XML, YAML and JavaScript types.
 */
export function isTextMediaType(mediaType: string): boolean {
  return (
    mediaType.startsWith('text/') ||
    /^application\/(json|xml|yaml|x-yaml|javascript|ecmascript)$/.test(
      mediaType,
    ) ||
    /\+(json|xml|yaml)$/.test(mediaType)
  );
}

/** A byte count as people read it, such as "1.5 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
