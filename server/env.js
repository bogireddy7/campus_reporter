// Loads settings from a ".env" file in the project folder (if present) so they do not have to be typed
// every time. Settings already set in the terminal / hosting dashboard take priority over the file.
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* no .env file: that is fine */
}
