# Multi-Character Story API Integration Guide

## Overview

The Story API now supports **1-4 character face photos** for generating personalized storybooks. This guide explains how to update your web application from single-image to multi-image support.

---

## API Endpoint

```
POST https://story-api-502566942325.us-central1.run.app/generate-ebook-async
```

**Authentication:** Requires Google Cloud IAM authentication token in `Authorization: Bearer <token>` header.

---

## Breaking Change: Field Name

### ❌ OLD (Single Image - Deprecated)

```javascript
const formData = new FormData();
formData.append('image', imageFile);  // Single image field
formData.append('story_prompt', prompt);
```

### ✅ NEW (Multi-Image Support)

```javascript
const formData = new FormData();
// Use "images" (plural) for all images, even if sending just one
formData.append('images', imageFile1);
formData.append('images', imageFile2);
formData.append('images', imageFile3);
formData.append('images', imageFile4);
formData.append('story_prompt', prompt);
formData.append('character_metadata', JSON.stringify(metadata));
```

**Critical:** The field name MUST be `"images"` (plural), not `"image"`. Using `"image"` will only send the last file.

---

## Request Format

### Form Fields (multipart/form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `images` | File[] | Yes | 1-4 face photos (JPEG/PNG). Use same field name for all. |
| `story_prompt` | string | Yes | Story theme/description (e.g., "A magical adventure...") |
| `character_metadata` | string | Recommended | JSON array with character info (see below) |
| `email` | string | Optional | Email address to send completed book |
| `output_type` | string | Optional | `"DIGI_BOOK"` (default) or `"LULU_BOOK"` |
| `model_provider` | string | Optional | `"openai"` (default) or `"gemini"` |
| `model` | string | Optional | Model name (default: `"gpt-5.5-2026-04-23"`) |
| `keep_job_dir` | boolean | Optional | Debug flag (default: false) |

### Character Metadata Format

**Required for multi-character stories.** Send as JSON string:

```json
[
  {
    "name": "Babu",
    "age": 35,
    "gender": "male",
    "relationship": "father"
  },
  {
    "name": "Aryahi",
    "age": 8,
    "gender": "female",
    "relationship": "daughter"
  },
  {
    "name": "Jeevan",
    "age": 6,
    "gender": "female",
    "relationship": "daughter"
  },
  {
    "name": "Nirvaan",
    "age": 2,
    "gender": "male",
    "relationship": "son"
  }
]
```

**Rules:**
- Array order MUST match image upload order
- First character is always the "main" character
- `name`: Character's name (used in story)
- `age`: Character's age (affects story tone)
- `gender`: `"male"`, `"female"`, or `"other"`
- `relationship`: `"father"`, `"mother"`, `"son"`, `"daughter"`, `"friend"`, etc.

---

## Response Format

### Immediate Response (202 Accepted)

```json
{
  "job_id": "3124420ec35644a5a9c278041196a11d",
  "status": "queued",
  "status_url": "/jobs/3124420ec35644a5a9c278041196a11d",
  "html_url": "/jobs/3124420ec35644a5a9c278041196a11d/storybook.html",
  "pipeline_version": "v2",
  "num_characters": 4
}
```

**Important:** Check `num_characters` matches the number of images you sent. If it shows `1` when you sent 4, you're using the wrong field name.

### Polling for Status

Poll `GET /jobs/{job_id}` every 5 seconds:

```json
{
  "job_id": "3124420ec35644a5a9c278041196a11d",
  "status": "running",
  "stage": "story_generation_start",
  "created_at": "2026-02-21T23:45:00Z"
}
```

**Status values:**
- `queued`: Job accepted, waiting to start
- `running`: Job in progress (check `stage` for details)
- `succeeded`: Job complete, ready to download
- `failed`: Job failed (check `error` field)

**Stage values:**
- `job_started`: Initializing
- `story_generation_start`: Generating story with AI
- `images_phase_start`: Generating character sheets and page images
- `images_phase_done`: All images generated
- `pdf_generation_start`: Creating PDF/HTML flipbook
- `email_start`: Sending email (if requested)

### Success Response

```json
{
  "job_id": "3124420ec35644a5a9c278041196a11d",
  "status": "succeeded",
  "timing": {
    "story_s": 102.9,
    "images_s": 59.9,
    "pdf_s": 30.7,
    "total_s": 194.2
  },
  "email_status": "sent",
  "artifacts": {
    "flipbook_html": "/jobs/3124420ec35644a5a9c278041196a11d/storybook.html"
  }
}
```

### Download Storybook

```
GET /jobs/{job_id}/storybook.html
```

Returns the complete HTML flipbook (self-contained, all images embedded as base64).

---

## Example Code

### JavaScript (Fetch API)

```javascript
// 1. Prepare files and metadata
const imageFiles = [file1, file2, file3, file4]; // File objects from <input type="file" multiple>

const characterMetadata = [
  { name: "Babu", age: 35, gender: "male", relationship: "father" },
  { name: "Aryahi", age: 8, gender: "female", relationship: "daughter" },
  { name: "Jeevan", age: 6, gender: "female", relationship: "daughter" },
  { name: "Nirvaan", age: 2, gender: "male", relationship: "son" }
];

const storyPrompt = "Create a magical adventure story about an Indian family...";

// 2. Build form data
const formData = new FormData();
imageFiles.forEach(file => {
  formData.append('images', file);  // Use "images" for all files
});
formData.append('story_prompt', storyPrompt);
formData.append('character_metadata', JSON.stringify(characterMetadata));
formData.append('email', 'user@example.com');
formData.append('output_type', 'DIGI_BOOK');
formData.append('model_provider', 'openai');
formData.append('model', 'gpt-5.5-2026-04-23');

// 3. Submit job
const response = await fetch('https://story-api-502566942325.us-central1.run.app/generate-ebook-async', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`
  },
  body: formData
});

const result = await response.json();
const jobId = result.job_id;
console.log(`Job submitted: ${jobId}, Characters: ${result.num_characters}`);

// 4. Poll for completion
const pollInterval = setInterval(async () => {
  const statusResp = await fetch(
    `https://story-api-502566942325.us-central1.run.app/jobs/${jobId}`,
    { headers: { 'Authorization': `Bearer ${authToken}` } }
  );
  
  const status = await statusResp.json();
  console.log(`[${Math.floor((Date.now() - startTime) / 1000)}s] ${status.status} - ${status.stage || ''}`);
  
  if (status.status === 'succeeded') {
    clearInterval(pollInterval);
    // Download storybook
    const bookUrl = `https://story-api-502566942325.us-central1.run.app/jobs/${jobId}/storybook.html`;
    window.open(bookUrl, '_blank');
  } else if (status.status === 'failed') {
    clearInterval(pollInterval);
    console.error('Job failed:', status.error);
  }
}, 5000);
```

### Python (Requests)

```python
import requests
import json
import time
from pathlib import Path

# 1. Prepare data
SERVICE_URL = "https://story-api-502566942325.us-central1.run.app"
headers = {"Authorization": f"Bearer {auth_token}"}

image_paths = [
    Path("babu.jpeg"),
    Path("aryahi.jpeg"),
    Path("jeevan.jpeg"),
    Path("nirvaan.jpeg")
]

character_metadata = json.dumps([
    {"name": "Babu", "age": 35, "gender": "male", "relationship": "father"},
    {"name": "Aryahi", "age": 8, "gender": "female", "relationship": "daughter"},
    {"name": "Jeevan", "age": 6, "gender": "female", "relationship": "daughter"},
    {"name": "Nirvaan", "age": 2, "gender": "male", "relationship": "son"},
])

story_prompt = "Create a magical adventure story about an Indian family..."

# 2. Build multipart form
with image_paths[0].open("rb") as f1, \
     image_paths[1].open("rb") as f2, \
     image_paths[2].open("rb") as f3, \
     image_paths[3].open("rb") as f4:
    
    files = [
        ("images", (image_paths[0].name, f1, "image/jpeg")),
        ("images", (image_paths[1].name, f2, "image/jpeg")),
        ("images", (image_paths[2].name, f3, "image/jpeg")),
        ("images", (image_paths[3].name, f4, "image/jpeg")),
    ]
    
    data = {
        "story_prompt": story_prompt,
        "character_metadata": character_metadata,
        "output_type": "DIGI_BOOK",
        "model_provider": "openai",
        "model": "gpt-5.5-2026-04-23",
        "email": "user@example.com"
    }
    
    # 3. Submit
    resp = requests.post(
        f"{SERVICE_URL}/generate-ebook-async",
        headers=headers,
        files=files,
        data=data,
        timeout=60
    )

result = resp.json()
job_id = result["job_id"]
print(f"Job ID: {job_id}, Characters: {result['num_characters']}")

# 4. Poll for completion
while True:
    r = requests.get(f"{SERVICE_URL}/jobs/{job_id}", headers=headers, timeout=30)
    status_data = r.json()
    
    print(f"Status: {status_data['status']} - {status_data.get('stage', '')}")
    
    if status_data["status"] == "succeeded":
        # Download storybook
        html_resp = requests.get(
            f"{SERVICE_URL}/jobs/{job_id}/storybook.html",
            headers=headers,
            timeout=120
        )
        Path("storybook.html").write_bytes(html_resp.content)
        print("✅ Storybook saved!")
        break
    elif status_data["status"] == "failed":
        print(f"❌ Failed: {status_data.get('error')}")
        break
    
    time.sleep(5)
```

### cURL Example

```bash
curl -X POST "https://story-api-502566942325.us-central1.run.app/generate-ebook-async" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -F "images=@babu.jpeg" \
  -F "images=@aryahi.jpeg" \
  -F "images=@jeevan.jpeg" \
  -F "images=@nirvaan.jpeg" \
  -F "story_prompt=Create a magical adventure story..." \
  -F 'character_metadata=[{"name":"Babu","age":35,"gender":"male","relationship":"father"},{"name":"Aryahi","age":8,"gender":"female","relationship":"daughter"},{"name":"Jeevan","age":6,"gender":"female","relationship":"daughter"},{"name":"Nirvaan","age":2,"gender":"male","relationship":"son"}]' \
  -F "email=user@example.com" \
  -F "output_type=DIGI_BOOK" \
  -F "model_provider=openai" \
  -F "model=gpt-5.5-2026-04-23"
```

---

## UI/UX Recommendations

### File Upload Component

```jsx
// React example
<input
  type="file"
  accept="image/jpeg,image/png"
  multiple
  max={4}
  onChange={handleImageUpload}
/>

{selectedImages.length > 0 && (
  <div className="character-preview">
    {selectedImages.map((img, idx) => (
      <div key={idx} className="character-card">
        <img src={URL.createObjectURL(img)} alt={`Character ${idx + 1}`} />
        <input
          type="text"
          placeholder="Name"
          value={metadata[idx]?.name || ''}
          onChange={(e) => updateMetadata(idx, 'name', e.target.value)}
        />
        <input
          type="number"
          placeholder="Age"
          value={metadata[idx]?.age || ''}
          onChange={(e) => updateMetadata(idx, 'age', parseInt(e.target.value))}
        />
        <select
          value={metadata[idx]?.gender || 'male'}
          onChange={(e) => updateMetadata(idx, 'gender', e.target.value)}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <select
          value={metadata[idx]?.relationship || ''}
          onChange={(e) => updateMetadata(idx, 'relationship', e.target.value)}
        >
          <option value="father">Father</option>
          <option value="mother">Mother</option>
          <option value="son">Son</option>
          <option value="daughter">Daughter</option>
          <option value="friend">Friend</option>
          <option value="sibling">Sibling</option>
        </select>
      </div>
    ))}
  </div>
)}
```

### Validation Rules

```javascript
function validateImages(files) {
  // 1. Check count
  if (files.length < 1 || files.length > 4) {
    throw new Error('Please upload 1-4 character photos');
  }
  
  // 2. Check file types
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  for (const file of files) {
    if (!validTypes.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.name}. Use JPEG or PNG.`);
    }
  }
  
  // 3. Check file sizes (recommend < 10MB each)
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error(`File too large: ${file.name}. Max 10MB per image.`);
    }
  }
  
  return true;
}

function validateMetadata(metadata, imageCount) {
  // Metadata array length should match image count
  if (metadata.length !== imageCount) {
    throw new Error('Character metadata must match number of images');
  }
  
  // Each entry should have required fields
  for (let i = 0; i < metadata.length; i++) {
    const char = metadata[i];
    if (!char.name || !char.age || !char.gender || !char.relationship) {
      throw new Error(`Missing required fields for character ${i + 1}`);
    }
  }
  
  return true;
}
```

---

## Expected Timing

| Characters | Story Generation | Image Generation | PDF Generation | Total |
|------------|------------------|------------------|----------------|-------|
| 1 | ~60-90s | ~40-60s | ~20-30s | ~2-3 min |
| 2 | ~90-120s | ~60-90s | ~25-35s | ~3-4 min |
| 3 | ~120-150s | ~90-120s | ~30-40s | ~4-5 min |
| 4 | ~150-180s | ~120-150s | ~30-40s | ~5-6 min |

**Note:** Times vary based on story complexity and API load.

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `"num_characters": 1` when sending 4 images | Using `"image"` field name instead of `"images"` | Change field name to `"images"` (plural) |
| `400: At least one face image is required` | No images uploaded | Ensure files are attached to form |
| `400: Maximum 4 face images allowed` | More than 4 images | Limit to 4 images max |
| `400: Invalid character_metadata JSON` | Malformed JSON string | Validate JSON before sending |
| `500: One or more image generations failed` | LaoZhang API safety filter triggered | Retry or modify story prompt |

### Handling Failed Jobs

```javascript
async function pollJob(jobId, authToken) {
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const resp = await fetch(
      `https://story-api-502566942325.us-central1.run.app/jobs/${jobId}`,
      { headers: { 'Authorization': `Bearer ${authToken}` } }
    );
    
    if (resp.status === 500) {
      const error = await resp.json();
      throw new Error(`Job failed: ${error.error?.message || 'Unknown error'}`);
    }
    
    const status = await resp.json();
    
    if (status.status === 'succeeded') {
      return status;
    }
    
    if (status.status === 'failed') {
      throw new Error(`Job failed: ${status.error?.message || 'Unknown error'}`);
    }
    
    // Update UI with progress
    updateProgress(status.stage);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Job timeout - exceeded 30 minutes');
}
```

---

## Migration Checklist

- [ ] Update file upload field name from `"image"` to `"images"`
- [ ] Add support for multiple file selection (1-4 images)
- [ ] Add character metadata input form (name, age, gender, relationship)
- [ ] Update validation to check 1-4 images (not just 1)
- [ ] Ensure metadata array matches image count
- [ ] Update polling UI to show `num_characters` in confirmation
- [ ] Test with 1, 2, 3, and 4 character scenarios
- [ ] Handle longer generation times for multi-character stories
- [ ] Update error messages for multi-image scenarios

---

## Testing

### Test Case 1: Single Character (Backward Compatibility)

```javascript
formData.append('images', singleImage);
formData.append('story_prompt', 'A brave knight...');
// No character_metadata needed for single character
```

Expected: `"num_characters": 1`, story with 1 character

### Test Case 2: Two Characters

```javascript
formData.append('images', image1);
formData.append('images', image2);
formData.append('character_metadata', JSON.stringify([
  { name: "Alice", age: 10, gender: "female", relationship: "daughter" },
  { name: "Bob", age: 40, gender: "male", relationship: "father" }
]));
```

Expected: `"num_characters": 2`, story with both characters

### Test Case 3: Four Characters (Maximum)

```javascript
// Upload 4 images with 4 metadata entries
```

Expected: `"num_characters": 4`, story with all 4 characters

---

## Important Notes

1. **Field Name is Critical:** Always use `"images"` (plural), even for a single image. Using `"image"` will break multi-image support.

2. **Order Matters:** The order of images MUST match the order of character_metadata entries. First image = first metadata entry.

3. **First Character is Main:** The first character in the array is always treated as the "main" character and will appear in most scenes.

4. **Authentication Required:** All requests require a valid Google Cloud IAM token. See GCP documentation for token generation.

5. **Async Processing:** Jobs are processed asynchronously. Never wait synchronously - always poll the status endpoint.

6. **File Size Limits:** Keep images under 10MB each for best performance. The API will resize/compress as needed.

7. **Story Prompt Quality:** For multi-character stories, explicitly mention all characters by name in the prompt for best results.

---

## Support

For issues or questions:
- Check Cloud Run logs: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=story-api"`
- Email: sarath8roy@gmail.com
- API Health Check: `GET /health`

---

## Changelog

### v2 (Current)
- ✅ Support for 1-4 character face photos
- ✅ Character metadata with name/age/gender/relationship
- ✅ Multi-character scene generation
- ✅ Improved character consistency across pages
- ✅ Field name changed from `"image"` to `"images"`

### v1 (Deprecated)
- Single character only
- Used `"image"` field name
- No character metadata support
