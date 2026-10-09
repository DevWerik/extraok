import { z } from 'zod'

// Run before application modules create schemas: the CSP disallows dynamic code.
z.config({ jitless: true })
