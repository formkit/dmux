import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

// @ts-ignore - No types available for qrcode-terminal
import qrcode from 'qrcode-terminal';

interface QRCodeProps {
  url: string;
}

const QRCode: React.FC<QRCodeProps> = ({ url }) => {
  const qrString = useMemo(() => {
    let output = '';
    qrcode.generate(url, { small: true }, (qr: string) => {
      output = qr;
    });
    return output;
  }, [url]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Scan to access dashboard:</Text>
      <Text>{qrString}</Text>
      <Text dimColor>{url}</Text>
    </Box>
  );
};

export default QRCode;
