import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, Section } from '@/components/list';
import { IconButton } from '@/components/ui';
import { type CreditKind, NATIVE_LIBRARIES, PACKAGES, TYPEFACES, licenseName, licenseText, packageId } from '@/lib/acknowledgements';
import { C, R, T } from '@/theme';

type Detail = {
  title: string;
  facts: [string, string][];
  copyright: string[];
  note?: string;
  links: { label: string; url: string }[];
  text: string | null;
};

/**
 * Licence files are hard-wrapped at ~80 columns. Rejoin plain paragraphs so
 * they wrap to the screen; leave lists, indented and ruled blocks as written.
 */
function reflow(text: string) {
  return text
    // Ruled lines (----, ====) only wrap into noise on a phone.
    .replace(/^[ \t]*[=\-_*]{3,}[ \t]*$/gm, '')
    .split(/\n\s*\n/)
    .map((para) => para.replace(/^(\s*\n)+|(\n\s*)+$/g, ''))
    .filter((para) => para.trim())
    .map((para) => {
      const lines = para.split('\n');
      const structured =
        lines.some((l, i) => i > 0 && /^\s*([-*•]|\(?[a-z0-9]{1,3}[.)])\s/i.test(l)) ||
        lines.some((l) => /^\s{3,}\S/.test(l));
      if (structured) return para;
      // Headings (all caps, or ending in a colon) keep their own line.
      const heading = (l: string) => /^[^a-z]{3,}$/.test(l) || l.endsWith(':');
      return lines
        .map((l) => l.trim())
        .reduce((out, l, i, all) => (i === 0 ? l : out + (heading(all[i - 1]) || heading(l) ? '\n' : ' ') + l), '');
    })
    .join('\n\n');
}

const reflowed = (id: string | null) => {
  const text = licenseText(id);
  return text ? reflow(text) : null;
};

function detailFor(kind: CreditKind, id: string): Detail | null {
  if (kind === 'font') {
    const f = TYPEFACES.find((t) => t.family === id);
    if (!f) return null;
    return {
      title: f.family,
      facts: [
        ['Styles', f.styles.join(', ')],
        ...(f.designer ? [['Designer', f.designer] as [string, string]] : []),
        ['Licence', licenseName(f.license)],
      ],
      copyright: f.copyright ? [f.copyright] : [],
      links: [
        ...(f.designerUrl ? [{ label: 'Designer’s website', url: f.designerUrl }] : []),
        ...(f.licenseUrl ? [{ label: 'About the licence', url: f.licenseUrl }] : []),
      ],
      text: reflowed(f.text),
    };
  }
  if (kind === 'native') {
    const n = NATIVE_LIBRARIES.find((l) => l.id === id);
    if (!n) return null;
    return {
      title: n.name,
      facts: [
        ['Included by', n.via],
        ['Licence', licenseName(n.license)],
      ],
      copyright: n.copyright,
      note: n.note,
      links: [{ label: 'Project website', url: n.url }],
      text: reflowed(n.text),
    };
  }
  const p = PACKAGES.find((pkg) => packageId(pkg) === id);
  if (!p) return null;
  return {
    title: p.name,
    facts: [
      ['Version', p.version],
      ['Licence', licenseName(p.license)],
    ],
    copyright: p.copyright,
    links: [{ label: 'Project website', url: p.url }],
    text: reflowed(p.text),
  };
}

export default function LicenceScreen() {
  const insets = useSafeAreaInsets();
  const { kind, id } = useLocalSearchParams<{ kind: CreditKind; id: string }>();
  const detail = detailFor(kind, id);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <View style={{ width: 44 }} />
      </View>

      {detail ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 22 }}>
          <Text style={styles.title}>{detail.title}</Text>

          <Section>
            {detail.facts.map(([label, value], i) => (
              <Row key={label} title={label} value={value} last={i === detail.facts.length - 1 && !detail.links.length} />
            ))}
            {detail.links.map((l, i) => (
              <Row
                key={l.url}
                title={l.label}
                detail={l.url.replace(/^https?:\/\/(www\.)?/, '')}
                onPress={() => WebBrowser.openBrowserAsync(l.url).catch(() => {})}
                last={i === detail.links.length - 1}
              />
            ))}
          </Section>

          {detail.note && (
            <View style={styles.note}>
              <Text style={styles.noteText}>{detail.note}</Text>
            </View>
          )}

          {(detail.copyright.length > 0 || detail.text) && (
            <View style={styles.licence}>
              {detail.copyright.map((line) => (
                <Text key={line} style={styles.copyright} selectable>
                  {line}
                </Text>
              ))}
              {detail.text && (
                <Text style={[styles.text, detail.copyright.length > 0 && { marginTop: 14 }]} selectable>
                  {detail.text}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <Text style={styles.missing}>This credit couldn’t be found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  title: { ...T.display, fontSize: 34, letterSpacing: -0.3, paddingHorizontal: 4 },
  note: { borderRadius: R.md, borderWidth: 1, borderColor: C.accent + '55', backgroundColor: C.accent + '14', padding: 14 },
  noteText: { ...T.medium, color: C.accent, fontSize: 13, lineHeight: 18 },
  licence: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineSoft },
  copyright: { ...T.medium, fontSize: 13, lineHeight: 18 },
  text: { ...T.body, color: C.textDim, fontSize: 12.5, lineHeight: 18 },
  missing: { ...T.body, color: C.textDim, textAlign: 'center', marginTop: 60 },
});
