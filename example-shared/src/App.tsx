import { useEffect, useState } from 'react';
import {
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HostValuesScreen } from './screens/HostValuesScreen';
import { JsonScreen } from './screens/JsonScreen';
import { NetworkScreen } from './screens/NetworkScreen';
import { PerformanceScreen } from './screens/PerformanceScreen';
import { Button, colors } from './ui';

const TABS = ['host', 'json', 'network', 'perf'] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  host: 'Host values',
  json: 'JSON',
  network: 'Network',
  perf: 'Performance',
};

/** `rcdemo://perf?autorun=1` opens a tab (and starts the benchmark) from adb / simctl. */
function parseLink(url: string | null | undefined): {
  tab?: Tab;
  autorun: boolean;
} {
  if (!url) return { autorun: false };
  const match = /^rcdemo:\/\/(\w+)(\?.*)?$/.exec(url);
  const tab = match?.[1] as Tab | undefined;
  return {
    tab: tab && TABS.includes(tab) ? tab : undefined,
    autorun: /autorun=1/.test(match?.[2] ?? ''),
  };
}

export function DemoApp({ title }: { title: string }) {
  const [tab, setTab] = useState<Tab>('host');
  const [autorun, setAutorun] = useState(false);

  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      const link = parseLink(url);
      if (link.tab) setTab(link.tab);
      setAutorun(link.autorun);
    };
    Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener('url', ({ url }) => apply(url));
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <Button
                key={t}
                label={LABELS[t]}
                selected={t === tab}
                onPress={() => setTab(t)}
              />
            ))}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'host' && <HostValuesScreen />}
          {tab === 'json' && <JsonScreen />}
          {tab === 'network' && <NetworkScreen />}
          {tab === 'perf' && <PerformanceScreen autorun={autorun} />}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  content: { padding: 16 },
});
