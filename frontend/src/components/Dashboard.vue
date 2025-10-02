<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';

// State
const projectName = ref('Loading...');
const sessionName = ref('');
const connected = ref(false);
const panes = ref<any[]>([]);
const lastUpdate = ref<Date | null>(null);
const timeSinceUpdate = ref('Never');
const promptInputs = ref<Record<string, string>>({});
const sendingPrompts = ref(new Set<string>());
const queuedMessages = ref<Record<string, string>>({});
const theme = ref(localStorage.getItem('dmux-theme') || 'dark');
const expandedPrompts = ref(new Set<string>());
const loadingOptions = ref(new Set<string>());
const showCreateDialog = ref(false);
const newPanePrompt = ref('');
const newPaneAgent = ref<string | null>(null);
const creatingPane = ref(false);
const availableAgents = ref<string[]>([]);
const needsAgentChoice = ref(false);
const createStep = ref<'prompt' | 'agent'>('prompt');

// Action system
const actions = ref<any[]>([]);
const paneActions = ref<Record<string, any[]>>({});
const showActionMenu = ref<string | null>(null);
const actionDialog = ref<any | null>(null);
const executingAction = ref(false);
const actionDialogLoading = ref(false);

let refreshInterval: any = null;

// Methods
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dmux-theme', theme.value);
  document.documentElement.setAttribute('data-theme', theme.value);
};

const togglePrompt = (paneId: string) => {
  if (expandedPrompts.value.has(paneId)) {
    expandedPrompts.value.delete(paneId);
  } else {
    expandedPrompts.value.add(paneId);
  }
  expandedPrompts.value = new Set(expandedPrompts.value);
};

const openCreateDialog = () => {
  showCreateDialog.value = true;
  newPanePrompt.value = '';
  newPaneAgent.value = null;
  availableAgents.value = [];
  needsAgentChoice.value = false;
  createStep.value = 'prompt';

  // Focus the textarea after the dialog opens
  nextTick(() => {
    const textarea = document.getElementById('pane-prompt') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
    }
  });

  // Add escape key listener
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCreateDialog();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
};

const closeCreateDialog = () => {
  showCreateDialog.value = false;
  newPanePrompt.value = '';
  newPaneAgent.value = null;
  availableAgents.value = [];
  needsAgentChoice.value = false;
  createStep.value = 'prompt';
};

const createPane = async () => {
  if (createStep.value === 'prompt' && !newPanePrompt.value.trim()) return;
  if (createStep.value === 'agent' && !newPaneAgent.value) return;

  try {
    creatingPane.value = true;

    const payload: any = {
      prompt: newPanePrompt.value.trim()
    };

    if (newPaneAgent.value) {
      payload.agent = newPaneAgent.value;
    }

    const response = await fetch('/api/panes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.needsAgentChoice) {
      needsAgentChoice.value = true;
      availableAgents.value = result.availableAgents;
      createStep.value = 'agent';
    } else {
      closeCreateDialog();
      await fetchPanes();
    }
  } catch (error) {
    console.error('Failed to create pane:', error);
    alert('Failed to create pane');
  } finally {
    creatingPane.value = false;
  }
};

const selectAgent = (agent: string) => {
  newPaneAgent.value = agent;
  createPane();
};

const fetchPanes = async () => {
  try {
    const response = await fetch('/api/panes');
    const data = await response.json();

    projectName.value = data.projectName || 'dmux';
    sessionName.value = data.sessionName || '';
    connected.value = true;
    panes.value = data.panes || [];
    lastUpdate.value = new Date();
    timeSinceUpdate.value = 'Just now';

    // Load actions for each pane
    for (const pane of panes.value) {
      if (!paneActions.value[pane.id]) {
        fetchPaneActions(pane.id);
      }
    }
  } catch (error) {
    console.error('Failed to fetch panes:', error);
    connected.value = false;
  }
};

const fetchPaneActions = async (paneId: string) => {
  try {
    const response = await fetch(`/api/panes/${paneId}/actions`);
    const data = await response.json();
    console.log(`Fetched actions for pane ${paneId}:`, data);
    paneActions.value[paneId] = data.actions || [];
  } catch (error) {
    console.error(`Failed to fetch actions for pane ${paneId}:`, error);
  }
};

const toggleActionMenu = (paneId: string) => {
  if (showActionMenu.value === paneId) {
    showActionMenu.value = null;
  } else {
    showActionMenu.value = paneId;
  }
};

const executeAction = async (pane: any, action: any) => {
  try {
    executingAction.value = true;
    showActionMenu.value = null;

    const response = await fetch(`/api/panes/${pane.id}/actions/${action.id}`, {
      method: 'POST'
    });

    const result = await response.json();

    if (result.requiresInteraction) {
      // Map the specific data type to a common structure
      let dialogData: any = {};

      if (result.interactionType === 'confirm') {
        dialogData = {
          type: 'confirm',
          title: result.title || 'Confirm',
          message: result.message,
          ...result.confirmData
        };
      } else if (result.interactionType === 'choice') {
        dialogData = {
          type: 'choice',
          title: result.title || 'Choose',
          message: result.message,
          ...result.choiceData
        };
      } else if (result.interactionType === 'input') {
        dialogData = {
          type: 'input',
          title: result.title || 'Input',
          message: result.message,
          ...result.inputData,
          inputValue: result.inputData?.defaultValue || ''
        };

        // Focus the input after dialog opens
        nextTick(() => {
          const input = document.querySelector('.dialog-input') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select(); // Select all text for easy replacement
          }
        });
      }

      dialogData.paneId = pane.id;
      actionDialog.value = dialogData;
    } else {
      await fetchPanes();
    }
  } catch (error) {
    console.error('Failed to execute action:', error);
    alert('Failed to execute action');
  } finally {
    executingAction.value = false;
  }
};

const closeActionDialog = () => {
  actionDialog.value = null;
};

const confirmAction = async (confirmed: boolean) => {
  if (!actionDialog.value) return;

  try {
    actionDialogLoading.value = true;
    const response = await fetch(`/api/callbacks/confirm/${actionDialog.value.callbackId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed })
    });

    const result = await response.json();

    // Check if the response requires another interaction
    if (result.requiresInteraction) {
      let dialogData: any = {};

      if (result.interactionType === 'confirm') {
        dialogData = {
          type: 'confirm',
          title: result.title || 'Confirm',
          message: result.message,
          ...result.confirmData
        };
      } else if (result.interactionType === 'choice') {
        dialogData = {
          type: 'choice',
          title: result.title || 'Choose',
          message: result.message,
          ...result.choiceData
        };
      } else if (result.interactionType === 'input') {
        dialogData = {
          type: 'input',
          title: result.title || 'Input',
          message: result.message,
          ...result.inputData,
          inputValue: result.inputData?.defaultValue || ''
        };

        // Focus the input after dialog opens
        nextTick(() => {
          const input = document.querySelector('.dialog-input') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        });
      }

      actionDialog.value = dialogData;
    } else {
      await fetchPanes();
      closeActionDialog();
    }
  } catch (error) {
    console.error('Failed to confirm action:', error);
    alert('Failed to complete action');
  } finally {
    actionDialogLoading.value = false;
  }
};

const selectChoice = async (optionId: string) => {
  if (!actionDialog.value) return;

  try {
    actionDialogLoading.value = true;
    const response = await fetch(`/api/callbacks/choice/${actionDialog.value.callbackId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId })
    });

    const result = await response.json();

    // Check if the response requires another interaction
    if (result.requiresInteraction) {
      let dialogData: any = {};

      if (result.interactionType === 'confirm') {
        dialogData = {
          type: 'confirm',
          title: result.title || 'Confirm',
          message: result.message,
          ...result.confirmData
        };
      } else if (result.interactionType === 'choice') {
        dialogData = {
          type: 'choice',
          title: result.title || 'Choose',
          message: result.message,
          ...result.choiceData
        };
      } else if (result.interactionType === 'input') {
        dialogData = {
          type: 'input',
          title: result.title || 'Input',
          message: result.message,
          ...result.inputData,
          inputValue: result.inputData?.defaultValue || ''
        };

        // Focus the input after dialog opens
        nextTick(() => {
          const input = document.querySelector('.dialog-input') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        });
      }

      actionDialog.value = dialogData;
    } else {
      await fetchPanes();
      closeActionDialog();
    }
  } catch (error) {
    console.error('Failed to select choice:', error);
    alert('Failed to complete action');
  } finally {
    actionDialogLoading.value = false;
  }
};

const submitInput = async () => {
  if (!actionDialog.value) return;

  try {
    actionDialogLoading.value = true;
    const response = await fetch(`/api/callbacks/input/${actionDialog.value.callbackId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: actionDialog.value.inputValue })
    });

    const result = await response.json();

    // Check if the response requires another interaction
    if (result.requiresInteraction) {
      let dialogData: any = {};

      if (result.interactionType === 'confirm') {
        dialogData = {
          type: 'confirm',
          title: result.title || 'Confirm',
          message: result.message,
          ...result.confirmData
        };
      } else if (result.interactionType === 'choice') {
        dialogData = {
          type: 'choice',
          title: result.title || 'Choose',
          message: result.message,
          ...result.choiceData
        };
      } else if (result.interactionType === 'input') {
        dialogData = {
          type: 'input',
          title: result.title || 'Input',
          message: result.message,
          ...result.inputData,
          inputValue: result.inputData?.defaultValue || ''
        };

        // Focus the input after dialog opens
        nextTick(() => {
          const input = document.querySelector('.dialog-input') as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        });
      }

      actionDialog.value = dialogData;
    } else {
      await fetchPanes();
      closeActionDialog();
    }
  } catch (error) {
    console.error('Failed to submit input:', error);
    alert('Failed to complete action');
  } finally {
    actionDialogLoading.value = false;
  }
};

const selectOption = async (pane: any, option: any) => {
  try {
    loadingOptions.value.add(pane.id);
    loadingOptions.value = new Set(loadingOptions.value);

    // Send each key in the keys array
    const keys = option.keys || [option.action];
    for (const key of keys) {
      await fetch(`/api/keys/${pane.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
      });
    }

    setTimeout(() => {
      loadingOptions.value.delete(pane.id);
      loadingOptions.value = new Set(loadingOptions.value);
      fetchPanes();
    }, 1500);
  } catch (error) {
    console.error('Failed to select option:', error);
    loadingOptions.value.delete(pane.id);
    loadingOptions.value = new Set(loadingOptions.value);
  }
};

const sendPrompt = async (pane: any) => {
  const prompt = promptInputs.value[pane.id];
  if (!prompt || !prompt.trim()) return;

  try {
    sendingPrompts.value.add(pane.id);
    sendingPrompts.value = new Set(sendingPrompts.value);

    // Send each character individually
    for (const char of prompt) {
      await fetch(`/api/keys/${pane.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: char })
      });
    }

    // Send Enter key to submit
    await fetch(`/api/keys/${pane.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'Enter' })
    });

    queuedMessages.value[pane.id] = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
    promptInputs.value[pane.id] = '';

    setTimeout(() => {
      delete queuedMessages.value[pane.id];
      sendingPrompts.value.delete(pane.id);
      sendingPrompts.value = new Set(sendingPrompts.value);
    }, 3000);
  } catch (error) {
    console.error('Failed to send prompt:', error);
    sendingPrompts.value.delete(pane.id);
    sendingPrompts.value = new Set(sendingPrompts.value);
  }
};

const autoExpand = (event: Event) => {
  const textarea = event.target as HTMLTextAreaElement;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
};

const startAutoRefresh = () => {
  fetchPanes();
  refreshInterval = setInterval(fetchPanes, 2000);
};

const stopAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

// Click-away handler for action menu
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  // Close action menu if clicking outside
  if (showActionMenu.value && !target.closest('.action-menu-btn') && !target.closest('.action-menu-dropdown')) {
    showActionMenu.value = null;
  }
};

// Lifecycle
onMounted(() => {
  document.documentElement.setAttribute('data-theme', theme.value);
  startAutoRefresh();

  // Add click-away handler for action menu
  document.addEventListener('click', handleClickOutside);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  });
});

onBeforeUnmount(() => {
  stopAutoRefresh();
  // Remove click-away handler
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <header>
    <img src="https://cdn.formk.it/dmux/dmux.png" alt="dmux" class="logo" />
    <h1>{{ projectName }}</h1>
    <div class="session-info">
      <button @click="toggleTheme" class="theme-toggle" :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'">
        <svg v-if="theme === 'dark'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6.5a9 9 0 009 9 8.97 8.97 0 003.963-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"/>
        </svg>
      </button>
      <span v-if="sessionName">{{ sessionName }}</span>
      <span class="status-indicator" :style="{ color: connected ? '#4ade80' : '#f87171' }">●</span>
    </div>
  </header>

  <div class="container">
    <main>
      <div class="actions-bar">
        <button @click="openCreateDialog" class="create-pane-button" :disabled="creatingPane">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5v15m7.5-7.5h-15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Create New Pane
        </button>
      </div>

      <div v-if="panes.length === 0" class="no-panes">
        <p>No dmux panes active</p>
        <p class="hint">Click "Create New Pane" above or press 'n' in dmux</p>
      </div>

      <div v-else class="panes-grid">
        <div
          v-for="pane in panes"
          :key="pane.id"
          class="pane-card"
        >
          <div class="pane-header">
            <div class="pane-header-content">
              <a :href="'/panes/' + pane.id" class="pane-title-link">
                <span class="pane-title">{{ pane.slug }}</span>
                <span class="pane-arrow">→</span>
              </a>
              <div class="pane-meta">
                <span class="pane-agent" :class="pane.agent || ''">{{ pane.agent || 'unknown' }}</span>
                <span class="pane-id">{{ pane.paneId }}</span>
              </div>
            </div>
            <button @click="toggleActionMenu(pane.id)" class="action-menu-btn" title="Actions">
              <span>⋮</span>
            </button>
          </div>

          <!-- Action Menu Dropdown -->
          <div v-if="showActionMenu === pane.id && paneActions[pane.id]" class="action-menu-dropdown">
            <button
              v-for="action in paneActions[pane.id]"
              :key="action.id"
              @click="executeAction(pane, action)"
              class="action-menu-item"
              :disabled="executingAction"
            >
              <span class="action-icon">{{ action.icon || '•' }}</span>
              <span class="action-label">{{ action.label }}</span>
            </button>
          </div>

          <div class="pane-prompt-section">
            <div
              class="pane-prompt-header"
              @click="togglePrompt(pane.id)"
              :class="{ 'expanded': expandedPrompts.has(pane.id) }"
            >
              <span class="prompt-label">Initial Prompt</span>
              <span class="expand-icon">{{ expandedPrompts.has(pane.id) ? '▼' : '▶' }}</span>
            </div>
            <div v-if="expandedPrompts.has(pane.id)" class="pane-prompt">
              {{ pane.prompt || 'No prompt' }}
            </div>
          </div>

          <!-- Show agent summary when idle -->
          <div v-if="pane.agentStatus === 'idle' && pane.agentSummary" class="agent-summary">
            {{ pane.agentSummary }}
          </div>

          <div class="pane-interactive" @click.prevent>
            <!-- Options Dialog (when waiting with options) -->
            <div v-if="pane.agentStatus === 'waiting' && pane.options && pane.options.length > 0" class="options-dialog">
              <div class="options-question">{{ pane.optionsQuestion || 'Choose an option:' }}</div>
              <div v-if="pane.potentialHarm && pane.potentialHarm.hasRisk" class="options-warning">
                ⚠️ {{ pane.potentialHarm.description }}
              </div>
              <div v-if="loadingOptions.has(pane.id)" class="analyzing-state">
                <div class="loader-spinner"></div>
                <span>Processing selection...</span>
              </div>
              <div v-else class="options-buttons">
                <button
                  v-for="option in pane.options"
                  :key="option.action"
                  @click="selectOption(pane, option)"
                  class="option-button"
                  :class="{ 'option-button-danger': pane.potentialHarm && pane.potentialHarm.hasRisk }"
                  :disabled="loadingOptions.has(pane.id)"
                >
                  {{ option.action }}
                </button>
              </div>
            </div>

            <!-- Analyzing (show loader) -->
            <div v-else-if="pane.agentStatus === 'analyzing'" class="analyzing-state">
              <div class="loader-spinner"></div>
              <span>Analyzing...</span>
            </div>

            <!-- Working/Idle (show prompt input) -->
            <div v-else>
              <div class="prompt-input-wrapper">
                <textarea
                  v-model="promptInputs[pane.id]"
                  @input="autoExpand"
                  :placeholder="pane.agentStatus === 'working' ? 'Queue a prompt...' : 'Send a prompt...'"
                  :disabled="sendingPrompts.has(pane.id)"
                  class="prompt-textarea"
                  rows="1"
                ></textarea>
                <button
                  @click="sendPrompt(pane)"
                  :disabled="!promptInputs[pane.id] || sendingPrompts.has(pane.id)"
                  class="send-button"
                  :title="pane.agentStatus === 'working' ? 'Queue prompt' : 'Send prompt'"
                >
                  <span v-if="sendingPrompts.has(pane.id)" class="button-loader"></span>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 988.44 1200.05">
                    <path d="M425.13,28.37L30.09,423.41C11.19,441.37.34,466.2,0,492.27c-.34,26.07,9.86,51.17,28.29,69.61,18.43,18.45,43.52,28.67,69.59,28.35,26.07-.31,50.91-11.14,68.88-30.02l233.16-233.52v776.64c0,34.56,18.43,66.48,48.36,83.76,29.93,17.28,66.8,17.28,96.72,0,29.93-17.28,48.36-49.21,48.36-83.76V328.85l231.72,231.36c24.63,23.41,59.74,32.18,92.48,23.09,32.74-9.08,58.32-34.68,67.38-67.43,9.05-32.75.25-67.85-23.18-92.46L566.73,28.37C548.63,10.16,524-.04,498.33.05c-.8-.06-1.6-.06-2.4,0-.8-.06-1.6-.06-2.4,0-25.65,0-50.25,10.19-68.4,28.32h0Z"/>
                  </svg>
                </button>
              </div>
              <div v-if="queuedMessages[pane.id]" class="queued-message">
                ✓ {{ queuedMessages[pane.id] }}
              </div>
            </div>
          </div>

          <div v-if="pane.devStatus && pane.devStatus !== 'stopped'" class="dev-server-status">
            <span class="status-label">Dev Server:</span>
            <span class="status-badge" :class="pane.devStatus">{{ pane.devStatus }}</span>
            <a v-if="pane.devUrl" :href="pane.devUrl" target="_blank" class="dev-link">↗</a>
          </div>
        </div>
      </div>
    </main>

    <!-- Create Pane Dialog -->
    <div v-if="showCreateDialog" class="action-dialog-overlay" @click.self="closeCreateDialog">
      <div class="action-dialog">
        <h3>Create New Pane</h3>

        <div v-if="createStep === 'prompt'">
          <label for="pane-prompt">Provide an initial prompt for your agent</label>
          <textarea
            id="pane-prompt"
            v-model="newPanePrompt"
            placeholder="E.g., Fix the authentication bug, Add dark mode, etc."
            rows="4"
            @keydown.enter.meta="createPane"
            @keydown.enter.ctrl="createPane"
          ></textarea>
          <div class="dialog-hint">
            💡 Press <kbd>⌘ Enter</kbd> or <kbd>Ctrl Enter</kbd> to create
          </div>
          <div class="dialog-buttons">
            <button @click="closeCreateDialog" class="dialog-btn">Cancel</button>
            <button @click="createPane" :disabled="!newPanePrompt.trim() || creatingPane" class="dialog-btn dialog-btn-primary">
              {{ creatingPane ? 'Creating...' : 'Create Pane' }}
            </button>
          </div>
        </div>

        <div v-else-if="createStep === 'agent'">
          <p>Multiple agents available. Choose one:</p>
          <div class="agent-choices">
            <button
              v-for="agent in availableAgents"
              :key="agent"
              @click="selectAgent(agent)"
              class="agent-choice-button"
              :disabled="creatingPane"
            >
              {{ agent }}
            </button>
          </div>
          <div class="dialog-buttons">
            <button @click="closeCreateDialog" class="dialog-btn">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Dialogs -->
    <div v-if="actionDialog" class="action-dialog-overlay" @click.self="closeActionDialog">
      <!-- Confirm Dialog -->
      <div v-if="actionDialog.type === 'confirm'" class="action-dialog">
        <h3>{{ actionDialog.title }}</h3>
        <p>{{ actionDialog.message }}</p>
        <div v-if="actionDialogLoading" class="dialog-loading">
          <div class="loader-spinner"></div>
          <span>Processing...</span>
        </div>
        <div v-else class="dialog-buttons">
          <button @click="confirmAction(false)" class="dialog-btn" :disabled="actionDialogLoading">Cancel</button>
          <button @click="confirmAction(true)" class="dialog-btn dialog-btn-primary" :disabled="actionDialogLoading">Confirm</button>
        </div>
      </div>

      <!-- Choice Dialog -->
      <div v-else-if="actionDialog.type === 'choice'" class="action-dialog">
        <h3>{{ actionDialog.title }}</h3>
        <p v-if="actionDialog.message">{{ actionDialog.message }}</p>
        <div v-if="actionDialogLoading" class="dialog-loading">
          <div class="loader-spinner"></div>
          <span>Processing...</span>
        </div>
        <div v-else>
          <div class="choice-options">
            <button
              v-for="option in actionDialog.options"
              :key="option.id"
              @click="selectChoice(option.id)"
              class="choice-option-btn"
              :class="{ 'danger': option.danger }"
              :disabled="actionDialogLoading"
            >
              <div class="choice-label">{{ option.label }}</div>
              <div v-if="option.description" class="choice-description">{{ option.description }}</div>
            </button>
          </div>
          <div class="dialog-buttons">
            <button @click="closeActionDialog" class="dialog-btn" :disabled="actionDialogLoading">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Input Dialog -->
      <div v-else-if="actionDialog.type === 'input'" class="action-dialog">
        <h3>{{ actionDialog.title }}</h3>
        <p v-if="actionDialog.message">{{ actionDialog.message }}</p>
        <div v-if="actionDialogLoading" class="dialog-loading">
          <div class="loader-spinner"></div>
          <span>Processing...</span>
        </div>
        <div v-else>
          <input
            type="text"
            v-model="actionDialog.inputValue"
            :placeholder="actionDialog.placeholder"
            class="dialog-input"
            @keydown.enter="submitInput"
          />
          <div class="dialog-buttons">
            <button @click="closeActionDialog" class="dialog-btn" :disabled="actionDialogLoading">Cancel</button>
            <button @click="submitInput" class="dialog-btn dialog-btn-primary" :disabled="actionDialogLoading">Submit</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="../styles.css"></style>
