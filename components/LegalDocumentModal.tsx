import AppModal from '@/components/AppModal';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  openLegalDocument,
  type LegalDocumentId,
} from '@/lib/settings';

type LegalDocumentModalProps = {
  document: LegalDocumentId | null;
  onClose: () => void;
};

/** 互換用: 表示要求時に外部 URL をアプリ内ブラウザで開き、すぐ閉じる */
export default function LegalDocumentModal({
  document,
  onClose,
}: LegalDocumentModalProps) {
  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    void (async () => {
      await openLegalDocument(document);
      if (!cancelled) onClose();
    })();
    return () => {
      cancelled = true;
    };
  }, [document, onClose]);

  if (!document) return null;

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
