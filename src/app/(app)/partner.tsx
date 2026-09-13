import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { InviterInfoDto } from '@/hooks/use-partner';
import { usePartner } from '@/hooks/use-partner';

export default function PartnerScreen() {
  const { token: deepLinkToken } = useLocalSearchParams<{ token?: string }>();
  const { partner, isLoading, generateInvite, getInviteInfo, acceptInvite, unlink } = usePartner();

  const [invite, setInvite] = useState<{ token: string; deepLink: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [unlinkPending, setUnlinkPending] = useState(false);

  // Code-entry state
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // Confirmation view state
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [inviterInfo, setInviterInfo] = useState<InviterInfoDto | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);

  // Auto-handle deep link token on mount / when it changes
  useEffect(() => {
    if (!deepLinkToken) return;
    handleLookupToken(deepLinkToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkToken]);

  async function handleLookupToken(token: string) {
    setCodeError(null);
    setCodeLoading(true);
    try {
      const info = await getInviteInfo(token);
      setPendingToken(token);
      setInviterInfo(info);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 410) {
        setCodeError('This invite has expired.');
      } else {
        setCodeError('Code not found.');
      }
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleCodeSubmit() {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 8) {
      setCodeError('Enter the full 8-character code.');
      return;
    }
    await handleLookupToken(code);
  }

  function handleDecline() {
    setPendingToken(null);
    setInviterInfo(null);
    setCodeInput('');
    setCodeError(null);
  }

  async function handleAccept() {
    if (!pendingToken) return;
    setAcceptLoading(true);
    try {
      await acceptInvite(pendingToken);
      setPendingToken(null);
      setInviterInfo(null);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        setCodeError('One of you is already linked to someone else.');
      } else if (status === 410) {
        setCodeError('This invite has expired.');
      } else {
        setCodeError('Something went wrong. Please try again.');
      }
      setPendingToken(null);
      setInviterInfo(null);
    } finally {
      setAcceptLoading(false);
    }
  }

  async function handleGenerateInvite() {
    setInviteError(null);
    try {
      const result = await generateInvite();
      setInvite({ token: result.token, deepLink: result.deepLink });
    } catch (e) {
      console.error('[PartnerScreen] generateInvite failed', e);
      setInviteError("Couldn't generate invite. Please try again.");
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

  async function handleConfirmUnlink() {
    try {
      await unlink();
    } catch (e) {
      console.error('[PartnerScreen] unlink failed', e);
    } finally {
      setUnlinkPending(false);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  // --- Linked state ---
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
            <Pressable style={styles.buttonSecondary} onPress={() => setUnlinkPending(true)}>
              <ThemedText type="default">Unlink</ThemedText>
            </Pressable>
          )}
        </ThemedView>
      </SafeAreaView>
    );
  }

  // --- Confirmation view ---
  if (inviterInfo && pendingToken) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedText type="title">Link with partner?</ThemedText>
          <ThemedView style={styles.card}>
            <ThemedText type="default" style={styles.bold}>
              {inviterInfo.inviterName ?? inviterInfo.inviterEmail}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{inviterInfo.inviterEmail}</ThemedText>
          </ThemedView>
          <ThemedView style={styles.buttonRow}>
            <Pressable style={[styles.buttonPrimary, styles.flex1]} onPress={handleAccept} disabled={acceptLoading}>
              <ThemedText type="default" style={styles.bold}>
                {acceptLoading ? 'Linking…' : 'Accept'}
              </ThemedText>
            </Pressable>
            <Pressable style={[styles.buttonSecondary, styles.flex1]} onPress={handleDecline}>
              <ThemedText type="default">Decline</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      </SafeAreaView>
    );
  }

  // --- Unlinked state ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
            <>
              <Pressable style={styles.buttonPrimary} onPress={handleGenerateInvite}>
                <ThemedText type="default" style={styles.bold}>Invite your partner</ThemedText>
              </Pressable>
              {inviteError ? (
                <ThemedText type="small" style={styles.errorText}>{inviteError}</ThemedText>
              ) : null}
            </>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.divider}>
            {'— or enter a partner’s code —'}
          </ThemedText>

          <ThemedView style={styles.codeEntryRow}>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(t) => { setCodeInput(t.toUpperCase()); setCodeError(null); }}
              placeholder="ABCD1234"
              autoCapitalize="characters"
              maxLength={8}
              autoCorrect={false}
            />
            <Pressable
              style={[styles.buttonPrimary, styles.linkButton]}
              onPress={handleCodeSubmit}
              disabled={codeLoading}>
              <ThemedText type="default" style={styles.bold}>
                {codeLoading ? '…' : 'Link'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          {codeError ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
              {codeError}
            </ThemedText>
          ) : null}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1 },
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
    width: '100%',
  },
  flex1: { flex: 1, width: undefined },
  divider: {
    textAlign: 'center',
  },
  codeEntryRow: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.two,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  linkButton: {
    width: undefined,
    paddingHorizontal: Spacing.three,
  },
  errorText: {
    color: '#D94A4A',
  },
  bold: {
    fontWeight: '700',
  },
});
