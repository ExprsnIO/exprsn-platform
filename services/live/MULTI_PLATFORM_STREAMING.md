# Multi-Platform Streaming - Complete Guide

## Overview

Exprsn Live now supports **simultaneous multi-platform streaming (simulcasting)** to YouTube, Twitch, Facebook, Cloudflare Stream, and custom RTMP destinations. Stream to all platforms at once with independent health monitoring, automatic reconnection, and platform-specific optimizations.

## Features

### ✨ Core Capabilities

- **Simulcast Streaming**: Stream to multiple platforms simultaneously
- **Platform Support**: YouTube, Twitch, Facebook, Cloudflare Stream, Custom RTMP
- **OAuth Integration**: Seamless authentication for major platforms
- **Credential Encryption**: AES-256-GCM encryption for tokens and stream keys
- **Auto Reconnection**: Automatic retry with exponential backoff
- **Health Monitoring**: Real-time health checks and metrics for each destination
- **Platform Optimization**: Bitrate, resolution, and codec settings per platform
- **Dynamic Control**: Add/remove destinations during active streams

### 🎯 Use Cases

1. **Content Creators**: Stream to YouTube and Twitch simultaneously
2. **Enterprise Broadcasting**: Multi-platform corporate events
3. **Gaming Streamers**: Reach audiences across all major platforms
4. **Live Events**: Maximum reach with single source stream

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Exprsn Live Service                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Streaming Orchestrator                      │   │
│  │  • OAuth Management                                 │   │
│  │  • Destination Preparation                          │   │
│  │  • Health Monitoring                                │   │
│  │  • Automatic Failover                               │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼──────────────────────────────────┐   │
│  │         Simulcast Service                           │   │
│  │  • FFmpeg Process Management                        │   │
│  │  • Multi-destination Streaming                      │   │
│  │  • Real-time Metrics Collection                     │   │
│  │  • Stream Health Analysis                           │   │
│  └──────────┬────────┬─────────┬─────────┬────────────┘   │
│             │        │         │         │                 │
└─────────────┼────────┼─────────┼─────────┼─────────────────┘
              │        │         │         │
       ┌──────▼──┐ ┌──▼────┐ ┌──▼─────┐ ┌▼──────────┐
       │ YouTube │ │ Twitch│ │Facebook│ │ Cloudflare│
       │  Live   │ │       │ │  Live  │ │  Stream   │
       └─────────┘ └───────┘ └────────┘ └───────────┘
```

## API Endpoints

### Destination Management

#### List Destinations
```http
GET /api/destinations
Authorization: Bearer {token}

Query Parameters:
  - stream_id: UUID (optional)
  - platform: youtube|twitch|facebook|cloudflare|rtmp_custom (optional)
  - is_enabled: boolean (optional)

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "stream_id": "uuid",
      "platform": "youtube",
      "name": "My YouTube Channel",
      "status": "pending",
      "is_enabled": true,
      "viewer_count": 0,
      "playback_url": "https://youtube.com/watch?v=...",
      "settings": {
        "bitrate": 4500,
        "resolution": "1920x1080",
        "framerate": 30
      }
    }
  ]
}
```

#### Create Destination
```http
POST /api/destinations
Authorization: Bearer {token}
Content-Type: application/json

{
  "stream_id": "uuid",
  "platform": "youtube",
  "name": "My YouTube Stream",
  "is_enabled": true,
  "settings": {
    "bitrate": 4500,
    "resolution": "1920x1080",
    "framerate": 30,
    "auto_reconnect": true,
    "max_retries": 3
  }
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "stream_id": "uuid",
    "platform": "youtube",
    "name": "My YouTube Stream",
    "status": "pending",
    "is_enabled": true
  }
}
```

#### Get OAuth Authorization URL
```http
GET /api/destinations/platforms/:platform/auth-url
Authorization: Bearer {token}

Parameters:
  - platform: youtube|twitch|facebook

Response:
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "state": "random_state_token"
  }
}
```

#### Exchange OAuth Code for Tokens
```http
POST /api/destinations/platforms/:platform/exchange-token
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "oauth_authorization_code",
  "stream_id": "uuid",
  "name": "My Platform Stream"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "platform": "youtube",
    "name": "My Platform Stream",
    "token_expires_at": "2024-01-15T12:00:00Z"
  }
}
```

### Simulcast Control

#### Start Multi-Platform Streaming
```http
POST /api/simulcast/:streamId/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "inputSource": "rtmp://source/stream" // optional
}

Response:
{
  "success": true,
  "data": {
    "streamId": "uuid",
    "status": "live",
    "startedAt": "2024-01-15T12:00:00Z",
    "destinations": [
      {
        "id": "uuid",
        "platform": "youtube",
        "status": "connected"
      },
      {
        "id": "uuid",
        "platform": "twitch",
        "status": "connected"
      }
    ]
  }
}
```

#### Stop Simulcast
```http
POST /api/simulcast/:streamId/stop
Authorization: Bearer {token}

Response:
{
  "success": true,
  "message": "Simulcast stopped"
}
```

#### Get Stream Status
```http
GET /api/simulcast/:streamId/status
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "stream": {
      "id": "uuid",
      "title": "My Stream",
      "status": "live",
      "started_at": "2024-01-15T12:00:00Z",
      "viewer_count": 150
    },
    "destinations": [
      {
        "id": "uuid",
        "platform": "youtube",
        "name": "YouTube",
        "status": "live",
        "viewer_count": 100,
        "playback_url": "https://youtube.com/watch?v=..."
      }
    ],
    "simulcast": {
      "streamId": "uuid",
      "status": "live",
      "uptime": 3600000
    }
  }
}
```

#### Get Stream Health
```http
GET /api/simulcast/:streamId/health
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "streamId": "uuid",
    "overall": "healthy",
    "uptime": 3600000,
    "destinations": {
      "dest-uuid-1": {
        "platform": "youtube",
        "health": "healthy",
        "metrics": {
          "fps": 30.0,
          "bitrate": 4500,
          "framesSent": 108000,
          "bytesSent": 2048000000
        },
        "issues": []
      },
      "dest-uuid-2": {
        "platform": "twitch",
        "health": "degraded",
        "metrics": {
          "fps": 25.5,
          "bitrate": 3800,
          "framesSent": 91800,
          "bytesSent": 1700000000
        },
        "issues": ["Low FPS: 25.5"]
      }
    }
  }
}
```

#### Get Stream Metrics
```http
GET /api/simulcast/:streamId/metrics
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "startTime": 1705324800000,
    "bytesSent": 3748000000,
    "framesSent": 199800,
    "errors": [],
    "destinationMetrics": {
      "dest-uuid-1": {
        "platform": "youtube",
        "bytesSent": 2048000000,
        "framesSent": 108000,
        "bitrate": 4500,
        "fps": 30.0,
        "lastUpdate": 1705328400000
      }
    }
  }
}
```

## Platform-Specific Setup

### YouTube Live

1. **Get Authorization URL**:
   ```bash
   curl -X GET "https://live.exprsn.io/api/destinations/platforms/youtube/auth-url" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **User authenticates via returned URL**

3. **Exchange code for tokens**:
   ```bash
   curl -X POST "https://live.exprsn.io/api/destinations/platforms/youtube/exchange-token" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "code": "OAUTH_CODE",
       "stream_id": "STREAM_UUID",
       "name": "My YouTube Stream"
     }'
   ```

**YouTube-Specific Features**:
- Automatic broadcast and stream creation
- DVR support
- Content encryption options
- Custom thumbnail support
- Privacy settings (public, unlisted, private)

### Twitch

1. **Get Authorization URL**
2. **User authenticates**
3. **Exchange code**

**Twitch-Specific Features**:
- Stream key caching
- Game/category selection
- Stream title updates
- Channel information sync
- Low-latency mode

### Facebook Live

1. **Get Authorization URL**
2. **User authenticates**
3. **Exchange for long-lived token**
4. **Select Facebook Page**

**Facebook-Specific Features**:
- Page selection
- Privacy settings
- Scheduled streams
- Embed HTML generation
- Live video insights

### Cloudflare Stream

**Direct Configuration** (no OAuth):
```bash
curl -X POST "https://live.exprsn.io/api/destinations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stream_id": "STREAM_UUID",
    "platform": "cloudflare",
    "name": "Cloudflare Stream",
    "is_enabled": true
  }'
```

**Features**:
- Automatic live input creation
- Recording support
- HLS/DASH playback
- Global CDN delivery
- Video analytics

### Custom RTMP

For any RTMP-compatible service:
```bash
curl -X POST "https://live.exprsn.io/api/destinations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stream_id": "STREAM_UUID",
    "platform": "rtmp_custom",
    "name": "Custom RTMP Server",
    "rtmp_url": "rtmp://custom-server.com/live",
    "stream_key": "your-stream-key",
    "settings": {
      "bitrate": 3500,
      "resolution": "1280x720",
      "framerate": 30
    }
  }'
```

## Configuration

### Environment Variables

```bash
# Encryption (REQUIRED in production)
ENCRYPTION_KEY=your-secret-encryption-key-32-bytes

# YouTube OAuth
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret
YOUTUBE_REDIRECT_URI=https://yourapp.com/oauth/youtube/callback

# Twitch OAuth
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
TWITCH_REDIRECT_URI=https://yourapp.com/oauth/twitch/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=https://yourapp.com/oauth/facebook/callback

# Cloudflare Stream
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

### Platform Settings

Each destination supports custom settings:

```javascript
{
  "settings": {
    "bitrate": 4500,           // Video bitrate in kbps (500-20000)
    "resolution": "1920x1080", // Video resolution
    "framerate": 30,           // Frames per second (15-60)
    "preset": "veryfast",      // FFmpeg preset (ultrafast|veryfast|fast|medium|slow)
    "auto_start": false,       // Auto-start when stream goes live
    "auto_reconnect": true,    // Auto-reconnect on error
    "max_retries": 3          // Maximum reconnection attempts
  }
}
```

## Best Practices

### 1. Bitrate Management

Different platforms have different bitrate requirements:

| Platform   | Recommended Bitrate | Max Resolution |
|-----------|-------------------|---------------|
| YouTube   | 4500-9000 kbps    | 1080p/60fps   |
| Twitch    | 3000-6000 kbps    | 1080p/60fps   |
| Facebook  | 4000-6000 kbps    | 1080p/30fps   |
| Cloudflare| 3000-8000 kbps    | 1080p/60fps   |

**Tip**: Use lower bitrate for mobile networks, higher for desktop audiences.

### 2. Error Handling

```javascript
// Monitor health status
const health = await fetch('/api/simulcast/stream-id/health');

if (health.overall === 'degraded') {
  // Check individual destinations
  for (const [id, dest] of Object.entries(health.destinations)) {
    if (dest.health !== 'healthy') {
      console.log(`${dest.platform} issues:`, dest.issues);
      // Optionally stop problematic destination
      await fetch(`/api/simulcast/stream-id/destinations/${id}`, {
        method: 'DELETE'
      });
    }
  }
}
```

### 3. Bandwidth Considerations

**Total Upload Bandwidth** = Sum of all destination bitrates

Example:
- YouTube: 4500 kbps
- Twitch: 4500 kbps
- Facebook: 4000 kbps
- **Total**: 13000 kbps (13 Mbps upload required)

**Recommendation**: Have 2x the required upload bandwidth for stability.

### 4. Platform-Specific Optimization

```javascript
// YouTube - High quality, longer latency OK
{
  "platform": "youtube",
  "settings": {
    "bitrate": 6000,
    "resolution": "1920x1080",
    "framerate": 60,
    "preset": "fast"
  }
}

// Twitch - Lower latency, gaming focus
{
  "platform": "twitch",
  "settings": {
    "bitrate": 4500,
    "resolution": "1920x1080",
    "framerate": 60,
    "preset": "veryfast"
  }
}

// Facebook - Social focus, mobile viewers
{
  "platform": "facebook",
  "settings": {
    "bitrate": 4000,
    "resolution": "1280x720",
    "framerate": 30,
    "preset": "veryfast"
  }
}
```

## Security

### Credential Encryption

All sensitive credentials are encrypted using **AES-256-GCM**:
- OAuth access tokens
- OAuth refresh tokens
- RTMP stream keys

**Encryption Service Features**:
- Random IV for each encryption
- Authentication tags for integrity
- Scrypt key derivation
- No plaintext storage

### Token Refresh

Tokens are automatically refreshed when:
- Token expires within 5 minutes
- Platform API returns 401 Unauthorized
- Manual refresh requested

### Secure Logging

- Stream keys are masked in logs (only first 4 characters shown)
- OAuth tokens never logged
- Sensitive fields excluded from API responses

## Monitoring & Analytics

### Real-time Metrics

Each destination tracks:
- **FPS** (frames per second)
- **Bitrate** (current streaming bitrate)
- **Frames Sent** (total frames transmitted)
- **Bytes Sent** (total data transmitted)
- **Last Update** (last metrics update time)

### Health Monitoring

Automatic health checks every 30 seconds:
- **Healthy**: FPS ≥ 20, bitrate stable, updates current
- **Degraded**: Low FPS or bitrate issues
- **Stale**: No updates in 10+ seconds
- **Error**: Connection failed or max retries exceeded

### Event System

Subscribe to real-time events:

```javascript
orchestrator.on('stream:started', (data) => {
  console.log('Stream started:', data);
});

orchestrator.on('destination:error', (data) => {
  console.log('Destination error:', data);
});

orchestrator.on('health:degraded', (data) => {
  console.log('Health degraded:', data);
});

orchestrator.on('metrics:update', (data) => {
  console.log('Metrics update:', data);
});
```

## Troubleshooting

### FFmpeg Not Found

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Low FPS

**Causes**:
- Insufficient CPU power
- High encoding preset (slow/slower)
- Too many simultaneous destinations

**Solutions**:
- Use faster preset (veryfast/ultrafast)
- Reduce resolution or framerate
- Limit number of simultaneous destinations
- Upgrade server CPU

### Connection Errors

**Causes**:
- Invalid stream key
- Expired OAuth tokens
- Network issues
- Platform API rate limiting

**Solutions**:
- Verify credentials via test connection endpoint
- Check token expiration
- Implement retry logic with exponential backoff
- Monitor platform status pages

### High Latency

**Causes**:
- Keyframe interval too long
- Network congestion
- Platform-specific delays

**Solutions**:
- Reduce keyframe interval (2 seconds recommended)
- Use lower latency mode if available
- Select closest RTMP ingest server

## Next Steps

1. **Video Conferencing**: Consider integrating [LiveKit](https://livekit.io/) for real-time video calls
2. **Advanced Analytics**: Add viewer engagement tracking
3. **Chat Integration**: Unify chat from all platforms
4. **Scheduled Streams**: Pre-schedule multi-platform broadcasts
5. **Recording**: Automatic recording to all platforms

## Support

For issues or questions:
- GitHub Issues: https://github.com/exprsn/exprsn-live/issues
- Documentation: https://docs.exprsn.io/live
- Email: support@exprsn.io
