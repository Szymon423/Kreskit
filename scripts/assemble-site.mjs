// Puts the landing page around the web build of the app: dist-web/ is the site root and
// dist-web/app/ (already built by Vite) is the live app.
import { cpSync } from 'node:fs'

cpSync('site', 'dist-web', { recursive: true })
for (const image of ['kreskit.png', '01.png', '02.png']) {
  cpSync(`example/${image}`, `dist-web/${image}`)
}
