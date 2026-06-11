import { Resend } from 'resend'

let client: Resend | null = null

function getClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

export async function sendMagicLink(email: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3001'
  const link = `${appUrl}/auth/verify?token=${token}`

  const { error } = await getClient().emails.send({
    from: 'auth@log.app',
    to: email,
    subject: 'Your sign-in link',
    text: `Your sign-in link: ${link}\n\nThis link expires in 15 minutes.`,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }
}
