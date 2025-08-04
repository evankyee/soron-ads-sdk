# Soron Ads SDK

Native ads SDK for chat and AI applications.

## Quick Start

```html
<script src="soron-ads-sdk.js"></script>

<script>
// 1. Initialize with your publisher key
SoronAds.init('publisher-YOUR-KEY-HERE');

// 2. When user sends a message, get an ad
async function handleUserMessage(message) {
  const adContent = await SoronAds.getFormattedAd(message);
  if (adContent) {
    // 3. Display it however you show messages
    displayMessage(adContent);  // Use your own chat display function
  }
}
</script>
```

## How to Add to Your Chat

### Method 0a: Simple Chat Function (Sequential):
```javascript
// Your chat message handler
async function onUserMessage(message) {
  // 1. Show user message
  addToChat('user', message);
  
  // 2. Get and show AI response
  const aiResponse = await callYourAI(message);
  addToChat('assistant', aiResponse);
  
  // 3. Get and show ad (formatted and ready to display)
  const adContent = await SoronAds.getFormattedAd(message);
  if (adContent) {
    addToChat('assistant', adContent);
  }
}

// Example display function
function addToChat(role, content) {
  const chatDiv = document.getElementById('chat');
  const messageDiv = document.createElement('div');
  messageDiv.className = role;
  messageDiv.innerHTML = content;  // Use innerHTML for formatted ads
  chatDiv.appendChild(messageDiv);
}
```

### Method 0b: Parallel Fetching:
```javascript
// Fetch AI and ad in parallel - display each as soon as ready
async function onUserMessage(message) {
  // 1. Show user message
  addToChat('user', message);
  
  // 2. Start BOTH requests at the same time
  const aiPromise = callYourAI(message).then(response => {
    addToChat('assistant', response);  // Show immediately when ready
    return response;
  });
  
  const adPromise = SoronAds.getFormattedAd(message).then(adContent => {
    if (adContent) {
      addToChat('assistant', adContent);  // Show immediately when ready
    }
    return adContent;
  });
  
  // 3. Wait for both to complete (optional - for error handling)
  await Promise.allSettled([aiPromise, adPromise]);
}
```

**Key Requirements for Parallel:**
- Use `.then()` to display each response immediately
- Start both requests before awaiting either
- Each response displays independently as it arrives

### Method 1: Direct HTML
```javascript
// If your chat is a simple div with messages
const adContent = await SoronAds.getFormattedAd(message);
if (adContent) {
  const messageHtml = `<div class="bot-message">${adContent}</div>`;
  document.getElementById('chat').innerHTML += messageHtml;
}
```

### Method 2: Creating DOM Elements
```javascript
// If you create elements for each message
const adContent = await SoronAds.getFormattedAd(message);
if (adContent) {
  const msgElement = document.createElement('div');
  msgElement.className = 'message bot';
  msgElement.innerHTML = adContent;  // Must use innerHTML for links
  chatContainer.appendChild(msgElement);
}
```

### Method 3: Using Raw Ad Data
```javascript
// If you need more control over formatting
const ad = await SoronAds.getAd(message);
if (ad) {
  // Build your own message format
  const message = {
    text: ad.content,
    author: ad.advertiser,
    link: ad.clickUrl,
    type: 'sponsored'
  };
  displayYourWay(message);
}
```

**💡 Parallel Tip:** To make any of these methods parallel, simply remove `await` and add `.then()`:
```javascript
// Instead of: const adContent = await SoronAds.getFormattedAd(message);
// Use: SoronAds.getFormattedAd(message).then(adContent => { /* your code */ });
```

## What You Get

### Using SDK (Recommended)

```javascript
// Returns formatted HTML ready to display:
const adContent = await SoronAds.getFormattedAd(message);
// Returns: "Check out our premium laptops perfect for gaming!<br><br>— <a href='...' target='_blank'>TechCorp</a>"
```

### Getting Raw Ad Object

```javascript
const ad = await SoronAds.getAd(message);
// Returns object with these fields:
{
  content: "Check out our premium laptops perfect for gaming!",  // The ad text
  advertiser: "TechCorp",                                        // Company name
  id: "campaign-123",                                            // Campaign ID
  url: "https://techcorp.com/laptops",                         // Final destination
  clickUrl: "https://api.../track/click/xyz",                  // TRACKING URL - USE THIS!
  pixelUrl: "https://api.../track/imp/abc",                    // Impression tracker
  cta: "Shop Now",                                              // Call-to-action text
  bidCpm: 25.5,                                                 // CPM bid amount
  source: "direct"                                              // Ad source
}
```

## Direct API Usage (Advanced)

If you can't use the SDK, here's the raw API:

```javascript
// 1. Make API request
const response = await fetch('https://soron.ai/user-query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'publisher-YOUR-KEY-HERE'  // Your publisher key
  },
  body: JSON.stringify({
    userPrompt: 'user message here',        // What the user said
    userId: 'user-123',                     // Unique user ID
    platform: 'web'                         // Platform type
  })
});

// 2. Get the response
const data = await response.json();
/* Response format:
{
  ads: [{
    content: "ad text...",        // Display this
    advertiser: "CompanyName",    // Display this
    clickUrl: "https://...",      // Use for ALL links
    pixelUrl: "https://...",      // Fire this for impressions
    url: "https://...",          // DON'T use directly
    ... other fields
  }],
  total: 1
}
*/

// 3. Display the ad
if (data.ads && data.ads.length > 0) {
  const ad = data.ads[0];
  
  // REQUIRED: Fire impression pixel for billing
  const img = new Image();
  img.src = ad.pixelUrl;
  
  // Display in your chat. Example:
  const adHtml = `${ad.content}<br><br>— <a href="${ad.clickUrl}" target="_blank">${ad.advertiser}</a>`;
  displayInChat(adHtml);
}
```

## Important Notes

1. **Always use `clickUrl`** - It tracks clicks then redirects to the advertiser
2. **Never use `url` directly** - This bypasses tracking
3. **Fire the pixel** - The `pixelUrl` must be loaded for billing to work
4. **Use innerHTML** - SDK handles HTML formatting. Direct API allows custom formatting.

## Parallel Fetching Tips

**When to use parallel fetching:**
- Chat applications where you show AI responses
- Any time you're fetching ads alongside other API calls
- When minimizing latency is critical

```javascript
// BAD - Sequential (AI waits for ad)
const ad = await SoronAds.getFormattedAd(message);
const ai = await callYourAI(message);

// GOOD - Parallel (both start immediately)
const adPromise = SoronAds.getFormattedAd(message);
const aiPromise = callYourAI(message);
```

## Troubleshooting

```javascript
// Enable debug logging
SoronAds.init('publisher-YOUR-KEY-HERE', { debug: true });

// Check browser console for:
// - "Fetching ad..." messages
// - API responses
// - Error details
```

