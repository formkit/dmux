# dmux API Documentation

## Overview

The dmux HTTP API allows you to interact with dmux programmatically, including creating new panes, listing existing panes, and monitoring their status.

The server automatically starts when you run `dmux` and selects an available port (typically starting at 3000). The server URL is displayed in the dmux TUI.

## Base URL

```
http://127.0.0.1:{port}
```

The port is auto-selected when dmux starts. You can find it by:
1. Looking at the dmux TUI (shows server URL)
2. Checking ports 3000-3010 for `/api/health` endpoint
3. Reading from the dmux config files

## Authentication

Currently, no authentication is required. The server binds to localhost only for security.

## Endpoints

### Health Check

Check if the server is running.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

---

### Session Information

Get information about the current dmux session.

**Endpoint:** `GET /api/session`

**Response:**
```json
{
  "projectName": "dmux",
  "sessionName": "dmux-dmux",
  "projectRoot": "/Users/user/Projects/dmux",
  "serverUrl": "http://127.0.0.1:3000",
  "settings": {
    "testCommand": "npm test",
    "devCommand": "npm run dev"
  },
  "paneCount": 3,
  "timestamp": 1234567890
}
```

---

### List Panes

Get a list of all panes in the current session.

**Endpoint:** `GET /api/panes`

**Response:**
```json
{
  "panes": [
    {
      "id": "dmux-1234567890",
      "slug": "add-feature",
      "prompt": "Add a new feature to the dashboard",
      "paneId": "%1",
      "worktreePath": "/Users/user/Projects/dmux/.dmux/worktrees/add-feature",
      "agent": "claude",
      "agentStatus": "idle",
      "testStatus": null,
      "devStatus": null
    }
  ],
  "projectName": "dmux",
  "sessionName": "dmux-dmux",
  "timestamp": 1234567890
}
```

---

### Create New Pane

Create a new dmux pane with a worktree and optional agent.

**Endpoint:** `POST /api/panes`

**Request Body:**
```json
{
  "prompt": "Your prompt for the AI agent",
  "agent": "claude"  // Optional: "claude" or "opencode"
}
```

**Parameters:**
- `prompt` (required, string): The initial prompt to send to the agent
- `agent` (optional, string): Which agent to use. Must be "claude" or "opencode". If omitted and multiple agents are available, the response will indicate that agent choice is needed.

**Success Response (201 Created):**
```json
{
  "success": true,
  "pane": {
    "id": "dmux-1234567890",
    "slug": "your-feature",
    "prompt": "Your prompt for the AI agent",
    "paneId": "%2",
    "worktreePath": "/Users/user/Projects/dmux/.dmux/worktrees/your-feature",
    "agent": "claude",
    "agentStatus": "idle"
  },
  "message": "Pane created successfully"
}
```

**Agent Choice Needed Response (200 OK):**
```json
{
  "needsAgentChoice": true,
  "availableAgents": ["claude", "opencode"],
  "message": "Please specify an agent (claude or opencode) in the request body"
}
```

**Error Responses:**

- **400 Bad Request** - Missing or invalid prompt
  ```json
  {
    "error": "Missing or invalid prompt"
  }
  ```

- **400 Bad Request** - Invalid agent
  ```json
  {
    "error": "Invalid agent. Must be \"claude\" or \"opencode\""
  }
  ```

- **500 Internal Server Error** - No agents available
  ```json
  {
    "error": "No agents available. Install claude or opencode."
  }
  ```

- **500 Internal Server Error** - Failed to create pane
  ```json
  {
    "error": "Failed to create pane",
    "details": "Error message..."
  }
  ```

**Example Usage:**

```bash
# Create pane with Claude
curl -X POST http://127.0.0.1:3000/api/panes \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Add TypeScript types to the user module",
    "agent": "claude"
  }'

# Create pane with opencode
curl -X POST http://127.0.0.1:3000/api/panes \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Refactor the authentication logic",
    "agent": "opencode"
  }'

# Create pane without specifying agent (will auto-select or ask)
curl -X POST http://127.0.0.1:3000/api/panes \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Fix the memory leak in the event handler"
  }'
```

---

### Get Specific Pane

Get detailed information about a specific pane.

**Endpoint:** `GET /api/panes/:id`

**Response:**
```json
{
  "id": "dmux-1234567890",
  "slug": "add-feature",
  "prompt": "Add a new feature to the dashboard",
  "paneId": "%1",
  "worktreePath": "/Users/user/Projects/dmux/.dmux/worktrees/add-feature",
  "agent": "claude",
  "agentStatus": "working",
  "optionsQuestion": "Would you like me to proceed?",
  "options": [
    {
      "action": "proceed",
      "keys": ["y"],
      "description": "Yes, continue"
    }
  ]
}
```

---

### Get Pane Snapshot

Capture the current terminal state of a pane.

**Endpoint:** `GET /api/panes/:id/snapshot`

**Response:**
```json
{
  "width": 80,
  "height": 24,
  "content": "Terminal content here...",
  "cursorRow": 10,
  "cursorCol": 5
}
```

---

## Web Dashboard

The API server also hosts a web dashboard for monitoring panes.

**Endpoint:** `GET /`

Opens an HTML dashboard showing:
- List of all panes with their status
- Real-time updates of agent status
- Links to view individual panes

---

## Best Practices

1. **Check Health First**: Always verify the server is running with `/api/health` before making other requests

2. **Handle Agent Choice**: If you don't specify an agent and multiple are available, the API will respond with `needsAgentChoice: true`. Make a second request with the agent specified.

3. **Error Handling**: Always check the response status code and handle errors appropriately

4. **Polling**: To monitor pane status, poll the `/api/panes` endpoint. Consider using the web dashboard for real-time updates instead.

5. **Unique Prompts**: Each prompt generates a unique slug for the worktree branch name. Avoid duplicate prompts to prevent conflicts.

---

## Integration Examples

### JavaScript/Node.js

```javascript
async function createPane(prompt, agent = 'claude') {
  const response = await fetch('http://127.0.0.1:3000/api/panes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, agent }),
  });

  const data = await response.json();

  if (data.needsAgentChoice) {
    console.log('Available agents:', data.availableAgents);
    // Make another request with agent specified
    return createPane(prompt, data.availableAgents[0]);
  }

  if (data.success) {
    console.log('Pane created:', data.pane.slug);
    return data.pane;
  } else {
    throw new Error(data.error || 'Failed to create pane');
  }
}

// Usage
createPane('Fix bug in user authentication')
  .then(pane => console.log('Created:', pane))
  .catch(err => console.error('Error:', err));
```

### Python

```python
import requests

def create_pane(prompt, agent='claude', port=3000):
    url = f'http://127.0.0.1:{port}/api/panes'
    payload = {'prompt': prompt, 'agent': agent}

    response = requests.post(url, json=payload)
    data = response.json()

    if data.get('needsAgentChoice'):
        print(f"Available agents: {data['availableAgents']}")
        # Retry with first available agent
        return create_pane(prompt, data['availableAgents'][0], port)

    if data.get('success'):
        print(f"Pane created: {data['pane']['slug']}")
        return data['pane']
    else:
        raise Exception(data.get('error', 'Failed to create pane'))

# Usage
try:
    pane = create_pane('Add logging to the API endpoints')
    print(f"Created pane: {pane['id']}")
except Exception as e:
    print(f"Error: {e}")
```

---

## Testing

A test script is included to verify the API functionality:

```bash
./test-api-create-pane.sh
```

This script tests:
- Health check
- Creating panes with different configurations
- Error handling
- Listing panes

---

## Troubleshooting

### Server Not Running

If you get connection errors:
1. Ensure dmux is running in a tmux session
2. Check if the server started successfully (look for "Server running at..." message)
3. Try different ports (3000-3010)

### Agent Not Found

If you get "No agents available" error:
1. Install Claude Code: Follow instructions at https://claude.ai/code
2. Install opencode: `npm install -g opencode` or similar
3. Verify installation: `which claude` and `which opencode`

### Pane Creation Fails

If pane creation fails:
1. Check that you're in a git repository
2. Verify you have write permissions
3. Ensure tmux is running properly
4. Check the error details in the response

---

## Future Enhancements

Planned API features:
- WebSocket support for real-time updates
- Pane actions endpoint (send keys, resize, etc.)
- Bulk pane operations
- Authentication/authorization
- Remote access (with proper security)
