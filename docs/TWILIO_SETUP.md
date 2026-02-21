# Twilio Setup Guide for MATASA Incident Report Platform

This guide covers setting up Twilio for USSD and SMS functionality.

## Prerequisites

1. Twilio Account (https://www.twilio.com)
2. A Nigerian phone number (for SMS/USSD)
3. Payment method configured in Twilio

---

## Step 1: Create Twilio Account

1. Go to https://www.twilio.com
2. Sign up for a free trial or login to existing account
3. Complete account verification (email, phone)

## Step 2: Get a Nigerian Phone Number

For USSD in Nigeria, you need a Nigerian virtual number:

1. In Twilio Console, go to **Phone Numbers** → **Buy a Number**
2. Search for a Nigerian number (+234)
3. Select a number with SMS and Voice capabilities
4. Note the phone number (format: +23480XXXXXXXX)

**Cost:** Approximately $1/month for SMS-enabled number

## Step 3: Configure USSD (Super Network)

For USSD in Nigeria, you have two options:

### Option A: Twilio Super Network (Recommended)

1. Go to **Super Network** → **USSD**
2. Click **Get Started with USSD**
3. Provide your business documentation:
   - Company registration
   - Purpose of USSD service
   - Expected traffic volume
4. Wait for approval (1-3 business days)
5. Once approved, configure your callback URL:
   ```
   https://your-domain.com/api/v1/ussd
   ```

### Option B: Use SMS for Fallback

If USSD approval is delayed, use SMS:

1. Configure SMS webhook:
   ```
   https://your-domain.com/api/v1/sms
   ```
2. Users send SMS to report incidents

## Step 4: Get API Credentials

1. Go to **Console Dashboard**
2. Find your **Account SID** (starts with AC)
3. Create **Auth Token**:
   - Click **Settings** → **General**
   - Create new API key or use main auth token
4. Save these credentials securely

## Step 5: Update Environment Variables

Edit your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+2348012345678
TWILIO_WHATSAPP_NUMBER=+2348012345678
```

## Step 6: Configure Webhooks

### USSD Webhook

1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click your Nigerian number
3. Under **Messaging**:
   - **A MESSAGE COMES IN**: Webhook
   - URL: `https://your-domain.com/api/v1/ussd`
   - Method: POST
4. Under **Voice** (for USSD):
   - **A CALL COMES IN**: Webhook
   - URL: `https://your-domain.com/api/v1/ussd`
   - Method: POST

### SMS Webhook (Fallback)

If using SMS as backup:
- URL: `https://your-domain.com/api/v1/sms`
- Method: POST

## Step 7: Configure USSD Menu in Twilio

In Twilio Console:

1. **Super Network** → **USSD** → **Message Templates**
2. Create menu template:
   ```
   MATASA Incident Report
   1. Report Suspicious Activity
   2. Report Incident
   3. Request Help
   4. Read Alerts
   ```
3. Map menu options to your webhook

## Step 8: Test Configuration

### Test SMS

```bash
curl -X POST https://your-domain.com/api/v1/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B2348012345678" \
  -d "Body=TEST"
```

### Test USSD

On your phone:
1. Dial `*384*154011#` (your USSD short code)
2. You should see the menu
3. Respond with numbers to navigate

### Verify Webhook

Check your server logs when making requests:
```
[Twilio] Incoming USSD request:
  SessionId: AX123456789
  From: +2348012345678
  Input: 1
```

## Step 9: Production Checklist

- [ ] SSL certificate installed (HTTPS required)
- [ ] Webhook URL accessible from internet
- [ ] Response timeout < 3 seconds
- [ ] USSD menu text approved by Twilio
- [ ] Rate limiting configured
- [ ] Error handling for failed messages

## Step 10: Monitor Usage

In Twilio Console:

1. **Logs** → **Phone Numbers** - Monitor API calls
2. **Super Network** → **USSD** - Track delivery rates
3. **Usage** → **Monthly** - Monitor costs

**Typical Costs:**
- SMS: $0.039 per message (Nigeria)
- USSD: $0.005 per session

## Troubleshooting

### "Message not delivered"
- Check webhook returns 200 OK
- Verify Content-Type is `text/plain`
- Ensure response starts with `CON` or `END`

### "Webhook timeout"
- Process requests within 3 seconds
- Queue slow operations for background processing
- Return quick acknowledgment, process later

### "Invalid credentials"
- Verify Account SID format (starts with AC)
- Check Auth Token is correct
- Ensure credentials are in `.env` file

### USSD session ends immediately
- Response must start with `CON` (continue) or `END` (end)
- Check for proper newline in response

## Alternative: Local SMS Gateway

If Twilio costs are prohibitive, use local Nigerian SMS gateway:

### Example: Multitexter SMS
```javascript
// In notificationService.js
async function sendSms(phone, message) {
  const response = await fetch('https://www.multitexter.com/v2/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MULTITEXTER_API_KEY}`,
    },
    body: JSON.stringify({
      email: process.env.MULTITEXTER_EMAIL,
      password: process.env.MULTITEXTER_PASSWORD,
      sender_name: 'MATASA',
      message: message,
      recipients: phone.replace('+234', '0'),
    }),
  });
  return response.json();
}
```

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all secrets
3. **Validate webhook signatures** from Twilio
4. **Rate limit** incoming requests
5. **Encrypt sensitive data** at rest

## Quick Reference

| Setting | Value |
|---------|-------|
| Twilio Console | https://console.twilio.com |
| Account SID | Starts with `AC` |
| Auth Token | 32+ character string |
| Webhook URL | `https://your-domain.com/api/v1/ussd` |
| Response Format | `CON message` or `END message` |
| Max Response Time | 3 seconds |
