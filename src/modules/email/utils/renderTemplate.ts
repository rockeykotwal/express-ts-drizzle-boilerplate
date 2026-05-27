import { readFileSync } from 'fs';
import { join } from 'path';
import { AppError } from '../../../errors/AppError';

const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/**
 * Reads an HTML email template and replaces all {{key}} placeholders
 * with the supplied variables.
 *
 * @param templateName - filename without extension (e.g. 'verify-email')
 * @param variables    - key/value pairs to substitute into the template
 */
export function renderTemplate(
  templateName: string,
  variables: Record<string, string>,
): string {
  let html: string;

  try {
    html = readFileSync(join(TEMPLATES_DIR, `${templateName}.html`), 'utf-8');
  } catch {
    throw new AppError(`Email template "${templateName}" not found`, 500, false);
  }

  // Replace every {{key}} occurrence with its value
  return html.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      // Leave unreplaced placeholders as empty strings rather than surfacing
      // raw template syntax to end users
      return '';
    }
    return value;
  });
}
