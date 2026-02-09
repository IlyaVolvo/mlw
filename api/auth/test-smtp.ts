import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Protect with secret
  const secret = req.query.secret as string;
  if (!secret || secret !== process.env.TEST_EMAIL_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpFrom = process.env.SMTP_FROM;

  const result: Record<string, any> = {
    smtp_user_set: !!smtpUser,
    smtp_user_value: smtpUser ? `${smtpUser.substring(0, 3)}...${smtpUser.substring(smtpUser.indexOf('@'))}` : null,
    smtp_pass_set: !!smtpPass,
    smtp_pass_length: smtpPass ? smtpPass.length : 0,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_from: smtpFrom || '(not set, will use SMTP_USER)',
  };

  if (!smtpUser || !smtpPass) {
    result.connection_verified = false;
    result.error = 'SMTP_USER or SMTP_PASS is not set';
    return res.json(result);
  }

  // Create transporter
  let transporter: nodemailer.Transporter;
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

  // Verify connection
  try {
    await transporter.verify();
    result.connection_verified = true;
  } catch (error: any) {
    result.connection_verified = false;
    result.error = error.message;
    result.error_code = error.code;
    result.error_response = error.response;
  }

  return res.json(result);
}
