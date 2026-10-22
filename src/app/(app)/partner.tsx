import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { InviterInfoDto } from '@/hooks/use-partner';
import { usePartner } from '@/hooks/use-partner';

type CodeError = 'expired' | 'notFound' | 'codeLength' | 'alreadyLinked' | 'generic';

export default function PartnerScreen() {
  const { t } = useTranslation();
  const { token: deepLinkToken } = useLocalSearchParams<{ token?: string }>();
  const { partner, isLoading, refresh, generateInvite, getInviteInfo, acceptInvite, unlink } =
    usePartner();

  const [invite, setInvite] = useState<{ token: string; deepLink: string; expiresAt: string } | null>(
    null,
  );
  const [inviteFailed, setInviteFailed] = useState(false);
  const [unlinkPending, setUnlinkPending] = useState(false);

  // Code-entry state
  const [codeInput, setCodeInput] = useState('');
  // Keys, not text: translated at render so a language switch updates a visible error.
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  // Confirmation view state
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [inviterInfo, setInviterInfo] = useState<InviterInfoDto | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);

  // While my invite code is shown on this screen, poll so it switches to linked once the partner
  // accepts. Each poll starts after the previous one finished (slow responses still land), and
  // polling stops when the code expires.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!invite || partner || !isFocused) return;
    const expiresAt = Date.parse(invite.expiresAt);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (Date.now() >= expiresAt) return;
      await refresh().catch(console.error);
      if (!cancelled) timer = setTimeout(poll, 3_000);
    }
    timer = setTimeout(poll, 3_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, partner, isFocused]);

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
        setCodeError('expired');
      } else {
        setCodeError('notFound');
      }
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleCodeSubmit() {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 8) {
      setCodeError('codeLength');
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
        setCodeError('alreadyLinked');
      } else if (status === 410) {
        setCodeError('expired');
      } else {
        setCodeError('generic');
      }
      setPendingToken(null);
      setInviterInfo(null);
    } finally {
      setAcceptLoading(false);
    }
  }

  async function handleGenerateInvite() {
    setInviteFailed(false);
    try {
      const result = await generateInvite();
      setInvite({ token: result.token, deepLink: result.deepLink, expiresAt: result.expiresAt });
    } catch (e) {
      console.error('[PartnerScreen] generateInvite failed', e);
      setInviteFailed(true);
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
        <ThemedText type="small" themeColor="textSecondary">{t('common.loading')}</ThemedText>
      </ThemedView>
    );
  }

  // --- Linked state ---
  if (partner) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.container}>
          <ThemedText type="title" style={styles.title}>{t('partner.title')}</ThemedText>
          <ThemedView style={styles.card}>
            <ThemedText type="default" style={styles.bold}>{partner.displayName ?? partner.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{partner.email}</ThemedText>
          </ThemedView>

          {unlinkPending ? (
            <ThemedView style={styles.confirmRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.confirmText}>
                {t('partner.unlinkConfirm')}
              </ThemedText>
              <ThemedView style={styles.buttonRow}>
                <Pressable style={styles.buttonDestructive} onPress={handleConfirmUnlink}>
                  <ThemedText type="default" style={styles.bold}>{t('common.confirm')}</ThemedText>
                </Pressable>
                <Pressable style={styles.buttonSecondary} onPress={() => setUnlinkPending(false)}>
                  <ThemedText type="default">{t('common.cancel')}</ThemedText>
                </Pressable>
              </ThemedView>
            </ThemedView>
          ) : (
            <Pressable style={styles.buttonSecondary} onPress={() => setUnlinkPending(true)}>
              <ThemedText type="default">{t('partner.unlink')}</ThemedText>
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
          <ThemedText type="title">{t('partner.linkPrompt')}</ThemedText>
          <ThemedView style={styles.card}>
            <ThemedText type="default" style={styles.bold}>
              {inviterInfo.inviterName ?? inviterInfo.inviterEmail}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{inviterInfo.inviterEmail}</ThemedText>
          </ThemedView>
          <ThemedView style={styles.buttonRow}>
            <Pressable style={[styles.buttonPrimary, styles.flex1]} onPress={handleAccept} disabled={acceptLoading}>
              <ThemedText type="default" style={styles.bold}>
                {acceptLoading ? t('partner.linking') : t('partner.accept')}
              </ThemedText>
            </Pressable>
            <Pressable style={[styles.buttonSecondary, styles.flex1]} onPress={handleDecline}>
              <ThemedText type="default">{t('partner.decline')}</ThemedText>
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
          <ThemedText type="title" style={styles.title}>{t('partner.title')}</ThemedText>

          {invite ? (
            <ThemedView style={styles.inviteCard}>
              <ThemedText type="small" themeColor="textSecondary">{t('partner.inviteCode')}</ThemedText>
              <ThemedText style={styles.code}>{invite.token}</ThemedText>
              <Pressable style={styles.buttonPrimary} onPress={handleShare}>
                <ThemedText type="default" style={styles.bold}>{t('partner.shareInvite')}</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <>
              <Pressable style={styles.buttonPrimary} onPress={handleGenerateInvite}>
                <ThemedText type="default" style={styles.bold}>{t('partner.invite')}</ThemedText>
              </Pressable>
              {inviteFailed ? (
                <ThemedText type="small" style={styles.errorText}>{t('partner.errors.inviteFailed')}</ThemedText>
              ) : null}
            </>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.divider}>
            {t('partner.orEnterCode')}
          </ThemedText>

          <ThemedView style={styles.codeEntryRow}>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(text) => { setCodeInput(text.toUpperCase()); setCodeError(null); }}
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
                {codeLoading ? '…' : t('partner.link')}
              </ThemedText>
            </Pressable>
          </ThemedView>

          {codeError ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
              {t(`partner.errors.${codeError}`)}
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
  // Left-aligned like the Settings title.
  title: { alignSelf: 'flex-start' },
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
    // ThemedText's default lineHeight (24) clips 36px glyphs on iOS.
    lineHeight: 44,
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
