# Troubleshooting: Low-Code Platform Applications Not Loading

**Issue Date:** December 24, 2024
**Status:** ✅ RESOLVED
**Severity:** Medium - Blocks Low-Code Platform development

---

## Problem Summary

The Low-Code Platform applications page (`https://localhost:5001/lowcode/applications`) was loading, but the applications list remained empty with an infinite loading spinner. The API endpoint `/lowcode/api/applications` was hanging indefinitely without returning any response.

### Symptoms

- ✅ Server started successfully on port 5001
- ✅ Health endpoint working (`/health`)
- ✅ Other API endpoints working (e.g., `/api/decision-tables`)
- ❌ **Low-Code applications API endpoint hanging:** `/lowcode/api/applications`
- ❌ No SQL queries being executed for applications endpoint
- ❌ Request logs showing `- ms -` (incomplete requests)

---

## Root Cause Analysis

### 1. Authentication Middleware Blocking

The Low-Code Platform uses CA token authentication middleware (`caTokenAuth`) defined in:
```
/lowcode/middleware/caTokenAuth.js
```

This middleware is applied to **ALL** Low-Code API routes in:
```
/lowcode/routes/index.js (line 55)
```

### 2. CA Token Validation Hanging

The `caTokenAuth` middleware attempts to validate CA tokens by connecting to the **exprsn-ca** service (Port 3000). When `LOW_CODE_DEV_AUTH` is **not set to `true`**, the middleware:

1. Tries to validate the CA token using `validateCAToken` from `@exprsn/shared`
2. Attempts to connect to exprsn-ca service
3. **Hangs indefinitely** when exprsn-ca is not running

### 3. Development Bypass Not Enabled

The middleware supports a development bypass mode that allows local testing without requiring the full CA infrastructure:

```javascript
// From /lowcode/middleware/caTokenAuth.js (lines 37-50)
const isDevelopment = process.env.NODE_ENV === 'development';
const bypassEnabled = process.env.LOW_CODE_DEV_AUTH === 'true';

if (isDevelopment && bypassEnabled) {
  logger.warn('[CA Auth] Development bypass enabled - using dummy user');
  req.user = DEV_USER;  // Dummy user with full permissions
  return next();
}
```

**The bypass requires BOTH:**
- `NODE_ENV=development`
- `LOW_CODE_DEV_AUTH=true` ← **This was missing!**

---

## Solution

### Quick Fix (Recommended for Development)

Start the server with the development bypass enabled:

```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
LOW_CODE_DEV_AUTH=true NODE_ENV=development npm start
```

### Verification

After starting with the bypass, you should see in the logs:
```
[CA Auth] Development bypass enabled - using dummy user
```

And API requests will complete successfully:
```
GET /lowcode/api/applications [200] 61.146 ms - 3542
```

### Alternative Fix (Production Setup)

For production or full integration testing, start the **exprsn-ca** service first:

```bash
# Terminal 1: Start CA service (must start FIRST)
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-ca
npm start

# Terminal 2: Start exprsn-svr (after CA is running)
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npm start
```

---

## Understanding the Development User

When `LOW_CODE_DEV_AUTH=true` is enabled, the middleware creates a dummy development user:

```javascript
const DEV_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'developer@exprsn.local',
  username: 'developer',
  role: 'admin',
  permissions: {
    read: true,
    write: true,
    delete: true,
    update: true,
    append: true
  }
};
```

This user has **full permissions** and is used for all Low-Code API requests during development.

---

## Security Notes

⚠️ **IMPORTANT:** The `LOW_CODE_DEV_AUTH=true` bypass should **NEVER** be used in production.

### Production Security Requirements

1. **CA Token Validation:** All requests require valid CA tokens from exprsn-ca
2. **OCSP Checking:** Certificate revocation status is verified
3. **Permission Validation:** Fine-grained permission checking per resource
4. **Audit Logging:** All authentication attempts are logged
5. **Rate Limiting:** Protection against brute force attacks

### Development Security

- Development bypass logs a warning: `[CA Auth] Development bypass enabled`
- All requests use the same DEV_USER
- No actual token validation occurs
- Suitable only for local development

---

## Testing the Fix

### 1. Test API Endpoint Directly

```bash
curl -k https://localhost:5001/lowcode/api/applications
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "total": 8,
    "applications": [
      {
        "id": "...",
        "name": "task-manager",
        "displayName": "Task Manager",
        ...
      }
    ],
    "limit": 25,
    "offset": 0,
    "hasMore": false
  }
}
```

### 2. Test in Browser

Navigate to: `https://localhost:5001/lowcode/applications`

You should see:
- ✅ Applications page loads
- ✅ List of applications displayed
- ✅ "Create Application" button functional
- ✅ No infinite loading spinners

### 3. Verify Server Logs

Check for these log entries:
```
[CA Auth] Development bypass enabled - using dummy user
Executing (default): SELECT count(*) AS "count" FROM "applications"...
GET /lowcode/api/applications [200] 61.146 ms - 3542
```

---

## Diagnostic Commands

### Check if Server is Running
```bash
lsof -i :5001
```

### Check Server Logs
```bash
# If using npm start in background
tail -f logs/combined.log
```

### Test Health Endpoint
```bash
curl -k https://localhost:5001/health
```

### Test Low-Code Health
```bash
curl -k https://localhost:5001/lowcode/api/health
```

---

## Related Files

### Key Files Modified/Investigated

1. `/lowcode/middleware/caTokenAuth.js` - Authentication middleware
2. `/lowcode/routes/index.js` - API route mounting
3. `/lowcode/routes/applications.js` - Applications route handler
4. `/lowcode/services/ApplicationService.js` - Business logic
5. `/lowcode/models/index.js` - Database model loading

### Configuration Files

- `.env` - Environment variables (add `LOW_CODE_DEV_AUTH=true`)
- `/lowcode/config.js` - Low-Code platform configuration

---

## Recommended Startup Script

Create a startup script for development:

```bash
#!/bin/bash
# start-lowcode-dev.sh

echo "Starting exprsn-svr with Low-Code development mode..."
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
LOW_CODE_DEV_AUTH=true NODE_ENV=development npm start
```

Make it executable:
```bash
chmod +x start-lowcode-dev.sh
./start-lowcode-dev.sh
```

---

## Future Improvements

### 1. Add to .env.example

```env
# Low-Code Platform Development
LOW_CODE_DEV_AUTH=true  # Enable auth bypass for local development (NEVER use in production)
```

### 2. Update npm Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "dev:lowcode": "LOW_CODE_DEV_AUTH=true NODE_ENV=development node index.js",
    "start:lowcode": "node index.js"
  }
}
```

### 3. Add Startup Check

Enhance the middleware to provide clearer error messages when CA is unreachable:

```javascript
// Proposed improvement to /lowcode/middleware/caTokenAuth.js
if (!isDevelopment || !bypassEnabled) {
  // Check if CA service is reachable before attempting validation
  const caReachable = await checkCAHealth();
  if (!caReachable) {
    logger.error('[CA Auth] CA service unreachable. Set LOW_CODE_DEV_AUTH=true for development');
    return res.status(503).json({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'CA authentication service is unavailable. For development, set LOW_CODE_DEV_AUTH=true'
    });
  }
}
```

---

## Conclusion

✅ **Issue Resolved:** Applications now load successfully with development bypass enabled

### Summary of Changes
- **No code changes required** - configuration issue only
- **Solution:** Set `LOW_CODE_DEV_AUTH=true` environment variable
- **Result:** Low-Code Platform fully functional for development

### Next Steps
1. Test other Low-Code features (entities, forms, grids)
2. Consider creating development startup scripts
3. Document environment variables in README
4. Add better error messages for common configuration issues

---

**Implementation Complete!** The Low-Code Platform is now ready for development and testing. 🎉
