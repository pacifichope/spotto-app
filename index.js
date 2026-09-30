/**
 * Expo Router より先に Firebase ネイティブ初期化を走らせる。
 * Android で Auth が DEFAULT アプリ未作成のまま呼ばれるのを防ぐ。
 */
import './lib/firebaseNativeInit';
import 'expo-router/entry';
