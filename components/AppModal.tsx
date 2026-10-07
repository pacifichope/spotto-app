import { Modal, StyleSheet, View, type ModalProps } from 'react-native';

import { MODAL_ORIENTATIONS } from '@/lib/modalOrientations';

/**
 * 画面回転後もモーダルの枠がウィンドウに追従し、背面のタッチを誤って塞がない。
 */
export default function AppModal({
  children,
  supportedOrientations,
  ...rest
}: ModalProps) {
  return (
    <Modal
      {...rest}
      supportedOrientations={
        supportedOrientations ?? [...MODAL_ORIENTATIONS]
      }
    >
      <View collapsable={false} pointerEvents="box-none" style={styles.fill}>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
