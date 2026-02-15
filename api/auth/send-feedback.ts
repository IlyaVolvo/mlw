import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

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
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as { userId: number; email: string };
    const userEmail = decoded.email;

    const { comments } = req.body;

    if (!comments || typeof comments !== 'string' || !comments.trim()) {
      return res.status(400).json({ error: 'Comments are required' });
    }

    const smtpUser = process.env.SMTP_USER;
    const fromEmail = process.env.SMTP_FROM || smtpUser;

    const transport = getTransporter();
    await transport.sendMail({
      from: fromEmail,
      to: smtpUser,
      replyTo: 'polywordlot@gmail.com',
      subject: `Polywordlot Feedback from ${userEmail}`,
      text: comments.trim(),
      html: `<pre style="white-space: pre-wrap; font-family: inherit;">${comments.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    });

    res.json({ success: true, message: 'Feedback sent successfully' });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Send feedback error', error);
    res.status(500).json({ error: 'Failed to send feedback' });
  }
}
