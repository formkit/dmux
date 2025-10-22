#!/usr/bin/env node
/**
 * Remote Access Popup - Displays tunnel URL and QR code for remote access
 */

import React, { useState, useEffect, useMemo } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import * as fs from 'fs';
import { execSync } from 'child_process';
// @ts-ignore - No types available for qrcode-terminal
import qrcode from 'qrcode-terminal';
import { PopupWrapper } from './shared/index.js';
import { POPUP_CONFIG } from './config.js';

interface RemotePopupAppProps {
  resultFile: string;
  serverPort: number;
  statusFile: string;
}

const RemotePopupApp: React.FC<RemotePopupAppProps> = ({
  resultFile,
  serverPort,
  statusFile
}) => {
  const { exit } = useApp();
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [copied, setCopied] = useState(false);

  const closePopup = (wasCopied: boolean) => {
    try {
      fs.writeFileSync(resultFile, JSON.stringify({ closed: true, copied: wasCopied }));
    } catch (error) {
      console.error('[remotePopup] Failed to write result file:', error);
    }
    exit();
  };

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      closePopup(false);
    } else if (input === 'c' && tunnelUrl) {
      // Copy URL to clipboard
      try {
        // Try pbcopy (macOS)
        execSync(`pbcopy`, { input: tunnelUrl, stdio: 'pipe' });
      } catch {
        try {
          // Try xclip (Linux)
          execSync(`xclip -selection clipboard`, { input: tunnelUrl, stdio: 'pipe' });
        } catch {
          // Clipboard not available
        }
      }
      // Close popup after copying, mark as copied
      closePopup(true);
    }
  });

  // Spinner animation
  useEffect(() => {
    if (!isCreating) return;

    const spinnerInterval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % 10);
    }, 80); // Update every 80ms

    return () => clearInterval(spinnerInterval);
  }, [isCreating]);

  // Poll status file for tunnel creation result
  useEffect(() => {
    const pollInterval = setInterval(() => {
      try {
        if (fs.existsSync(statusFile)) {
          const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          if (data.url) {
            setTunnelUrl(data.url);
            setIsCreating(false);
            clearInterval(pollInterval);
          } else if (data.error) {
            setError(data.error);
            setIsCreating(false);
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        // File might not exist yet or be incomplete, keep polling
      }
    }, 100); // Poll every 100ms

    // Cleanup
    return () => clearInterval(pollInterval);
  }, [statusFile]);

  // Generate QR code
  const qrString = useMemo(() => {
    if (!tunnelUrl) return '';
    let output = '';
    qrcode.generate(tunnelUrl, { small: true }, (qr: string) => {
      output = qr;
    });
    return output;
  }, [tunnelUrl]);

  // Spinner frames
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const currentSpinner = spinnerFrames[spinnerFrame];

  if (isCreating) {
    return (
      <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text bold color={POPUP_CONFIG.titleColor}>Remote Access</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="yellow">{currentSpinner} Creating tunnel...</Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor>This may take up to 30 seconds</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to close</Text>
          </Box>
        </Box>
      </PopupWrapper>
    );
  }

  if (error) {
    return (
      <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text bold color={POPUP_CONFIG.titleColor}>Remote Access</Text>
          </Box>
          <Text color="red">{error}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to close</Text>
          </Box>
        </Box>
      </PopupWrapper>
    );
  }

  if (!tunnelUrl) {
    return (
      <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text bold color={POPUP_CONFIG.titleColor}>Remote Access</Text>
          </Box>
          <Text color="red">No tunnel URL available</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to close</Text>
          </Box>
        </Box>
      </PopupWrapper>
    );
  }

  return (
    <PopupWrapper resultFile={resultFile} allowEscapeToCancel={false}>
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color={POPUP_CONFIG.titleColor}>Remote Access</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Scan to access dashboard:</Text>
          <Text>{qrString}</Text>
          <Text dimColor>{tunnelUrl}</Text>
        </Box>

        {copied && (
          <Box marginTop={1} marginBottom={1}>
            <Text color="green">✓ Copied to clipboard!</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Press [c] to copy URL • [Esc] to close</Text>
        </Box>
      </Box>
    </PopupWrapper>
  );
};

// Main entry point
const main = async () => {
  const resultFile = process.argv[2];
  if (!resultFile) {
    console.error('Error: Result file path required');
    process.exit(1);
  }

  const dataFile = process.argv[3];
  if (!dataFile) {
    console.error('Error: Data file path required');
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    render(<RemotePopupApp
      resultFile={resultFile}
      serverPort={data.serverPort}
      statusFile={data.statusFile}
    />);
  } catch (error) {
    console.error('Failed to read data file:', error);
    process.exit(1);
  }
};

main();
