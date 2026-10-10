import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { brandLogoUri, useBrandLogos, useBrandProfile } from '@/lib/brand';
import { useSettings } from '@/lib/settings';
import { C, T } from '@/theme';

/**
 * The top of an Instagram profile, filled in from the brand kit (logo, name,
 * handle, tagline) so the grid below can be judged in context.
 */
export function ProfileHeader({ posts, planned }: { posts: number; planned?: number }) {
  const profile = useBrandProfile();
  const logos = useBrandLogos();
  const settings = useSettings();
  const name = profile.name || settings.name || 'Your profile';
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            {logos[0] ? (
              <Image source={{ uri: brandLogoUri(logos[0]) }} style={styles.logo} contentFit="contain" />
            ) : (
              <Text style={styles.initials}>{initials}</Text>
            )}
          </View>
        </View>
        <View style={styles.stats}>
          <Stat value={posts} label="posts" />
          {planned != null && <Stat value={planned} label="planned" />}
        </View>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.handle}>{profile.handle ? `@${profile.handle}` : 'Add your handle in the brand kit'}</Text>
      {!!profile.tagline && <Text style={styles.bio}>{profile.tagline}</Text>}
      {!!profile.website && <Text style={styles.link}>{profile.website}</Text>}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 14, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 10 },
  avatarRing: { width: 84, height: 84, borderRadius: 42, padding: 3, borderWidth: 2, borderColor: C.accent },
  avatar: {
    flex: 1,
    borderRadius: 40,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: '72%', height: '72%' },
  initials: { ...T.display, fontSize: 30 },
  stats: { flexDirection: 'row', gap: 28 },
  stat: { alignItems: 'center' },
  statValue: { ...T.semibold, fontSize: 18, fontVariant: ['tabular-nums'] },
  statLabel: { ...T.body, color: C.textDim, fontSize: 13 },
  name: { ...T.semibold, fontSize: 15 },
  handle: { ...T.body, color: C.textDim, fontSize: 13 },
  bio: { ...T.body, fontSize: 14, lineHeight: 19, marginTop: 4 },
  link: { ...T.medium, color: '#9DB7E0', fontSize: 14 },
});
