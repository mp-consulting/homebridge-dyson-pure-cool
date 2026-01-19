# Discovery

Device discovery mechanisms - Find devices on network and retrieve credentials from Dyson cloud.

## Structure

```
discovery/
├── index.ts           # Module exports
├── types.ts           # Discovery type definitions
├── cloudApi.ts        # Dyson Cloud API client
└── mdnsDiscovery.ts   # mDNS/Bonjour discovery
```

## Files

### types.ts
TypeScript interfaces for discovery:
- `AuthResponse`, `ChallengeResponse`: Cloud authentication
- `CloudDeviceInfo`: Device info from cloud
- `DeviceCredentials`: Local MQTT credentials (encrypted)
- `CloudApiError`: Error handling types

### cloudApi.ts
Authenticates with Dyson cloud and retrieves device list.

**Authentication Flow:**
1. `POST /v3/userregistration/email/auth` - Request OTP, get challengeId
2. `POST /v3/userregistration/email/verify` - Verify OTP + password, get token
3. `GET /v2/provisioningservice/manifest` - Retrieve devices with encrypted credentials

**Key Features:**
- Decrypts local MQTT credentials (AES-256)
- Rate limiting (1 second between requests)
- 15 second default timeout

### mdnsDiscovery.ts
Discovers devices on local network via mDNS/Bonjour.

**Service Type:** `_dyson_mqtt._tcp`

**Features:**
- Extracts serial number from mDNS service name
- Prefers IPv4 addresses
- Configurable timeout (1000-60000 ms, default 10000)
- Optional max device limit

## Discovery Modes

### Cloud + mDNS (Recommended)
1. Authenticate with Dyson cloud
2. Retrieve device list with encrypted credentials
3. Discover device IPs via mDNS
4. Connect using local MQTT

### Manual Configuration
- User provides serial, credentials, and IP address
- Skips cloud authentication
- Useful when cloud access is unavailable
