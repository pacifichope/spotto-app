import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="language" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="blocklist" />
      <Stack.Screen name="contact" />
      <Stack.Screen name="bank-account" />
      <Stack.Screen name="sales" />
      <Stack.Screen name="organizer-guidelines" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="tokushoho" />
      <Stack.Screen name="[section]" />
    </Stack>
  );
}
