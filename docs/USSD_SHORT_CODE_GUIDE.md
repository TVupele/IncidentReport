# Complete Guide: Getting USSD Short Code for Your App

This guide walks you through getting a USSD short code and configuring it so users can dial it to access your incident reporting menu.

## Overview

```
User dials (*384*154011#) 
    ↓
Telco network receives request
    ↓
Telco routes to Africa's Talking
    ↓
Africa's Talking calls your webhook (https://your-domain.com/api/v1/ussd)
    ↓
Your app processes request, returns menu
    ↓
User sees menu on phone
```

---

## Option 1: Africa's Talking (Recommended for Africa)

### Step 1: Create Account
1. Go to https://africastalking.com
2. Click **Sign Up**
3. Fill in your details:
   - Full name
   - Email address
   - Phone number (will be verified)
   - Company name (can be personal if no company)
4. Verify email and phone number

### Step 2: Access USSD Section
1. Login to https://dashboard.africastalking.com
2. On the left menu, find **USSD** (you may need to scroll down)
3. Click **Short Codes**

### Step 3: Request Short Code

**For Sandbox (Free Testing):**
1. Click **Request Sandbox Number**
2. Select `*384*154011#` from available codes (most common)
3. Or request another number like `*234#`, `*345#`
4. Click **Request**

**For Production (Live Use):**
1. Click **Buy Number** or **Request Dedicated Short Code**
2. Choose a short code (options shown include available codes)
3. Provide:
   - Business name
   - Business type (NGO, Government, Private, etc.)
   - Purpose: "Community safety incident reporting"
   - Expected monthly volume
4. Upload documents:
   - Company registration (CAC certificate)
   - ID of account holder
5. Click **Submit**
6. **Wait 3-7 business days** for approval

### Step 4: Create USSD Service
1. Go to **USSD** → **Services**
2. Click **Create New Service**
3. Fill in:

```
Service Name: MATASA Incident Report
Keyword: INCIDENT (or your preferred keyword)
Short Code: *384*154011#
Callback URL: https://your-domain.com/api/v1/ussd
Response Type: Text
```

4. Click **Save**

### Step 5: Configure Callback (Webhook)
1. In your service settings, find **Callback URL**
2. Set it to your app's endpoint:
   ```
   https://your-domain.com/api/v1/ussd
   ```
3. Method: **POST**
4. Content Type: **application/x-www-form-urlencoded**

### Step 6: Get API Credentials
1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "Production API")
4. Copy the key (starts with `ats_`)
5. **Save it somewhere safe** - you'll need it

---

## Option 2: Hub2 (Nigerian Provider)

### Step 1: Create Account
1. Go to https://hub2.com.ng
2. Sign up for an account
3. Verify email and phone

### Step 2: Apply for Short Code
1. Contact Hub2 support via email or WhatsApp
2. Request USSD short code
3. Provide:
   - Company name
   - Purpose (incident reporting for community safety)
   - Expected usage
4. Hub2 will guide you through the process
5. **Cost**: Typically cheaper than international providers

### Step 3: Get API Credentials
1. Hub2 will provide:
   - API Key
   - Short Code
   - API endpoint URL

### Step 4: Configure in Your App
```env
USSD_PROVIDER=hub2
HUB2_API_KEY=your_hub2_key
HUB2_SHORT_CODE=*384*154011#
```

---

## Option 3: Twilio (Alternative)

### Step 1: Create Account
1. Go to https://twilio.com
2. Sign up for free trial
3. Verify account

### Step 2: Buy Nigerian Number
1. Go to **Phone Numbers** → **Buy a Number**
2. Search for Nigerian number (+234)
3. Must have **USSD** capability
4. Cost: ~$1-2/month

### Step 3: Configure USSD
1. Click your number
2. Under **Voice**:
   - **A CALL COMES IN**: Webhook
   - URL: `https://your-domain.com/api/v1/ussd`
   - Method: POST

### Step 4: Get Credentials
1. Go to **Console Dashboard**
2. Find **Account SID** (starts with `AC`)
3. Create **Auth Token**

---

## Setting Up Your Server (Required)

Your app must be accessible via HTTPS. Here's how:

### Option A: Deploy to Vercel/Netlify (Easiest)
```bash
# Deploy your Node.js app
vercel --prod
# You'll get a URL like: https://your-app.vercel.app
```

### Option B: Deploy to Railway/Render
```bash
# Connect your GitHub repo
# Deploy automatically
# Get a domain like: https://your-app.railway.app
```

### Option C: DigitalOcean/AWS (More Control)
1. Create droplet/server
2. Install Node.js
3. Deploy app
4. Configure SSL (Let's Encrypt free)

### Configure Your Domain
Once you have a URL:
1. Go to Africa's Talking Dashboard
2. Update Callback URL to your domain:
   ```
   https://your-deployed-app.com/api/v1/ussd
   ```

---

## Testing Your USSD

### 1. Test Without Deployment (Simulation)
Use the simulate endpoint:
```bash
curl -X POST http://localhost:3000/api/v1/ussd/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "phoneNumber": "+2348012345678",
    "input": "",
    "language": "english"
  }'
```

### 2. Test After Deployment
1. Deploy your app
2. Get your HTTPS URL
3. Update Africa's Talking with the URL
4. Dial `*384*154011#` from a Nigerian phone
5. You should see:
   ```
   CON MATASA Incident Report
   1. Report Suspicious
   2. Report Incident
   3. Request Help
   4. Read Alerts
   5. Repeat
   ```

---

## Expected Response Flow

When user dials `*384*154011#`:

1. **First Request (no input)**
   ```
   POST /api/v1/ussd
   Body: { sessionId: "...", phoneNumber: "+2348...", text: "" }
   
   Response: "CON MATASA Incident Report\n1. Report Suspicious..."
   ```

2. **User selects "1"**
   ```
   POST /api/v1/ussd
   Body: { sessionId: "...", phoneNumber: "+2348...", text: "1" }
   
   Response: "CON What did you see?:\n1. Fight\n2. Gunshot..."
   ```

3. **User completes all steps**
4. **Final response**
   ```
   Response: "END Thank you! Your report submitted. ID: INC-ABC123"
   ```

---

## Troubleshooting

### "Webhook not receiving requests"
- Check your server is running
- Verify HTTPS certificate is valid
- Test URL with curl:
  ```bash
  curl -X POST https://your-domain.com/api/v1/ussd \
    -d "sessionId=test&phoneNumber=+2348&text="
  ```

### "Session timeout"
- Process requests in < 3 seconds
- Return quick acknowledgment first
- Queue slow operations

### "Invalid phone number"
- Format: `+2348012345678` or `08012345678`

### "Nothing happens when dialing"
- Short code may not be active yet
- Contact your provider
- Check if short code is approved

---

## Cost Estimation (Africa's Talking)

| Usage | Cost/Month |
|-------|------------|
| 1,000 users × 1 session each | ~$5 |
| 5,000 users × 2 sessions each | ~$50 |
| 10,000 users × 2 sessions each | ~$100 |

SMS notifications cost extra (~$0.01/message).

---

## Checklist Before Going Live

- [ ] Account created and verified
- [ ] Short code approved (for production)
- [ ] API credentials saved
- [ ] Webhook configured
- [ ] Server deployed with HTTPS
- [ ] Callback URL updated in dashboard
- [ ] Tested end-to-end
- [ ] Monitoring set up
- [ ] Response SLA configured
