# Quick Start - Phase 1 Admin Dashboard

**Goal:** Get the new PowerApps-inspired admin dashboard running in 5 minutes.

---

## ⚡ Quick Start (3 Steps)

### Step 1: Run Migration
```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
node scripts/migrate.js
```

Expected output:
```
Database connection established
Found 1 pending migration(s)
Running migration: 20251225180000-create-setup-dashboard-tables.js
✓ Migration completed: 20251225180000-create-setup-dashboard-tables.js
✓ All migrations completed successfully
```

### Step 2: Start Server
```bash
cd /Users/rickholland/Downloads/Exprsn
npm start
```

Or for SVR only:
```bash
npm run dev:svr
```

### Step 3: Access Dashboard
Open your browser to:
```
http://localhost:5001/setup
```

Or with TLS:
```
https://localhost:5001/setup
```

---

## 🎨 What You'll See

### Home Dashboard
- **Header** with logo, command palette button, notifications, dark mode toggle, settings
- **Sidebar** with navigation (Dashboard, Management, Database, Security, Monitoring)
- **Main Content** with 4 customizable cards:
  1. System Health (services, database, Redis)
  2. Recent Activity (last 10 actions)
  3. Quick Actions (create app, run migrations, design schema)
  4. Usage Analytics (apps, users, API calls, storage)

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (or `Cmd+K`) | Open command palette |
| `Esc` | Close command palette |
| Click moon/sun icon | Toggle dark mode |

---

## 🔧 Features to Try

### 1. **Toggle Dark Mode**
- Click the moon icon in the header
- Theme will switch and save to localStorage
- Refresh page - theme persists!

### 2. **Open Command Palette**
- Press `Ctrl+K` (or `Cmd+K` on Mac)
- See quick actions
- Click any action to navigate
- Press `Esc` to close

### 3. **Navigate Sidebar**
- Click any menu item
- Notice active state highlighting
- Try: Dashboard, Services, Database, Security, Analytics

### 4. **Drag Cards** (GridStack)
- Hover over any card header
- Drag to rearrange position
- Cards will reflow automatically
- (Note: Saving layout requires user authentication - Phase 4)

### 5. **Auto-Refresh**
- Dashboard data refreshes every 30 seconds
- Check browser console for refresh logs
- System health updates in real-time

---

## 📊 API Testing

Test the new API endpoints:

```bash
# Get dashboard cards (default layout)
curl http://localhost:5001/setup/api/home/cards

# Get real-time dashboard data
curl http://localhost:5001/setup/api/home/dashboard-data

# Get specific card data
curl "http://localhost:5001/setup/api/home/dashboard-data?cards=system_health,recent_activity"
```

---

## 🐛 Troubleshooting

### Migration Error
**Problem:** `relation "setup_dashboard_cards" does not exist`
**Solution:**
```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
node scripts/migrate.js
```

### Port Already in Use
**Problem:** `Error: listen EADDRINUSE: address already in use :::5001`
**Solution:**
```bash
# Find process using port 5001
lsof -i :5001

# Kill the process
kill -9 <PID>

# Or use different port
PORT=5002 npm run dev:svr
```

### Dark Mode Not Saving
**Problem:** Theme resets on refresh
**Solution:** Check browser localStorage:
```javascript
// In browser console
localStorage.getItem('theme')  // Should return 'light' or 'dark'
```

### Services Showing as Stopped
**Problem:** All services show red status
**Solution:** Make sure other Exprsn services are running:
```bash
# Start all services
cd /Users/rickholland/Downloads/Exprsn
npm start

# Or start specific services
npm run dev:ca      # Port 3000
npm run dev:auth    # Port 3001
npm run dev:timeline # Port 3004
```

---

## 📁 Key Files Created

| File | Purpose |
|------|---------|
| `controllers/setup/HomeController.js` | Dashboard logic |
| `services/setup/ServiceHealthService.js` | Service monitoring |
| `services/setup/ActivityService.js` | Activity tracking |
| `services/setup/AlertService.js` | Alert management |
| `models/DashboardCard.js` | Card layout model |
| `routes/setup-v2.js` | Enhanced routes |
| `views/setup/home.ejs` | Dashboard UI |
| `migrations/20251225180000-create-setup-dashboard-tables.js` | Database setup |

---

## 🎯 Next Steps

Once Phase 1 is working, you can:

1. **Explore the sidebar** - All menu items are placeholders for future phases
2. **Test dark mode** - Ensure theme persists across sessions
3. **Try command palette** - Press Ctrl+K and explore commands
4. **Monitor services** - Watch System Health card for real-time updates
5. **Check browser console** - See auto-refresh logs

---

## 📚 Full Documentation

For complete details, see:
- **`PHASE_1_IMPLEMENTATION_COMPLETE.md`** - Full implementation details
- **`SETUP_DIRECTIVE_DESIGN.md`** - Complete 8-phase roadmap

---

## ✅ Success Checklist

- [ ] Migration ran successfully
- [ ] Server started on port 5001
- [ ] Dashboard loads at `/setup`
- [ ] Dark mode toggle works
- [ ] Command palette opens with Ctrl+K
- [ ] Sidebar navigation shows all sections
- [ ] System Health card shows service status
- [ ] Cards can be dragged and rearranged
- [ ] Console shows 30s auto-refresh

**All checked?** 🎉 **Phase 1 is working perfectly!**

---

**Ready for Phase 2?** See `SETUP_DIRECTIVE_DESIGN.md` for Database & Schema Management features!
