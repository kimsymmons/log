import jwt from 'jsonwebtoken'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var is required')
  return secret
}

export function signToken(email: string): string {
  return jwt.sign({ email }, getSecret(), { expiresIn: '30d', algorithm: 'HS256' })
}

export function verifyToken(token: string): { email: string } | null {
  try {
    const payload = jwt.verify(token, getSecret()) as { email: string }
    return { email: payload.email }
  } catch {
    return null
  }
}
