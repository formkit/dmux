
    // Apply theme on mount
    document.documentElement.setAttribute('data-theme', this.theme);

    this.startAutoRefresh();

    // Handle page visibility to pause/resume updates
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAutoRefresh();
      } else {
        this.startAutoRefresh();
      