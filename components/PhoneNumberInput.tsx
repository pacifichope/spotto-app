import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import {
  DEFAULT_PHONE_COUNTRY,
  filterPhoneCountries,
  formatPhoneCountryLabel,
  type PhoneCountry,
} from '@/lib/phoneCountries';
import {
  formatNationalTyping,
  sanitizeNationalDigits,
  validatePhoneInput,
  type PhoneInputValidation,
} from '@/lib/phoneVerificationShared';

export type PhoneNumberInputValue = {
  digits: string;
  country: PhoneCountry;
  validation: PhoneInputValidation;
  e164: string | null;
  display: string;
  isComplete: boolean;
};

type PhoneNumberInputProps = {
  value: string;
  country: PhoneCountry;
  onChangeDigits: (digits: string) => void;
  onChangeCountry: (country: PhoneCountry) => void;
  editable?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<TextInput | null>;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

/**
 * 国番号セレクター + 国内番号入力（Firebase Auth 風のシンプル UI）
 */
export default function PhoneNumberInput({
  value,
  country,
  onChangeDigits,
  onChangeCountry,
  editable = true,
  autoFocus = false,
  inputRef,
  onSubmitEditing,
}: PhoneNumberInputProps) {
  const insets = useSafeAreaInsets();
  const localRef = useRef<TextInput>(null);
  const searchRef = useRef<TextInput>(null);
  const ref = inputRef ?? localRef;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const validation = useMemo(
    () => validatePhoneInput(value, country),
    [value, country],
  );
  const display = useMemo(
    () => formatNationalTyping(value, country),
    [value, country],
  );
  const filteredCountries = useMemo(
    () => filterPhoneCountries(search),
    [search],
  );

  const maxFormattedLen =
    country.maxDigits + Math.max(0, country.groups.length - 1);

  const showHint =
    validation.status === 'invalid' ||
    validation.status === 'valid' ||
    (validation.status === 'typing' && validation.currentDigits > 0);

  const hintColor =
    validation.status === 'valid'
      ? theme.colors.primaryDark
      : validation.status === 'invalid'
        ? theme.colors.danger
        : theme.colors.textMuted;

  const closePicker = () => {
    setPickerOpen(false);
    setSearch('');
  };

  return (
    <View>
      <View
        style={[
          styles.field,
          validation.status === 'invalid' && styles.fieldInvalid,
          validation.status === 'valid' && styles.fieldValid,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.countryBtn,
            pressed && styles.countryBtnPressed,
            !editable && styles.disabled,
          ]}
          onPress={() => {
            if (!editable) return;
            setPickerOpen(true);
            setTimeout(() => searchRef.current?.focus(), 350);
          }}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Country code +${country.dialCode}. Tap to change`}
        >
          <Text style={styles.countryDial}>+{country.dialCode}</Text>
          <Text style={styles.countryCaret}>▾</Text>
        </Pressable>

        <View style={styles.divider} />

        <TextInput
          ref={ref}
          style={styles.input}
          value={display}
          onChangeText={(text) => {
            onChangeDigits(sanitizeNationalDigits(text, country));
          }}
          placeholder="Phone number"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="tel"
          textContentType="telephoneNumber"
          importantForAutofill="yes"
          maxLength={maxFormattedLen}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          autoFocus={autoFocus}
          accessibilityLabel="Phone number"
        />
      </View>

      {showHint ? (
        <Text style={[styles.hint, { color: hintColor }]} numberOfLines={2}>
          {validation.hint}
        </Text>
      ) : (
        <View style={styles.hintSpacer} />
      )}

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <View style={styles.pickerRoot}>
          <Pressable style={styles.pickerBackdrop} onPress={closePicker} />
          <View
            style={[
              styles.pickerSheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select country</Text>
              <Pressable
                onPress={closePicker}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.pickerClose}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.searchWrap}>
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search country or code"
                placeholderTextColor={theme.colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                accessibilityLabel="Search countries"
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => `${item.iso2}-${item.dialCode}`}
              keyboardShouldPersistTaps="handled"
              style={styles.pickerList}
              initialNumToRender={24}
              windowSize={10}
              ListEmptyComponent={
                <Text style={styles.emptySearch}>No countries found</Text>
              }
              renderItem={({ item }) => {
                const selected = item.iso2 === country.iso2;
                return (
                  <Pressable
                    style={[
                      styles.pickerRow,
                      selected && styles.pickerRowSelected,
                    ]}
                    onPress={() => {
                      onChangeCountry(item);
                      onChangeDigits(sanitizeNationalDigits(value, item));
                      closePicker();
                      setTimeout(() => ref.current?.focus(), 200);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={formatPhoneCountryLabel(item)}
                  >
                    <Text
                      style={[
                        styles.pickerName,
                        selected && styles.pickerNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.nameEn}
                    </Text>
                    <Text
                      style={[
                        styles.pickerDial,
                        selected && styles.pickerDialSelected,
                      ]}
                    >
                      +{item.dialCode}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function usePhoneNumberInputState(
  initialCountry: PhoneCountry = DEFAULT_PHONE_COUNTRY,
) {
  const [country, setCountry] = useState(initialCountry);
  const [digits, setDigits] = useState('');
  const validation = useMemo(
    () => validatePhoneInput(digits, country),
    [digits, country],
  );
  return {
    country,
    setCountry,
    digits,
    setDigits,
    validation,
    reset: () => {
      setCountry(initialCountry);
      setDigits('');
    },
  };
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    minHeight: 54,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  fieldInvalid: {
    borderColor: theme.colors.danger,
  },
  fieldValid: {
    borderColor: theme.colors.primary,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 78,
  },
  countryBtnPressed: {
    opacity: 0.7,
  },
  countryDial: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  countryCaret: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.border,
    marginVertical: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: theme.colors.text,
  },
  disabled: {
    opacity: 0.5,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  hintSpacer: {
    height: 10,
  },
  pickerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '82%',
    minHeight: '55%',
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  pickerClose: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  searchWrap: {
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  pickerList: {
    flexGrow: 1,
  },
  emptySearch: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 28,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
  },
  pickerRowSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  pickerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pickerNameSelected: {
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  pickerDial: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pickerDialSelected: {
    color: theme.colors.primaryDark,
  },
});
