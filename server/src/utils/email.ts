import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(email: string, resetToken: string, baseUrl: string): Promise<void> {
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Password Reset - Wordle Multi',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password for Wordle Multi.</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `
      Password Reset Request
      
      You requested to reset your password for Wordle Multi.
      Click the link below to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      If you didn't request this, please ignore this email.
    `,
  };

  await transporter.sendMail(mailOptions);
}

