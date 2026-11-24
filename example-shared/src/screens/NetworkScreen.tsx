import { useState } from 'react';
import {
  RemoteComposeView,
  type RemoteComposeLoadEvent,
} from 'react-native-remote-compose';
import { networkDocuments } from '../documents';
import { Button, Mono, Row, Section, styles } from '../ui';

/** Documents fetched over HTTPS by the native side (real AndroidX captures). */
export function NetworkScreen() {
  const [index, setIndex] = useState(0);
  const [lenient, setLenient] = useState(true);
  const [status, setStatus] = useState('loading…');
  const doc = networkDocuments[index] ?? networkDocuments[0];

  const onLoad = (e: RemoteComposeLoadEvent) => {
    setStatus(
      `${e.byteLength} bytes · fetch ${e.loadMs.toFixed(0)} ms · decode ${e.decodeMs.toFixed(1)} ms`
    );
  };

  return (
    <>
      <Section title={doc.label}>
        <RemoteComposeView
          style={[styles.player, styles.playerTall]}
          source={{ uri: doc.uri }}
          lenient={lenient}
          onLoad={onLoad}
          onError={(e) => {
            setStatus(`error ${e.code}: ${e.message}`);
          }}
        />
        <Mono>{status}</Mono>
        {'note' in doc ? <Mono>{doc.note}</Mono> : null}
      </Section>
      <Section title="Documents">
        <Row>
          {networkDocuments.map((d, i) => (
            <Button
              key={d.uri}
              label={d.label}
              selected={i === index}
              onPress={() => {
                setStatus('loading…');
                setIndex(i);
              }}
            />
          ))}
        </Row>
        <Row>
          <Button
            label={lenient ? 'lenient: on' : 'lenient: off'}
            selected={lenient}
            onPress={() => {
              setLenient((v) => !v);
            }}
          />
        </Row>
      </Section>
    </>
  );
}
