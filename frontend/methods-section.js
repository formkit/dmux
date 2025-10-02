    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('dmux-theme', this.theme);
      document.documentElement.setAttribute('data-theme', this.theme);
    },
    togglePrompt(paneId) {
      if (this.expandedPrompts.has(paneId)) {
        this.expandedPrompts.delete(paneId);
      } else {
        this.expandedPrompts.add(paneId);
      }
      // Force reactivity
      this.expandedPrompts = new Set(this.expandedPrompts);
    },
    openCreateDialog() {
      this.showCreateDialog = true;
      this.newPanePrompt = '';
      this.newPaneAgent = null;
      this.availableAgents = [];
      this.needsAgentChoice = false;
      this.createStep = 'prompt';
      // Focus the textarea after dialog opens
      setTimeout(() => {
        const textarea = document.getElementById('pane-prompt');
        if (textarea) textarea.focus();
      }, 100);
    },
    closeCreateDialog() {
      this.showCreateDialog = false;
      this.newPanePrompt = '';
      this.newPaneAgent = null;
      this.creatingPane = false;
      this.createStep = 'prompt';
      this.availableAgents = [];
      this.needsAgentChoice = false;
    },
    async submitPrompt() {
      if (!this.newPanePrompt.trim() || this.creatingPane) return;

      this.creatingPane = true;

      try {
        // First API call: Send prompt without agent
        const response = await fetch('/api/panes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: this.newPanePrompt.trim()
          })
        });

        const data = await response.json();

        if (data.success) {
          // Pane created without agent selection (only one agent available)
          this.closeCreateDialog();
          await this.fetchPanes();
          console.log('Pane created:', data.pane);
        } else if (data.needsAgentChoice) {
          // Agent selection required
          this.availableAgents = data.availableAgents || [];
          this.needsAgentChoice = true;
          this.createStep = 'agent';
          this.creatingPane = false;
          // Auto-select first agent
          if (this.availableAgents.length > 0) {
            this.newPaneAgent = this.availableAgents[0];
          }
        } else {
          // Error occurred
          console.error('Failed to create pane:', data.error);
          alert('Failed to create pane: ' + (data.error || 'Unknown error'));
          this.creatingPane = false;
        }
      } catch (err) {
        console.error('Failed to create pane:', err);
        alert('Failed to create pane: ' + err.message);
        this.creatingPane = false;
      }
    },
    async createPane() {
      if (!this.newPaneAgent || this.creatingPane) return;

      this.creatingPane = true;

      try {
        // Second API call: Send prompt with selected agent
        const response = await fetch('/api/panes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: this.newPanePrompt.trim(),
            agent: this.newPaneAgent
          })
        });

        const data = await response.json();

        if (data.success) {
          // Pane created successfully
          this.closeCreateDialog();
          await this.fetchPanes();
          console.log('Pane created:', data.pane);
        } else {
          // Error occurred
          console.error('Failed to create pane:', data.error);
          alert('Failed to create pane: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Failed to create pane:', err);
        alert('Failed to create pane: ' + err.message);
      } finally {
        this.creatingPane = false;
      }
    },
    async fetchPanes() {
      try {
        const response = await fetch('/api/panes');
        const data = await response.json();
        this.projectName = data.projectName || 'Unknown Project';
        this.sessionName = data.sessionName || '';
        this.panes = data.panes || [];
        this.lastUpdate = new Date();
        this.connected = true;
        this.updateTimeSinceUpdate();

        // Clear loading state for panes that are no longer waiting
        this.loadingOptions.forEach(paneId => {
          const pane = this.panes.find(p => p.id === paneId);
          if (!pane || pane.agentStatus !== 'waiting') {
            this.loadingOptions.delete(paneId);
          }
        });
        // Force reactivity
        this.loadingOptions = new Set(this.loadingOptions);
      } catch (err) {
        this.connected = false;
      }
    },
    async sendKeys(paneId, keys) {
      try {
        const response = await fetch(\`/api/keys/\${paneId}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keys })
        });
        return response.ok;
      } catch (err) {
        console.error('Failed to send keys:', err);
        return false;
      }
    },
    async sendPrompt(pane) {
      const prompt = this.promptInputs[pane.id];
      if (!prompt || this.sendingPrompts.has(pane.id)) return;

      this.sendingPrompts.add(pane.id);

      try {
        // Send each character of the prompt
        for (const char of prompt) {
          await this.sendKeys(pane.id, char);
          await new Promise(resolve => setTimeout(resolve, 5)); // Small delay between chars
        }

        // Send Enter to submit
        await this.sendKeys(pane.id, 'Enter');

        // Show queued message for working status
        if (pane.agentStatus === 'working') {
          this.queuedMessages[pane.id] = 'Sent to queue';
          setTimeout(() => {
            delete this.queuedMessages[pane.id];
          }, 3000);
        }

        // Clear input
        this.promptInputs[pane.id] = '';
      } catch (err) {
        console.error('Failed to send prompt:', err);
      } finally {
        this.sendingPrompts.delete(pane.id);
      }
    },
    async selectOption(pane, option) {
      if (!option.keys || option.keys.length === 0) return;

      // Set loading state immediately
      this.loadingOptions.add(pane.id);
      // Force reactivity
      this.loadingOptions = new Set(this.loadingOptions);

      try {
        // Send the first key in the array (usually the main option key)
        const key = option.keys[0];
        await this.sendKeys(pane.id, key);

        // Clear loading state after a short delay to ensure the state has transitioned
        // The 2-second delay in the worker will prevent premature state detection
        setTimeout(() => {
          this.loadingOptions.delete(pane.id);
          this.loadingOptions = new Set(this.loadingOptions);
        }, 500);
      } catch (err) {
        console.error('Failed to select option:', err);
        // Clear loading state on error
        this.loadingOptions.delete(pane.id);
        this.loadingOptions = new Set(this.loadingOptions);
      }
    },
    autoExpand(event) {
      const textarea = event.target;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    },
    async toggleActionMenu(paneId) {
      if (this.showActionMenu === paneId) {
        this.showActionMenu = null;
      } else {
        // Load actions for this pane if not already loaded
        if (!this.paneActions[paneId]) {
          try {
            const response = await fetch(\`/api/panes/\${paneId}/actions\`);
            const data = await response.json();
            this.paneActions[paneId] = data.actions || [];
          } catch (err) {
            console.error('Failed to load actions:', err);
            this.paneActions[paneId] = [];
          }
        }
        this.showActionMenu = paneId;
      }
    },
    async executeAction(pane, action) {
      this.executingAction = true;
      this.showActionMenu = null;

      try {
        const response = await fetch(\`/api/panes/\${pane.id}/actions/\${action.id}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        const result = await response.json();

        // Handle different response types
        if (result.requiresInteraction) {
          if (result.interactionType === 'confirm') {
            this.actionDialog = {
              type: 'confirm',
              title: result.confirmData.title,
              message: result.confirmData.message,
              yesLabel: result.confirmData.yesLabel,
              noLabel: result.confirmData.noLabel,
              callbackId: result.confirmData.callbackId
            };
          } else if (result.interactionType === 'choice') {
            this.actionDialog = {
              type: 'choice',
              title: result.choiceData.title,
              message: result.choiceData.message,
              options: result.choiceData.options,
              callbackId: result.choiceData.callbackId
            };
          }
        }
      } catch (err) {
        console.error('Failed to execute action:', err);
      } finally {
        this.executingAction = false;
      }
    },
    async handleConfirm(confirmed) {
      if (!this.actionDialog || !this.actionDialog.callbackId) return;

      try {
        const response = await fetch(\`/api/callbacks/confirm/\${this.actionDialog.callbackId}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmed })
        });

        await response.json();
      } catch (err) {
        console.error('Failed to handle confirm:', err);
      } finally {
        this.actionDialog = null;
      }
    },
    async handleChoice(optionId) {
      if (!this.actionDialog || !this.actionDialog.callbackId) return;

      try {
        const response = await fetch(\`/api/callbacks/choice/\${this.actionDialog.callbackId}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId })
        });

        await response.json();
      } catch (err) {
        console.error('Failed to handle choice:', err);
      } finally {
        this.actionDialog = null;
      }
    },
    closeActionDialog() {
      this.actionDialog = null;
    },
    updateTimeSinceUpdate() {
      if (!this.lastUpdate) return;

      const now = new Date();
      const diff = Math.floor((now - this.lastUpdate) / 1000);

      if (diff < 60) {
        this.timeSinceUpdate = diff + 's ago';
      } else if (diff < 3600) {
        this.timeSinceUpdate = Math.floor(diff / 60) + 'm ago';
      } else {
        this.timeSinceUpdate = Math.floor(diff / 3600) + 'h ago';
      }
    },
    startAutoRefresh() {
      this.fetchPanes();
      refreshInterval = setInterval(() => {
        this.fetchPanes();
      }, 2000);

      // Update time display every second
      setInterval(() => {
        this.updateTimeSinceUpdate();
      }, 1000);
    },
    stopAutoRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }
  },
