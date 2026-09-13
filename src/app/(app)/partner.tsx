import { useState } from 'react';
import { Pressable, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { usePartner } from '@/hooks/use-partner';

export default function PartnerScreen() {
  const { partner, isLoading, generateInvite, unlink } = usePartner();
  const [invite, setInvite] = useState<{ token: string; deepLink: string } | null>(null);
  const [unlinkPending, setUnlinkPending] = useState(false);

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  async function handleGenerateInvite() {
    try {
      const result = await generateInvite();
      setInvite({ token: result.token, deepLink: result.deepLink });
    } catch (e) {
      console.error('[PartnerScreen] generateInvite failed', e);
    }
  }

  async function handleShare() {
    if (!invite) return;
    try {
      await Share.share({ message: invite.deepLink });
    } catch (e) {
      console.error('[PartnerScreen] share failed', e);
    }
  }

  async function handleUnlink() {
    setUnlinkPending(true);
  }

  async function handleConfirmUnlink() {
    try {
      await unlink();
    } catch (e) {
      console.error('[PartnerScreen] unlink failed', e);
    } finally {
      setUnlinkPending(false);
    }
  }

  if (partner) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedText type="title">Partner</ThemedText>
          <ThemedView style={styles.card}>
            <ThemedText type="default" style={styles.bold}>{partner.displayName ?? partner.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{partner.email}</ThemedText>
          </ThemedView>

          {unlinkPending ? (
            <ThemedView style={styles.confirmRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.confirmText}>
                Are you sure? This removes the link for both of you.
              </ThemedText>
              <ThemedView style={styles.buttonRow}>
                <Pressable style={styles.buttonDestructive} onPress={handleConfirmUnlink}>
                  <ThemedText type="default" style={styles.bold}>Confirm</ThemedText>
                </Pressable>
                <Pressable style={styles.buttonSecondary} onPress={() => setUnlinkPending(false)}>
                  <ThemedText type="default">Cancel</ThemedText>
                </Pressable>
              </ThemedView>
            </ThemedView>
          ) : (
            <Pressable style={styles.buttonSecondary} onPress={handleUnlink}>
              <ThemedText type="default">Unlink</ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Partner</ThemedText>

        {invite ? (
          <ThemedView style={styles.inviteCard}>
            <ThemedText type="small" themeColor="textSecondary">Your invite code</ThemedText>
            <ThemedText style={styles.code}>{invite.token}</ThemedText>
            <Pressable style={styles.buttonPrimary} onPress={handleShare}>
              <ThemedText type="default" style={styles.bold}>Share invite link</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <Pressable style={styles.buttonPrimary} onPress={handleGenerateInvite}>
            <ThemedText type="default" style={styles.bold}>Invite your partner</ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.three,
  },
  card: {
    width: '100%',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  inviteCard: {
    width: '100%',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.three,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
  },
  buttonPrimary: {
    width: '100%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
    backgroundColor: '#4A90D9',
  },
  buttonSecondary: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#888',
  },
  buttonDestructive: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    alignItems: 'center',
    backgroundColor: '#D94A4A',
  },
  confirmRow: {
    width: '100%',
    gap: Spacing.two,
    alignItems: 'center',
  },
  confirmText: {
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bold: {
    fontWeight: '700',
  },
});
