import AppModal from '@/components/AppModal';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardFormScrollView } from '@/components/KeyboardForm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  MAX_PRE_QUESTION_OPTIONS,
  MAX_PRE_QUESTIONS,
  PRE_QUESTION_TYPES,
  cloneQuestion,
  createEmptyQuestion,
  isChoiceType,
  stripProfilePresetQuestions,
  type PreQuestion,
  type PreQuestionType,
} from '@/lib/preQuestions';

type PreQuestionsModalProps = {
  visible: boolean;
  questions: PreQuestion[];
  onClose: () => void;
  onSave: (questions: PreQuestion[]) => void;
};

const MUTED = '#9CA3AF';
const LABEL = theme.colors.text;
const CARD = theme.colors.surface;
const BG = '#F5F5F5';

export default function PreQuestionsModal({
  visible,
  questions,
  onClose,
  onSave,
}: PreQuestionsModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PreQuestion[]>([]);
  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  useEffect(() => {
    if (!visible) return;
    const current = stripProfilePresetQuestions(
      questionsRef.current.map(cloneQuestion),
    );
    setDraft(current);
  }, [visible]);

  const updateQuestion = (id: string, patch: Partial<PreQuestion>) => {
    setDraft((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const changeType = (id: string, type: PreQuestionType) => {
    setDraft((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const options =
          isChoiceType(type) && item.options.length < 2
            ? [...item.options, '', ''].slice(0, 2)
            : item.options;
        return { ...item, type, options };
      }),
    );
  };

  const addQuestion = () => {
    if (draft.length >= MAX_PRE_QUESTIONS) {
      Alert.alert(
        t('create.preQuestions.maxTitle', { count: MAX_PRE_QUESTIONS }),
        t('create.preQuestions.maxBody'),
      );
      return;
    }
    setDraft((prev) => [...prev, createEmptyQuestion()]);
  };

  const removeQuestion = (id: string) => {
    setDraft((prev) => prev.filter((item) => item.id !== id));
  };

  const addOption = (id: string) => {
    setDraft((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.options.length >= MAX_PRE_QUESTION_OPTIONS) return item;
        return { ...item, options: [...item.options, ''] };
      }),
    );
  };

  const updateOption = (id: string, optionIndex: number, value: string) => {
    setDraft((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const options = item.options.map((option, index) =>
          index === optionIndex ? value : option,
        );
        return { ...item, options };
      }),
    );
  };

  const removeOption = (id: string, optionIndex: number) => {
    setDraft((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (item.options.length <= 2) return item;
        return {
          ...item,
          options: item.options.filter((_, index) => index !== optionIndex),
        };
      }),
    );
  };

  const handleDone = () => {
    onSave(draft);
  };

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDone}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.cancel}>{t('common.close')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('create.preQuestions.title')}</Text>
          <Pressable onPress={handleDone} hitSlop={12} style={styles.headerSideRight}>
            <Text style={styles.done}>{t('common.done')}</Text>
          </Pressable>
        </View>

        <KeyboardFormScrollView
          style={styles.scroll}
          keyboardVerticalOffset={Math.max(insets.top, 8) + 52}
          contentContainerStyle={styles.content}
          bottomGap={Math.max(insets.bottom, 24)}
        >
          <Text style={styles.kicker}>{t('create.preQuestions.kicker')}</Text>
          <Text style={styles.lead}>{t('create.preQuestions.lead')}</Text>

          {draft.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {t('create.preQuestions.emptyTitle')}
              </Text>
              <Text style={styles.emptyBody}>
                {t('create.preQuestions.emptyBody')}
              </Text>
            </View>
          ) : null}

          {draft.map((question, index) => (
            <View key={question.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>
                  {t('create.preQuestions.cardTitle', { index: index + 1 })}
                </Text>
                <View style={styles.cardHeaderRight}>
                  <Switch
                    value={question.enabled}
                    onValueChange={(enabled) =>
                      updateQuestion(question.id, { enabled })
                    }
                    trackColor={{
                      false: theme.colors.border,
                      true: theme.colors.primary,
                    }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#E5E7EB"
                  />
                  <Pressable
                    onPress={() => removeQuestion(question.id)}
                    hitSlop={8}
                  >
                    <Text style={styles.delete}>{t('common.delete')}</Text>
                  </Pressable>
                </View>
              </View>

              <TextInput
                style={styles.titleInput}
                placeholder={t('create.preQuestions.titlePlaceholder')}
                placeholderTextColor={MUTED}
                value={question.title}
                onChangeText={(title) => updateQuestion(question.id, { title })}
              />

              <View style={styles.typeRow}>
                {PRE_QUESTION_TYPES.map((item) => {
                  const active = question.type === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      style={[styles.typeChip, active && styles.typeChipActive]}
                      onPress={() => changeType(question.id, item.value)}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          active && styles.typeChipTextActive,
                        ]}
                      >
                        {t(`create.preQuestions.types.${item.value}`, {
                          defaultValue: item.label,
                        })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {isChoiceType(question.type) ? (
                <View style={styles.options}>
                  {question.options.map((option, optionIndex) => (
                    <View
                      key={`${question.id}-opt-${optionIndex}`}
                      style={styles.optionRow}
                    >
                      <Text style={styles.optionMark}>
                        {question.type === 'single' ? '○' : '□'}
                      </Text>
                      <TextInput
                        style={styles.optionInput}
                        placeholder={t('create.preQuestions.optionPlaceholder', {
                          index: optionIndex + 1,
                        })}
                        placeholderTextColor={MUTED}
                        value={option}
                        onChangeText={(value) =>
                          updateOption(question.id, optionIndex, value)
                        }
                      />
                      {question.options.length > 2 ? (
                        <Pressable
                          onPress={() =>
                            removeOption(question.id, optionIndex)
                          }
                          hitSlop={8}
                        >
                          <Text style={styles.optionRemove}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                  {question.options.length < MAX_PRE_QUESTION_OPTIONS ? (
                    <Pressable
                      style={styles.addOption}
                      onPress={() => addOption(question.id)}
                    >
                      <Text style={styles.addOptionText}>
                        {t('create.preQuestions.addOption')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.textPreview}>
                  <Text style={styles.textPreviewLabel}>
                    {t('create.preQuestions.textPreview')}
                  </Text>
                </View>
              )}
            </View>
          ))}

          <Pressable
            style={({ pressed }) => [
              styles.addQuestion,
              pressed && styles.addQuestionPressed,
            ]}
            onPress={addQuestion}
          >
            <Text style={styles.addQuestionText}>
              {t('create.preQuestions.addQuestion')}
            </Text>
          </Pressable>
        </KeyboardFormScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BG,
  },
  headerSide: {
    minWidth: 64,
  },
  headerSideRight: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
  cancel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: LABEL,
  },
  done: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  lead: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: LABEL,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: LABEL,
  },
  delete: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.danger,
  },
  titleInput: {
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: LABEL,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: LABEL,
  },
  typeChipTextActive: {
    color: theme.colors.primaryDark,
    fontWeight: '800',
  },
  options: {
    marginTop: 12,
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  optionMark: {
    fontSize: 14,
    color: MUTED,
    width: 16,
    textAlign: 'center',
  },
  optionInput: {
    flex: 1,
    fontSize: 14,
    color: LABEL,
    paddingVertical: 10,
  },
  optionRemove: {
    fontSize: 16,
    fontWeight: '700',
    color: MUTED,
    paddingHorizontal: 4,
  },
  addOption: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  textPreview: {
    marginTop: 12,
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  textPreviewLabel: {
    fontSize: 13,
    color: MUTED,
  },
  addQuestion: {
    marginTop: 4,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  addQuestionPressed: {
    opacity: 0.88,
  },
  addQuestionText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
});
