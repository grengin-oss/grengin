import express from 'express'
import cors from 'cors'
import { seedData } from './lib/store.js'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import filesRoutes from './routes/files.js'
import settingsRoutes from './routes/settings.js'
import userRoutes from './routes/user.js'
import healthRoutes from './routes/health.js'
import modelsRoutes from './routes/models.js'
import adminRoutes from './routes/admin.js'
import analyticsRoutes from './routes/analytics.js'
import onboardingRoutes from './routes/onboarding.js'

// Seed initial data
seedData()

const app = express()

// Enable CORS
app.use(cors())
app.use(express.json())

// Mount routes
app.use(authRoutes)
app.use(chatRoutes)
app.use(filesRoutes)
app.use(settingsRoutes)
app.use(userRoutes)
app.use(healthRoutes)
app.use(modelsRoutes)
app.use(adminRoutes)
app.use(analyticsRoutes)
app.use(onboardingRoutes)

// Fallback 404 handler - always returns JSON
app.use((req, res) => {
  res.status(404).json({ detail: 'Not Found' })
})

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || 'localhost'

app.listen(PORT, () => {
  console.log(`🚀 Grengin Mock API Server v1.1.0`)
  console.log(`   Running at http://${HOST}:${PORT}`)
  console.log('')
  console.log('Auth endpoints:')
  console.log(`  POST /auth/login              - Password login`)
  console.log(`  POST /auth/refresh            - Refresh token`)
  console.log(`  POST /auth/logout             - Logout (auth required)`)
  console.log(`  GET  /auth/:provider          - SSO init (google, azure, keycloak)`)
  console.log(`  *    /auth/:provider/callback - SSO callback (GET/POST)`)
  console.log('')
  console.log('Core endpoints:')
  console.log(`  GET  /health       - Health check`)
  console.log(`  GET  /models       - List AI models`)
  console.log(`  GET  /me           - Current user (auth required)`)
  console.log(`  *    /chat/*       - Chat endpoints (auth required)`)
  console.log(`  *    /files/*      - File endpoints (auth required)`)
  console.log(`  *    /settings     - Settings (auth required)`)
  console.log('')
  console.log('Admin endpoints:')
  console.log(`  GET    /admin/ai-engines                    - List AI engines`)
  console.log(`  GET    /admin/ai-engines/:key               - Get engine details`)
  console.log(`  PUT    /admin/ai-engines/:key               - Update engine config`)
  console.log(`  POST   /admin/ai-engines/:key/validate      - Validate API key`)
  console.log(`  GET    /admin/ai-engines/:key/models        - List available models`)
  console.log(`  DELETE /admin/ai-engines/:key/api-key       - Remove API key`)
  console.log('')
  console.log('🔑 Demo credentials: admin@grengin.com / Demo123456!@')
  console.log('💡 Use "Bearer <token>" for authentication')
})
