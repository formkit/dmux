
      projectName: 'Loading...',
      sessionName: '',
      connected: false,
      panes: [],
      lastUpdate: null,
      timeSinceUpdate: 'Never',
      promptInputs: {}, // Map of pane ID to prompt text
      sendingPrompts: new Set(), // Set of pane IDs currently sending
      queuedMessages: {}, // Map of pane ID to temporary "queued" message
      theme: localStorage.getItem('dmux-theme') || 'dark', // Theme state
      expandedPrompts: new Set(), // Set of pane IDs with expanded initial prompts
      loadingOptions: new Set(), // Set of pane IDs with loading option dialogs
      showCreateDialog: false,
      newPanePrompt: '',
      newPaneAgent: null,
      creatingPane: false,
      availableAgents: [],
      needsAgentChoice: false,
      createStep: 'prompt', // 'prompt' or 'agent'
      // Action system
      actions: [], // Available actions from API
      paneActions: {}, // Map of pane ID to available actions
      showActionMenu: null, // Pane ID with open action menu
      actionDialog: null, // Current action dialog { type: 'confirm'|'choice', ... }
      executingAction: false // Whether an action is currently executing
    