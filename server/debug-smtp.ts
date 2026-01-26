import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function debugSMTP() {
  console.log('\n=== SMTP Debug Diagnostic ===\n');
  
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  
  console.log('1. Environment Variable Check:');
  console.log(`   SMTP_USER: "${smtpUser}"`);
  console.log(`   SMTP_USER length: ${smtpUser?.length || 0}`);
  console.log(`   SMTP_PASS: "${'*'.repeat(smtpPass?.length || 0)}"`);
  console.log(`   SMTP_PASS length: ${smtpPass?.length || 0}`);
  console.log(`   SMTP_PASS bytes: ${smtpPass ? Buffer.from(smtpPass).toString('hex') : 'N/A'}`);
  console.log('');
  
  // Check for hidden characters
  if (smtpPass) {
    const hasSpaces = smtpPass.includes(' ');
    const hasTabs = smtpPass.includes('\t');
    const hasNewlines = smtpPass.includes('\n') || smtpPass.includes('\r');
    const hasQuotes = smtpPass.includes('"') || smtpPass.includes("'");
    
    console.log('2. Password Character Check:');
    console.log(`   Contains spaces: ${hasSpaces}`);
    console.log(`   Contains tabs: ${hasTabs}`);
    console.log(`   Contains newlines: ${hasNewlines}`);
    console.log(`   Contains quotes: ${hasQuotes}`);
    if (hasSpaces || hasTabs || hasNewlines || hasQuotes) {
      console.log('   ⚠️  WARNING: Password contains invalid characters!');
    }
    console.log('');
  }
  
  // Test with service option
  console.log('3. Testing with service: "gmail" option...');
  try {
    const transporter1 = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    
    await transporter1.verify();
    console.log('   ✅ SUCCESS with service: "gmail"');
    console.log('   💡 Use this configuration in your code!');
    return;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.code} - ${error.response?.substring(0, 100)}`);
  }
  
  // Test with explicit host/port
  console.log('\n4. Testing with explicit host/port (smtp.gmail.com:587)...');
  try {
    const transporter2 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    
    await transporter2.verify();
    console.log('   ✅ SUCCESS with explicit host/port');
    return;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.code} - ${error.response?.substring(0, 100)}`);
  }
  
  // Final recommendations
  console.log('\n5. Diagnostic Summary:');
  console.log('   ❌ All authentication attempts failed');
  console.log('');
  console.log('🔍 Next Steps to Try:');
  console.log('');
  console.log('   A. Verify App Password is correct:');
  console.log('      1. Go to: https://myaccount.google.com/apppasswords');
  console.log('      2. Check if you see the App Password you created');
  console.log('      3. If not visible or unsure, DELETE all App Passwords');
  console.log('      4. Generate a BRAND NEW one');
  console.log('      5. Copy it EXACTLY (it shows as 4 groups - remove ALL spaces)');
  console.log('      6. Paste directly into .env file (no quotes, no spaces)');
  console.log('');
  console.log('   B. Verify 2-Step Verification is ACTIVE (not just set up):');
  console.log('      1. Go to: https://myaccount.google.com/security');
  console.log('      2. Under "2-Step Verification" it should say "On"');
  console.log('      3. If it says "Off" or "Get started", enable it first');
  console.log('      4. You MUST complete the setup (verify phone, etc.)');
  console.log('');
  console.log('   C. Check account restrictions:');
  console.log('      1. Go to: https://myaccount.google.com/security');
  console.log('      2. Look for any security alerts or restrictions');
  console.log('      3. Check if account is suspended or has issues');
  console.log('');
  console.log('   D. Try a different Gmail account:');
  console.log('      Sometimes accounts have hidden restrictions');
  console.log('      Try with a different Gmail account to test');
  console.log('');
  console.log('   E. Wait and retry:');
  console.log('      After generating a new App Password, wait 2-3 minutes');
  console.log('      Sometimes Google needs time to activate it');
  console.log('');
  console.log('   F. Check if this is a Google Workspace account:');
  console.log('      If ivolvo12t@gmail.com is managed by an organization,');
  console.log('      you may need admin approval for App Passwords');
  console.log('');
  
  process.exit(1);
}

debugSMTP().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
