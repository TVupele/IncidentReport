# MongoDB Atlas Setup Guide (Free Tier)

Follow these steps to set up a free cloud MongoDB database.

## Step 1: Create MongoDB Atlas Account

1. Go to https://cloud.mongodb.com
2. Click **"Try Free"** or **"Sign In"**
3. Create account with your email
4. Verify email address

## Step 2: Create Free Cluster

1. After login, click **"Create a Cluster"**
2. Choose **"Free"** tier (M0)
3. Select **"Google Cloud"** as provider (closest to Nigeria)
4. Select region: **"us-east-1"** (Virginia) or **"europe-west1"** (Belgium)
5. Click **"Create Cluster"** (may take 1-3 minutes)

## Step 3: Create Database User

1. Click **"Database Access"** in left sidebar
2. Click **"Add New Database User"**
3. Enter:
   - **Username**: `matasa_admin`
   - **Password**: Generate a secure password (copy it!)
   - **Built-in Role**: `Atlas admin`
4. Click **"Add User"**

## Step 4: Configure Network Access

1. Click **"Network Access"** in left sidebar
2. Click **"Add IP Address"**
3. Select **"Allow Access from Anywhere"** (0.0.0.0/0)
4. Click **"Confirm"**

## Step 5: Get Connection String

1. Click **"Clusters"** in left sidebar
2. Click **"Connect"** button on your cluster
3. Select **"Connect your application"**
4. Copy the connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/incident_report?retryWrites=true&w=majority
   ```

## Step 6: Update .env File

Edit your `.env` file and replace with your credentials:

```env
# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://matasa_admin:YOUR_PASSWORD_HERE@cluster0.xxxxx.mongodb.net/incident_report?retryWrites=true&w=majority
```

**Important:** Replace `YOUR_PASSWORD_HERE` with the password you created in Step 3.

## Step 7: Start the Application

```bash
cd c:/Users/George/Desktop/Incident Report
npm start
```

If connected successfully, you should see:
```
Connecting to MongoDB...
MongoDB connected
Server running on port 3000
```

## Step 8: Verify in Browser

Open http://localhost:3000/health

You should see:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 0,
  "environment": "development"
}
```

## Troubleshooting

### "Authentication failed"
- Check username/password in connection string
- Ensure database user is created

### "Network is unreachable"
- Check Network Access allows 0.0.0.0/0
- Try different region

### "Connection timeout"
- Check internet connection
- Try again in a few minutes

## Alternative: Use MongoDB Compass (GUI)

1. Download MongoDB Compass: https://www.mongodb.com/try/download/compass
2. Install and open
3. Paste connection string
4. View database visually

## Security Notes

- **Never commit** `.env` file to git
- **Keep password** secure
- For production, restrict IP access
- Consider using environment variables
