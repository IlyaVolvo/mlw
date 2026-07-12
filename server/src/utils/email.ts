import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter: nodemailer.Transporter | null = null;
let transporterVerified = false;
let cachedConfig: { user: string; pass: string; host: string; port: number } | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  // Validate required environment variables
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  // Check if configuration has changed - if so, reset the transporter
  const currentConfig = { user: smtpUser || '', pass: smtpPass || '', host: smtpHost, port: smtpPort };
  if (cachedConfig && (
    cachedConfig.user !== currentConfig.user ||
    cachedConfig.pass !== currentConfig.pass ||
    cachedConfig.host !== currentConfig.host ||
    cachedConfig.port !== currentConfig.port
  )) {
    logger.info('SMTP configuration changed, resetting transporter');
    transporter = null;
    transporterVerified = false;
    cachedConfig = null;
  }

  if (transporter && transporterVerified && cachedConfig) {
    return transporter;
  }

  if (!smtpUser || !smtpPass) {
    const error = 'SMTP configuration is missing. Please set SMTP_USER and SMTP_PASS environment variables.';
    logger.error(error, { 
      hasUser: !!smtpUser, 
      hasPass: !!smtpPass,
      host: smtpHost,
      port: smtpPort 
    });
    throw new Error(error);
  }

  logger.info('Creating SMTP transporter', { 
    host: smtpHost, 
    port: smtpPort, 
    user: smtpUser,
    hasPassword: !!smtpPass 
  });

  // Cache the current configuration
  cachedConfig = { user: smtpUser, pass: smtpPass, host: smtpHost, port: smtpPort };

  // Try using Gmail service option first (more reliable)
  if (smtpHost === 'smtp.gmail.com') {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Add connection timeout
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  } else {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      // Add connection timeout
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  // Verify connection
  try {
    logger.info('Verifying SMTP connection...');
    await transporter.verify();
    transporterVerified = true;
    logger.info('SMTP connection verified successfully');
  } catch (verifyError: any) {
    logger.error('SMTP connection verification failed', {
      error: verifyError.message,
      code: verifyError.code,
      command: verifyError.command,
      response: verifyError.response,
      responseCode: verifyError.responseCode,
    });
    // Don't throw here - let the actual send attempt fail with more context
    transporterVerified = false;
  }

  return transporter;
}

export async function sendPasswordResetEmail(email: string, resetToken: string, baseUrl: string): Promise<void> {
  try {
    const transporter = await getTransporter();
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    if (!fromEmail) {
      throw new Error('SMTP_FROM or SMTP_USER must be set');
    }

    // Support display name format: "Display Name <email@example.com>" or just "email@example.com"
    // If SMTP_FROM doesn't contain an email address, use SMTP_USER as fallback
    let fromField = fromEmail;
    if (!fromEmail.includes('@')) {
      // If SMTP_FROM is just a display name, combine it with SMTP_USER
      const smtpUser = process.env.SMTP_USER;
      if (smtpUser) {
        fromField = `"${fromEmail}" <${smtpUser}>`;
      } else {
        throw new Error('SMTP_FROM must contain an email address or SMTP_USER must be set');
      }
    }

    const mailOptions = {
      from: fromField,
      to: email,
      subject: 'Password Reset - Polywordlot',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password for Polywordlot.</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 6 hours.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      text: `
        Password Reset Request
        
        You requested to reset your password for Polywordlot.
        Click the link below to reset your password:
        ${resetUrl}
        
        This link will expire in 6 hours.
        If you didn't request this, please ignore this email.
      `,
    };

    logger.info('Sending password reset email', { 
      to: email, 
      from: fromEmail,
      resetUrl,
      baseUrl 
    });
    
    const info = await transporter.sendMail(mailOptions);
    logger.info('Password reset email sent successfully', { 
      messageId: info.messageId, 
      to: email,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response 
    });
  } catch (error: any) {
    const errorDetails = {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
      email,
    };
    logger.error('Failed to send password reset email', errorDetails);
    
    // Provide more helpful error messages
    if (error.code === 'EAUTH') {
      throw new Error('SMTP authentication failed. Please check your SMTP_USER and SMTP_PASS credentials.');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      throw new Error(`SMTP connection failed. Unable to connect to ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${process.env.SMTP_PORT || '587'}. Check your network and SMTP settings.`);
    } else if (error.responseCode) {
      throw new Error(`SMTP server error: ${error.responseCode} ${error.response || error.message}`);
    }
    
    throw error;
  }
}

export async function sendFeedbackEmail(userEmail: string, comments: string): Promise<void> {
  try {
    const transporter = await getTransporter();
    const smtpUser = process.env.SMTP_USER;
    const fromEmail = process.env.SMTP_FROM || smtpUser;

    if (!smtpUser) {
      throw new Error('SMTP_USER must be set');
    }

    let fromField = fromEmail || smtpUser;
    if (fromField && !fromField.includes('@')) {
      fromField = `"${fromField}" <${smtpUser}>`;
    }

    const mailOptions = {
      from: fromField,
      to: smtpUser,
      replyTo: userEmail,
      subject: `Polywordlot Feedback from ${userEmail}`,
      text: comments.trim(),
      html: `<pre style="white-space: pre-wrap; font-family: inherit;">${comments.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    };

    logger.info('Sending feedback email', { from: userEmail, to: smtpUser });
    await transporter.sendMail(mailOptions);
    logger.info('Feedback email sent successfully');
  } catch (error: any) {
    logger.error('Failed to send feedback email', { error: error.message, userEmail });
    throw error;
  }
}

