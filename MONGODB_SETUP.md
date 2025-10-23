# MongoDB Atlas Setup Guide

## Current Issue: Authentication Failed

### Step-by-Step Fix

#### 1. Whitelist Your IP Address

**Go to MongoDB Atlas Dashboard:**
1. Navigate to https://cloud.mongodb.com
2. Select your project `OmniqCluster0`
3. Click **Network Access** in the left menu
4. Click **+ ADD IP ADDRESS** button

**Choose one option:**

**Option A: Add Current IP (Recommended for Production)**
- Click **ADD CURRENT IP ADDRESS**
- Click **Confirm**

**Option B: Allow All IPs (Easy for Development)**
- Click **ALLOW ACCESS FROM ANYWHERE**
- This adds `0.0.0.0/0`
- Click **Confirm**
- ⚠️ Warning: Only use this for development/testing

Wait 1-2 minutes for changes to propagate.

#### 2. Verify Database User Permissions

**Check User Permissions:**
1. Click **Database Access** in the left menu
2. Find user: `adminomniq_db_user`
3. Verify it has role: **Atlas admin** or **Read and write to any database**

**If user doesn't exist or needs update:**
1. Click **+ ADD NEW DATABASE USER**
2. Authentication Method: **Password**
3. Username: `adminomniq_db_user`
4. Password: (generate a new one or use existing)
5. Database User Privileges: **Built-in Role** → **Atlas admin**
6. Click **Add User**

#### 3. Update .env File

If you created a new password, update `.env`:

```env
MONGODB_URI=mongodb+srv://adminomniq_db_user:YOUR_NEW_PASSWORD@omniqcluster0.og0l86m.mongodb.net/business-analytics?retryWrites=true&w=majority
```

**Important:** If your password contains special characters, they need to be URL-encoded:

| Character | Encoded |
|-----------|---------|
| @         | %40     |
| :         | %3A     |
| /         | %2F     |
| ?         | %3F     |
| #         | %23     |
| [         | %5B     |
| ]         | %5D     |

#### 4. Test Connection Again

```bash
node test-connection.js
```

You should see:
```
✅ Successfully connected to MongoDB Atlas!
📊 Database: business-analytics
```

#### 5. Start the Application

```bash
npm run dev
```

## Troubleshooting

### Still Getting "Authentication Failed"?

1. **Double-check username and password**
   - No extra spaces
   - Correct capitalization
   - Special characters properly encoded

2. **Wait 1-2 minutes after changes**
   - IP whitelist changes take time to propagate
   - Database user updates need time to sync

3. **Try with a fresh user**
   - Create a completely new database user
   - Use a simple password (no special characters)
   - Update your `.env` file

### Connection Timeout?

1. **Check Network Access settings**
   - Make sure your IP is whitelisted
   - Try allowing all IPs temporarily

2. **Firewall/VPN issues**
   - Disable VPN temporarily
   - Check corporate firewall settings

### Need Help?

Run the test script with more details:

```bash
node test-connection.js
```

The error message will tell you exactly what's wrong.

## Current Configuration

- **Cluster**: omniqcluster0.og0l86m.mongodb.net
- **Database**: business-analytics
- **Username**: adminomniq_db_user
- **Connection Type**: MongoDB Atlas (Cloud)

## Next Steps After Connection Works

1. Start the server: `npm run dev`
2. Register a user: `POST /api/auth/register`
3. Connect your integrations
4. Start syncing data!
