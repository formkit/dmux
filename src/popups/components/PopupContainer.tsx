import React from 'react';
import { Box, Text } from 'ink';
import { POPUP_CONFIG } from '../config.js';

interface PopupContainerProps {
  children: React.ReactNode;
  title?: string;
  footer?: string;
  borderStyle?: 'round' | 'bold' | 'single';
  width?: number;
}

/**
 * Reusable container component that applies consistent styling to all popups
 */
export const PopupContainer: React.FC<PopupContainerProps> = ({
  children,
  title,
  footer,
  borderStyle = POPUP_CONFIG.borderStyle,
  width,
}) => {
  return (
    <Box flexDirection="column" paddingX={POPUP_CONFIG.containerPadding.x} paddingY={POPUP_CONFIG.containerPadding.y} width={width}>
      {title && (
        <Box marginBottom={POPUP_CONFIG.sectionSpacing}>
          <Text bold color={POPUP_CONFIG.titleColor}>{title}</Text>
        </Box>
      )}
      {children}
      {footer && (
        <Box marginTop={POPUP_CONFIG.sectionSpacing}>
          <Text dimColor italic>{footer}</Text>
        </Box>
      )}
    </Box>
  );
};
