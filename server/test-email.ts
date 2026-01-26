import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

async function testSMTP() {
  console.log('\n=== SMTP Configuration Test ===\n');
  
  // Display configuration (without showing password)
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  console.log('Configuration:');
  console.log(`  SMTP_HOST: ${smtpHost}`);
  console.log(`  SMTP_PORT: ${smtpPort}`);
  console.log(`  SMTP_USER: ${smtpUser}`);
  console.log(`  SMTP_PASS: ${smtpPass ? '***' + smtpPass.slice(-4) : 'NOT SET'}`);
  console.log(`  SMTP_PASS length: ${smtpPass?.length || 0} characters`);
  console.log(`  SMTP_FROM: ${smtpFrom}`);
  console.log('');
  
  // Check for common issues
  if (smtpPass) {
    if (smtpPass.length !== 16) {
      console.warn(`⚠️  WARNING: App Password should be 16 characters, but got ${smtpPass.length}`);
    }
    if (smtpPass.includes(' ')) {
      console.warn('⚠️  WARNING: Password contains spaces - remove them!');
    }
    if (smtpPass.startsWith('"') || smtpPass.endsWith('"') || smtpPass.startsWith("'") || smtpPass.endsWith("'")) {
      console.warn('⚠️  WARNING: Password appears to have quotes - remove them!');
    }
  }

  // Validate required variables
  if (!smtpUser || !smtpPass) {
    console.error('❌ ERROR: SMTP_USER and SMTP_PASS must be set in .env file');
    process.exit(1);
  }

  // Create transporter with debug logging
  console.log('Creating SMTP transporter...');
  console.log('  Auth user length:', smtpUser?.length);
  console.log('  Auth pass length:', smtpPass?.length);
  console.log('  Auth user first 3 chars:', smtpUser?.substring(0, 3));
  console.log('  Auth pass first 3 chars:', smtpPass?.substring(0, 3));
  
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    debug: true, // Enable debug output
    logger: true, // Enable logging
  });

  // Test 1: Verify connection
  console.log('\n--- Test 1: Verifying SMTP Connection ---');
  console.log('Attempting to connect to:', smtpHost, 'on port', smtpPort);
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');
  } catch (error: any) {
    console.log('\n🔍 Detailed error information:');
    console.log('  Full error object keys:', Object.keys(error));
    if (error.response) {
      console.log('  Raw response:', error.response);
    }
    if (error.command) {
      console.log('  Failed command:', error.command);
    }
    console.error('❌ SMTP connection verification failed!');
    console.error('\nError details:');
    console.error(`  Code: ${error.code || 'N/A'}`);
    console.error(`  Command: ${error.command || 'N/A'}`);
    console.error(`  Response: ${error.response || error.message}`);
    console.error(`  Response Code: ${error.responseCode || 'N/A'}`);
    
    if (error.code === 'EAUTH') {
      console.error('\n💡 Authentication failed. Common issues:');
      console.error('  1. Make sure you\'re using a Gmail App Password, not your regular password');
      console.error('  2. Generate a NEW App Password at: https://myaccount.google.com/apppasswords');
      console.error('     - Select "Mail" as the app');
      console.error('     - Select "Other (Custom name)" and enter "Polywordlot"');
      console.error('     - Copy the 16-character password (no spaces)');
      console.error('  3. Make sure 2-Step Verification is enabled on your Google account');
      console.error('  4. Check that SMTP_PASS in .env has no extra spaces, quotes, or line breaks');
      console.error('  5. Make sure SMTP_USER matches the email account where you generated the App Password');
      console.error('\n📋 Step-by-step fix:');
      console.error('  1. Go to: https://myaccount.google.com/security');
      console.error('  2. Enable 2-Step Verification if not already enabled');
      console.error('  3. Go to: https://myaccount.google.com/apppasswords');
      console.error('  4. Generate a new App Password for "Mail"');
      console.error('  5. Copy the password exactly (16 characters, no spaces)');
      console.error('  6. Update SMTP_PASS in .env file');
      console.error('  7. Restart the server');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.error('\n💡 Connection failed. Check:');
      console.error('  1. Your internet connection');
      console.error('  2. Firewall settings');
      console.error('  3. SMTP_HOST and SMTP_PORT are correct');
    }
    
    process.exit(1);
  }

  // Test 2: Send test email (optional)
  const testEmail = process.argv[2]; // Get email from command line argument
  if (testEmail) {
    console.log(`\n--- Test 2: Sending Test Email to ${testEmail} ---`);
    try {
      const info = await transporter.sendMail({
        from: smtpFrom,
        to: testEmail,
        subject: 'Test Email from Polywordlot Server',
        text: 'This is a test email to verify SMTP configuration is working correctly.',
        html: '<p>This is a test email to verify SMTP configuration is working correctly.</p>',
      });
      
      console.log('✅ Test email sent successfully!');
      console.log(`  Message ID: ${info.messageId}`);
      console.log(`  Accepted: ${info.accepted.join(', ')}`);
      if (info.rejected.length > 0) {
        console.log(`  Rejected: ${info.rejected.join(', ')}`);
      }
    } catch (error: any) {
      console.error('❌ Failed to send test email!');
      console.error(`  Error: ${error.message}`);
      console.error(`  Code: ${error.code || 'N/A'}`);
      process.exit(1);
    }
  } else {
    console.log('\n--- Test 2: Skipped (no email address provided) ---');
    console.log('💡 To send a test email, run: npm run test:email your-email@example.com');
  }

  console.log('\n✅ All tests passed!');
  process.exit(0);
}

testSMTP().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
