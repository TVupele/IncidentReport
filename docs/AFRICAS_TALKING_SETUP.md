# Africa's Talking Setup Guide for MATASA Incident Report Platform

This guide covers setting up Africa's Talking for USSD and SMS functionality. Africa's Talking is recommended for Nigeria/Africa due to competitive pricing and excellent regional support.

## Why Africa's Talking?

- **Competitive Pricing**: ~$0.01/SMS (60% cheaper than Twilio)
- **Native USSD**: Direct USSD support for Nigeria
- **African Focus**: Better support for African telecom networks
- **Reliable**: 99.9% uptime for critical communications

---

## Prerequisites

1. Africa's Talking Account (https://africastalking.com)
2. A Nigerian phone number (for SMS/USSD)
3. Payment method configured
4. Domain with SSL certificate (for webhooks)

---

## Step 1: Create Africa's Talking Account

1. Go to https://africastalking.com
2. Sign up for an account
3. Complete verification (email, phone)
4. Choose "Sandbox" for testing or "Live" for production

## Step 2: Get USSD Number

### For Sandbox (Testing):
1. Log in to Africa's Talking Dashboard
2. Go to **USSD** → **Short Codes**
3. Request access to short code `*384*154011#` (or your preferred code)
4. Note the keyword (default: `INCIDENT`)

### For Production:
1. Apply for a dedicated short code through Africa's Talking
2. Submit required documentation:
   - Company registration
   - Purpose of USSD service
   - Expected traffic volume
3. Wait for approval (typically 3-5 business days)

## Step 3: Configure USSD Service

1. In Dashboard, go to **USSD** → **Services**
2. Click **Create New Service**
3. Configure:
   ```
   Service Name: MATASA Incident Report
   Keyword: INCIDENT
   Short Code: *384*154011#
   Callback URL: https://your-domain.com/api/v1/ussd
   ```

4. Set session timeout (recommended: 120 seconds)

## Step 4: Get API Credentials

1. Go to **Settings** → **API Keys**
2. Copy your **API Key** (starts with `ats_`)
3. Note your **Username** (typically `sandbox` for testing)

## Step 5: Update Environment Variables

Edit your `.env` file:

```env
# Africa's Talking Configuration
AFRICAS_TALKING_API_KEY=ats_your_api_key_here
AFRICAS_TALKING_USERNAME=sandbox
AFRICAS_TALKING_SHORT_CODE=*384*154011#
AFRICAS_TALKING_KEYWORD=INCIDENT
AFRICAS_TALKING_CALLBACK_URL=https://your-domain.com/api/v1/ussd

# USSD Provider
USSD_PROVIDER=africastalking
USSD_SHORT_CODE=*384*154011#
```

## Step 6: Configure Webhook

### In Africa's Talking Dashboard:
1. Go to **USSD** → **Your Service**
2. Set **Callback URL** to:
   ```
   https://your-domain.com/api/v1/ussd
   ```
3. Method: **POST**
4. Content-Type: **application/x-www-form-urlencoded**

### Expected Request Format:
```json
{
  "sessionId": "ATUid_1234567890",
  "phoneNumber": "+2348012345678",
  "text": "1",
  "serviceCode": "*384*154011#",
  "operator": "MTN"
}
```

### Response Format:
```
CON <message>  (continue session)
END <message>  (end session)
```

## Step 7: Configure SMS (Optional)

For SMS notifications:

1. Go to **SMS** → **Outbound** in Dashboard
2. Note sender ID configuration
3. SMS cost is separate from USSD

## Step 8: Testing

### Test USSD Locally:
```bash
curl -X POST http://localhost:3000/api/v1/ussd/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "phoneNumber": "+2348012345678",
    "input": "",
    "language": "english"
  }'
```

### Expected Response:
```json
{
  "success": true,
  "response": {
    "response": "continue",
    "message": "MATASA Incident Report\n1. Report Suspicious\n2. Report Incident\n..."
  }
}
```

### Test with Africa's Talking Sandbox:
1. Use Africa's Talking mobile app or test numbers
2. Dial `*384*154011#`
3. Follow the menu prompts

## Step 9: Production Checklist

- [ ] SSL certificate installed (HTTPS required)
- [ ] Webhook URL accessible from internet
- [ ] Response timeout < 3 seconds
- [ ] USSD menu text approved
- [ ] Rate limiting configured
- [ ] Error handling for failed messages
- [ ] Monitoring set up

## Cost Estimation

| Service | Cost (Nigeria) |
|---------|---------------|
| USSD Session | ~$0.005 per session |
| SMS | ~$0.01 per message |
| Monthly Number | ~$10/month |

**Monthly Example (1000 reports):**
- USSD Sessions: 1000 × $0.005 = $5
- SMS Notifications: 3000 × $0.01 = $30
- **Total: ~$35/month**

---

## Alternative: Hub2 (Nigeria)

Hub2 is another Nigerian provider worth considering:

### Setup:
```env
USSD_PROVIDER=hub2
HUB2_API_KEY=your_hub2_api_key
HUB2_SHORT_CODE=*384*154011#
```

### Hub2 Webhook Format:
```json
{
  "session_id": "abc123",
  "msisdn": "+2348012345678",
  "ussd_text": "1",
  "operator_name": "MTN"
}
```

---

## Troubleshooting

### "Webhook not receiving requests"
- Check firewall allows inbound requests
- Verify SSL certificate is valid
- Test URL with curl: `curl -X POST https://your-domain.com/api/v1/ussd -d '{}'`

### "Session timeout errors"
- Reduce processing time (< 3 seconds)
- Queue slow operations for background
- Return quick acknowledgment first

### "Invalid phone number"
- Format: `+2348012345678` or `08012345678`
- Check network operator support

### "USSD menu not displaying"
- Verify short code is active
- Check operator compatibility
- Ensure menu text doesn't exceed 182 characters

---

## Security Best Practices

1. **Never commit credentials** to version control
2. **Use environment variables** for all secrets
3. **Validate webhook signatures** from provider
4. **Rate limit** incoming requests
5. **Encrypt sensitive data** at rest
6. **Use HTTPS** for all webhooks

---

## Quick Reference

| Setting | Value |
|---------|-------|
| API URL | https://api.africastalking.com |
| Dashboard | https://dashboard.africastalking.com |
| API Key Format | `ats_xxxxxxxx` |
| Webhook URL | `https://your-domain.com/api/v1/ussd` |
| Response Format | `CON message` or `END message` |
| Max Response Time | 3 seconds |
