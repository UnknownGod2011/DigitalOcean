# Deploying Cursivis to DigitalOcean

This guide covers deploying the Cursivis Gradient AI Agent to DigitalOcean App Platform.

---

## Prerequisites

1. DigitalOcean account
2. GitHub account with your code pushed
3. MODEL_ACCESS_KEY from DigitalOcean Gradient AI Platform
4. `doctl` CLI installed (optional, for CLI deployment)

---

## Option 1: Deploy via DigitalOcean Control Panel (Easiest)

### Step 1: Push to GitHub

```bash
# Create new repo on GitHub
# Then push your code:
cd cursivis-gradient
git init
git add .
git commit -m "Initial commit - DigitalOcean Gradient AI Hackathon"
git remote add origin https://github.com/your-username/cursivis-gradient.git
git push -u origin main
```

### Step 2: Create App on DigitalOcean

1. Go to https://cloud.digitalocean.com/apps
2. Click "Create App"
3. Select "GitHub" as source
4. Authorize DigitalOcean to access your repo
5. Select your `cursivis-gradient` repository
6. Select `main` branch
7. Click "Next"

### Step 3: Configure App

**Source Directory:**
- Set to: `backend/gradient-agent`

**Environment Variables:**
- Click "Edit" next to Environment Variables
- Add:
  - `MODEL_ACCESS_KEY` = your_key_here (mark as SECRET)
  - `GRADIENT_TEXT_MODEL` = `anthropic-claude-4.5-haiku`
  - `GRADIENT_VOICE_MODEL` = `openai-gpt-4o`
  - `PORT` = `8080`

**Build Settings:**
- Build Command: `npm install`
- Run Command: `node src/server.js`

**HTTP Port:**
- Set to: `8080`

**Health Check:**
- HTTP Path: `/health`

### Step 4: Deploy

1. Click "Next" through remaining steps
2. Review configuration
3. Click "Create Resources"
4. Wait 3-5 minutes for deployment

### Step 5: Test Your Deployment

Once deployed, you'll get a URL like:
```
https://cursivis-gradient-agent-xxxxx.ondigitalocean.app
```

Test it:
```bash
curl -X POST https://your-app-url.ondigitalocean.app/agent \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Hello from production!\",\"mode\":\"smart\"}"
```

---

## Option 2: Deploy via doctl CLI

### Step 1: Install doctl

**Windows (PowerShell):**
```powershell
# Download from GitHub releases
# https://github.com/digitalocean/doctl/releases

# Or use Chocolatey:
choco install doctl
```

**Mac:**
```bash
brew install doctl
```

**Linux:**
```bash
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz
tar xf doctl-1.104.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin
```

### Step 2: Authenticate

```bash
doctl auth init
# Enter your DigitalOcean API token when prompted
```

### Step 3: Create App

```bash
cd cursivis-gradient
doctl apps create --spec .do/app.yaml
```

### Step 4: Get App ID and Monitor

```bash
# List apps
doctl apps list

# Get deployment status
doctl apps get <app-id>

# View logs
doctl apps logs <app-id> --type run
```

---

## Option 3: Deploy via Dockerfile

### Step 1: Build Docker Image

```bash
cd cursivis-gradient/backend/gradient-agent

# Build
docker build -t cursivis-gradient-agent .

# Test locally
docker run -p 8080:8080 \
  -e MODEL_ACCESS_KEY=your_key_here \
  -e GRADIENT_TEXT_MODEL=anthropic-claude-4.5-haiku \
  cursivis-gradient-agent
```

### Step 2: Push to DigitalOcean Container Registry

```bash
# Create registry (if you don't have one)
doctl registry create cursivis-registry

# Login
doctl registry login

# Tag image
docker tag cursivis-gradient-agent registry.digitalocean.com/cursivis-registry/gradient-agent:latest

# Push
docker push registry.digitalocean.com/cursivis-registry/gradient-agent:latest
```

### Step 3: Deploy to App Platform

1. Go to https://cloud.digitalocean.com/apps
2. Click "Create App"
3. Select "DigitalOcean Container Registry"
4. Select your image
5. Configure environment variables
6. Deploy

---

## Monitoring and Logs

### View Logs

**Via Control Panel:**
1. Go to your app
2. Click "Runtime Logs" tab
3. View real-time logs

**Via CLI:**
```bash
doctl apps logs <app-id> --type run --follow
```

### View Metrics

1. Go to your app in Control Panel
2. Click "Insights" tab
3. View:
   - Request rate
   - Response time
   - Error rate
   - CPU/Memory usage

### Health Checks

The app includes a `/health` endpoint:
```bash
curl https://your-app-url.ondigitalocean.app/health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2026-03-18T10:30:00.000Z",
  "service": "cursivis-gradient-agent",
  "version": "1.0.0"
}
```

---

## Scaling

### Manual Scaling

**Via Control Panel:**
1. Go to your app
2. Click "Settings" tab
3. Adjust "Instance Count"
4. Click "Save"

**Via CLI:**
```bash
doctl apps update <app-id> --spec .do/app.yaml
```

### Auto-Scaling (Future)

DigitalOcean App Platform supports auto-scaling. Update `.do/app.yaml`:

```yaml
services:
  - name: gradient-agent
    instance_count: 1
    autoscaling:
      min_instance_count: 1
      max_instance_count: 5
      metrics:
        cpu:
          percent: 80
```

---

## Cost Estimation

### App Platform Costs

| Instance Size | vCPU | RAM | Price/Month |
|---|---|---|---|
| Basic XXS | 0.5 | 512 MB | $5 |
| Basic XS | 1 | 1 GB | $12 |
| Basic S | 1 | 2 GB | $24 |

### DigitalOcean Gradient AI Costs

**Serverless Inference (Pay-per-token):**

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| Claude 4.5 Haiku | $0.80 | $4.00 |
| GPT-4o | $2.50 | $10.00 |
| GTE Large v1.5 | $0.10 | N/A |

**Example Monthly Cost:**
- App Platform (Basic XXS): $5
- 1M input tokens (Claude): $0.80
- 250K output tokens (Claude): $1.00
- **Total: ~$7/month** for moderate usage

---

## Troubleshooting

### Deployment Failed

**Check build logs:**
```bash
doctl apps logs <app-id> --type build
```

**Common issues:**
- Missing `package.json` in source directory
- Wrong source directory path
- Missing environment variables

### App Crashes on Startup

**Check runtime logs:**
```bash
doctl apps logs <app-id> --type run
```

**Common issues:**
- Invalid MODEL_ACCESS_KEY
- Model not available in region
- Port mismatch (must be 8080)

### Health Check Failing

**Verify health endpoint:**
```bash
curl https://your-app-url.ondigitalocean.app/health
```

**Common issues:**
- App not listening on port 8080
- Health check path incorrect
- App taking too long to start

---

## Production Best Practices

### 1. Use Environment Variables

Never hardcode:
- MODEL_ACCESS_KEY
- API endpoints
- Secrets

### 2. Enable CORS

For browser-based clients, enable CORS in `app.js`:
```javascript
import cors from 'cors';
app.use(cors({
  origin: ['https://your-frontend.com'],
  credentials: true
}));
```

### 3. Add Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/agent', limiter);
```

### 4. Monitor Costs

- Set up billing alerts in DigitalOcean
- Monitor token usage in logs
- Use prompt caching to reduce costs

### 5. Implement Caching

Cache frequent requests:
```javascript
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 600 }); // 10 min TTL
```

---

## Next Steps

1. Deploy to production
2. Test all endpoints
3. Monitor logs and metrics
4. Set up custom domain (optional)
5. Add to hackathon submission

---

## Support

- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
- Gradient AI Docs: https://docs.digitalocean.com/products/gradient-ai-platform/
- Community: https://www.digitalocean.com/community/

