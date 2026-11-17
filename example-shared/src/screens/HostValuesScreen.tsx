import { useMemo, useState } from 'react';
import { Text, TextInput } from 'react-native';
import {
  RemoteComposeView,
  type RemoteComposeActionEvent,
  type RemoteComposeLoadEvent,
} from 'react-native-remote-compose';
import { productCardRc } from '../documents';
import { Button, Mono, Row, Section, styles } from '../ui';

const ACCENTS = ['#6750A4', '#00897B', '#E65100', '#C2185B'] as const;

/**
 * The host owns the state: the document declares named values (`title`, `rating`, `count`,
 * `accent`) and raises `add_to_cart`; React state drives the values and reacts to the action.
 */
export function HostValuesScreen() {
  const [title, setTitle] = useState('Flat white');
  const [rating, setRating] = useState(0.6);
  const [accent, setAccent] = useState<string>(ACCENTS[0]);
  const [count, setCount] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<RemoteComposeLoadEvent | null>(null);
  const [details, setDetails] = useState(false);

  const namedValues = useMemo(
    () => ({
      title,
      rating,
      count,
      accent: { type: 'color' as const, value: accent },
    }),
    [title, rating, count, accent]
  );

  const onAction = (event: RemoteComposeActionEvent) => {
    setEvents((list) => [JSON.stringify(event), ...list].slice(0, 5));
    if (event.kind !== 'named') return;
    if (event.name === 'add_to_cart') setCount((c) => c + 1);
    if (event.name === 'show_details') setDetails(true);
  };

  return (
    <>
      <Section title="Document (product_card.rc)">
        <RemoteComposeView
          testID="product-card"
          style={styles.player}
          source={productCardRc}
          namedValues={namedValues}
          onAction={onAction}
          onLoad={setLoaded}
          onError={(e) =>
            setEvents((l) => [`error ${e.code}: ${e.message}`, ...l])
          }
        />
      </Section>
      {details ? (
        <Section title="Long press → show_details">
          <Text>{title}: details opened by a long press in the document.</Text>
          <Button label="close" onPress={() => setDetails(false)} />
        </Section>
      ) : null}
      <Section title="Host values → document">
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <Row>
          <Button
            label="rating −"
            onPress={() => setRating((r) => Math.max(0, r - 0.1))}
          />
          <Button
            label="rating +"
            onPress={() => setRating((r) => Math.min(1, r + 0.1))}
          />
          <Button label="reset cart" onPress={() => setCount(0)} />
        </Row>
        <Row>
          {ACCENTS.map((color) => (
            <Button
              key={color}
              label={color}
              selected={color === accent}
              onPress={() => setAccent(color)}
            />
          ))}
        </Row>
      </Section>
      <Section title="Document → host (onAction)">
        <Text>Cart: {count}</Text>
        {events.length === 0 ? (
          <Mono>Tap “Add to cart” (click) or hold it (long press)</Mono>
        ) : null}
        {events.map((line, i) => (
          <Mono key={i}>{line}</Mono>
        ))}
      </Section>
      {loaded ? (
        <Section title="onLoad">
          <Mono>
            {loaded.byteLength} bytes · load {loaded.loadMs.toFixed(1)} ms ·
            decode {loaded.decodeMs.toFixed(1)} ms
          </Mono>
          <Mono>declares: {loaded.namedValues.join(', ')}</Mono>
        </Section>
      ) : null}
    </>
  );
}
