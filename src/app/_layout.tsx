import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/auth/auth-provider';
export default function RootLayout() {
  return <AuthProvider><StatusBar hidden /><Stack screenOptions={{ headerShown: false }} /></AuthProvider>;
}
