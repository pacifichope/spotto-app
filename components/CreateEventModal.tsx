import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KeyboardFormScrollView,
  useKeyboardBottomInset,
} from '@/components/KeyboardForm';
import type {
    CreateEventPayload,
    ScheduleType,
} from '@/components/createEventSheetTypes';
import EventTimePickerModal from '@/components/EventTimePickerModal';
import { CheckIcon, SportIcon } from '@/components/icons';
import LocationPickerModal from '@/components/LocationPickerModal';
import MultiSessionCalendarModal from '@/components/MultiSessionCalendarModal';
import NumericKeypadModal from '@/components/NumericKeypadModal';
import PreQuestionsModal from '@/components/PreQuestionsModal';
import { theme } from '@/constants/theme';
import {
    eventDraftHasContent,
    eventDraftSnapshotOf,
    snapshotsMatch,
    type EventDraft,
    type EventDraftSnapshot,
} from '@/lib/eventDrafts';
import {
    CANCEL_POLICY_OPTIONS,
    defaultEventSchedule,
    formatDeadlineLabel,
    formatEventDate,
    formatLocationLabel,
    formatSessionsSummary,
    LEVEL_OPTIONS,
    MAX_EVENT_ITEMS,
    MAX_EVENT_PHOTOS,
    MAX_TARGET_AGE_GROUP_LENGTH,
    MAX_TARGET_AGE_GROUPS,
    OTHER_SPORT_LABEL,
    parseEventItemDraft,
    REGISTRATION_DEADLINE_OPTIONS,
    sanitizeEventItems,
    sanitizeTargetAgeGroups,
    sortEventSessions,
    SPORT_IMAGE_PRESETS,
    SPORT_OPTIONS,
    TARGET_AGE_PRESETS,
    type EventSession,
    type RegistrationDeadlineOffset,
    type SkillLevel,
} from '@/lib/events';
import { isImagePickerAvailable, requestPhotoLibraryAccess } from '@/lib/imagePicker';
import {
    findNgWordInCreatePayload,
    findNgWordInTexts,
    NG_WORD_ERROR_MESSAGE,
} from '@/lib/ngWords';
import {
    sanitizePreQuestions,
    stripProfilePresetQuestions,
    type PreQuestion,
} from '@/lib/preQuestions';
import { uploadPublicImageOrLocal } from '@/lib/storage';
import { FALLBACK_COORDS, requestPermissionAndGetCoordinates } from '@/lib/userLocation';

const INITIAL_COORDS = FALLBACK_COORDS;

type CreateEventModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateEventPayload) => void | Promise<void>;
  draft?: EventDraft | null;
  onSaveDraft: (snapshot: EventDraftSnapshot) => void;
};

type PickerKind =
  | 'sport'
  | 'deadline'
  | 'cancel'
  | 'level'
  | 'image'
  | null;

type FeeType = 'free' | 'paid';

const BG = '#F5F5F5';
const CARD = theme.colors.surface;
const MUTED = '#9CA3AF';
const LABEL = theme.colors.text;
const DIVIDER = '#F0F0F0';

export default function CreateEventModal({
  visible,
  onClose,
  onSubmit,
  draft = null,
  onSaveDraft,
}: CreateEventModalProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [sportIndex, setSportIndex] = useState(0);
  const [customSport, setCustomSport] = useState('');
  const [level, setLevel] = useState<SkillLevel>('誰でも歓迎');
  const [targetAgeGroups, setTargetAgeGroups] = useState<string[]>([]);
  const [ageCustomDraft, setAgeCustomDraft] = useState('');
  const [date, setDate] = useState(() => defaultEventSchedule().date);
  const [time, setTime] = useState(() => defaultEventSchedule().time);
  const [endDate, setEndDate] = useState(() => defaultEventSchedule().endDate);
  const [endTime, setEndTime] = useState(() => defaultEventSchedule().endTime);
  const [location, setLocation] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [latitude, setLatitude] = useState<number>(INITIAL_COORDS.latitude);
  const [longitude, setLongitude] = useState<number>(INITIAL_COORDS.longitude);
  const [description, setDescription] = useState('');
  const [itemsToBring, setItemsToBring] = useState<string[]>([]);
  const [itemsToBringDraft, setItemsToBringDraft] = useState('');
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [includedItemsDraft, setIncludedItemsDraft] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [uploadingImageUris, setUploadingImageUris] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('single');
  const [capacity, setCapacity] = useState('');
  const [priceYen, setPriceYen] = useState('0');
  const [feeType, setFeeType] = useState<FeeType>('free');
  const [pricePickerVisible, setPricePickerVisible] = useState(false);
  const [capacityPickerVisible, setCapacityPickerVisible] = useState(false);
  const [deadlineOffset, setDeadlineOffset] =
    useState<RegistrationDeadlineOffset>(0);
  const [cancelPolicy, setCancelPolicy] = useState('');
  const [enablePreQuestions, setEnablePreQuestions] = useState(false);
  const [preQuestions, setPreQuestions] = useState<PreQuestion[]>([]);
  const [preQuestionsVisible, setPreQuestionsVisible] = useState(false);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [publishing, setPublishing] = useState(false);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [imageDraft, setImageDraft] = useState('');
  const baselineScheduleRef = useRef(defaultEventSchedule());
  // Modal 内は adjustResize が効かない端末があるため、重なり量でフォームを押し上げる
  const keyboardHeight = useKeyboardBottomInset(visible);

  const sport = SPORT_OPTIONS[sportIndex];
  const isOtherSport = sport.label === OTHER_SPORT_LABEL;
  const sportLabel = isOtherSport
    ? customSport.trim() || OTHER_SPORT_LABEL
    : sport.label;
  const remainingSlots = MAX_EVENT_PHOTOS - imageUris.length;
  const atPhotoLimit = remainingSlots <= 0;

  const coverUri = useMemo(() => {
    if (imageUris[0]) return imageUris[0];
    return SPORT_IMAGE_PRESETS[sport.label] ?? SPORT_IMAGE_PRESETS.default;
  }, [imageUris, sport.label]);

  const canPublish =
    imageUris.length > 0 &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    location.trim().length > 0 &&
    Number(capacity) > 0 &&
    (scheduleType !== 'recurring' || sessions.length > 0);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const applyEmptyForm = () => {
      setTitle('');
      setSportIndex(0);
      setCustomSport('');
      setLevel('誰でも歓迎');
      setTargetAgeGroups([]);
      setAgeCustomDraft('');
      const schedule = defaultEventSchedule();
      baselineScheduleRef.current = schedule;
      setDate(schedule.date);
      setTime(schedule.time);
      setEndDate(schedule.endDate);
      setEndTime(schedule.endTime);
      setLocation('');
      setLocationNote('');
      setLatitude(INITIAL_COORDS.latitude);
      setLongitude(INITIAL_COORDS.longitude);
      setDescription('');
      setItemsToBring([]);
      setItemsToBringDraft('');
      setIncludedItems([]);
      setIncludedItemsDraft('');
      setImageUris([]);
      setImageDraft('');
      setScheduleType('single');
      setCapacity('');
      setPriceYen('0');
      setFeeType('free');
      setPricePickerVisible(false);
      setCapacityPickerVisible(false);
      setDeadlineOffset(0);
      setCancelPolicy('');
      setEnablePreQuestions(false);
      setPreQuestions([]);
      setPreQuestionsVisible(false);
      setPicker(null);
      setLocationPickerVisible(false);
      setTimePickerVisible(false);
      setCalendarVisible(false);
      setSessions([]);
    };

    if (draft) {
      const snap = eventDraftSnapshotOf(draft);
      setTitle(snap.title);
      setSportIndex(snap.sportIndex);
      setCustomSport(snap.customSport);
      setLevel(snap.level);
      setTargetAgeGroups(snap.targetAgeGroups);
      setAgeCustomDraft(snap.ageCustomDraft);
      baselineScheduleRef.current = {
        date: snap.date,
        time: snap.time,
        endDate: snap.endDate,
        endTime: snap.endTime,
      };
      setDate(snap.date);
      setTime(snap.time);
      setEndDate(snap.endDate);
      setEndTime(snap.endTime);
      setLocation(snap.location);
      setLocationNote(snap.locationNote);
      setLatitude(snap.latitude);
      setLongitude(snap.longitude);
      setDescription(snap.description);
      setItemsToBring(snap.itemsToBring);
      setItemsToBringDraft(snap.itemsToBringDraft);
      setIncludedItems(snap.includedItems);
      setIncludedItemsDraft(snap.includedItemsDraft);
      setImageUris(snap.imageUris);
      setUploadingImageUris([]);
      setImageDraft(snap.imageDraft);
      setScheduleType(snap.scheduleType);
      setCapacity(snap.capacity);
      setPriceYen(snap.priceYen);
      setFeeType(snap.feeType);
      setPricePickerVisible(false);
      setCapacityPickerVisible(false);
      setDeadlineOffset(snap.deadlineOffset);
      setCancelPolicy(snap.cancelPolicy);
      setEnablePreQuestions(snap.enablePreQuestions);
      setPreQuestions(stripProfilePresetQuestions(snap.preQuestions));
      setPreQuestionsVisible(false);
      setPicker(null);
      setLocationPickerVisible(false);
      setTimePickerVisible(false);
      setCalendarVisible(false);
      setSessions(snap.sessions);
      return () => {
        cancelled = true;
      };
    }

    applyEmptyForm();

    void (async () => {
      const coords = await requestPermissionAndGetCoordinates();
      if (cancelled || !coords) return;
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, draft]);

  const buildPayload = (): CreateEventPayload | null => {
    if (uploadingImageUris.length > 0) {
      Alert.alert(
        '写真をアップロード中です',
        '完了してから公開してください。',
      );
      return null;
    }
    if (imageUris.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('写真を1枚以上追加してください');
      } else {
        Alert.alert('入力不足', '写真を1枚以上追加してください');
      }
      return null;
    }
    if (!title.trim() || !location.trim()) {
      Alert.alert('入力不足', 'タイトルと活動地点を入力してください。');
      return null;
    }
    if (!description.trim()) {
      Alert.alert('入力不足', 'イベント内容を入力してください');
      return null;
    }
    if (scheduleType === 'recurring' && sessions.length === 0) {
      Alert.alert('入力不足', '開催日を1日以上選んでください。');
      return null;
    }
    const cap = Math.min(1000, Math.max(1, Number(capacity)));
    const price =
      feeType === 'paid' ? Math.max(0, Math.floor(Number(priceYen) || 0)) : 0;
    if (feeType === 'paid' && price < 1) {
      Alert.alert('入力不足', '有料イベントの参加費を入力してください');
      return null;
    }
    if (feeType === 'paid' && !cancelPolicy.trim()) {
      Alert.alert('入力不足', 'キャンセルポリシーを選択してください');
      return null;
    }
    const orderedSessions =
      scheduleType === 'recurring'
        ? sortEventSessions(sessions)
        : [{ date, time, endDate, endTime }];
    const first = orderedSessions[0] ?? { date, time, endDate, endTime };
    return {
      title: title.trim().slice(0, 20),
      sport: sportLabel,
      emoji: sport.emoji,
      level,
      date: first.date,
      time: first.time,
      endDate: first.endDate,
      endTime: first.endTime,
      sessions: orderedSessions,
      location: location.trim(),
      locationNote: locationNote.trim() || undefined,
      description: description.trim(),
      imageUri: coverUri,
      imageUris,
      capacity: cap,
      priceYen: price,
      cancelPolicy: price > 0 ? cancelPolicy.trim() : '',
      protection: '主催者サポートのみ',
      scheduleType,
      latitude,
      longitude,
      registrationDeadlineOffset: deadlineOffset,
      enablePreQuestions:
        enablePreQuestions && sanitizePreQuestions(preQuestions).length > 0,
      preQuestions: sanitizePreQuestions(preQuestions),
      itemsToBring: sanitizeEventItems([
        ...itemsToBring,
        ...parseEventItemDraft(itemsToBringDraft),
      ]),
      includedItems: sanitizeEventItems([
        ...includedItems,
        ...parseEventItemDraft(includedItemsDraft),
      ]),
      targetAgeGroups: sanitizeTargetAgeGroups([
        ...targetAgeGroups,
        ageCustomDraft,
      ]),
    };
  };

  const handlePublish = async () => {
    if (publishing) return;
    const payload = buildPayload();
    if (!payload) return;
    if (findNgWordInCreatePayload(payload)) {
      if (Platform.OS === 'web') {
        window.alert(NG_WORD_ERROR_MESSAGE);
      } else {
        Alert.alert('送信できません', NG_WORD_ERROR_MESSAGE);
      }
      return;
    }
    setPublishing(true);
    try {
      await onSubmit(payload);
    } finally {
      setPublishing(false);
    }
  };

  const collectSnapshot = (): EventDraftSnapshot => ({
    title,
    sportIndex,
    customSport,
    level,
    targetAgeGroups,
    ageCustomDraft,
    date,
    time,
    endDate,
    endTime,
    location,
    locationNote,
    latitude,
    longitude,
    description,
    itemsToBring,
    itemsToBringDraft,
    includedItems,
    includedItemsDraft,
    imageUris,
    imageDraft,
    scheduleType,
    capacity,
    priceYen,
    feeType,
    deadlineOffset,
    cancelPolicy,
    enablePreQuestions,
    preQuestions,
    sessions,
  });

  const handleDraft = () => {
    const snapshot = collectSnapshot();
    if (!draft && !eventDraftHasContent(snapshot)) {
      if (Platform.OS === 'web') {
        window.alert('保存する内容がありません');
      } else {
        Alert.alert('保存できません', '入力内容がありません。');
      }
      return;
    }
    const draftNgHit = findNgWordInTexts([
      snapshot.title,
      snapshot.customSport,
      snapshot.location,
      snapshot.locationNote,
      snapshot.description,
      snapshot.itemsToBringDraft,
      snapshot.includedItemsDraft,
      snapshot.ageCustomDraft,
      ...snapshot.itemsToBring,
      ...snapshot.includedItems,
      ...snapshot.targetAgeGroups,
      ...snapshot.preQuestions.flatMap((q) => [q.title, ...q.options]),
    ]);
    if (draftNgHit) {
      if (Platform.OS === 'web') {
        window.alert(NG_WORD_ERROR_MESSAGE);
      } else {
        Alert.alert('保存できません', NG_WORD_ERROR_MESSAGE);
      }
      return;
    }
    onSaveDraft(snapshot);
    onClose();
  };

  const emptyFormDirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    itemsToBring.length > 0 ||
    itemsToBringDraft.trim().length > 0 ||
    includedItems.length > 0 ||
    includedItemsDraft.trim().length > 0 ||
    location.trim().length > 0 ||
    locationNote.trim().length > 0 ||
    imageUris.length > 0 ||
    imageDraft.trim().length > 0 ||
    capacity.trim().length > 0 ||
    priceYen !== '0' ||
    feeType !== 'free' ||
    sportIndex !== 0 ||
    customSport.trim().length > 0 ||
    level !== '誰でも歓迎' ||
    targetAgeGroups.length > 0 ||
    ageCustomDraft.trim().length > 0 ||
    scheduleType !== 'single' ||
    sessions.length > 0 ||
    cancelPolicy !== '' ||
    enablePreQuestions ||
    preQuestions.length > 0 ||
    deadlineOffset !== 0 ||
    date !== baselineScheduleRef.current.date ||
    time !== baselineScheduleRef.current.time ||
    endDate !== baselineScheduleRef.current.endDate ||
    endTime !== baselineScheduleRef.current.endTime;

  const hasUnsavedChanges = draft
    ? !snapshotsMatch(collectSnapshot(), eventDraftSnapshotOf(draft))
    : emptyFormDirty;

  const requestClose = () => {
    if (locationPickerVisible) {
      setLocationPickerVisible(false);
      return;
    }
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    Alert.alert(
      '変更を破棄しますか？',
      '入力中の内容はまだ公開されていません。下書きとして保存するか、変更を破棄して閉じることができます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '下書きとして保存',
          onPress: handleDraft,
        },
        {
          text: '変更を破棄する',
          style: 'destructive',
          onPress: onClose,
        },
      ],
    );
  };

  const pickFromLibrary = async () => {
    const remaining = MAX_EVENT_PHOTOS - imageUris.length;
    if (remaining <= 0) {
      Alert.alert(
        '写真は最大5枚まで',
        'これ以上追加できません。不要な写真を削除してください。',
      );
      return;
    }

    const access = await requestPhotoLibraryAccess();
    if (!access.ok) {
      if (access.reason === 'unavailable') {
        setImageDraft('');
        setPicker('image');
      }
      return;
    }

    const result = await access.picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;

    const picked = result.assets
      .map((asset) => asset.uri)
      .filter((uri): uri is string => Boolean(uri));
    if (picked.length === 0) return;

    // 選択直後にローカルプレビューを差し込む
    setImageUris((prev) => {
      const room = MAX_EVENT_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const next = picked.filter((uri) => !prev.includes(uri)).slice(0, room);
      return [...prev, ...next];
    });
    setUploadingImageUris((prev) => [
      ...prev,
      ...picked.filter((uri) => !prev.includes(uri)),
    ]);

    let cloudFailed = false;
    let cloudError = '';
    for (const uri of picked) {
      const stored = await uploadPublicImageOrLocal(uri, 'events');
      if (stored.error) {
        cloudFailed = true;
        if (!cloudError) cloudError = stored.error;
      }
      setImageUris((prev) => {
        if (!prev.includes(uri)) {
          // アップロード中にユーザーが削除した場合
          return prev;
        }
        if (stored.uri === uri) return prev;
        return prev.map((item) => (item === uri ? stored.uri : item));
      });
      setUploadingImageUris((prev) => prev.filter((item) => item !== uri));
    }
    if (cloudFailed) {
      Alert.alert(
        '一部の写真をクラウドに保存できませんでした',
        cloudError ||
          'この端末内の写真として追加します。公開後、他の端末では表示されないことがあります。',
      );
    }
  };

  const removeImage = (index: number) => {
    setImageUris((prev) => {
      const removed = prev[index];
      if (removed) {
        setUploadingImageUris((uploading) =>
          uploading.filter((uri) => uri !== removed),
        );
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const addImageUri = (uri: string) => {
    const trimmed = uri.trim();
    if (!trimmed) return;
    setImageUris((prev) => {
      if (prev.includes(trimmed) || prev.length >= MAX_EVENT_PHOTOS) return prev;
      return [...prev, trimmed];
    });
  };

  const openImagePicker = () => {
    if (MAX_EVENT_PHOTOS - imageUris.length <= 0) {
      Alert.alert(
        '写真は最大5枚まで',
        'これ以上追加できません。不要な写真を削除してください。',
      );
      return;
    }

    const openPreset = () => {
      setImageDraft('');
      setPicker('image');
    };

    // ネイティブ未組み込みの環境では、アラートで止めずそのまま選択 UI を開く
    if (!isImagePickerAvailable()) {
      openPreset();
      return;
    }

    Alert.alert('写真を追加', 'イベントの雰囲気が伝わる写真を選びましょう（最大5枚）', [
      {
        text: 'フォトライブラリから選ぶ',
        onPress: () => {
          void pickFromLibrary();
        },
      },
      {
        text: 'プリセット / URL',
        onPress: openPreset,
      },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const openLocationPicker = () => {
    setLocationPickerVisible(true);
  };

  const configuredQuestionCount = sanitizePreQuestions(preQuestions).length;

  const openPreQuestions = () => {
    setPreQuestionsVisible(true);
  };

  const handleTogglePreQuestions = (next: boolean) => {
    if (next) {
      setEnablePreQuestions(true);
      if (configuredQuestionCount === 0) {
        setPreQuestionsVisible(true);
      }
      return;
    }
    setEnablePreQuestions(false);
  };

  const handleSavePreQuestions = (next: PreQuestion[]) => {
    const cleaned = stripProfilePresetQuestions(next);
    setPreQuestions(cleaned);
    setEnablePreQuestions(sanitizePreQuestions(cleaned).length > 0);
    setPreQuestionsVisible(false);
  };

  const handleClosePreQuestions = () => {
    setPreQuestionsVisible(false);
    if (configuredQuestionCount === 0) {
      setEnablePreQuestions(false);
    }
  };

  const datetimeLabel = formatEventDate(date, time, endTime, endDate);
  const recurringLabel =
    sessions.length > 0
      ? formatSessionsSummary(sessions, 4)
      : '開催日を選択してください';
  const activityLabel =
    scheduleType === 'recurring'
      ? recurringLabel
      : `${datetimeLabel.monthDay} ${datetimeLabel.time}`;
  const deadlineLabel = formatDeadlineLabel(deadlineOffset);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={requestClose}
    >
      <View style={[styles.root, { paddingTop: insets.top || 8 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={requestClose}
            hitSlop={12}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="閉じる"
          >
            <SymbolView
              name={{
                ios: 'xmark',
                android: 'close',
                web: 'close',
              }}
              tintColor={theme.colors.text}
              size={22}
              fallback={<Text style={styles.headerCloseFallback}>×</Text>}
            />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            イベント作成
          </Text>
          <View style={styles.headerSide} />
        </View>

        <View
          style={[
            styles.body,
            // フォーム全体（スクロール＋フッター）をキーボード上へ
            keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
          ]}
        >
        <KeyboardFormScrollView
          style={styles.scroll}
          // 外側の paddingBottom と二重補正しない
          automaticallyAdjustKeyboardInsets={false}
          contentContainerStyle={styles.content}
          bottomGap={28}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Hero card: photos + title + description */}
          <View style={styles.heroCard}>
            <Text style={styles.photoCountLabel}>
              写真（必須） {imageUris.length}/{MAX_EVENT_PHOTOS}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {imageUris.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.thumbWrap}>
                  <Image
                    source={{ uri }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                  />
                  {uploadingImageUris.includes(uri) ? (
                    <View style={styles.thumbUploading}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() => removeImage(index)}
                    hitSlop={8}
                    accessibilityLabel="写真を削除"
                  >
                    <Text style={styles.thumbRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
              {!atPhotoLimit ? (
                <Pressable
                  style={[
                    styles.addTile,
                    imageUris.length === 0 && styles.addTileEmpty,
                  ]}
                  onPress={openImagePicker}
                >
                  <Text style={styles.imagePlus}>＋</Text>
                  <Text style={styles.imageHint}>
                    {imageUris.length === 0
                      ? `写真を1枚以上追加\n（必須）`
                      : '写真を追加'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {atPhotoLimit ? (
              <Text style={styles.photoLimitHint}>
                写真は最大{MAX_EVENT_PHOTOS}枚までです
              </Text>
            ) : null}

            <View style={styles.heroFields}>
              <View style={styles.heroField}>
                <View style={styles.heroFieldHeader}>
                  <Text style={styles.heroFieldLabel}>
                    <Text style={styles.asterisk}>＊</Text>
                    タイトル
                  </Text>
                  <Text style={styles.heroFieldMeta}>
                    {title.length}/20
                  </Text>
                </View>
                <TextInput
                  style={styles.titleInput}
                  placeholder="例：おもしろサッカー練習会"
                  placeholderTextColor={MUTED}
                  value={title}
                  onChangeText={(t) => setTitle(t.slice(0, 20))}
                  maxLength={20}
                  accessibilityLabel="タイトル"
                />
              </View>

              <View style={[styles.heroField, styles.heroFieldLast]}>
                <View style={styles.heroFieldHeader}>
                  <Text style={styles.heroFieldLabel}>
                    <Text style={styles.asterisk}>＊</Text>
                    イベント内容
                  </Text>
                </View>
                <TextInput
                  style={styles.descInput}
                  placeholder={
                    '例：初心者大歓迎！みんなで楽しくボールを蹴りましょう！\n当日の流れやおすすめの人なども書けます'
                  }
                  placeholderTextColor={MUTED}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel="イベント内容（必須）"
                />
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>当日の案内（任意）</Text>
          <View style={styles.listCard}>
            <ChipEditor
              label="必要な持ち物"
              hint="例: インドアシューズ"
              items={itemsToBring}
              onChangeItems={setItemsToBring}
              draft={itemsToBringDraft}
              onChangeDraft={setItemsToBringDraft}
            />
            <View style={styles.rowDivider} />
            <ChipEditor
              label="イベントに含まれているもの"
              hint="例: コート代込み"
              items={includedItems}
              onChangeItems={setIncludedItems}
              draft={includedItemsDraft}
              onChangeDraft={setIncludedItemsDraft}
            />
          </View>

          {/* 2. Schedule type tabs */}
          <View style={styles.tabRow}>
            <Pressable
              style={styles.tab}
              onPress={() => setScheduleType('single')}
            >
              <Text
                style={[
                  styles.tabTitle,
                  scheduleType === 'single' && styles.tabTitleActive,
                ]}
              >
                単発イベント
              </Text>
              <Text style={styles.tabSub}>1回限り・気軽な組局向け</Text>
              {scheduleType === 'single' && <View style={styles.tabUnderline} />}
            </Pressable>
            <Pressable
              style={styles.tab}
              onPress={() => {
                setScheduleType('recurring');
                if (sessions.length === 0 && date && time) {
                  setSessions([
                    { date, time, endDate, endTime },
                  ]);
                }
              }}
            >
              <Text
                style={[
                  styles.tabTitle,
                  scheduleType === 'recurring' && styles.tabTitleActive,
                ]}
              >
                定期・複数回
              </Text>
              <Text style={styles.tabSub}>
                日程ごとに別イベントとして公開
              </Text>
              {scheduleType === 'recurring' && (
                <View style={styles.tabUnderline} />
              )}
            </Pressable>
          </View>

          {/* 3. Settings list */}
          <View style={styles.listCard}>
            <SettingsRow
              required
              label="カテゴリ"
              value={sportLabel}
              placeholder={false}
              onPress={() => setPicker('sport')}
            />
            <SettingsRow
              required
              label={scheduleType === 'recurring' ? '活動日時' : '活動時間'}
              value={activityLabel}
              placeholder={
                scheduleType === 'recurring'
                  ? sessions.length === 0
                  : !date || !time
              }
              numberOfLines={scheduleType === 'recurring' ? 2 : 1}
              onPress={() =>
                scheduleType === 'recurring'
                  ? setCalendarVisible(true)
                  : setTimePickerVisible(true)
              }
            />
            <SettingsRow
              required
              label="活動地点"
              value={
                location
                  ? formatLocationLabel(location, locationNote)
                  : '集合場所を選択してください'
              }
              placeholder={!location}
              onPress={openLocationPicker}
            />
            <View style={styles.locationNoteRow}>
              <TextInput
                style={styles.locationNoteInput}
                value={locationNote}
                onChangeText={setLocationNote}
                placeholder="場所の補足（任意）"
                placeholderTextColor={MUTED}
                maxLength={40}
              />
            </View>
          </View>

          {/* Level (extra useful for sports app) */}
          <View style={styles.listCard}>
            <SettingsRow
              label="参加レベル"
              value={level}
              onPress={() => setPicker('level')}
              last
            />
          </View>

          <Text style={styles.sectionLabel}>年齢層（任意）</Text>
          <View style={styles.listCard}>
            <View style={styles.ageBlock}>
              <Text style={styles.ageHint}>
                複数選べます。参加しやすい雰囲気の目安です。未設定でも公開できます。
              </Text>
              <View style={styles.agePresetRow}>
                <Pressable
                  style={[
                    styles.ageChip,
                    targetAgeGroups.length === 0 &&
                      !ageCustomDraft.trim() &&
                      styles.ageChipActive,
                  ]}
                  onPress={() => {
                    setTargetAgeGroups([]);
                    setAgeCustomDraft('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="年齢層を指定しない"
                >
                  <Text
                    style={[
                      styles.ageChipText,
                      targetAgeGroups.length === 0 &&
                        !ageCustomDraft.trim() &&
                        styles.ageChipTextActive,
                    ]}
                  >
                    指定しない
                  </Text>
                </Pressable>
                {TARGET_AGE_PRESETS.map((preset) => {
                  const active = targetAgeGroups.includes(preset);
                  const atLimit =
                    !active &&
                    sanitizeTargetAgeGroups([
                      ...targetAgeGroups,
                      ageCustomDraft,
                    ]).length >= MAX_TARGET_AGE_GROUPS;
                  return (
                    <Pressable
                      key={preset}
                      style={[styles.ageChip, active && styles.ageChipActive]}
                      onPress={() => {
                        if (active) {
                          setTargetAgeGroups((prev) =>
                            prev.filter((item) => item !== preset),
                          );
                          return;
                        }
                        if (atLimit) return;
                        setTargetAgeGroups((prev) => [...prev, preset]);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={preset}
                    >
                      <Text
                        style={[
                          styles.ageChipText,
                          active && styles.ageChipTextActive,
                        ]}
                      >
                        {preset}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.ageInput}
                value={ageCustomDraft}
                onChangeText={(value) =>
                  setAgeCustomDraft(value.slice(0, MAX_TARGET_AGE_GROUP_LENGTH))
                }
                placeholder="自由記述を追加（例: 社会人中心）"
                placeholderTextColor={MUTED}
                maxLength={MAX_TARGET_AGE_GROUP_LENGTH}
                returnKeyType="done"
                onSubmitEditing={() => {
                  const next = sanitizeTargetAgeGroups([
                    ...targetAgeGroups,
                    ageCustomDraft,
                  ]);
                  if (next.length === targetAgeGroups.length) return;
                  setTargetAgeGroups(next);
                  setAgeCustomDraft('');
                }}
              />
            </View>
          </View>

          {/* 4. Group info card */}
          <Text style={styles.sectionLabel}>グループ情報</Text>
          <View style={styles.listCard}>
            <Pressable
              style={styles.settingsRow}
              onPress={() => setCapacityPickerVisible(true)}
            >
              <Text style={styles.rowLabel}>
                <Text style={styles.asterisk}>＊</Text>活動人数
              </Text>
              <View style={styles.rowRight}>
                <Text
                  style={[
                    styles.rowValue,
                    !(Number(capacity) > 0) && styles.rowValueMuted,
                  ]}
                  numberOfLines={1}
                >
                  {Number(capacity) > 0
                    ? `${Math.floor(Number(capacity)).toLocaleString('ja-JP')} 人`
                    : '活動人数を入力してください'}
                </Text>
                <Text style={styles.chevron}>{'>'}</Text>
              </View>
            </Pressable>
            <View style={styles.rowDivider} />
            <View style={styles.settingsRow}>
              <Text style={styles.rowLabel}>
                <Text style={styles.asterisk}>＊</Text>参加費
              </Text>
              <View style={styles.feeTypePills}>
                <Pressable
                  style={[
                    styles.feeTypePill,
                    feeType === 'free' && styles.feeTypePillActive,
                  ]}
                  onPress={() => {
                    setFeeType('free');
                    setPriceYen('0');
                    setCancelPolicy('');
                  }}
                >
                  <Text
                    style={[
                      styles.feeTypePillText,
                      feeType === 'free' && styles.feeTypePillTextActive,
                    ]}
                  >
                    無料
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.feeTypePill,
                    feeType === 'paid' && styles.feeTypePillActive,
                  ]}
                  onPress={() => {
                    setFeeType('paid');
                    if (!(Number(priceYen) > 0)) setPriceYen('');
                  }}
                >
                  <Text
                    style={[
                      styles.feeTypePillText,
                      feeType === 'paid' && styles.feeTypePillTextActive,
                    ]}
                  >
                    有料
                  </Text>
                </Pressable>
              </View>
            </View>
            {feeType === 'paid' ? (
              <>
                <View style={styles.rowDivider} />
                <Pressable
                  style={styles.settingsRow}
                  onPress={() => setPricePickerVisible(true)}
                >
                  <Text style={styles.rowLabel}>
                    <Text style={styles.asterisk}>＊</Text>金額
                  </Text>
                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.rowValue,
                        !(Number(priceYen) > 0) && styles.rowValueMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {Number(priceYen) > 0
                        ? `¥ ${Math.floor(Number(priceYen)).toLocaleString('ja-JP')} / 人`
                        : '参加費を入力してください'}
                    </Text>
                    <Text style={styles.chevron}>{'>'}</Text>
                  </View>
                </Pressable>
                <View style={styles.rowDivider} />
                <Pressable
                  style={styles.settingsRow}
                  onPress={() => setPicker('cancel')}
                >
                  <Text style={styles.rowLabel}>
                    <Text style={styles.asterisk}>＊</Text>キャンセルポリシー
                  </Text>
                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.rowValue,
                        !cancelPolicy && styles.rowValueMuted,
                      ]}
                      numberOfLines={2}
                    >
                      {cancelPolicy || '返金ポリシーを選択'}
                    </Text>
                    <Text style={styles.chevron}>{'>'}</Text>
                  </View>
                </Pressable>
              </>
            ) : null}
            <View style={styles.rowDivider} />
            <Pressable
              style={styles.settingsRow}
              onPress={() => setPicker('deadline')}
            >
              <View style={styles.stackLabel}>
                <Text style={styles.rowLabel}>申込締切</Text>
                <Text style={styles.stackMeta}>Registration Deadline</Text>
              </View>
              <View style={styles.rowRight}>
                <Text
                  style={styles.rowValue}
                  numberOfLines={1}
                >
                  {deadlineLabel}
                </Text>
                <Text style={styles.chevron}>{'>'}</Text>
              </View>
            </Pressable>
            <View style={styles.rowDivider} />
          </View>

          <Text style={styles.moreLabel}>その他の設定</Text>
          <View style={styles.listCard}>
            <View style={styles.toggleRow}>
              <Pressable
                style={styles.preQuestionMain}
                onPress={openPreQuestions}
              >
                <Text style={styles.rowLabel}>事前質問</Text>
                <Text style={styles.preQuestionMeta}>
                  {configuredQuestionCount > 0
                    ? `${configuredQuestionCount}問の追加質問${enablePreQuestions ? '' : ' · オフ'}`
                    : 'イベント固有の質問を追加'}
                </Text>
              </Pressable>
              <Switch
                value={enablePreQuestions}
                onValueChange={handleTogglePreQuestions}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E7EB"
              />
              <Pressable onPress={openPreQuestions} hitSlop={10}>
                <Text style={styles.chevron}>{'>'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardFormScrollView>

        {/* 5. Footer — body の paddingBottom でキーボード上に維持 */}
        <View
          style={[
            styles.footer,
            {
              paddingBottom:
                keyboardHeight > 0 ? 12 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable
            style={styles.draftBtn}
            onPress={handleDraft}
            accessibilityRole="button"
            accessibilityLabel="下書き保存"
          >
            <Text style={styles.draftText}>下書き保存</Text>
          </Pressable>
          <Pressable
            style={[
              styles.publishBtn,
              (!canPublish || publishing) && styles.publishBtnDisabled,
            ]}
            onPress={() => {
              void handlePublish();
            }}
            disabled={!canPublish || publishing}
            accessibilityRole="button"
            accessibilityLabel="イベントを公開"
          >
            {publishing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.publishText}>イベントを公開</Text>
            )}
          </Pressable>
        </View>
        </View>

        {/* Pickers */}
        <Modal
          visible={picker !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPicker(null)}
        >
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
            <Pressable
              style={[
                styles.pickerSheet,
                keyboardHeight > 0
                  ? { marginBottom: keyboardHeight }
                  : null,
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.pickerHandle} />

              {picker === 'sport' && (
                <>
                  <Text style={styles.pickerTitle}>カテゴリを選択</Text>
                  <ScrollView style={{ maxHeight: 320 }}>
                    {SPORT_OPTIONS.map((option, index) => (
                      <Pressable
                        key={option.label}
                        style={styles.pickerItem}
                        onPress={() => {
                          setSportIndex(index);
                          if (option.label !== OTHER_SPORT_LABEL) {
                            setCustomSport('');
                            setPicker(null);
                          }
                        }}
                      >
                        <View style={styles.pickerItemLeft}>
                          <SportIcon
                            sport={option.label}
                            size={18}
                            color={
                              index === sportIndex
                                ? theme.colors.iconActive
                                : undefined
                            }
                          />
                          <Text style={styles.pickerItemText}>
                            {option.label}
                          </Text>
                        </View>
                        {index === sportIndex && (
                          <CheckIcon size={18} />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                  {isOtherSport ? (
                    <>
                      <Text style={styles.pickerHint}>
                        任意のカテゴリ名を入力できます（空なら「その他」）
                      </Text>
                      <TextInput
                        style={styles.pickerInput}
                        value={customSport}
                        onChangeText={setCustomSport}
                        placeholder="例: ボルダリング、ヨガ"
                        placeholderTextColor={MUTED}
                      />
                      <Pressable
                        style={styles.pickerDone}
                        onPress={() => setPicker(null)}
                      >
                        <Text style={styles.pickerDoneText}>決定</Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              )}

              {picker === 'deadline' && (
                <>
                  <Text style={styles.pickerTitle}>申込締切</Text>
                  <Text style={styles.pickerHint}>
                    いつまで申し込みを受け付けるかを選びます
                  </Text>
                  <ScrollView style={{ maxHeight: 360 }}>
                    {REGISTRATION_DEADLINE_OPTIONS.map((option, index) => {
                      const active = option.value === deadlineOffset;
                      const showSection =
                        option.group === 'before' &&
                        REGISTRATION_DEADLINE_OPTIONS[index - 1]?.group !==
                          'before';
                      return (
                        <View key={String(option.value)}>
                          {showSection ? (
                            <Text style={styles.deadlineSection}>
                              開始の〇時間前
                            </Text>
                          ) : null}
                          <Pressable
                            style={styles.pickerItem}
                            onPress={() => {
                              setDeadlineOffset(option.value);
                              setPicker(null);
                            }}
                          >
                            <View style={styles.deadlineOptionCopy}>
                              <Text style={styles.pickerItemText}>
                                {option.label}
                              </Text>
                              <Text style={styles.deadlineOptionSub}>
                                {option.sublabel}
                              </Text>
                            </View>
                            {active ? (
                              <Text style={styles.check}>✓</Text>
                            ) : null}
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {picker === 'cancel' && (
                <>
                  <Text style={styles.pickerTitle}>キャンセルポリシー</Text>
                  <Text style={styles.ageHint}>
                    期限内のキャンセルは自動返金されます。期限後は返金されません。
                  </Text>
                  {CANCEL_POLICY_OPTIONS.map((item) => (
                    <Pressable
                      key={item.label}
                      style={styles.pickerItem}
                      onPress={() => {
                        setCancelPolicy(item.label);
                        setPicker(null);
                      }}
                    >
                      <View style={styles.deadlineOptionCopy}>
                        <Text style={styles.pickerItemText}>{item.label}</Text>
                        <Text style={styles.deadlineOptionSub}>{item.hint}</Text>
                      </View>
                      {cancelPolicy === item.label && (
                        <Text style={styles.check}>✓</Text>
                      )}
                    </Pressable>
                  ))}
                </>
              )}

              {picker === 'level' && (
                <>
                  <Text style={styles.pickerTitle}>参加レベル</Text>
                  {LEVEL_OPTIONS.map((item) => (
                    <Pressable
                      key={item}
                      style={styles.pickerItem}
                      onPress={() => {
                        setLevel(item);
                        setPicker(null);
                      }}
                    >
                      <Text style={styles.pickerItemText}>{item}</Text>
                      {level === item && <Text style={styles.check}>✓</Text>}
                    </Pressable>
                  ))}
                </>
              )}

              {picker === 'image' && (
                <>
                  <Text style={styles.pickerTitle}>写真を追加</Text>
                  <Text style={styles.pickerHint}>
                    あと{remainingSlots}枚まで追加できます
                  </Text>
                  {isImagePickerAvailable() ? (
                    <Pressable
                      style={styles.libraryBtn}
                      onPress={() => {
                        setPicker(null);
                        void pickFromLibrary();
                      }}
                    >
                      <Text style={styles.libraryBtnText}>
                        フォトライブラリから選ぶ
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.pickerHint}>
                      ※ 端末ライブラリ連携は開発ビルド（npx expo run:ios）後に有効になります。今は URL / プリセットを使えます。
                    </Text>
                  )}
                  <Text style={styles.pickerHint}>画像 URL</Text>
                  <TextInput
                    style={styles.pickerInput}
                    value={imageDraft}
                    onChangeText={setImageDraft}
                    placeholder="https://..."
                    placeholderTextColor={MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.pickerHint}>プリセット</Text>
                  <View style={styles.presetGrid}>
                    {Object.entries(SPORT_IMAGE_PRESETS)
                      .filter(([key]) => key !== 'default')
                      .map(([key, uri]) => (
                        <Pressable
                          key={key}
                          style={styles.presetItem}
                          onPress={() => setImageDraft(uri)}
                          accessibilityLabel={`${key}の活動写真プリセット`}
                        >
                          <Image
                            source={{ uri }}
                            style={styles.presetThumb}
                            accessibilityLabel={`${key}の試合・活動風景`}
                          />
                          <Text style={styles.presetLabel} numberOfLines={1}>
                            {key}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                  <Pressable
                    style={styles.pickerDone}
                    onPress={() => {
                      const uri = imageDraft.trim();
                      if (uri) {
                        if (imageUris.length >= MAX_EVENT_PHOTOS) {
                          Alert.alert(
                            '写真は最大5枚まで',
                            'これ以上追加できません。不要な写真を削除してください。',
                          );
                        } else {
                          addImageUri(uri);
                        }
                      }
                      setPicker(null);
                    }}
                  >
                    <Text style={styles.pickerDoneText}>決定</Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        <LocationPickerModal
          visible={locationPickerVisible}
          initial={{
            latitude,
            longitude,
            label: location,
          }}
          onClose={() => setLocationPickerVisible(false)}
          onConfirm={(picked) => {
            setLocation(picked.label);
            setLatitude(picked.latitude);
            setLongitude(picked.longitude);
            setLocationPickerVisible(false);
          }}
        />

        <EventTimePickerModal
          visible={timePickerVisible}
          initial={{ date, time, endDate, endTime }}
          onClose={() => setTimePickerVisible(false)}
          onConfirm={(picked) => {
            setDate(picked.date);
            setTime(picked.time);
            setEndDate(picked.endDate);
            setEndTime(picked.endTime);
            setSessions([
              {
                date: picked.date,
                time: picked.time,
                endDate: picked.endDate,
                endTime: picked.endTime,
              },
            ]);
            setTimePickerVisible(false);
          }}
        />

        <MultiSessionCalendarModal
          visible={calendarVisible}
          initialSessions={sessions}
          onClose={() => setCalendarVisible(false)}
          onConfirm={(next) => {
            const ordered = sortEventSessions(next);
            setSessions(ordered);
            const first = ordered[0];
            if (first) {
              setDate(first.date);
              setTime(first.time);
              setEndDate(first.endDate ?? first.date);
              setEndTime(first.endTime ?? first.time);
            }
            setCalendarVisible(false);
          }}
        />

        <PreQuestionsModal
          visible={preQuestionsVisible}
          questions={preQuestions}
          onClose={handleClosePreQuestions}
          onSave={handleSavePreQuestions}
        />

        <NumericKeypadModal
          visible={capacityPickerVisible}
          value={capacity}
          title="Participants"
          subtitle="活動人数"
          note="活動人数は1〜1,000人まで設定できます。"
          suffix="人"
          min={0}
          max={1000}
          onCancel={() => setCapacityPickerVisible(false)}
          onConfirm={(next) => {
            const count = Math.floor(Number(next) || 0);
            setCapacity(count >= 1 ? String(count) : '');
            setCapacityPickerVisible(false);
          }}
        />

        <NumericKeypadModal
          visible={pricePickerVisible}
          value={priceYen}
          title="Price per person"
          subtitle="1人あたりの参加費"
          note="有料イベントは参加時に Stripe / Apple Pay で事前決済されます。1円以上を入力してください。"
          prefix="¥"
          min={1}
          max={999999}
          onCancel={() => setPricePickerVisible(false)}
          onConfirm={(next) => {
            setPriceYen(next);
            setPricePickerVisible(false);
          }}
        />
      </View>
    </Modal>
  );
}

function ChipEditor({
  label,
  hint,
  items,
  onChangeItems,
  draft,
  onChangeDraft,
}: {
  label: string;
  hint: string;
  items: string[];
  onChangeItems: (items: string[]) => void;
  draft: string;
  onChangeDraft: (value: string) => void;
}) {
  const atLimit = items.length >= MAX_EVENT_ITEMS;
  const canAdd = draft.trim().length > 0 && !atLimit;

  const commit = () => {
    if (!canAdd) return;
    const parsed = parseEventItemDraft(draft);
    if (parsed.length === 0) return;
    onChangeItems(sanitizeEventItems([...items, ...parsed]));
    onChangeDraft('');
  };

  return (
    <View style={styles.chipBlock}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chipInputRow}>
        <TextInput
          style={styles.chipInput}
          value={draft}
          onChangeText={onChangeDraft}
          placeholder={hint}
          placeholderTextColor={MUTED}
          returnKeyType="done"
          blurOnSubmit={false}
          enablesReturnKeyAutomatically
          editable={!atLimit}
          onSubmitEditing={commit}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          maxLength={24}
        />
        <Pressable
          style={[styles.chipAddBtn, !canAdd && styles.chipAddBtnMuted]}
          onPress={commit}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityLabel="項目を追加"
        >
          <Text style={styles.chipAddText}>追加</Text>
        </Pressable>
      </View>
      {atLimit ? (
        <Text style={styles.chipHint}>最大{MAX_EVENT_ITEMS}件まで追加できます</Text>
      ) : null}
      {items.length > 0 ? (
        <View style={styles.chipList}>
          {items.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.chipRow}>
              <Text style={styles.chipRowText}>{item}</Text>
              <Pressable
                style={styles.chipDelete}
                onPress={() =>
                  onChangeItems(items.filter((_, itemIndex) => itemIndex !== index))
                }
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${item}を削除`}
              >
                <Text style={styles.chipDeleteMark}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.chipHint}>追加すると下に一覧表示されます</Text>
      )}
    </View>
  );
}

function SettingsRow({
  label,
  value,
  required,
  placeholder,
  onPress,
  last,
  numberOfLines = 1,
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: boolean;
  onPress: () => void;
  last?: boolean;
  numberOfLines?: number;
}) {
  return (
    <>
      <Pressable style={styles.settingsRow} onPress={onPress}>
        <Text style={styles.rowLabel}>
          {required ? <Text style={styles.asterisk}>＊</Text> : null}
          {label}
        </Text>
        <View style={styles.rowRight}>
          <Text
            style={[styles.rowValue, placeholder && styles.rowValueMuted]}
            numberOfLines={numberOfLines}
          >
            {value}
          </Text>
          <Text style={styles.chevron}>{'>'}</Text>
        </View>
      </Pressable>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  body: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: BG,
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCloseFallback: {
    fontSize: 26,
    lineHeight: 30,
    color: LABEL,
    fontWeight: '400',
    marginTop: -2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: LABEL,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  heroCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
  },
  photoCountLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
    marginBottom: 8,
  },
  photoStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 12,
  },
  photoLimitHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  thumbWrap: {
    width: 88,
    height: 88,
  },
  thumbImage: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#F0F1F3',
  },
  thumbUploading: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  addTile: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#F0F1F3',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  addTileEmpty: {
    width: 120,
  },
  imagePlus: {
    fontSize: 22,
    color: MUTED,
    marginBottom: 2,
  },
  imageHint: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 14,
  },
  heroFields: {
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DIVIDER,
    paddingTop: 14,
    gap: 14,
  },
  heroField: {
    gap: 8,
  },
  heroFieldLast: {
    marginBottom: 0,
  },
  heroFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: LABEL,
  },
  heroFieldMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '700',
    color: LABEL,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DIVIDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  descInput: {
    fontSize: 14,
    fontWeight: '500',
    color: LABEL,
    lineHeight: 21,
    minHeight: 96,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DIVIDER,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tabTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: MUTED,
    marginBottom: 4,
  },
  tabTitleActive: {
    color: LABEL,
  },
  tabSub: {
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  listCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  stackLabel: {
    flex: 1,
    minWidth: 0,
  },
  stackMeta: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED,
  },
  preQuestionMain: {
    flex: 1,
    minWidth: 0,
  },
  preQuestionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: LABEL,
  },
  asterisk: {
    color: theme.colors.danger,
    fontWeight: '700',
  },
  rowRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  feeTypePills: {
    flexDirection: 'row',
    gap: 8,
  },
  feeTypePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  feeTypePillActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  feeTypePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
  },
  feeTypePillTextActive: {
    color: theme.colors.primaryDark,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    color: LABEL,
    textAlign: 'right',
  },
  rowValueMuted: {
    color: MUTED,
  },
  chevron: {
    fontSize: 14,
    color: MUTED,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
    marginLeft: 16,
  },
  locationNoteRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  locationNoteInput: {
    fontSize: 14,
    color: LABEL,
    paddingVertical: 6,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 8,
    marginTop: 4,
    marginLeft: 4,
  },
  chipBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: LABEL,
  },
  chipInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipInput: {
    flex: 1,
    fontSize: 14,
    color: LABEL,
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipAddBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipAddBtnMuted: {
    opacity: 0.45,
  },
  chipAddText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chipHint: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  chipList: {
    gap: 6,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
  },
  chipRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  chipDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  chipDeleteMark: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryDark,
    marginTop: -1,
  },
  ageBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  ageHint: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    lineHeight: 18,
  },
  agePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ageChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ageChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  ageChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: LABEL,
  },
  ageChipTextActive: {
    color: theme.colors.primaryDark,
  },
  ageInput: {
    fontSize: 14,
    color: LABEL,
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },
  inlineInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    color: LABEL,
    paddingVertical: 4,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yen: {
    fontSize: 15,
    fontWeight: '600',
    color: LABEL,
  },
  priceInput: {
    minWidth: 56,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '600',
    color: LABEL,
    paddingVertical: 4,
  },
  perPerson: {
    fontSize: 13,
    color: MUTED,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: CARD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: DIVIDER,
  },
  draftBtn: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: CARD,
  },
  draftText: {
    fontSize: 14,
    fontWeight: '600',
    color: LABEL,
  },
  publishBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.text,
    alignItems: 'center',
  },
  publishBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  publishText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: LABEL,
    marginBottom: 12,
  },
  pickerHint: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 8,
    marginTop: 4,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  pickerItemText: {
    fontSize: 15,
    color: LABEL,
  },
  deadlineOptionCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  deadlineOptionSub: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
  },
  deadlineSection: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
    color: MUTED,
  },
  check: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  pickerInput: {
    backgroundColor: BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: LABEL,
    marginBottom: 12,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  timeChipText: {
    fontSize: 13,
    color: LABEL,
  },
  timeChipTextActive: {
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  pickerDone: {
    marginTop: 8,
    backgroundColor: theme.colors.text,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  libraryBtn: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  libraryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.primaryDark,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  presetItem: {
    width: '22%',
    alignItems: 'center',
  },
  presetThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: BG,
  },
  presetLabel: {
    marginTop: 4,
    fontSize: 10,
    color: MUTED,
  },
});
