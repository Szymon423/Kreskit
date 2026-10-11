// Puts the landing page around the web build of the app: dist-web/ is the site root and
// dist-web/app/ (already built by Vite) is the live app.
import { cpSync } from 'node:fs'

cpSync('site', 'dist-web', { recursive: true })
cpSync('example/kreskit.png', 'dist-web/kreskit.png')
