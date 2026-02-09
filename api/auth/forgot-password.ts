import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? {
    rejectUnauthorized: false
  } : false
});

const query = (text: string, params?: any[]) => pool.query(text, params);

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP configuration is missing. Set SMTP_USER and SMTP_PASS.');
  }

  if (smtpHost === 'smtp.gmail.com') {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  } else {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  return transporter;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, baseUrl } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    // Don't reveal if user exists
    if (user) {
      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      // Delete old tokens
      await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = 0', [user.id]);

      // Store new token
      await query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, resetToken, expiresAt.toISOString()]
      );

      // Send email
      try {
        const transport = getTransporter();
        const resetUrl = `${baseUrl || 'https://mlw-rho.vercel.app'}/reset-password?token=${resetToken}`;
        const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

        // Support display name format
        let fromField = fromEmail || '';
        if (fromField && !fromField.includes('@')) {
          const smtpUser = process.env.SMTP_USER;
          if (smtpUser) {
            fromField = `"${fromField}" <${smtpUser}>`;
          }
        }

        await transport.sendMail({
          from: fromField,
          to: email,
          subject: 'Password Reset - Polywordlot',
          html: `
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password for Polywordlot.</p>
            <p>Click the link below to reset your password:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
          text: `Password Reset Request\n\nYou requested to reset your password for Polywordlot.\nClick the link below to reset your password:\n${resetUrl}\n\nThis link will expire in 1 hour.\nIf you didn't request this, please ignore this email.`,
        });

        console.log('Password reset email sent', { email });
      } catch (emailError) {
        console.error('Failed to send password reset email', emailError);
        // Still return success to not reveal if email exists
      }
    }

    // Always return success
    res.json({ message: 'If the email exists, a password reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
}
