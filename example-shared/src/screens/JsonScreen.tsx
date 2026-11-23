import { useState } from 'react';
import { Platform, Text } from 'react-native';
import {
  RemoteComposeView,
  convertJsonToRc,
  isJsonConversionSupported,
} from 'react-native-remote-compose';
import { pulseJson, pulseRc } from '../documents';
import { Button, Mono, Row, Section, styles } from '../ui';

/**
 * AndroidX authoring JSON. Android converts it on the device with AndroidX's own parser;
 * iOS has no converter, so the same document is shipped pre-converted (`yarn documents`).
 */
export function JsonScreen() {
  const supported = isJsonConversionSupported();
  const [speed, setSpeed] = useState(2);
  const [label, setLabel] = useState('Tap the circle');
  const [status, setStatus] = useState<string>('');

  const convert = async () => {
    const start = Date.now();
    try {
      const base64 = await convertJsonToRc(pulseJson);
      setStatus(
        `converted: ${Math.floor((base64.length * 3) / 4)} bytes in ${Date.now() - start} ms`
      );
    } catch (e) {
      setStatus(`rejected: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <Section
        title={
          supported
            ? 'source={{ json }} (converted on device)'
            : 'Pre-converted .rc'
        }
      >
        <RemoteComposeView
          style={styles.player}
          source={supported ? { json: pulseJson } : pulseRc}
          namedValues={{ speed, label }}
          onAction={(e) => {
            if (e.kind === 'named') {
              setLabel(
                `Tapped ${e.name} at ${new Date().toLocaleTimeString()}`
              );
            }
          }}
          onError={(e) => {
            setStatus(`error ${e.code}: ${e.message}`);
          }}
        />
        <Row>
          <Button
            label="slower"
            onPress={() => {
              setSpeed((s) => Math.max(0.5, s / 2));
            }}
          />
          <Button
            label="faster"
            onPress={() => {
              setSpeed((s) => Math.min(16, s * 2));
            }}
          />
          <Mono>speed = {speed}</Mono>
        </Row>
      </Section>
      <Section title="convertJsonToRc()">
        <Text>
          {Platform.OS}: on-device JSON conversion is{' '}
          {supported ? 'available' : 'not available'}.
        </Text>
        <Row>
          <Button label="Convert pulse.json" onPress={convert} />
        </Row>
        {status ? <Mono>{status}</Mono> : null}
      </Section>
      {!supported ? (
        <Section title="{ json } on iOS">
          <RemoteComposeView
            style={[styles.player, styles.playerShort]}
            source={{ json: pulseJson }}
            onError={(e) => {
              setStatus(`expected → ${e.code}: ${e.message}`);
            }}
          />
        </Section>
      ) : null}
    </>
  );
}
