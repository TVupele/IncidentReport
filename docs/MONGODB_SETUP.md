# MongoDB Setup Options

Your MongoDB Atlas cluster `incidentresponse.wybxdqt.mongodb.net` is not accessible. You have two options:

## Option 1: Create New MongoDB Atlas Cluster (Recommended)

1. Go to https://cloud.mongodb.com
2. Sign in or create a free account
3. Create a new free cluster (M0 tier)
4. In "Network Access", add IP `0.0.0.0/0` (Allow from Anywhere)
5. In "Database Access", create a user with "Atlas admin" role
6. Click "Connect" → "Connect your application"
7. Copy the connection string (replace `<password>` with your user's password):
   ```
   mongodb+srv://<username>:<password>@<cluster-name>.wybxdqt.mongodb.net/incident_report?retryWrites=true&w=majority
   ```
8. Update your `.env` file:
   ```
   MONGODB_URI=mongodb+srv://your_username:your_password@your_cluster_name.wybxdqt.mongodb.net/incident_report?retryWrites=true&w=majority
   ```

## Option 2: Install MongoDB Locally

1. Download MongoDB Community Server: https://www.mongodb.com/try/download/community
2. Install and start MongoDB service
3. Update your `.env` file:
   ```
   MONGODB_URI=mongodb://localhost:27017/incident_report
   ```

## Quick Test

After setting up MongoDB, run:
```bash
npm start
```

You should see:
```
Server running on port 3000
Environment: development
USSD Short Code: *123#
```
