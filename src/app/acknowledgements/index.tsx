import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Row, Section } from '@/components/list';
import { Icon, IconButton } from '@/components/ui';
import { NATIVE_LIBRARIES, PACKAGES, TYPEFACES, licenseName } from '@/lib/acknowledgements';
import { PHOTO_CREDITS, PLATFORM_CREDITS, SERVICES, UNSPLASH_LICENSE } from '@/lib/credits';
import { PHOTOS } from '@/lib/samples';
import { C, T } from '@/theme';

const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

export default function AcknowledgementsScreen() {
  const insets = useSafeAreaInsets();
  const platform = PLATFORM_CREDITS[Platform.OS === 'android' ? 'android' : 'ios'];
  const notices = NATIVE_LIBRARIES.filter((n) => n.note);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <IconButton label="Back" icon={{ ios: 'chevron.left', android: 'arrow_back' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Acknowledgements</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 26 }}>
        <View style={styles.intro}>
          <Text style={styles.thanks}>Thank you.</Text>
          <Text style={styles.introText}>
            Seam is built on the work of photographers, type designers and open-source developers who chose to share
            what they made. Everyone below made something that ships inside this app.
          </Text>
        </View>

        <Section title="Photography" footer="Sample photos in templates. Free to use under the Unsplash License; credit is our thanks.">
          {PHOTO_CREDITS.map((p) => (
            <Pressable
              key={p.scene}
              onPress={() => open(p.url)}
              accessibilityRole="link"
              accessibilityLabel={`${p.title}, photo by ${p.author}`}
              style={({ pressed }) => [styles.photoRow, pressed && styles.pressed]}>
              <Image source={PHOTOS[p.scene]} style={styles.thumb} contentFit="cover" />
              <View style={[styles.photoBody, styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {p.author}
                  </Text>
                  <Text style={styles.rowDetail}>{p.title} · Unsplash</Text>
                </View>
                <Icon name={{ ios: 'arrow.up.right', android: 'open_in_new' }} size={12} color={C.textFaint} />
              </View>
            </Pressable>
          ))}
          <Row icon={{ ios: 'doc.text', android: 'description' }} title="Unsplash License" onPress={() => open(UNSPLASH_LICENSE)} last />
        </Section>

        <Section title="Typefaces" footer="Free to use and share under their licences. Tap a typeface to read its licence.">
          {TYPEFACES.map((f, i) => (
            <Row
              key={f.family}
              title={f.family}
              detail={[f.designer, licenseName(f.license)].filter(Boolean).join(' · ')}
              onPress={() => router.push({ pathname: '/acknowledgements/licence', params: { kind: 'font', id: f.family } })}
              last={i === TYPEFACES.length - 1}
            />
          ))}
        </Section>

        <Section title="Open-source software" footer="Every library compiled into this version of Seam, with its licence.">
          <Row
            icon={{ ios: 'curlybraces', android: 'data_object' }}
            title="JavaScript packages"
            detail="React Native, Expo, Reanimated, Skia and more"
            value={String(PACKAGES.length)}
            onPress={() => router.push({ pathname: '/acknowledgements/software', params: { kind: 'package' } })}
          />
          <Row
            icon={{ ios: 'cpu', android: 'memory' }}
            title="Native libraries"
            detail="Hermes, Skia, image codecs and more"
            value={String(NATIVE_LIBRARIES.length)}
            onPress={() => router.push({ pathname: '/acknowledgements/software', params: { kind: 'native' } })}
            last
          />
        </Section>

        {notices.length > 0 && (
          <Section title="Notices">
            <View style={styles.notices}>
              {notices.map((n) => (
                <Text key={n.id} style={styles.notice}>
                  {n.note}
                </Text>
              ))}
            </View>
          </Section>
        )}

        <Section title="Services">
          {SERVICES.map((s, i) => (
            <Row key={s.title} title={s.title} detail={s.detail} onPress={s.url ? () => open(s.url!) : undefined} last={i === SERVICES.length - 1} />
          ))}
        </Section>

        <Section title="Platform">
          {platform.map((s, i) => (
            <Row key={s.title} title={s.title} detail={s.detail} onPress={s.url ? () => open(s.url!) : undefined} last={i === platform.length - 1} />
          ))}
        </Section>

        <Text style={styles.signoff}>Made by Gauransh Sharma, with gratitude.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52 },
  headerTitle: { ...T.display, fontSize: 24 },
  intro: { gap: 8, paddingHorizontal: 4, paddingTop: 6 },
  thanks: { ...T.displayItalic, fontSize: 40, color: C.accent, letterSpacing: -0.3 },
  introText: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 20 },
  photoRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  pressed: { backgroundColor: '#FFFFFF0A' },
  thumb: { width: 40, height: 40, borderRadius: 9, marginRight: 12, backgroundColor: C.surfaceHi },
  photoBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, paddingVertical: 9, paddingRight: 16 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowTitle: { ...T.medium, fontSize: 15 },
  rowDetail: { ...T.body, color: C.textDim, fontSize: 12 },
  notices: { padding: 14, gap: 10 },
  notice: { ...T.body, color: C.textDim, fontSize: 13, lineHeight: 18 },
  signoff: { ...T.displayItalic, color: C.textDim, fontSize: 17, textAlign: 'center', marginTop: 4 },
});
