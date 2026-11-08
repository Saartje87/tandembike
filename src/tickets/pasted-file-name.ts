/** What browsers name a pasted screenshot: `image.png` and the like. */
const genericImageName = /^image\.[a-z0-9]+$/i;

/** Extensions whose media subtype is not the usual one. */
const extensions: Record<string, string> = { jpeg: 'jpg', 'svg+xml': 'svg' };

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A pasted file as it is added as an Attachment: a generic clipboard image,
 * an `image/*` file named `image.<ext>`, is renamed
 * `Pasted image YYYY-MM-DD HH.mm.ss.<ext>` from `at`, the local time of the paste,
 * with the extension taken from its media type. Any other file is returned
 * as it is.
 */
export const namePastedFile = (file: File, at: Date): File => {
  if (!file.type.startsWith('image/') || !genericImageName.test(file.name)) {
    return file;
  }
  const subtype = file.type.slice('image/'.length);
  const extension = extensions[subtype] ?? subtype;
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;
  return new File([file], `Pasted image ${date} ${time}.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
};
